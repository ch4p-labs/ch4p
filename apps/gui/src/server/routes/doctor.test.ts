import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDoctorResults } from './doctor.js';

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

describe('getDoctorResults', () => {
  it('returns checks even without config', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getDoctorResults();
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.summary.total).toBe(result.checks.length);
  });

  it('runs all 7 health checks with config', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      agent: { provider: 'anthropic', model: 'claude-opus-4-6' },
      engines: { default: 'claude-cli' },
      providers: {},
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getDoctorResults();
    expect(result.checks).toHaveLength(7);
    expect(result.summary.total).toBe(7);
    expect(result.summary.ok + result.summary.warn + result.summary.fail).toBe(7);
  });

  it('each check has required fields', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getDoctorResults();
    for (const check of result.checks) {
      expect(typeof check.name).toBe('string');
      expect(['ok', 'warn', 'fail']).toContain(check.status);
      expect(typeof check.message).toBe('string');
      expect(check.message.length).toBeGreaterThan(0);
    }
  });

  it('checks Node.js version', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getDoctorResults();
    const nodeCheck = result.checks.find(c => c.name.includes('Node'));
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.message).toContain('v');
  });
});
