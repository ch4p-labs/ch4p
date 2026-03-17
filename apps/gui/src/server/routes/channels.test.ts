import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChannels } from './channels.js';

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

describe('getChannels', () => {
  it('returns empty when no config exists', () => {
    mockConfigExists.mockReturnValue(false);
    const result = getChannels();
    expect(result.channels).toEqual([]);
  });

  it('returns empty when config has no channels', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      channels: {},
    } as ReturnType<typeof loadConfig>);
    const result = getChannels();
    expect(result.channels).toEqual([]);
  });

  it('returns enabled channels with credential status', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      channels: {
        telegram: { enabled: true, botToken: 'test-bot-token' },
        discord: { enabled: true, botToken: '' },
        slack: { enabled: false, botToken: 'test-slack-token' },
      },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getChannels();
    expect(result.channels).toHaveLength(3);

    const telegram = result.channels.find(c => c.id === 'telegram');
    expect(telegram?.enabled).toBe(true);
    expect(telegram?.hasCredentials).toBe(true);

    const discord = result.channels.find(c => c.id === 'discord');
    expect(discord?.enabled).toBe(true);
    expect(discord?.hasCredentials).toBe(false);

    const slack = result.channels.find(c => c.id === 'slack');
    expect(slack?.enabled).toBe(false);
    expect(slack?.hasCredentials).toBe(true);
  });

  it('ignores placeholder env var credentials', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      channels: {
        telegram: { enabled: true, botToken: '${TELEGRAM_BOT_TOKEN}' },
      },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getChannels();
    expect(result.channels[0]!.hasCredentials).toBe(false);
  });

  it('treats channels without explicit enabled as enabled', () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      channels: {
        imessage: {},
      },
    } as unknown as ReturnType<typeof loadConfig>);

    const result = getChannels();
    expect(result.channels[0]!.enabled).toBe(true);
  });
});
