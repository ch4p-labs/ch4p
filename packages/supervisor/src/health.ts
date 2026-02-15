/**
 * Health monitoring for supervised children.
 *
 * Tracks heartbeats, detects unresponsive children, and records crash history.
 * Designed to work alongside the Supervisor — the supervisor delegates health
 * bookkeeping here while retaining restart authority.
 */

import { EventEmitter } from 'node:events';

// ── Types ────────────────────────────────────────────────────────────────

export interface HealthConfig {
  /** How often a heartbeat is expected, in ms. Default 5 000. */
  heartbeatIntervalMs: number;
  /** How many consecutive missed heartbeats before marking unhealthy. Default 3. */
  missedThreshold: number;
}

export interface CrashRecord {
  childId: string;
  timestamp: number;
  error?: Error;
  exitCode?: number;
  signal?: string;
}

export interface ChildHealthState {
  lastHeartbeat: number;
  missedCount: number;
  healthy: boolean;
  crashHistory: CrashRecord[];
}

export type HealthEvent =
  | { type: 'healthy'; childId: string }
  | { type: 'unhealthy'; childId: string; missedCount: number }
  | { type: 'crashed'; childId: string; error?: Error }
  | { type: 'restarted'; childId: string };

export interface HealthMonitorEvents {
  healthy: [childId: string];
  unhealthy: [childId: string, missedCount: number];
  crashed: [childId: string, error: Error | undefined];
  restarted: [childId: string];
}

// ── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  heartbeatIntervalMs: 5_000,
  missedThreshold: 3,
};

// ── HealthMonitor ────────────────────────────────────────────────────────

export class HealthMonitor extends EventEmitter<HealthMonitorEvents> {
  private readonly config: HealthConfig;
  private readonly children = new Map<string, ChildHealthState>();
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<HealthConfig>) {
    super();
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** Begin the periodic heartbeat check loop. */
  start(): void {
    if (this.checkTimer !== null) return;
    this.checkTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatIntervalMs);
    // Let the event loop exit if the monitor is the only thing alive.
    this.checkTimer.unref();
  }

  /** Stop the periodic check loop and clear all tracked state. */
  stop(): void {
    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Remove all tracked children and stop the timer. */
  dispose(): void {
    this.stop();
    this.children.clear();
    this.removeAllListeners();
  }

  // ── Child registration ───────────────────────────────────────────────

  /** Register a new child for health tracking. Idempotent. */
  registerChild(childId: string): void {
    if (this.children.has(childId)) return;
    this.children.set(childId, {
      lastHeartbeat: Date.now(),
      missedCount: 0,
      healthy: true,
      crashHistory: [],
    });
  }

  /** Unregister a child and drop its state. */
  unregisterChild(childId: string): void {
    this.children.delete(childId);
  }

  // ── Heartbeat API ────────────────────────────────────────────────────

  /** Record a heartbeat for a child, resetting its missed count. */
  recordHeartbeat(childId: string): void {
    const state = this.children.get(childId);
    if (!state) return;

    const wasPreviouslyUnhealthy = !state.healthy;
    state.lastHeartbeat = Date.now();
    state.missedCount = 0;
    state.healthy = true;

    if (wasPreviouslyUnhealthy) {
      this.emit('healthy', childId);
    }
  }

  /** Whether a specific child is currently considered healthy. */
  isHealthy(childId: string): boolean {
    const state = this.children.get(childId);
    if (!state) return false;
    return state.healthy;
  }

  // ── Crash recording ──────────────────────────────────────────────────

  /** Record a crash for a child. Appends to history and emits 'crashed'. */
  recordCrash(childId: string, error?: Error, exitCode?: number, signal?: string): void {
    let state = this.children.get(childId);
    if (!state) {
      // Tolerate recording a crash for an unregistered child — the supervisor
      // may have already torn down the registration before the exit event fires.
      state = {
        lastHeartbeat: 0,
        missedCount: 0,
        healthy: false,
        crashHistory: [],
      };
      this.children.set(childId, state);
    }

    state.healthy = false;

    const record: CrashRecord = {
      childId,
      timestamp: Date.now(),
      error,
      exitCode,
      signal,
    };
    state.crashHistory.push(record);

    this.emit('crashed', childId, error);
  }

  /** Notify the monitor that a child has been restarted. */
  recordRestart(childId: string): void {
    const state = this.children.get(childId);
    if (state) {
      state.lastHeartbeat = Date.now();
      state.missedCount = 0;
      state.healthy = true;
    }
    this.emit('restarted', childId);
  }

  // ── Queries ──────────────────────────────────────────────────────────

  /** Get the full crash history for a child. */
  getCrashHistory(childId: string): readonly CrashRecord[] {
    return this.children.get(childId)?.crashHistory ?? [];
  }

  /** Returns true only when ALL registered children are healthy. */
  getOverallHealth(): boolean {
    if (this.children.size === 0) return true;
    for (const state of this.children.values()) {
      if (!state.healthy) return false;
    }
    return true;
  }

  /** Get the health state snapshot for a specific child. */
  getChildHealth(childId: string): ChildHealthState | undefined {
    const state = this.children.get(childId);
    if (!state) return undefined;
    // Return a shallow copy so callers can't mutate internal state.
    return { ...state, crashHistory: [...state.crashHistory] };
  }

  // ── Internal ─────────────────────────────────────────────────────────

  /** Runs on a timer to detect missed heartbeats. */
  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [childId, state] of this.children) {
      if (!state.healthy && state.missedCount >= this.config.missedThreshold) {
        // Already flagged — skip noisy re-emits.
        continue;
      }

      const elapsed = now - state.lastHeartbeat;
      if (elapsed > this.config.heartbeatIntervalMs) {
        state.missedCount += 1;

        if (state.missedCount >= this.config.missedThreshold && state.healthy) {
          state.healthy = false;
          this.emit('unhealthy', childId, state.missedCount);
        }
      }
    }
  }
}
