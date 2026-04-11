import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs.existsSync to control whether GUI entry is found
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn() };
});

import { existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('gui command', () => {
  it('sets exitCode when GUI entry point is not found', async () => {
    mockExistsSync.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { gui } = await import('./gui.js');
    await gui([]);

    expect(process.exitCode).toBe(1);
    consoleSpy.mockRestore();
  });

  it('parses --port argument', async () => {
    // Just verify the function doesn't crash with port args
    mockExistsSync.mockReturnValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { gui } = await import('./gui.js');
    await gui(['--port', '9999']);

    expect(process.exitCode).toBe(1); // still fails (no GUI built)
    vi.restoreAllMocks();
  });

  it('parses --no-open argument', async () => {
    mockExistsSync.mockReturnValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { gui } = await import('./gui.js');
    await gui(['--no-open']);

    expect(process.exitCode).toBe(1);
    vi.restoreAllMocks();
  });
});
