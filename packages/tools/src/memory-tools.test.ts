/**
 * Tests for MemoryStoreTool and MemoryRecallTool.
 *
 * These tests verify that the tools are correctly wired to the IMemoryBackend
 * via the ToolContext.  The critical regression being guarded: the model was
 * telling users "memory is not available" because (a) the system prompt never
 * mentioned memory, and (b) calling these tools without a memoryBackend in the
 * context throws a ToolError that propagated as "not wired".
 */

import { describe, it, expect, vi } from 'vitest';
import type { IMemoryBackend, ToolContext } from '@ch4p/core';
import { ToolError } from '@ch4p/core';
import { MemoryStoreTool } from './memory-store.js';
import { MemoryRecallTool } from './memory-recall.js';
import type { MemoryToolContext } from './memory-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemoryBackend(): IMemoryBackend {
  const store = new Map<string, { content: string; metadata?: Record<string, unknown> }>();
  return {
    store: vi.fn(async (key: string, content: string, metadata?: Record<string, unknown>) => {
      store.set(key, { content, metadata });
    }),
    recall: vi.fn(async (query: string) => {
      const results: Array<{ key: string; content: string; score: number; matchType: string }> = [];
      for (const [key, { content }] of store) {
        if (content.includes(query) || key.includes(query)) {
          results.push({ key, content, score: 0.9, matchType: 'keyword' });
        }
      }
      return results;
    }),
    delete: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  } as unknown as IMemoryBackend;
}

function makeContext(memoryBackend?: IMemoryBackend): MemoryToolContext {
  return {
    sessionId: 'test-session',
    cwd: '/tmp',
    securityPolicy: {} as ToolContext['securityPolicy'],
    abortSignal: new AbortController().signal,
    onProgress: () => {},
    memoryBackend,
  };
}

// ---------------------------------------------------------------------------
// MemoryStoreTool
// ---------------------------------------------------------------------------

describe('MemoryStoreTool', () => {
  const tool = new MemoryStoreTool();

  it('has correct name and weight', () => {
    expect(tool.name).toBe('memory_store');
    expect(tool.weight).toBe('lightweight');
  });

  it('stores a memory entry when backend is present', async () => {
    const backend = makeMemoryBackend();
    const ctx = makeContext(backend);

    const result = await tool.execute({ key: 'user/pref', content: 'User prefers dark mode' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('user/pref');
    expect(backend.store).toHaveBeenCalledWith(
      'user/pref',
      'User prefers dark mode',
      undefined,
    );
  });

  it('stores a memory entry with metadata', async () => {
    const backend = makeMemoryBackend();
    const ctx = makeContext(backend);

    const result = await tool.execute(
      { key: 'proj/arch', content: 'Use event sourcing', metadata: { source: 'discussion' } },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(backend.store).toHaveBeenCalledWith('proj/arch', 'Use event sourcing', { source: 'discussion' });
  });

  it('throws ToolError when no memory backend is in context', async () => {
    const ctx = makeContext(undefined);

    await expect(
      tool.execute({ key: 'test', content: 'hello' }, ctx),
    ).rejects.toThrow(ToolError);
  });

  it('returns validation error for missing key', async () => {
    const ctx = makeContext(makeMemoryBackend());
    const result = await tool.execute({ content: 'hello' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('key');
  });

  it('returns validation error for missing content', async () => {
    const ctx = makeContext(makeMemoryBackend());
    const result = await tool.execute({ key: 'k' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  it('returns validation error for key exceeding 256 chars', async () => {
    const ctx = makeContext(makeMemoryBackend());
    const result = await tool.execute({ key: 'a'.repeat(257), content: 'hello' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('256');
  });

  it('handles backend store failure gracefully', async () => {
    const backend = makeMemoryBackend();
    vi.mocked(backend.store).mockRejectedValueOnce(new Error('disk full'));
    const ctx = makeContext(backend);

    const result = await tool.execute({ key: 'k', content: 'v' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('disk full');
  });
});

// ---------------------------------------------------------------------------
// MemoryRecallTool
// ---------------------------------------------------------------------------

describe('MemoryRecallTool', () => {
  const tool = new MemoryRecallTool();

  it('has correct name and weight', () => {
    expect(tool.name).toBe('memory_recall');
    expect(tool.weight).toBe('lightweight');
  });

  it('recalls matching entries when backend is present', async () => {
    const backend = makeMemoryBackend();
    // Pre-populate the backend.
    await backend.store('user/pref', 'dark mode preference', {});

    const ctx = makeContext(backend);
    const result = await tool.execute({ query: 'dark mode' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('dark mode');
    expect(result.metadata?.resultCount).toBe(1);
  });

  it('returns "no results" message when nothing matches', async () => {
    const backend = makeMemoryBackend();
    const ctx = makeContext(backend);

    const result = await tool.execute({ query: 'nonexistent query xyz' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matching');
    expect(result.metadata?.resultCount).toBe(0);
  });

  it('throws ToolError when no memory backend is in context', async () => {
    const ctx = makeContext(undefined);

    await expect(
      tool.execute({ query: 'test' }, ctx),
    ).rejects.toThrow(ToolError);
  });

  it('respects the limit parameter', async () => {
    const backend = makeMemoryBackend();
    // Populate many entries.
    for (let i = 0; i < 5; i++) {
      await backend.store(`entry/${i}`, `test content ${i}`, {});
    }
    // Make recall return all of them.
    vi.mocked(backend.recall).mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({
        key: `entry/${i}`,
        content: `test content ${i}`,
        score: 0.9,
        matchType: 'keyword' as const,
      })),
    );

    const ctx = makeContext(backend);
    const result = await tool.execute({ query: 'test content', limit: 3 }, ctx);

    expect(result.success).toBe(true);
    // Should pass the requested limit to the backend.
    expect(backend.recall).toHaveBeenCalledWith('test content', { limit: 3 });
  });

  it('returns validation error for missing query', async () => {
    const ctx = makeContext(makeMemoryBackend());
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('returns validation error for limit exceeding max', async () => {
    const ctx = makeContext(makeMemoryBackend());
    const result = await tool.execute({ query: 'test', limit: 100 }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('50');
  });
});

// ---------------------------------------------------------------------------
// ToolRegistry wiring check
// ---------------------------------------------------------------------------

describe('ToolRegistry default includes memory tools', () => {
  it('registers memory_store and memory_recall in the default set', async () => {
    const { ToolRegistry } = await import('./registry.js');
    const registry = ToolRegistry.createDefault();
    expect(registry.has('memory_store')).toBe(true);
    expect(registry.has('memory_recall')).toBe(true);
  });

  it('excludes memory tools when explicitly excluded', async () => {
    const { ToolRegistry } = await import('./registry.js');
    const registry = ToolRegistry.createDefault({ exclude: ['memory_store', 'memory_recall'] });
    expect(registry.has('memory_store')).toBe(false);
    expect(registry.has('memory_recall')).toBe(false);
  });
});
