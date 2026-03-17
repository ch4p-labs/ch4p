/**
 * GET /api/config — safe config (no API keys).
 * PATCH /api/config — update config.
 */

import { loadConfig, saveConfig, configExists } from '../config.js';
import type { SafeConfig } from '../../shared/types.js';

/**
 * Build a safe config subset — strips API keys and sensitive values.
 */
export function getSafeConfig(): SafeConfig | null {
  if (!configExists()) return null;

  const config = loadConfig();
  return {
    agent: {
      engine: config.agent.engine,
      model: config.agent.model,
      provider: config.agent.provider,
      thinkingLevel: config.agent.thinkingLevel,
    },
    gateway: {
      port: config.gateway.port,
      requirePairing: config.gateway.requirePairing,
      allowPublicBind: config.gateway.allowPublicBind,
    },
    memory: {
      backend: config.memory.backend,
      autoSave: config.memory.autoSave,
    },
    autonomy: {
      level: config.autonomy.level,
      allowedCommands: config.autonomy.allowedCommands,
    },
    observability: {
      logLevel: config.observability.logLevel,
      observers: config.observability.observers,
    },
    skills: {
      enabled: config.skills.enabled,
      paths: config.skills.paths,
    },
    tunnel: {
      provider: config.tunnel.provider,
    },
    secrets: {
      encrypt: config.secrets.encrypt,
    },
  };
}

/**
 * Apply safe updates to the config. Only allows updating non-sensitive fields.
 */
export function applySafeUpdates(updates: Record<string, unknown>): SafeConfig | null {
  if (!configExists()) return null;

  const config = loadConfig();

  // Apply whitelisted updates
  const agent = updates['agent'] as Record<string, unknown> | undefined;
  if (agent) {
    if (typeof agent['model'] === 'string') config.agent.model = agent['model'];
    if (typeof agent['provider'] === 'string') config.agent.provider = agent['provider'];
    if (typeof agent['thinkingLevel'] === 'string') config.agent.thinkingLevel = agent['thinkingLevel'];
  }

  const gateway = updates['gateway'] as Record<string, unknown> | undefined;
  if (gateway) {
    if (typeof gateway['port'] === 'number') config.gateway.port = gateway['port'];
    if (typeof gateway['requirePairing'] === 'boolean') config.gateway.requirePairing = gateway['requirePairing'];
  }

  const memory = updates['memory'] as Record<string, unknown> | undefined;
  if (memory) {
    if (typeof memory['backend'] === 'string') config.memory.backend = memory['backend'];
    if (typeof memory['autoSave'] === 'boolean') config.memory.autoSave = memory['autoSave'];
  }

  const autonomy = updates['autonomy'] as Record<string, unknown> | undefined;
  if (autonomy) {
    if (typeof autonomy['level'] === 'string') config.autonomy.level = autonomy['level'];
  }

  const observability = updates['observability'] as Record<string, unknown> | undefined;
  if (observability) {
    if (typeof observability['logLevel'] === 'string') config.observability.logLevel = observability['logLevel'];
  }

  saveConfig(config);
  return getSafeConfig();
}
