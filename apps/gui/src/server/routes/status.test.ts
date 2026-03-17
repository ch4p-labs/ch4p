import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStatus } from './status.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(() => '/tmp/.ch4p/config.json'),
  getCh4pDir: vi.fn(() => '/tmp/.ch4p'),
}));

import { configExists, loadConfig } from '../config.js';

const mockConfigExists = vi.mocked(configExists);
const mockLoadConfig = vi.mocked(loadConfig);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getStatus', () => {
  it('returns defaults when no config exists', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getStatus();
    expect(result.configExists).toBe(false);
    expect(result.provider).toBe('');
    expect(result.model).toBe('');
    expect(result.channels).toEqual([]);
    expect(result.version).toBeTruthy();
  });

  it('returns full status with valid config', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      agent: { provider: 'anthropic', model: 'claude-opus-4-6' },
      engines: { default: 'claude-cli' },
      autonomy: { level: 'supervised' },
      memory: { backend: 'sqlite', autoSave: true },
      gateway: { port: 18789, requirePairing: true },
      channels: { telegram: { enabled: true }, discord: { enabled: true } },
      tunnel: { provider: 'none' },
      observability: { observers: ['console'] },
      secrets: { encrypt: true },
      providers: {},
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getStatus();
    expect(result.configExists).toBe(true);
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-opus-4-6');
    expect(result.engine).toBe('claude-cli');
    expect(result.autonomy).toBe('supervised');
    expect(result.channels).toContain('telegram');
    expect(result.channels).toContain('discord');
    expect(result.memory.backend).toBe('sqlite');
    expect(result.gateway.port).toBe(18789);
    expect(result.secretsEncrypted).toBe(true);
  });

  it('detects API key presence', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      agent: { provider: 'anthropic', model: 'claude-opus-4-6' },
      engines: { default: 'native' },
      autonomy: { level: 'supervised' },
      memory: { backend: 'sqlite', autoSave: true },
      gateway: { port: 18789, requirePairing: true },
      channels: {},
      tunnel: { provider: 'none' },
      observability: { observers: [] },
      secrets: { encrypt: true },
      providers: {
        anthropic: { apiKey: 'test-api-key-value' },
        openai: { apiKey: '${OPENAI_API_KEY}' },
      },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getStatus();
    expect(result.apiKeys.anthropic).toBe(true);
    expect(result.apiKeys.openai).toBe(false); // placeholder
  });

  it('always returns a version string', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getStatus();
    expect(typeof result.version).toBe('string');
    expect(result.version.length).toBeGreaterThan(0);
  });
});
