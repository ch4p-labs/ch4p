import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTools } from './tools.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
  getCh4pDir: vi.fn(() => '/tmp/test-ch4p'),
}));

import { configExists, loadConfig } from '../config.js';

const mockConfigExists = vi.mocked(configExists);
const mockLoadConfig = vi.mocked(loadConfig);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getTools', () => {
  it('returns builtin tools when no config exists', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(9);
    expect(result.tools.every(t => t.type === 'builtin')).toBe(true);
    expect(result.skillsEnabled).toBe(false);
    expect(result.mcpServers).toEqual([]);
  });

  it('includes all 9 builtin tools', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getTools();
    const names = result.tools.map(t => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('list_dir');
    expect(names).toContain('shell');
    expect(names).toContain('web_search');
    expect(names).toContain('web_fetch');
    expect(names).toContain('memory_store');
    expect(names).toContain('memory_recall');
  });

  it('reads skills config when config exists', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      skills: { enabled: true, paths: ['~/.ch4p/skills'] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getTools();
    expect(result.skillsEnabled).toBe(true);
    expect(result.skillPaths).toEqual(['~/.ch4p/skills']);
  });

  it('lists MCP servers from config', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      skills: { enabled: false, paths: [] },
      mcp: {
        servers: {
          'github': { command: 'gh-mcp' },
          'filesystem': { command: 'fs-mcp' },
        },
      },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getTools();
    expect(result.mcpServers).toEqual(['github', 'filesystem']);
    expect(result.tools.filter(t => t.type === 'mcp')).toHaveLength(2);
    expect(result.tools.find(t => t.name === 'github')?.type).toBe('mcp');
  });

  it('all builtin tools have descriptions', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getTools();
    const builtins = result.tools.filter(t => t.type === 'builtin');
    for (const tool of builtins) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('all tools are enabled', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getTools();
    expect(result.tools.every(t => t.enabled)).toBe(true);
  });
});
