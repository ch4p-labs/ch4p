import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSafeConfig, applySafeUpdates } from './config.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

import { configExists, loadConfig, saveConfig } from '../config.js';

const mockConfigExists = vi.mocked(configExists);
const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);

function validConfig() {
  return {
    agent: { engine: 'claude-cli', model: 'claude-opus-4-6', provider: 'anthropic', thinkingLevel: 'high' },
    gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
    memory: { backend: 'sqlite', autoSave: true },
    autonomy: { level: 'supervised', allowedCommands: ['bash'] },
    observability: { logLevel: 'info', observers: ['console'] },
    skills: { enabled: true, paths: ['~/.ch4p/skills'] },
    tunnel: { provider: 'none' },
    secrets: { encrypt: true },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getSafeConfig', () => {
  it('returns null when no config exists', () => {
    mockConfigExists.mockReturnValue(false);
    expect(getSafeConfig()).toBeNull();
  });

  it('returns safe config subset', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue(validConfig() as unknown as ReturnType<typeof loadConfig>);

    const result = getSafeConfig()!;
    expect(result.agent.model).toBe('claude-opus-4-6');
    expect(result.agent.provider).toBe('anthropic');
    expect(result.agent.engine).toBe('claude-cli');
    expect(result.gateway.port).toBe(18789);
    expect(result.gateway.requirePairing).toBe(true);
    expect(result.memory.backend).toBe('sqlite');
    expect(result.autonomy.level).toBe('supervised');
    expect(result.tunnel.provider).toBe('none');
    expect(result.secrets.encrypt).toBe(true);
  });

  it('does not expose API keys', () => {
    mockConfigExists.mockReturnValue(true);
    const cfg = validConfig() as Record<string, unknown>;
    cfg['providers'] = { anthropic: { apiKey: 'sk-ant-secret' } };
    mockLoadConfig.mockReturnValue(cfg as unknown as ReturnType<typeof loadConfig>);

    const result = getSafeConfig()!;
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret');
  });
});

describe('applySafeUpdates', () => {
  it('returns null when no config exists', () => {
    mockConfigExists.mockReturnValue(false);
    expect(applySafeUpdates({ agent: { model: 'test' } })).toBeNull();
  });

  it('updates model', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue(validConfig() as unknown as ReturnType<typeof loadConfig>);

    applySafeUpdates({ agent: { model: 'claude-sonnet-4-6' } });
    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    expect((saved['agent'] as Record<string, string>)['model']).toBe('claude-sonnet-4-6');
  });

  it('updates gateway port', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue(validConfig() as unknown as ReturnType<typeof loadConfig>);

    applySafeUpdates({ gateway: { port: 9999 } });
    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    expect((saved['gateway'] as Record<string, number>)['port']).toBe(9999);
  });

  it('updates autonomy level', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue(validConfig() as unknown as ReturnType<typeof loadConfig>);

    applySafeUpdates({ autonomy: { level: 'full' } });
    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    expect((saved['autonomy'] as Record<string, string>)['level']).toBe('full');
  });

  it('ignores non-whitelisted fields', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue(validConfig() as unknown as ReturnType<typeof loadConfig>);

    applySafeUpdates({ providers: { anthropic: { apiKey: 'injected' } } } as Record<string, unknown>);
    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    // providers should NOT have been modified
    expect(JSON.stringify(saved)).not.toContain('injected');
  });
});
