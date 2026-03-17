/**
 * Config loading for the GUI server.
 *
 * Copied from apps/cli/src/config.ts to avoid cross-package import.
 * TODO: extract to @ch4p/config shared package.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CH4P_DIR_NAME = '.ch4p';
const CONFIG_FILE_NAME = 'config.json';
const LOGS_DIR_NAME = 'logs';

export function getCh4pDir(): string {
  return resolve(homedir(), CH4P_DIR_NAME);
}

export function getConfigPath(): string {
  return join(getCh4pDir(), CONFIG_FILE_NAME);
}

export function getLogsDir(): string {
  return join(getCh4pDir(), LOGS_DIR_NAME);
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

export function ensureConfigDir(): void {
  const dir = getCh4pDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Config type (inline to avoid @ch4p/core import in server bundle)
// ---------------------------------------------------------------------------

export interface GuiConfig {
  agent: { model: string; provider: string; thinkingLevel?: string; [k: string]: unknown };
  providers: Record<string, Record<string, unknown>>;
  channels: Record<string, unknown>;
  memory: { backend: string; autoSave: boolean; [k: string]: unknown };
  gateway: { port: number; requirePairing: boolean; allowPublicBind: boolean; [k: string]: unknown };
  security: { workspaceOnly: boolean; blockedPaths: string[]; [k: string]: unknown };
  autonomy: { level: string; allowedCommands: string[]; [k: string]: unknown };
  engines: { default: string; available: Record<string, unknown>; [k: string]: unknown };
  tunnel: { provider: string; [k: string]: unknown };
  secrets: { encrypt: boolean; [k: string]: unknown };
  observability: { observers: string[]; logLevel: string; [k: string]: unknown };
  skills: { enabled: boolean; paths: string[]; autoLoad: boolean; contextBudget: number; [k: string]: unknown };
  verification: { enabled: boolean; semantic: boolean; [k: string]: unknown };
  mesh: { enabled: boolean; maxConcurrency: number; defaultTimeout: number; [k: string]: unknown };
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export function getDefaultConfig(): GuiConfig {
  return {
    agent: { model: 'claude-sonnet-4-6', provider: 'anthropic', thinkingLevel: 'medium' },
    providers: {
      anthropic: { apiKey: '${ANTHROPIC_API_KEY}' },
      openai: { apiKey: '${OPENAI_API_KEY}' },
    },
    channels: {},
    memory: { backend: 'sqlite', autoSave: true, vectorWeight: 0.7, keywordWeight: 0.3 },
    gateway: { port: 18789, requirePairing: true, allowPublicBind: false },
    security: { workspaceOnly: true, blockedPaths: [] },
    autonomy: {
      level: 'supervised',
      allowedCommands: ['bash', 'sh', 'git', 'npm', 'pnpm', 'node', 'npx', 'cargo', 'ls', 'cat', 'grep', 'find', 'wc', 'sort', 'head', 'tail', 'mkdir', 'cp', 'mv', 'echo', 'touch'],
    },
    engines: {
      default: 'native',
      available: {
        native: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        'claude-cli': { command: 'claude', timeout: 600000 },
        'codex-cli': { command: 'codex', timeout: 600000 },
      },
    },
    tunnel: { provider: 'none' },
    secrets: { encrypt: true },
    observability: { observers: ['console'], logLevel: 'info' },
    skills: { enabled: true, paths: ['~/.ch4p/skills', '.ch4p/skills', '.agents/skills'], autoLoad: true, contextBudget: 16000 },
    verification: { enabled: true, semantic: true },
    mesh: { enabled: false, maxConcurrency: 3, defaultTimeout: 120000 },
  };
}

// ---------------------------------------------------------------------------
// .env file loading
// ---------------------------------------------------------------------------

function loadEnvFile(): void {
  const envPath = join(getCh4pDir(), '.env');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const stripped = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = stripped.indexOf('=');
    if (eqIdx === -1) continue;
    const key = stripped.slice(0, eqIdx).trim();
    let value = stripped.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Deep merge + env resolution
// ---------------------------------------------------------------------------

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_m, v: string) => process.env[v] ?? '');
  }
  if (Array.isArray(obj)) return obj.map((i) => resolveEnvVars(i));
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return obj;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadConfig(): GuiConfig {
  loadEnvFile();
  const defaults = getDefaultConfig();
  let merged: GuiConfig = defaults;

  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf8');
    const userConfig = JSON.parse(raw) as Record<string, unknown>;
    merged = deepMerge(defaults as unknown as Record<string, unknown>, userConfig) as unknown as GuiConfig;
  }

  return resolveEnvVars(merged) as GuiConfig;
}

export function saveConfig(config: GuiConfig): void {
  const ch4pDir = getCh4pDir();
  if (!existsSync(ch4pDir)) mkdirSync(ch4pDir, { recursive: true, mode: 0o700 });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}
