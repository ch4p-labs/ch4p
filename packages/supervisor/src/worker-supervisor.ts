/**
 * WorkerSupervisor — manages worker_threads as supervised children.
 *
 * Each worker is spawned as a Node.js Worker thread. The supervisor
 * translates worker 'error' and 'exit' events into the standard
 * child crash flow, so restart strategies apply uniformly.
 *
 * Message passing is proxied through per-child MessagePorts.
 */

import { Worker, type WorkerOptions } from 'node:worker_threads';
import { Supervisor, type ChildSpec, type ChildHandle } from './supervisor.js';
import type { RestartPolicy } from './strategies.js';
import type { HealthMonitor } from './health.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface WorkerChildSpec {
  id: string;
  /** Path to the worker script (absolute or relative to cwd). */
  workerPath: string;
  /** Options forwarded to the Worker constructor. */
  workerOptions?: WorkerOptions;
  /** Per-child restart policy overrides. */
  restartPolicy?: Partial<RestartPolicy>;
}

export type MessageHandler = (message: unknown) => void;

// ── WorkerSupervisor ─────────────────────────────────────────────────────

export class WorkerSupervisor extends Supervisor {
  /**
   * Active Worker instances keyed by child id.
   * Maintained separately from the base class handles because we need
   * access to the Worker API (postMessage, on('message'), etc.).
   */
  private readonly workers = new Map<string, Worker>();

  /** Per-child message handlers registered via onMessage(). */
  private readonly messageHandlers = new Map<string, Set<MessageHandler>>();

  constructor(policy?: Partial<RestartPolicy>, health?: HealthMonitor) {
    super(policy, health);
  }

  // ── Worker-specific child registration ───────────────────────────────

  /**
   * Register a worker child. Builds the ChildSpec internally so the caller
   * only needs to provide the worker script path and options.
   */
  async addWorker(spec: WorkerChildSpec): Promise<void> {
    const childSpec: ChildSpec = {
      id: spec.id,
      start: () => this.spawnWorker(spec),
      shutdown: (handle) => this.shutdownWorker(spec.id, handle),
      restartPolicy: spec.restartPolicy,
    };

    await this.addChild(childSpec);
  }

  // ── Messaging ────────────────────────────────────────────────────────

  /**
   * Post a message to a specific worker child.
   * Throws if the child does not exist or is not running.
   */
  postMessage(childId: string, message: unknown): void {
    const worker = this.workers.get(childId);
    if (!worker) {
      throw new Error(
        `Cannot post message: worker "${childId}" is not running`,
      );
    }
    worker.postMessage(message);
  }

  /**
   * Register a handler for messages from a specific worker child.
   * The handler persists across restarts — it will be re-attached
   * to the new Worker instance automatically.
   */
  onMessage(childId: string, handler: MessageHandler): () => void {
    let handlers = this.messageHandlers.get(childId);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(childId, handlers);
    }
    handlers.add(handler);

    // Attach immediately if the worker is already alive.
    const worker = this.workers.get(childId);
    if (worker) {
      worker.on('message', handler);
    }

    // Return an unsubscribe function.
    return () => {
      handlers?.delete(handler);
      const w = this.workers.get(childId);
      if (w) {
        w.off('message', handler);
      }
    };
  }

  // ── Overrides ────────────────────────────────────────────────────────

  override async stop(): Promise<void> {
    await super.stop();
    // Defensive cleanup — all workers should already be terminated by now.
    this.workers.clear();
    this.messageHandlers.clear();
  }

  override async removeChild(id: string): Promise<void> {
    await super.removeChild(id);
    this.workers.delete(id);
    this.messageHandlers.delete(id);
  }

  // ── Internal: spawn & shutdown ───────────────────────────────────────

  private async spawnWorker(spec: WorkerChildSpec): Promise<ChildHandle> {
    const worker = new Worker(spec.workerPath, spec.workerOptions);

    // Wait for the worker to come online before resolving.
    await new Promise<void>((resolve, reject) => {
      const onOnline = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        worker.off('online', onOnline);
        worker.off('error', onError);
      };
      worker.once('online', onOnline);
      worker.once('error', onError);
    });

    // Store the worker instance.
    this.workers.set(spec.id, worker);

    // Re-attach any registered message handlers.
    const handlers = this.messageHandlers.get(spec.id);
    if (handlers) {
      for (const handler of handlers) {
        worker.on('message', handler);
      }
    }

    // Wire up crash detection.
    worker.on('error', (err) => {
      this.handleWorkerError(spec.id, err);
    });

    worker.on('exit', (code) => {
      this.handleWorkerExit(spec.id, code);
    });

    const handle: ChildHandle = {
      id: spec.id,
      threadId: worker.threadId,
      kill: () => {
        // terminate() returns a Promise but we fire-and-forget for the
        // ChildHandle.kill() contract.
        worker.terminate().catch(() => {});
      },
      isAlive: () => {
        // threadId becomes -1 after the worker exits.
        return worker.threadId !== -1;
      },
    };

    return handle;
  }

  private async shutdownWorker(
    childId: string,
    _handle: ChildHandle,
  ): Promise<void> {
    const worker = this.workers.get(childId);
    if (!worker) return;

    try {
      await worker.terminate();
    } catch {
      // Already exited — ignore.
    } finally {
      this.workers.delete(childId);
    }
  }

  // ── Internal: error / exit translation ───────────────────────────────

  private handleWorkerError(childId: string, err: Error): void {
    // Clean up the stored worker reference — it is dead.
    this.workers.delete(childId);
    this.handleChildCrash(childId, err);
  }

  private handleWorkerExit(childId: string, code: number): void {
    // A code of 0 means graceful exit — only treat non-zero as a crash.
    // However, if the supervisor itself stopped the child, the child state
    // will already be 'stopped' and handleChildCrash will no-op because
    // stopping is true.
    if (code === 0) {
      this.workers.delete(childId);
      return;
    }

    this.workers.delete(childId);
    const error = new Error(
      `Worker "${childId}" exited with code ${code}`,
    );
    this.handleChildCrash(childId, error);
  }
}
