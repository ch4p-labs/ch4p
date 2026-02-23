/**
 * Tests for ToolWorkerPool — worker protocol and lifecycle.
 *
 * These tests exercise the pool infrastructure using the built-in inline
 * eval worker (DEFAULT_WORKER_SCRIPT) so they run without a prior build step.
 *
 * Integration tests against the real dist/worker.js are separate and require
 * `corepack pnpm -r build` first — see the "Real worker integration" section
 * at the bottom of this file.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ToolWorkerPool } from './worker-pool.js';
import type { WorkerTask } from './worker-pool.js';

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

const task = (overrides: Partial<WorkerTask> = {}): WorkerTask => ({
  tool:    'bash',
  args:    { command: 'echo hello' },
  context: { sessionId: 'test', cwd: '/tmp' },
  ...overrides,
});

// ===========================================================================
// hasWorkerScript
// ===========================================================================

describe('ToolWorkerPool — hasWorkerScript()', () => {
  it('returns false when no workerScript is provided', () => {
    const pool = new ToolWorkerPool();
    expect(pool.hasWorkerScript()).toBe(false);
    void pool.shutdown();
  });

  it('returns true when a workerScript path is provided', () => {
    const pool = new ToolWorkerPool({ workerScript: '/path/to/worker.js' });
    expect(pool.hasWorkerScript()).toBe(true);
    void pool.shutdown();
  });
});

// ===========================================================================
// Default inline fallback
// ===========================================================================

describe('ToolWorkerPool — default inline fallback', () => {
  let pool: ToolWorkerPool;

  afterEach(async () => {
    if (pool) await pool.shutdown();
  });

  it('returns "no tool registry" error for any tool name', async () => {
    pool = new ToolWorkerPool();
    const result = await pool.execute(task());
    expect(result.success).toBe(false);
    expect(result.error).toContain('no tool registry');
  });

  it('counts completed tasks in stats', async () => {
    pool = new ToolWorkerPool();

    await pool.execute(task());
    await pool.execute(task());

    const stats = pool.getStats();
    expect(stats.totalTasks).toBe(2);
    expect(stats.completedTasks).toBe(2);
    expect(stats.failedTasks).toBe(0);
  });

  it('initialises with zero stats', () => {
    pool = new ToolWorkerPool();
    const stats = pool.getStats();
    expect(stats.totalTasks).toBe(0);
    expect(stats.completedTasks).toBe(0);
    expect(stats.failedTasks).toBe(0);
    expect(stats.queuedTasks).toBe(0);
  });
});

// ===========================================================================
// Abort signal
// ===========================================================================

describe('ToolWorkerPool — abort signal', () => {
  let pool: ToolWorkerPool;

  afterEach(async () => {
    if (pool) await pool.shutdown();
  });

  it('rejects immediately when signal is already aborted at submit time', async () => {
    pool = new ToolWorkerPool();
    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      pool.execute(task(), ctrl.signal),
    ).rejects.toThrow(/aborted before execution/i);
  });

  it('does not increment any task counters for a pre-aborted signal', async () => {
    pool = new ToolWorkerPool();
    const ctrl = new AbortController();
    ctrl.abort();

    try {
      await pool.execute(task(), ctrl.signal);
    } catch {
      // Expected.
    }

    const stats = pool.getStats();
    expect(stats.completedTasks).toBe(0);
    // totalTasks++ is guarded by the abort check, so it stays at 0.
    expect(stats.totalTasks).toBe(0);
  });
});

// ===========================================================================
// Shutdown behaviour
// ===========================================================================

describe('ToolWorkerPool — shutdown', () => {
  it('rejects new tasks submitted after shutdown() is called', async () => {
    const pool = new ToolWorkerPool();
    const done = pool.shutdown();

    await expect(
      pool.execute(task()),
    ).rejects.toThrow(/shutting down/i);

    await done;
  });
});

// ===========================================================================
// Real worker integration (requires `corepack pnpm -r build` first)
// ===========================================================================

/**
 * To run real-worker integration tests manually:
 *
 *   corepack pnpm -r build
 *   npx vitest run packages/agent/src/worker.test.ts
 *
 * The integration test below is guarded by checking whether dist/worker.js
 * exists on disk, so it silently skips when the build has not been run.
 *
 * Expected behaviour when dist/worker.js exists:
 *   - Unknown tool → { success: false, error: 'Tool not found in worker registry: no_such_tool' }
 *   - Known tool (bash echo) → { success: true } with progress forwarded
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve dist/worker.js relative to this test file (src/worker.test.ts → ../dist/worker.js).
const __dirname = dirname(fileURLToPath(import.meta.url));
const realWorkerPath = resolve(__dirname, '../dist/worker.js');

describe.skipIf(!realWorkerPath || !existsSync(realWorkerPath!))(
  'ToolWorkerPool — real worker.js (integration)',
  () => {
    let pool: ToolWorkerPool;

    afterEach(async () => {
      if (pool) await pool.shutdown();
    });

    it('reports error for a tool that is not in the registry', async () => {
      pool = new ToolWorkerPool({ workerScript: realWorkerPath });
      const result = await pool.execute(task({ tool: 'no_such_tool' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('no_such_tool');
    });

    it('executes a tool and returns a result', async () => {
      pool = new ToolWorkerPool({ workerScript: realWorkerPath, taskTimeoutMs: 10_000 });

      const progressUpdates: string[] = [];
      // Use file_read to read this test file itself.
      // The cwd is process.cwd() (the repo root) so the path is within scope.
      const result = await pool.execute(
        {
          tool:    'file_read',
          args:    { path: fileURLToPath(import.meta.url) },
          context: { sessionId: 'test', cwd: process.cwd() },
        },
        undefined,
        (update) => progressUpdates.push(update),
      );

      // file_read of this test file should succeed.
      expect(result.success).toBe(true);
      expect(result.output).toContain('ToolWorkerPool');
    });

    it('hasWorkerScript() returns true with a real script path', () => {
      pool = new ToolWorkerPool({ workerScript: realWorkerPath });
      expect(pool.hasWorkerScript()).toBe(true);
    });
  },
);
