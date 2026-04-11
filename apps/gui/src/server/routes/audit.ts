/**
 * GET /api/audit — security audit (mirrors `ch4p audit` CLI command).
 */

import { loadConfig, configExists } from '../config.js';
import type { AuditItem, AuditResponse } from '../../shared/types.js';

/**
 * Run all security audit checks. Pure function — no side effects.
 */
export function getAuditResults(): AuditResponse {
  if (!configExists()) {
    return { results: [], summary: { pass: 0, warn: 0, fail: 0, total: 0 } };
  }

  const config = loadConfig();
  const results: AuditItem[] = [];
  let id = 0;

  // 1. Gateway binding
  id++;
  const allowPublic = config.gateway?.allowPublicBind ?? false;
  const port = config.gateway?.port ?? 18789;
  results.push({
    id, name: 'Gateway binding',
    severity: allowPublic ? 'fail' : 'pass',
    message: allowPublic
      ? `Gateway allows public binding (0.0.0.0:${port}). Restrict to loopback.`
      : `Gateway bound to loopback (127.0.0.1:${port})`,
  });

  // 2. Pairing required
  id++;
  const requirePairing = config.gateway?.requirePairing ?? true;
  results.push({
    id, name: 'Pairing required',
    severity: requirePairing ? 'pass' : 'warn',
    message: requirePairing ? 'Gateway requires pairing for all connections' : 'Pairing is disabled.',
  });

  // 3. Workspace scoping
  id++;
  const workspaceOnly = config.security?.workspaceOnly ?? true;
  results.push({
    id, name: 'Workspace scoping',
    severity: workspaceOnly ? 'pass' : 'warn',
    message: workspaceOnly ? 'Filesystem access restricted to workspace' : 'Workspace scoping disabled.',
  });

  // 4. Blocked paths
  id++;
  const blockedPaths = config.security?.blockedPaths ?? [];
  results.push({
    id, name: 'Blocked paths', severity: 'pass',
    message: blockedPaths.length > 0
      ? `${blockedPaths.length} additional blocked path(s) configured`
      : 'Using default system blocked paths (14 dirs + 4 dotfiles)',
  });

  // 5. Autonomy level
  id++;
  const autonomy = config.autonomy?.level ?? 'supervised';
  results.push({
    id, name: 'Autonomy level',
    severity: autonomy === 'full' ? 'warn' : 'pass',
    message: autonomy === 'full' ? 'Full autonomy enabled. Agent will not ask for confirmation.' : `Autonomy level: ${autonomy}`,
  });

  // 6. Command allowlist
  id++;
  const allowedCommands = config.autonomy?.allowedCommands ?? [];
  results.push({
    id, name: 'Command allowlist',
    severity: allowedCommands.length > 0 ? 'pass' : 'warn',
    message: allowedCommands.length > 0 ? `${allowedCommands.length} command(s) in allowlist` : 'No command allowlist configured.',
  });

  // 7. Secrets encryption
  id++;
  const encryptSecrets = config.secrets?.encrypt ?? true;
  results.push({
    id, name: 'Secrets encryption',
    severity: encryptSecrets ? 'pass' : 'fail',
    message: encryptSecrets ? 'Secrets are encrypted at rest (AES-256-GCM)' : 'Secrets encryption is disabled.',
  });

  // 8. API key status
  id++;
  const engineDefault = config.engines?.default ?? 'native';
  const usesSubprocess = engineDefault === 'claude-cli' || engineDefault === 'codex-cli';
  const usesOllama = config.agent?.provider === 'ollama';
  if (usesSubprocess) {
    results.push({ id, name: 'API keys', severity: 'pass', message: `Using ${engineDefault} engine.` });
  } else if (usesOllama) {
    results.push({ id, name: 'API keys', severity: 'pass', message: 'Using Ollama (local inference).' });
  } else {
    const anthKey = config.providers?.['anthropic']?.['apiKey'];
    const oaiKey = config.providers?.['openai']?.['apiKey'];
    const hasAnth = typeof anthKey === 'string' && anthKey.length > 0 && !anthKey.includes('${');
    const hasOai = typeof oaiKey === 'string' && oaiKey.length > 0 && !oaiKey.includes('${');
    const hasAny = hasAnth || hasOai;
    results.push({
      id, name: 'API keys',
      severity: hasAny ? 'pass' : 'warn',
      message: hasAny
        ? `API key(s): ${[hasAnth && 'Anthropic', hasOai && 'OpenAI'].filter(Boolean).join(', ')}`
        : 'No API keys configured.',
    });
  }

  // 9. Tunnel exposure
  id++;
  const tunnelProvider = config.tunnel?.provider ?? 'none';
  results.push({
    id, name: 'Tunnel exposure',
    severity: tunnelProvider === 'none' ? 'pass' : 'warn',
    message: tunnelProvider === 'none' ? 'No tunnel configured. Gateway is local only.' : `Tunnel active via ${tunnelProvider}.`,
  });

  // 10. Observability
  id++;
  const observers = config.observability?.observers ?? [];
  results.push({
    id, name: 'Observability',
    severity: observers.length > 0 ? 'pass' : 'warn',
    message: observers.length > 0 ? `Observer(s): ${observers.join(', ')}` : 'No observers configured.',
  });

  const pass = results.filter((r) => r.severity === 'pass').length;
  const warn = results.filter((r) => r.severity === 'warn').length;
  const fail = results.filter((r) => r.severity === 'fail').length;

  return { results, summary: { pass, warn, fail, total: results.length } };
}
