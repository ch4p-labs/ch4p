/**
 * MultiObserver — fan-out observer that delegates to multiple child observers.
 *
 * Every IObserver method is forwarded to each child. Errors thrown by
 * individual children are caught and logged to stderr so that a single
 * broken observer never takes down the pipeline.
 */

import type {
  IObserver,
  SessionMeta,
  SessionStats,
  ToolInvocationEvent,
  LLMCallEvent,
  ChannelMessageEvent,
  SecurityEvent,
} from '@ch4p/core';

export class MultiObserver implements IObserver {
  private readonly children: IObserver[];

  constructor(children: IObserver[]) {
    this.children = [...children];
  }

  // ---- helpers ------------------------------------------------------------

  private safely(fn: (child: IObserver) => void): void {
    for (const child of this.children) {
      try {
        fn(child);
      } catch (err) {
        // Never let a child observer crash the host process.
        console.error('[MultiObserver] child observer threw:', err);
      }
    }
  }

  // ---- IObserver ----------------------------------------------------------

  onSessionStart(meta: SessionMeta): void {
    this.safely((c) => c.onSessionStart(meta));
  }

  onSessionEnd(meta: SessionMeta, stats: SessionStats): void {
    this.safely((c) => c.onSessionEnd(meta, stats));
  }

  onToolInvocation(event: ToolInvocationEvent): void {
    this.safely((c) => c.onToolInvocation(event));
  }

  onLLMCall(event: LLMCallEvent): void {
    this.safely((c) => c.onLLMCall(event));
  }

  onChannelMessage(event: ChannelMessageEvent): void {
    this.safely((c) => c.onChannelMessage(event));
  }

  onError(error: Error, context: Record<string, unknown>): void {
    this.safely((c) => c.onError(error, context));
  }

  onSecurityEvent(event: SecurityEvent): void {
    this.safely((c) => c.onSecurityEvent(event));
  }

  async flush(): Promise<void> {
    const results = this.children.map(async (child) => {
      try {
        await child.flush?.();
      } catch (err) {
        console.error('[MultiObserver] flush error in child observer:', err);
      }
    });
    await Promise.all(results);
  }
}
