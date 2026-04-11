/**
 * GET /api/engines — detect available CLI engines on PATH.
 */

import { execSync } from 'node:child_process';
import type { DetectedEngine, ChannelDef, ModelChoice } from '../../shared/types.js';

function detectBinary(name: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function getDetectedEngines(): DetectedEngine[] {
  const claudeFound = detectBinary('claude');
  const codexFound = detectBinary('codex');
  const ollamaFound = detectBinary('ollama');

  // Claude CLI and Codex CLI are always shown — ch4p wraps both as subprocess engines.
  // Detection status is shown so users know if they still need to install.
  const engines: DetectedEngine[] = [
    {
      id: 'claude-cli',
      label: 'Claude Code CLI',
      description: claudeFound
        ? 'Detected — uses your Max/Pro plan locally, no API key needed'
        : 'Not installed — install from https://docs.anthropic.com/claude-code',
      detected: claudeFound,
    },
    {
      id: 'codex-cli',
      label: 'Codex CLI',
      description: codexFound
        ? 'Detected — uses your OpenAI account via Codex, no API key needed'
        : 'Not installed — install from https://github.com/openai/codex',
      detected: codexFound,
    },
  ];

  if (ollamaFound) {
    engines.push({
      id: 'ollama',
      label: 'Ollama (local)',
      description: 'Run models locally — no API key, fully offline',
      detected: true,
    });
  }

  return engines;
}

export const MODELS: ModelChoice[] = [
  // Anthropic — matches packages/providers/src/anthropic.ts
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (recommended)', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  // OpenAI — matches packages/providers/src/openai.ts
  { id: 'gpt-4.1', label: 'GPT-4.1 (recommended)', provider: 'openai' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai' },
  { id: 'o3', label: 'o3', provider: 'openai' },
  { id: 'o4-mini', label: 'o4-mini', provider: 'openai' },
  // Ollama — popular local models
  { id: 'llama3.3:70b', label: 'Llama 3.3 70B (recommended)', provider: 'ollama' },
  { id: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B', provider: 'ollama' },
  { id: 'deepseek-r1:32b', label: 'DeepSeek R1 32B', provider: 'ollama' },
  { id: 'mistral-small:24b', label: 'Mistral Small 24B', provider: 'ollama' },
];

export const CHANNEL_DEFS: ChannelDef[] = [
  { id: 'telegram', label: 'Telegram', fields: [{ key: 'botToken', label: 'Bot token', secret: true }] },
  { id: 'discord', label: 'Discord', fields: [{ key: 'botToken', label: 'Bot token', secret: true }] },
  { id: 'slack', label: 'Slack', fields: [
    { key: 'botToken', label: 'Bot token (xoxb-...)', secret: true },
    { key: 'appToken', label: 'App token (xapp-...)', secret: true },
  ]},
  { id: 'matrix', label: 'Matrix', fields: [
    { key: 'homeserverUrl', label: 'Homeserver URL', defaultValue: 'https://matrix.org' },
    { key: 'accessToken', label: 'Access token', secret: true },
    { key: 'userId', label: 'User ID (e.g. @bot:matrix.org)' },
  ]},
  { id: 'teams', label: 'Microsoft Teams', fields: [
    { key: 'appId', label: 'App (client) ID' },
    { key: 'appPassword', label: 'App password', secret: true },
  ]},
  { id: 'whatsapp', label: 'WhatsApp', fields: [
    { key: 'phoneNumberId', label: 'Phone number ID' },
    { key: 'accessToken', label: 'Access token', secret: true },
    { key: 'verifyToken', label: 'Webhook verify token' },
  ]},
  { id: 'signal', label: 'Signal', fields: [
    { key: 'signalCliPath', label: 'signal-cli path', defaultValue: 'signal-cli' },
    { key: 'phoneNumber', label: 'Phone number (e.g. +1234567890)' },
  ]},
  { id: 'imessage', label: 'iMessage', fields: [], notes: 'macOS only. Uses AppleScript — no additional config needed.' },
  { id: 'irc', label: 'IRC', fields: [
    { key: 'server', label: 'Server hostname' },
    { key: 'port', label: 'Port', defaultValue: '6697' },
    { key: 'nick', label: 'Nickname' },
    { key: 'channels', label: 'Channels (comma-separated, e.g. #general,#dev)' },
  ]},
  { id: 'zalo-oa', label: 'Zalo OA', fields: [
    { key: 'oaId', label: 'OA ID' },
    { key: 'accessToken', label: 'Access token', secret: true },
    { key: 'oaSecretKey', label: 'OA secret key', secret: true },
  ]},
  { id: 'bluebubbles', label: 'BlueBubbles', fields: [
    { key: 'serverUrl', label: 'Server URL (e.g. http://localhost:1234)' },
    { key: 'password', label: 'Password', secret: true },
  ]},
  { id: 'google-chat', label: 'Google Chat', fields: [
    { key: 'serviceAccountKeyPath', label: 'Service account JSON key path' },
    { key: 'spaceId', label: 'Space ID' },
  ]},
  { id: 'webchat', label: 'WebChat', fields: [
    { key: 'path', label: 'WebSocket path', defaultValue: '/webchat' },
  ]},
  { id: 'zalo-personal', label: 'Zalo Personal', fields: [
    { key: 'bridgeUrl', label: 'Bridge URL (e.g. http://localhost:3500)' },
  ], notes: 'Requires your own Zalo automation bridge. May violate Zalo TOS.' },
  { id: 'macos', label: 'macOS Native', fields: [], notes: 'macOS only. Uses Notification Center + AppleScript — no additional config needed.' },
];

export const AUTONOMY_LEVELS = [
  { id: 'readonly', label: 'Read-only', description: 'Agent can only read files and run safe commands' },
  { id: 'supervised', label: 'Supervised', description: 'Agent asks before writes and destructive actions (recommended)' },
  { id: 'full', label: 'Full', description: 'Agent operates autonomously (use with caution)' },
];

export function getEnginesData() {
  return {
    engines: getDetectedEngines(),
    models: MODELS,
    channels: CHANNEL_DEFS,
    autonomyLevels: AUTONOMY_LEVELS,
  };
}
