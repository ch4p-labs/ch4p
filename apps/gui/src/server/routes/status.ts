/**
 * GET /api/status — system status (mirrors `ch4p status` CLI command).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, getConfigPath, getCh4pDir, configExists } from '../config.js';
import type { StatusResponse } from '../../shared/types.js';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const paths = [
      resolve(__dirname, '..', 'package.json'),
      resolve(__dirname, '..', '..', 'package.json'),
      resolve(__dirname, '..', '..', '..', 'package.json'),
    ];
    for (const p of paths) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch { /* try next */ }
    }
  } catch { /* fallback */ }
  return '0.4.0';
}

function checkApiKey(config: Record<string, unknown>, provider: string): boolean {
  const providerConfig = (config as Record<string, Record<string, unknown>>).providers?.[provider];
  const key = providerConfig?.['apiKey'];
  return typeof key === 'string' && key.length > 0 && !key.includes('${');
}

export function getStatus(): StatusResponse {
  const configPath = getConfigPath();
  const hasConfig = configExists();
  const ch4pDir = getCh4pDir();

  if (!hasConfig) {
    return {
      version: getVersion(),
      configPath,
      configExists: false,
      dataDir: ch4pDir,
      provider: '',
      model: '',
      engine: '',
      autonomy: '',
      memory: { backend: '', autoSave: false },
      gateway: { port: 18789, requirePairing: true },
      channels: [],
      tunnel: '',
      observers: [],
      secretsEncrypted: true,
      apiKeys: { anthropic: false, openai: false },
    };
  }

  const config = loadConfig();
  return {
    version: getVersion(),
    configPath,
    configExists: true,
    dataDir: ch4pDir,
    provider: config.agent.provider,
    model: config.agent.model,
    engine: config.engines.default,
    autonomy: config.autonomy.level,
    memory: { backend: config.memory.backend, autoSave: config.memory.autoSave },
    gateway: { port: config.gateway.port, requirePairing: config.gateway.requirePairing },
    channels: Object.keys(config.channels),
    tunnel: config.tunnel.provider,
    observers: config.observability.observers,
    secretsEncrypted: config.secrets.encrypt,
    apiKeys: {
      anthropic: checkApiKey(config as unknown as Record<string, unknown>, 'anthropic'),
      openai: checkApiKey(config as unknown as Record<string, unknown>, 'openai'),
    },
  };
}
