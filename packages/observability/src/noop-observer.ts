/**
 * NoopObserver — silent observer that discards all events.
 *
 * Used when observability is explicitly disabled. Every method is a no-op,
 * keeping the hot path as cheap as possible.
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

export class NoopObserver implements IObserver {
  onSessionStart(_meta: SessionMeta): void {
    // intentionally empty
  }

  onSessionEnd(_meta: SessionMeta, _stats: SessionStats): void {
    // intentionally empty
  }

  onToolInvocation(_event: ToolInvocationEvent): void {
    // intentionally empty
  }

  onLLMCall(_event: LLMCallEvent): void {
    // intentionally empty
  }

  onChannelMessage(_event: ChannelMessageEvent): void {
    // intentionally empty
  }

  onError(_error: Error, _context: Record<string, unknown>): void {
    // intentionally empty
  }

  onSecurityEvent(_event: SecurityEvent): void {
    // intentionally empty
  }

  onIdentityEvent(_event: IdentityEvent): void {
    // intentionally empty
  }

  async flush(): Promise<void> {
    // intentionally empty
  }
}
