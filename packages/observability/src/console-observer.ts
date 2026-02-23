/**
 * ConsoleObserver — structured console logging with ANSI color coding.
 *
 * Formats observability events as human-readable console output, respecting
 * the configured log level. Tool invocations include duration, LLM calls
 * include token usage and cost, and security events include severity.
 */

import type {
  IObserver,
  SessionMeta,
  SessionStats,
  ToolInvocationEvent,
  LLMCallEvent,
  ChannelMessageEvent,
  SecurityEvent,
  IdentityEvent,
} from '@ch4p/core';

// ---------------------------------------------------------------------------
// ANSI escape codes
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const FG = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

// ---------------------------------------------------------------------------
// Log-level gate
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// Security event severity mapping
// ---------------------------------------------------------------------------

const SECURITY_SEVERITY: Record<SecurityEvent['type'], 'low' | 'medium' | 'high' | 'critical'> = {
  secret_redacted: 'low',
  path_blocked: 'medium',
  command_blocked: 'high',
  injection_detected: 'critical',
  pairing_attempt: 'high',
};

const SEVERITY_COLOR: Record<string, string> = {
  low: FG.gray,
  medium: FG.yellow,
  high: FG.red,
  critical: `${BOLD}${FG.red}`,
};

// ---------------------------------------------------------------------------
// ConsoleObserver
// ---------------------------------------------------------------------------

export class ConsoleObserver implements IObserver {
  private readonly minLevel: number;

  constructor(logLevel: LogLevel = 'info') {
    this.minLevel = LEVEL_RANK[logLevel];
  }

  // ---- helpers ------------------------------------------------------------

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= this.minLevel;
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  private tag(label: string, color: string): string {
    return `${color}${BOLD}[${label}]${RESET}`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // ---- IObserver ----------------------------------------------------------

  onSessionStart(meta: SessionMeta): void {
    if (!this.shouldLog('info')) return;
    const ts = this.timestamp();
    console.log(
      `${DIM}${ts}${RESET} ${this.tag('SESSION', FG.cyan)} ${FG.green}started${RESET}` +
        ` ${DIM}sid=${RESET}${meta.sessionId}` +
        ` ${DIM}engine=${RESET}${meta.engineId}` +
        (meta.channelId ? ` ${DIM}channel=${RESET}${meta.channelId}` : '') +
        (meta.userId ? ` ${DIM}user=${RESET}${meta.userId}` : ''),
    );
  }

  onSessionEnd(meta: SessionMeta, stats: SessionStats): void {
    if (!this.shouldLog('info')) return;
    const ts = this.timestamp();
    const cost =
      stats.tokensUsed.totalCost !== undefined
        ? ` ${DIM}cost=${RESET}$${stats.tokensUsed.totalCost.toFixed(4)}`
        : '';
    console.log(
      `${DIM}${ts}${RESET} ${this.tag('SESSION', FG.cyan)} ${FG.yellow}ended${RESET}` +
        ` ${DIM}sid=${RESET}${meta.sessionId}` +
        ` ${DIM}duration=${RESET}${this.formatDuration(stats.duration)}` +
        ` ${DIM}tools=${RESET}${stats.toolInvocations}` +
        ` ${DIM}llm_calls=${RESET}${stats.llmCalls}` +
        ` ${DIM}tokens=${RESET}${stats.tokensUsed.inputTokens + stats.tokensUsed.outputTokens}` +
        cost +
        ` ${DIM}errors=${RESET}${stats.errors}`,
    );
  }

  onToolInvocation(event: ToolInvocationEvent): void {
    if (event.error) {
      if (!this.shouldLog('error')) return;
      const ts = this.timestamp();
      console.error(
        `${DIM}${ts}${RESET} ${this.tag('TOOL', FG.magenta)} ${FG.red}FAIL${RESET}` +
          ` ${BOLD}${event.tool}${RESET}` +
          ` ${DIM}duration=${RESET}${this.formatDuration(event.duration)}` +
          ` ${DIM}error=${RESET}${event.error.message}`,
      );
    } else {
      if (!this.shouldLog('debug')) return;
      const ts = this.timestamp();
      const success = event.result?.success ?? true;
      const statusColor = success ? FG.green : FG.red;
      const statusLabel = success ? 'OK' : 'FAIL';
      console.log(
        `${DIM}${ts}${RESET} ${this.tag('TOOL', FG.magenta)} ${statusColor}${statusLabel}${RESET}` +
          ` ${BOLD}${event.tool}${RESET}` +
          ` ${DIM}duration=${RESET}${this.formatDuration(event.duration)}`,
      );
    }
  }

  onLLMCall(event: LLMCallEvent): void {
    if (!this.shouldLog('debug')) return;
    const ts = this.timestamp();
    const totalTokens = event.usage.inputTokens + event.usage.outputTokens;
    const cost =
      event.usage.totalCost !== undefined
        ? ` ${DIM}cost=${RESET}$${event.usage.totalCost.toFixed(4)}`
        : '';
    const cache =
      event.usage.cacheReadTokens !== undefined
        ? ` ${DIM}cache_read=${RESET}${event.usage.cacheReadTokens}`
        : '';
    console.log(
      `${DIM}${ts}${RESET} ${this.tag('LLM', FG.blue)} ${BOLD}${event.model}${RESET}` +
        ` ${DIM}provider=${RESET}${event.provider}` +
        ` ${DIM}tokens=${RESET}${totalTokens} (${event.usage.inputTokens}/${event.usage.outputTokens})` +
        cache +
        cost +
        ` ${DIM}duration=${RESET}${this.formatDuration(event.duration)}` +
        ` ${DIM}finish=${RESET}${event.finishReason}`,
    );
  }

  onChannelMessage(event: ChannelMessageEvent): void {
    if (!this.shouldLog('debug')) return;
    const ts = this.timestamp();
    const arrow = event.direction === 'inbound' ? `${FG.green}>>>${RESET}` : `${FG.yellow}<<<${RESET}`;
    console.log(
      `${DIM}${ts}${RESET} ${this.tag('MSG', FG.white)} ${arrow}` +
        ` ${DIM}channel=${RESET}${event.channelId}` +
        (event.userId ? ` ${DIM}user=${RESET}${event.userId}` : '') +
        ` ${DIM}len=${RESET}${event.messageLength}`,
    );
  }

  onError(error: Error, context: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const ts = this.timestamp();
    const ctx = Object.keys(context).length > 0 ? ` ${DIM}ctx=${RESET}${JSON.stringify(context)}` : '';
    console.error(
      `${DIM}${ts}${RESET} ${this.tag('ERROR', FG.red)} ${BOLD}${error.name}${RESET}: ${error.message}${ctx}`,
    );
  }

  onSecurityEvent(event: SecurityEvent): void {
    if (!this.shouldLog('warn')) return;
    const ts = this.timestamp();
    const severity = SECURITY_SEVERITY[event.type] ?? 'medium';
    const color = SEVERITY_COLOR[severity] ?? FG.yellow;
    console.warn(
      `${DIM}${ts}${RESET} ${this.tag('SECURITY', FG.red)} ${color}[${severity.toUpperCase()}]${RESET}` +
        ` ${BOLD}${event.type}${RESET}` +
        ` ${DIM}details=${RESET}${JSON.stringify(event.details)}`,
    );
  }

  onIdentityEvent(event: IdentityEvent): void {
    if (!this.shouldLog('info')) return;
    const ts = this.timestamp();
    const isFail = event.type === 'trust_check_failed';
    const color = isFail ? FG.red : FG.green;
    console.log(
      `${DIM}${ts}${RESET} ${this.tag('IDENTITY', FG.cyan)} ${color}${event.type}${RESET}` +
        (event.agentId ? ` ${DIM}agent=${RESET}${event.agentId}` : '') +
        (event.chainId !== undefined ? ` ${DIM}chain=${RESET}${event.chainId}` : '') +
        ` ${DIM}details=${RESET}${JSON.stringify(event.details)}`,
    );
  }

  async flush(): Promise<void> {
    // Console output is unbuffered; nothing to flush.
  }
}
