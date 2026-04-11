import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuditResults } from './audit.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
}));

import { configExists, loadConfig } from '../config.js';

const mockConfigExists = vi.mocked(configExists);
const mockLoadConfig = vi.mocked(loadConfig);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getAuditResults', () => {
  it('returns empty when no config', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getAuditResults();
    expect(result.results).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it('runs all 10 checks with valid config', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
      security: { workspaceOnly: true, blockedPaths: [] },
      autonomy: { level: 'supervised', allowedCommands: ['bash'] },
      secrets: { encrypt: true },
      providers: {},
      engines: { default: 'claude-cli' },
      agent: { provider: 'anthropic' },
      tunnel: { provider: 'none' },
      observability: { observers: ['console'] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getAuditResults();
    expect(result.results).toHaveLength(10);
    expect(result.summary.total).toBe(10);
    expect(result.summary.pass + result.summary.warn + result.summary.fail).toBe(10);
  });

  it('flags public gateway binding as fail', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789, requirePairing: true, allowPublicBind: true },
      security: { workspaceOnly: true, blockedPaths: [] },
      autonomy: { level: 'supervised', allowedCommands: [] },
      secrets: { encrypt: true },
      providers: {},
      engines: { default: 'native' },
      agent: { provider: 'anthropic' },
      tunnel: { provider: 'none' },
      observability: { observers: [] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getAuditResults();
    const binding = result.results.find(r => r.name === 'Gateway binding');
    expect(binding?.severity).toBe('fail');
  });

  it('flags disabled encryption as fail', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
      security: { workspaceOnly: true, blockedPaths: [] },
      autonomy: { level: 'supervised', allowedCommands: [] },
      secrets: { encrypt: false },
      providers: {},
      engines: { default: 'native' },
      agent: { provider: 'anthropic' },
      tunnel: { provider: 'none' },
      observability: { observers: [] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getAuditResults();
    const secrets = result.results.find(r => r.name === 'Secrets encryption');
    expect(secrets?.severity).toBe('fail');
  });

  it('flags full autonomy as warn', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
      security: { workspaceOnly: true, blockedPaths: [] },
      autonomy: { level: 'full', allowedCommands: [] },
      secrets: { encrypt: true },
      providers: {},
      engines: { default: 'native' },
      agent: { provider: 'anthropic' },
      tunnel: { provider: 'none' },
      observability: { observers: [] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getAuditResults();
    const autonomy = result.results.find(r => r.name === 'Autonomy level');
    expect(autonomy?.severity).toBe('warn');
  });

  it('each result has required fields', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
      security: { workspaceOnly: true, blockedPaths: [] },
      autonomy: { level: 'supervised', allowedCommands: [] },
      secrets: { encrypt: true },
      providers: {},
      engines: { default: 'native' },
      agent: { provider: 'anthropic' },
      tunnel: { provider: 'none' },
      observability: { observers: [] },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getAuditResults();
    for (const item of result.results) {
      expect(typeof item.id).toBe('number');
      expect(typeof item.name).toBe('string');
      expect(['pass', 'warn', 'fail']).toContain(item.severity);
      expect(typeof item.message).toBe('string');
      expect(item.message.length).toBeGreaterThan(0);
    }
  });
});
