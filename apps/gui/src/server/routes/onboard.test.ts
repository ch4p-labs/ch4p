import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyOnboard } from './onboard.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(() => true),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  ensureConfigDir: vi.fn(),
  getConfigPath: vi.fn(() => '/tmp/.ch4p/config.json'),
}));

vi.mock('./audit.js', () => ({
  getAuditResults: vi.fn(() => ({
    results: [],
    summary: { pass: 10, warn: 0, fail: 0, total: 10 },
  })),
}));

import { loadConfig, saveConfig } from '../config.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);

function baseConfig() {
  return {
    agent: { model: 'claude-opus-4-6', provider: 'anthropic', engine: 'native' },
    providers: {},
    channels: {},
    autonomy: { level: 'supervised', allowedCommands: [] },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockLoadConfig.mockReturnValue(baseConfig() as unknown as ReturnType<typeof loadConfig>);
});

describe('applyOnboard', () => {
  it('saves engine selection', () => {
    const result = applyOnboard({
      engine: 'claude-cli',
      autonomy: 'supervised',
      channels: {},
      features: {},
    });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe('/tmp/.ch4p/config.json');
    expect(mockSaveConfig).toHaveBeenCalledTimes(1);

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    expect((saved['agent'] as Record<string, string>)['engine']).toBe('claude-cli');
  });

  it('saves provider and model', () => {
    applyOnboard({
      engine: 'api',
      provider: 'openai',
      model: 'gpt-4.1',
      autonomy: 'supervised',
      channels: {},
      features: {},
    });

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    const agent = saved['agent'] as Record<string, string>;
    expect(agent['provider']).toBe('openai');
    expect(agent['model']).toBe('gpt-4.1');
  });

  it('saves API key under provider config', () => {
    applyOnboard({
      engine: 'api',
      provider: 'anthropic',
      apiKey: 'test-key-123',
      autonomy: 'supervised',
      channels: {},
      features: {},
    });

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    const providers = saved['providers'] as Record<string, Record<string, string>>;
    expect(providers['anthropic']!['apiKey']).toBe('test-key-123');
  });

  it('saves channel configurations', () => {
    applyOnboard({
      engine: 'claude-cli',
      autonomy: 'supervised',
      channels: {
        telegram: { botToken: 'test-token' },
        discord: { botToken: 'test-discord' },
      },
      features: {},
    });

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    const channels = saved['channels'] as Record<string, Record<string, unknown>>;
    expect(channels['telegram']!['enabled']).toBe(true);
    expect(channels['telegram']!['botToken']).toBe('test-token');
    expect(channels['discord']!['enabled']).toBe(true);
  });

  it('saves autonomy level', () => {
    applyOnboard({
      engine: 'claude-cli',
      autonomy: 'full',
      channels: {},
      features: {},
    });

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    expect((saved['autonomy'] as Record<string, string>)['level']).toBe('full');
  });

  it('saves search feature config', () => {
    applyOnboard({
      engine: 'claude-cli',
      autonomy: 'supervised',
      channels: {},
      features: {
        search: { enabled: true, apiKey: 'brave-key' },
      },
    });

    const saved = mockSaveConfig.mock.calls[0]![0] as Record<string, unknown>;
    const search = saved['search'] as Record<string, unknown>;
    expect(search['enabled']).toBe(true);
    expect(search['provider']).toBe('brave');
  });

  it('returns audit results', () => {
    const result = applyOnboard({
      engine: 'claude-cli',
      autonomy: 'supervised',
      channels: {},
      features: {},
    });

    expect(result.audit).toBeDefined();
    expect(result.audit.summary.total).toBe(10);
  });
});
