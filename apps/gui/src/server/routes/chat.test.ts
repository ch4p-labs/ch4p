import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

import { configExists } from '../config.js';
import { existsSync } from 'node:fs';

const mockConfigExists = vi.mocked(configExists);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('handleChat', () => {
  it('returns error when no config exists', async () => {
    mockConfigExists.mockReturnValue(false);
    const { handleChat } = await import('./chat.js');
    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('no_config');
    expect(result.reply).toContain('Setup Wizard');
  });

  it('returns error when CLI entry not found', async () => {
    mockConfigExists.mockReturnValue(true);
    mockExistsSync.mockReturnValue(false);
    const { handleChat } = await import('./chat.js');
    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('cli_not_found');
  });
});
