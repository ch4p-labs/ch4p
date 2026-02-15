/**
 * ProcessSupervisor — manages child processes as supervised children.
 *
 * Spawns OS processes via child_process.spawn and translates their
 * lifecycle events (error, exit) into the standard supervisor crash flow.
 * Used for CLI engine wrappers such as claude-cli and codex-cli.
 *
 * Stdout and stderr are captured and forwarded through per-child handlers
 * so the rest of the system can consume process output without coupling
 * to the raw ChildProcess object.
 */

import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import { Supervisor, type ChildSpec, type ChildHandle } from './supervisor.js';
import type { RestartPolicy } from './strategies.js';
import type { HealthMonitor } from './health.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface ProcessChildSpec {
  id: string;
  /** Command to execute (e.g. 'node', 'python'). */
  command: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Options forwarded to child_process.spawn. */
  spawnOptions?: SpawnOptions;
  /** Per-child restart policy overrides. */
  restartPolicy?: Partial<RestartPolicy>;
}

export type DataHandler = (data: Buffer) => void;

// ── ProcessSupervisor ────────────────────────────────────────────────────

export class ProcessSupervisor extends Supervisor {
  /**
   * Active ChildProcess instances keyed by child id.
   */
  private readonly processes = new Map<string, ChildProcess>();

  /** Per-child stdout handlers that persist across restarts. */
  private readonly stdoutHandlers = new Map<string, Set<DataHandler>>();

  /** Per-child stderr handlers that persist across restarts. */
  private readonly stderrHandlers = new Map<string, Set<DataHandler>>();

  constructor(policy?: Partial<RestartPolicy>, health?: HealthMonitor) {
    super(policy, health);
  }

  // ── Process-specific child registration ──────────────────────────────

  /**
   * Register a process child. Builds the ChildSpec internally so the
   * caller only needs to provide the command, args, and options.
   */
  async addProcess(spec: ProcessChildSpec): Promise<void> {
    const childSpec: ChildSpec = {
      id: spec.id,
      start: () => this.spawnProcess(spec),
      shutdown: (handle) => this.shutdownProcess(spec.id, handle),
      restartPolicy: spec.restartPolicy,
    };

    await this.addChild(childSpec);
  }

  // ── I/O ──────────────────────────────────────────────────────────────

  /**
   * Write data to a child process's stdin.
   * Throws if the child does not exist, is not running, or stdin is not
   * piped (set stdio: ['pipe', ...] in spawnOptions).
   */
  sendInput(childId: string, data: string | Buffer): void {
    const proc = this.processes.get(childId);
    if (!proc) {
      throw new Error(
        `Cannot send input: process "${childId}" is not running`,
      );
    }
    if (!proc.stdin) {
      throw new Error(
        `Cannot send input: stdin not available for process "${childId}". ` +
          'Ensure spawnOptions.stdio includes "pipe" for stdin.',
      );
    }
    proc.stdin.write(data);
  }

  /**
   * Register a handler for stdout data from a specific child process.
   * The handler persists across restarts.
   */
  onStdout(childId: string, handler: DataHandler): () => void {
    let handlers = this.stdoutHandlers.get(childId);
    if (!handlers) {
      handlers = new Set();
      this.stdoutHandlers.set(childId, handlers);
    }
    handlers.add(handler);

    // Attach immediately if the process is already alive.
    const proc = this.processes.get(childId);
    if (proc?.stdout) {
      proc.stdout.on('data', handler);
    }

    return () => {
      handlers?.delete(handler);
      const p = this.processes.get(childId);
      if (p?.stdout) {
        p.stdout.off('data', handler);
      }
    };
  }

  /**
   * Register a handler for stderr data from a specific child process.
   * The handler persists across restarts.
   */
  onStderr(childId: string, handler: DataHandler): () => void {
    let handlers = this.stderrHandlers.get(childId);
    if (!handlers) {
      handlers = new Set();
      this.stderrHandlers.set(childId, handlers);
    }
    handlers.add(handler);

    const proc = this.processes.get(childId);
    if (proc?.stderr) {
      proc.stderr.on('data', handler);
    }

    return () => {
      handlers?.delete(handler);
      const p = this.processes.get(childId);
      if (p?.stderr) {
        p.stderr.off('data', handler);
      }
    };
  }

  // ── Overrides ────────────────────────────────────────────────────────

  override async stop(): Promise<void> {
    await super.stop();
    // Defensive cleanup.
    this.processes.clear();
    this.stdoutHandlers.clear();
    this.stderrHandlers.clear();
  }

  override async removeChild(id: string): Promise<void> {
    await super.removeChild(id);
    this.processes.delete(id);
    this.stdoutHandlers.delete(id);
    this.stderrHandlers.delete(id);
  }

  // ── Internal: spawn & shutdown ───────────────────────────────────────

  private async spawnProcess(spec: ProcessChildSpec): Promise<ChildHandle> {
    const proc = spawn(spec.command, spec.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spec.spawnOptions,
    });

    // Wait for the process to actually spawn before resolving.
    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        proc.off('spawn', onSpawn);
        proc.off('error', onError);
      };
      proc.once('spawn', onSpawn);
      proc.once('error', onError);
    });

    // Store the process reference.
    this.processes.set(spec.id, proc);

    // Attach persisted stdout/stderr handlers.
    this.attachOutputHandlers(spec.id, proc);

    // Wire up crash detection.
    proc.on('error', (err) => {
      this.handleProcessError(spec.id, err);
    });

    proc.on('exit', (code, signal) => {
      this.handleProcessExit(spec.id, code, signal);
    });

    const handle: ChildHandle = {
      id: spec.id,
      pid: proc.pid,
      kill: () => {
        // Try SIGTERM first, SIGKILL as fallback after a short delay.
        if (!proc.killed) {
          proc.kill('SIGTERM');
          // If the process hasn't exited within 5s, force-kill.
          const forceKillTimer = setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5_000);
          forceKillTimer.unref();
        }
      },
      isAlive: () => {
        return !proc.killed && proc.exitCode === null;
      },
    };

    return handle;
  }

  private async shutdownProcess(
    childId: string,
    _handle: ChildHandle,
  ): Promise<void> {
    const proc = this.processes.get(childId);
    if (!proc) return;

    // Send SIGTERM and give the process time to exit gracefully.
    if (!proc.killed && proc.exitCode === null) {
      proc.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force-kill if still alive.
          if (!proc.killed && proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
          resolve();
        }, 5_000);
        timeout.unref();

        proc.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.processes.delete(childId);
  }

  // ── Internal: output handler attachment ──────────────────────────────

  private attachOutputHandlers(childId: string, proc: ChildProcess): void {
    const stdoutH = this.stdoutHandlers.get(childId);
    if (stdoutH && proc.stdout) {
      for (const handler of stdoutH) {
        proc.stdout.on('data', handler);
      }
    }

    const stderrH = this.stderrHandlers.get(childId);
    if (stderrH && proc.stderr) {
      for (const handler of stderrH) {
        proc.stderr.on('data', handler);
      }
    }
  }

  // ── Internal: error / exit translation ───────────────────────────────

  private handleProcessError(childId: string, err: Error): void {
    this.processes.delete(childId);
    this.handleChildCrash(childId, err);
  }

  private handleProcessExit(
    childId: string,
    code: number | null,
    signal: string | null,
  ): void {
    // Graceful exit (code 0, no signal) — not a crash.
    if (code === 0 && !signal) {
      this.processes.delete(childId);
      return;
    }

    this.processes.delete(childId);

    const reason = signal
      ? `Process "${childId}" killed by signal ${signal}`
      : `Process "${childId}" exited with code ${code ?? 'unknown'}`;

    const error = new Error(reason);
    this.handleChildCrash(childId, error);
  }
}
