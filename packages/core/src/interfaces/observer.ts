/**
 * IObserver — observability contract
 *
 * Structured observability for every subsystem: sessions, tools, LLM calls,
 * channel messages, errors, and security events.
 */

import type { TokenUsage } from './provider.js';
import type { ToolResult } from './tool.js';

export interface SessionMeta {
  sessionId: string;
  channelId?: string;
  userId?: string;
  engineId: string;
  startedAt: Date;
}

export interface SessionStats {
  duration: number;
  toolInvocations: number;
  llmCalls: number;
  tokensUsed: TokenUsage;
  errors: number;
}

export interface ToolInvocationEvent {
  sessionId: string;
  tool: string;
  args: unknown;
  result?: ToolResult;
  duration: number;
  error?: Error;
}

export interface LLMCallEvent {
  sessionId: string;
  provider: string;
  model: string;
  usage: TokenUsage;
  duration: number;
  finishReason: string;
}

export interface ChannelMessageEvent {
  channelId: string;
  direction: 'inbound' | 'outbound';
  userId?: string;
  messageLength: number;
  timestamp: Date;
}

export interface SecurityEvent {
  type: 'path_blocked' | 'command_blocked' | 'injection_detected' | 'secret_redacted' | 'pairing_attempt';
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface IObserver {
  onSessionStart(meta: SessionMeta): void;
  onSessionEnd(meta: SessionMeta, stats: SessionStats): void;
  onToolInvocation(event: ToolInvocationEvent): void;
  onLLMCall(event: LLMCallEvent): void;
  onChannelMessage(event: ChannelMessageEvent): void;
  onError(error: Error, context: Record<string, unknown>): void;
  onSecurityEvent(event: SecurityEvent): void;
  flush?(): Promise<void>;
}
