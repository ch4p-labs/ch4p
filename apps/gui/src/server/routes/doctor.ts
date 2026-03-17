/**
 * GET /api/doctor — health checks (mirrors `ch4p doctor` CLI command).
 */

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { loadConfig, getConfigPath, getCh4pDir, configExists } from '../config.js';
import { getAuditResults } from './audit.js';
import type { CheckResult, DoctorResponse } from '../../shared/types.js';

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]!, 10);
  return major >= 22
    ? { name: 'Node.js version', status: 'ok', message: `Node.js ${version} (>= 22 required)` }
    : { name: 'Node.js version', status: 'fail', message: `Node.js ${version} detected. Version >= 22 is required.` };
}

function checkConfigFile(): CheckResult {
  const path = getConfigPath();
  if (!configExists()) {
    return { name: 'Config file', status: 'fail', message: `Not found at ${path}. Run 'ch4p onboard' to create.` };
  }
  try {
    loadConfig();
    return { name: 'Config file', status: 'ok', message: `Valid config at ${path}` };
  } catch (err) {
    return { name: 'Config file', status: 'fail', message: `Invalid config: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function checkDataDir(): CheckResult {
  const dir = getCh4pDir();
  return existsSync(dir)
    ? { name: 'Data directory', status: 'ok', message: `Exists at ${dir}` }
    : { name: 'Data directory', status: 'warn', message: `Not found at ${dir}. Will be created on first use.` };
}

function checkMemoryDatabase(): CheckResult {
  const dir = getCh4pDir();
  return existsSync(dir)
    ? { name: 'Memory database', status: 'ok', message: 'Data directory accessible. SQLite will initialize on first use.' }
    : { name: 'Memory database', status: 'warn', message: 'Data directory does not exist yet. Memory will be initialized on first use.' };
}

function checkApiKeys(): CheckResult {
  if (!configExists()) {
    return { name: 'API keys', status: 'warn', message: 'No config file. Cannot check API keys.' };
  }
  try {
    const config = loadConfig();
    const engineDefault = config.engines?.default ?? 'native';
    if (engineDefault === 'claude-cli' || engineDefault === 'codex-cli') {
      return { name: 'API keys', status: 'ok', message: `Using ${engineDefault} engine. Auth handled by CLI tool.` };
    }
    if (config.agent?.provider === 'ollama') {
      return { name: 'API keys', status: 'ok', message: 'Using Ollama provider. No API key required (local inference).' };
    }
    const providerName = config.agent?.provider ?? 'anthropic';
    const providerConfig = config.providers?.[providerName];
    const apiKey = providerConfig?.['apiKey'];
    const envKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
    const hasKey =
      (typeof apiKey === 'string' && apiKey.length > 0 && !apiKey.includes('${')) ||
      (typeof envKey === 'string' && envKey.length > 0);
    return hasKey
      ? { name: 'API keys', status: 'ok', message: `${providerName} key configured.` }
      : { name: 'API keys', status: 'fail', message: `No API key for provider "${providerName}".` };
  } catch {
    return { name: 'API keys', status: 'warn', message: 'Could not load config to check keys.' };
  }
}

function checkSubprocessEngine(engineId: string): CheckResult {
  const command = engineId === 'claude-cli' ? 'claude' : engineId === 'codex-cli' ? 'codex' : engineId;
  try {
    execSync(`${command} --version`, { timeout: 5000, stdio: 'pipe' });
    return { name: `${engineId} binary`, status: 'ok', message: `${command} found on PATH.` };
  } catch {
    return { name: `${engineId} binary`, status: 'fail', message: `${command} not found or not responding.` };
  }
}

function checkSecurityAudit(): CheckResult {
  if (!configExists()) {
    return { name: 'Security audit', status: 'warn', message: 'No config file. Cannot run audit.' };
  }
  try {
    const { results } = getAuditResults();
    const passed = results.filter((r) => r.severity === 'pass').length;
    const warned = results.filter((r) => r.severity === 'warn').length;
    const failed = results.filter((r) => r.severity === 'fail').length;
    if (failed > 0) return { name: 'Security audit', status: 'fail', message: `${passed} passed, ${warned} warnings, ${failed} failed.` };
    if (warned > 0) return { name: 'Security audit', status: 'warn', message: `${passed} passed, ${warned} warnings.` };
    return { name: 'Security audit', status: 'ok', message: `All ${results.length} checks passed.` };
  } catch {
    return { name: 'Security audit', status: 'warn', message: 'Could not run audit.' };
  }
}

export function getDoctorResults(): DoctorResponse {
  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkConfigFile(),
    checkDataDir(),
    checkMemoryDatabase(),
    checkApiKeys(),
    checkSecurityAudit(),
  ];

  if (configExists()) {
    try {
      const config = loadConfig();
      const engineDefault = config.engines?.default ?? 'native';
      if (engineDefault === 'claude-cli' || engineDefault === 'codex-cli') {
        checks.splice(checks.length - 1, 0, checkSubprocessEngine(engineDefault));
      }
    } catch { /* skip */ }
  }

  const ok = checks.filter((c) => c.status === 'ok').length;
  const warn = checks.filter((c) => c.status === 'warn').length;
  const fail = checks.filter((c) => c.status === 'fail').length;

  return { checks, summary: { ok, warn, fail, total: checks.length } };
}
