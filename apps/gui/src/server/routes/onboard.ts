/**
 * POST /api/onboard — save config from the onboarding wizard.
 */

import { loadConfig, saveConfig, ensureConfigDir, getConfigPath } from '../config.js';
import { getAuditResults } from './audit.js';
import type { OnboardPayload, OnboardResponse } from '../../shared/types.js';

export function applyOnboard(payload: OnboardPayload): OnboardResponse {
  ensureConfigDir();
  const config = loadConfig();

  // Engine
  config.agent.engine = payload.engine;

  // Provider + model (API key path)
  if (payload.provider) {
    config.agent.provider = payload.provider;
  }
  if (payload.model) {
    config.agent.model = payload.model;
  }
  if (payload.apiKey && payload.provider) {
    if (!config.providers) config.providers = {};
    config.providers[payload.provider] = {
      ...(config.providers[payload.provider] as Record<string, unknown> ?? {}),
      apiKey: payload.apiKey,
    };
  }

  // Autonomy
  config.autonomy.level = payload.autonomy;

  // Channels
  for (const [id, channelConfig] of Object.entries(payload.channels)) {
    config.channels[id] = { enabled: true, ...channelConfig };
  }

  // Additional providers
  if (payload.features.providers) {
    if (!config.providers) config.providers = {};
    for (const [id, providerConfig] of Object.entries(payload.features.providers)) {
      config.providers[id] = {
        ...(config.providers[id] as Record<string, unknown> ?? {}),
        ...providerConfig,
      };
    }
  }

  // Search
  if (payload.features.search?.enabled) {
    (config as Record<string, unknown>).search = {
      enabled: true,
      provider: 'brave',
      apiKey: payload.features.search.apiKey ?? '',
      maxResults: 5,
    };
  }

  // Save
  saveConfig(config);

  // Run audit
  const audit = getAuditResults();

  return {
    success: true,
    configPath: getConfigPath(),
    audit,
  };
}
