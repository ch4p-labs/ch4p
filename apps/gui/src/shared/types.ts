/**
 * Shared API types for the GUI client and server.
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusResponse {
  version: string;
  configPath: string;
  configExists: boolean;
  dataDir: string;
  provider: string;
  model: string;
  engine: string;
  autonomy: string;
  memory: { backend: string; autoSave: boolean };
  gateway: { port: number; requirePairing: boolean };
  channels: string[];
  tunnel: string;
  observers: string[];
  secretsEncrypted: boolean;
  apiKeys: { anthropic: boolean; openai: boolean };
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface DoctorResponse {
  checks: CheckResult[];
  summary: { ok: number; warn: number; fail: number; total: number };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditItem {
  id: number;
  name: string;
  severity: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface AuditResponse {
  results: AuditItem[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

// ---------------------------------------------------------------------------
// Config (safe subset — no API keys)
// ---------------------------------------------------------------------------

export interface SafeConfig {
  agent: { model: string; provider: string; thinkingLevel?: string };
  gateway: { port: number; requirePairing: boolean; allowPublicBind: boolean };
  memory: { backend: string; autoSave: boolean };
  autonomy: { level: string; allowedCommands: string[] };
  observability: { logLevel: string; observers: string[] };
  skills: { enabled: boolean; paths: string[] };
  tunnel: { provider: string };
  secrets: { encrypt: boolean };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type Page =
  | 'dashboard'
  | 'onboarding'
  | 'chat'
  | 'channels'
  | 'security'
  | 'tools'
  | 'settings'
  | 'terminal';
