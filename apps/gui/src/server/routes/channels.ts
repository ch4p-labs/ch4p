/**
 * GET /api/channels — list configured channels with their status.
 */

import { loadConfig, configExists } from '../config.js';

export interface ChannelInfo {
  id: string;
  enabled: boolean;
  hasCredentials: boolean;
}

export interface ChannelsResponse {
  channels: ChannelInfo[];
}

/** Check if a channel has non-empty, non-placeholder credentials. */
function hasCredentials(channelConfig: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(channelConfig)) {
    if (key === 'enabled') continue;
    if (typeof value === 'string' && value.length > 0 && !value.includes('${')) {
      return true;
    }
  }
  return false;
}

export function getChannels(): ChannelsResponse {
  if (!configExists()) return { channels: [] };

  const config = loadConfig();
  const channels: ChannelInfo[] = [];

  for (const [id, channelConfig] of Object.entries(config.channels)) {
    const cfg = channelConfig as Record<string, unknown>;
    channels.push({
      id,
      enabled: cfg['enabled'] !== false,
      hasCredentials: hasCredentials(cfg),
    });
  }

  return { channels };
}
