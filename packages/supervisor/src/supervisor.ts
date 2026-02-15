/**
 * Base supervisor managing child lifecycles with OTP-inspired restart strategies.
 *
 * The supervision hierarchy mirrors the logical hierarchy:
 * Gateway -> Sessions -> Agent loops -> Tool workers
 *
 * Each supervisor manages an ordered set of children, tracks their health,
 * and applies restart policies when children crash.
 *
 * Port of Lemon's BEAM supervision patterns to Node.js / TypeScript.
 */

import { EventEmitter } from 'node:events';
import { backoffDelay } from '@ch4p/core';
import { type RestartPolicy, DEFAULT_RESTART_POLICY } from './strategies.js';
import { HealthMonitor } from './health.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface ChildSpec {
  id: string;
  start: () => Promise<ChildHandle>;
  shutdown?: (handle: ChildHandle) => Promise<void>;
  restartPolicy?: Partial<RestartPolicy>;
}

export interface ChildHandle {
  id: string;
  pid?: number;
  threadId?: number;
  kill: () => void;
  isAlive: () => boolean;
}

export interface ChildState {
  spec: ChildSpec;
  handle: ChildHandle | null;
  status: 'running' | 'stopped' | 'crashed' | 'restarting';
  restartCount: number;
  restartTimestamps: number[];
  lastError?: Error;
}

export interface SupervisorEvents {
  'child:started': [childId: string, handle: ChildHandle];
  'child:crashed': [childId: string, error: Error];
  'child:restarted': [childId: string, handle: ChildHandle, attempt: number];
  'child:stopped': [childId: string];
  'supervisor:started': [];
  'supervisor:stopped': [];
  'supervisor:max_restarts_exceeded': [childId: string, count: number, windowMs: number];
}

// ── Supervisor ───────────────────────────────────────────────────────────

export class Supervisor extends EventEmitter<SupervisorEvents> {
  protected readonly children: ChildState[] = [];
  protected readonly childIndex = new Map<string, ChildState>();
  protected readonly policy: RestartPolicy;
  protected readonly health: HealthMonitor;

  private running = false;
  private stopping = false;

  /** Tracks in-flight restart promises so we can await them during stop(). */
  private readonly pendingRestarts = new Map<string, Promise<void>>();

  /** AbortController used to cancel pending backoff sleeps on shutdown. */
  private shutdownController: AbortController | null = null;

  constructor(policy?: Partial<RestartPolicy>, health?: HealthMonitor) {
    super();
    this.policy = { ...DEFAULT_RESTART_POLICY, ...policy };
    this.health = health ?? new HealthMonitor();
  }

  // ── Queries ──────────────────────────────────────────────────────────

  get isRunning(): boolean {
    return this.running;
  }

  getChildState(id: string): ChildState | undefined {
    const state = this.childIndex.get(id);
    if (!state) return undefined;
    // Return shallow copy — keeps internal state safe.
    return { ...state, restartTimestamps: [...state.restartTimestamps] };
  }

  getChildren(): readonly ChildState[] {
    return this.children.map((s) => ({
      ...s,
      restartTimestamps: [...s.restartTimestamps],
    }));
  }

  getHealthMonitor(): HealthMonitor {
    return this.health;
  }

  // ── Child management ─────────────────────────────────────────────────

  /**
   * Register a child specification. If the supervisor is already running the
   * child will be started immediately.
   */
  async addChild(spec: ChildSpec): Promise<void> {
    if (this.childIndex.has(spec.id)) {
      throw new Error(`Child "${spec.id}" is already registered`);
    }

    const state: ChildState = {
      spec,
      handle: null,
      status: 'stopped',
      restartCount: 0,
      restartTimestamps: [],
    };

    this.children.push(state);
    this.childIndex.set(spec.id, state);
    this.health.registerChild(spec.id);

    if (this.running && !this.stopping) {
      await this.startChild(state);
    }
  }

  /**
   * Remove a child. Shuts the child down first if it is running.
   */
  async removeChild(id: string): Promise<void> {
    const state = this.childIndex.get(id);
    if (!state) return;

    // Cancel any pending restart.
    this.pendingRestarts.delete(id);

    if (state.handle && state.status === 'running') {
      await this.stopChild(state);
    }

    const idx = this.children.indexOf(state);
    if (idx !== -1) this.children.splice(idx, 1);
    this.childIndex.delete(id);
    this.health.unregisterChild(id);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Start the supervisor and all registered children in order.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.shutdownController = new AbortController();

    this.health.start();

    // Start children sequentially — ordering matters for rest-for-one.
    for (const child of this.children) {
      if (this.stopping) break;
      await this.startChild(child);
    }

    this.emit('supervisor:started');
  }

  /**
   * Gracefully stop the supervisor and all children (reverse order).
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopping = true;

    // Signal pending backoff sleeps to abort immediately.
    this.shutdownController?.abort();

    // Wait for any in-flight restarts to settle so we don't race with them.
    if (this.pendingRestarts.size > 0) {
      await Promise.allSettled([...this.pendingRestarts.values()]);
    }

    // Stop children in reverse order (mirrors OTP shutdown semantics).
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i]!;
      if (child.status === 'running' || child.status === 'restarting') {
        await this.stopChild(child);
      }
    }

    this.health.stop();
    this.running = false;
    this.stopping = false;
    this.pendingRestarts.clear();
    this.shutdownController = null;

    this.emit('supervisor:stopped');
  }

  // ── Manual restart ───────────────────────────────────────────────────

  /**
   * Manually restart a specific child (e.g. triggered via admin API).
   */
  async restartChild(id: string): Promise<void> {
    const state = this.childIndex.get(id);
    if (!state) throw new Error(`Unknown child "${id}"`);
    if (this.stopping) return;

    if (state.handle && state.status === 'running') {
      await this.stopChild(state);
    }
    await this.startChild(state);
  }

  // ── Crash handling (called by subclasses) ────────────────────────────

  /**
   * Should be called by subclasses or child monitors when a child crashes.
   * Applies the configured restart strategy.
   */
  protected handleChildCrash(childId: string, error: Error): void {
    if (this.stopping) return;

    const state = this.childIndex.get(childId);
    if (!state) return;

    state.status = 'crashed';
    state.lastError = error;
    state.handle = null;

    this.health.recordCrash(childId, error);
    this.emit('child:crashed', childId, error);

    // Determine effective policy (child-level overrides supervisor default).
    const effectivePolicy: RestartPolicy = {
      ...this.policy,
      ...state.spec.restartPolicy,
    };

    // Kick off the strategy — fire-and-forget but track the promise.
    const restartPromise = this.applyStrategy(effectivePolicy, state)
      .catch((strategyError: unknown) => {
        // Strategy-level errors (e.g. max restarts) are already emitted
        // inside applyStrategy. Swallow here to avoid unhandled rejection.
        if (
          strategyError instanceof Error &&
          strategyError.message.startsWith('Max restarts')
        ) {
          return;
        }
        // Truly unexpected — re-emit as an error on the supervisor.
        this.emit('error' as keyof SupervisorEvents, strategyError as never);
      })
      .finally(() => {
        this.pendingRestarts.delete(childId);
      });

    this.pendingRestarts.set(childId, restartPromise);
  }

  // ── Strategy application ─────────────────────────────────────────────

  private async applyStrategy(
    policy: RestartPolicy,
    crashedState: ChildState,
  ): Promise<void> {
    if (this.stopping) return;

    switch (policy.strategy) {
      case 'one-for-one':
        await this.restartWithBackoff(crashedState, policy);
        break;

      case 'rest-for-one': {
        // Find the index of the crashed child.
        const idx = this.children.indexOf(crashedState);
        if (idx === -1) return;

        // Stop all children that were started AFTER the crashed one (reverse).
        const toRestart: ChildState[] = [];
        for (let i = this.children.length - 1; i > idx; i--) {
          const sibling = this.children[i]!;
          if (sibling.status === 'running') {
            await this.stopChild(sibling);
          }
          toRestart.unshift(sibling);
        }

        // Restart the crashed child first.
        await this.restartWithBackoff(crashedState, policy);

        // Then restart the siblings in order.
        for (const sibling of toRestart) {
          if (this.stopping) break;
          await this.startChild(sibling);
        }
        break;
      }

      case 'one-for-all': {
        // Stop all other running children (reverse order).
        for (let i = this.children.length - 1; i >= 0; i--) {
          const child = this.children[i]!;
          if (child !== crashedState && child.status === 'running') {
            await this.stopChild(child);
          }
        }

        // Restart all children in original order.
        for (const child of this.children) {
          if (this.stopping) break;
          if (child === crashedState) {
            await this.restartWithBackoff(child, policy);
          } else {
            await this.startChild(child);
          }
        }
        break;
      }
    }
  }

  // ── Backoff + restart ────────────────────────────────────────────────

  private async restartWithBackoff(
    state: ChildState,
    policy: RestartPolicy,
  ): Promise<void> {
    if (this.stopping) return;

    // Prune timestamps outside the current window.
    const now = Date.now();
    state.restartTimestamps = state.restartTimestamps.filter(
      (ts) => now - ts < policy.windowMs,
    );

    // Check if max restarts exceeded within the window.
    if (state.restartTimestamps.length >= policy.maxRestarts) {
      state.status = 'crashed';
      this.emit(
        'supervisor:max_restarts_exceeded',
        state.spec.id,
        state.restartTimestamps.length,
        policy.windowMs,
      );
      throw new Error(
        `Max restarts (${policy.maxRestarts}) exceeded for "${state.spec.id}" within ${policy.windowMs}ms window`,
      );
    }

    state.status = 'restarting';
    state.restartCount += 1;
    state.restartTimestamps.push(now);

    // Exponential backoff with jitter (uses @ch4p/core util).
    const delay = backoffDelay(
      state.restartTimestamps.length - 1,
      policy.backoffBaseMs,
      policy.backoffMaxMs,
    );

    try {
      await this.interruptibleSleep(delay);
    } catch {
      // Aborted during shutdown — bail out.
      return;
    }

    if (this.stopping) return;

    await this.startChild(state);

    this.health.recordRestart(state.spec.id);
    if (state.handle) {
      this.emit(
        'child:restarted',
        state.spec.id,
        state.handle,
        state.restartCount,
      );
    }
  }

  // ── Child start / stop primitives ────────────────────────────────────

  protected async startChild(state: ChildState): Promise<void> {
    if (this.stopping) return;

    try {
      const handle = await state.spec.start();
      state.handle = handle;
      state.status = 'running';
      this.emit('child:started', state.spec.id, handle);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      // Starting failed — treat as an immediate crash.
      state.status = 'crashed';
      state.lastError = error;
      this.handleChildCrash(state.spec.id, error);
    }
  }

  protected async stopChild(state: ChildState): Promise<void> {
    const { handle, spec } = state;
    if (!handle) {
      state.status = 'stopped';
      return;
    }

    try {
      if (spec.shutdown) {
        await spec.shutdown(handle);
      } else {
        handle.kill();
      }
    } catch {
      // Best-effort shutdown — force-kill on error.
      try {
        handle.kill();
      } catch {
        /* swallow */
      }
    }

    state.handle = null;
    state.status = 'stopped';
    this.emit('child:stopped', spec.id);
  }

  // ── Utilities ────────────────────────────────────────────────────────

  /**
   * Sleep that can be interrupted by the shutdown controller.
   * Throws if aborted so the caller can bail out.
   */
  private interruptibleSleep(ms: number): Promise<void> {
    const controller = this.shutdownController;
    if (!controller || controller.signal.aborted) {
      return Promise.reject(new Error('Supervisor is shutting down'));
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error('Supervisor is shutting down'));
      };

      const cleanup = () => {
        controller.signal.removeEventListener('abort', onAbort);
      };

      controller.signal.addEventListener('abort', onAbort);
    });
  }
}
