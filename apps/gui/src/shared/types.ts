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
  agent: { engine?: string; model: string; provider: string; thinkingLevel?: string };
  gateway: { port: number; requirePairing: boolean; allowPublicBind: boolean };
  memory: { backend: string; autoSave: boolean };
  autonomy: { level: string; allowedCommands: string[] };
  observability: { logLevel: string; observers: string[] };
  skills: { enabled: boolean; paths: string[] };
  tunnel: { provider: string };
  secrets: { encrypt: boolean };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface DetectedEngine {
  id: string;
  label: string;
  description: string;
  detected?: boolean;
}

export interface EnginesResponse {
  engines: DetectedEngine[];
}

export interface ChannelDef {
  id: string;
  label: string;
  fields: { key: string; label: string; secret?: boolean; defaultValue?: string }[];
  notes?: string;
}

export interface ModelChoice {
  id: string;
  label: string;
  provider: string;
}

export interface OnboardPayload {
  engine: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  autonomy: string;
  channels: Record<string, Record<string, unknown>>;
  features: {
    providers?: Record<string, Record<string, unknown>>;
    search?: { enabled: boolean; apiKey?: string };
    voice?: { enabled: boolean };
    mcp?: boolean;
    cron?: boolean;
    x402?: boolean;
    mesh?: boolean;
  };
}

export interface OnboardResponse {
  success: boolean;
  configPath: string;
  audit: AuditResponse;
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
