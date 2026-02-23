import { NoopObserver } from './noop-observer.js';
import type { SessionMeta, SessionStats, IdentityEvent } from '@ch4p/core';

describe('NoopObserver', () => {
  let observer: NoopObserver;

  beforeEach(() => {
    observer = new NoopObserver();
  });

  const meta: SessionMeta = {
    sessionId: 'sess-1',
    engineId: 'echo',
    startedAt: new Date(),
  };

  const stats: SessionStats = {
    duration: 1000,
    toolInvocations: 0,
    llmCalls: 1,
    tokensUsed: { inputTokens: 10, outputTokens: 5 },
    errors: 0,
  };

  it('onSessionStart does not throw', () => {
    expect(() => observer.onSessionStart(meta)).not.toThrow();
  });

  it('onSessionEnd does not throw', () => {
    expect(() => observer.onSessionEnd(meta, stats)).not.toThrow();
  });

  it('onToolInvocation does not throw', () => {
    expect(() =>
      observer.onToolInvocation({
        sessionId: 'sess-1',
        tool: 'test',
        args: {},
        result: { success: true, output: '' },
        duration: 10,
      }),
    ).not.toThrow();
  });

  it('onLLMCall does not throw', () => {
    expect(() =>
      observer.onLLMCall({
        sessionId: 'sess-1',
        provider: 'test',
        model: 'test',
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 10,
        finishReason: 'stop',
      }),
    ).not.toThrow();
  });

  it('onChannelMessage does not throw', () => {
    expect(() =>
      observer.onChannelMessage({
        channelId: 'ch-1',
        direction: 'inbound',
        messageLength: 10,
        timestamp: new Date(),
      }),
    ).not.toThrow();
  });

  it('onError does not throw', () => {
    expect(() => observer.onError(new Error('test'), {})).not.toThrow();
  });

  it('onSecurityEvent does not throw', () => {
    expect(() =>
      observer.onSecurityEvent({
        type: 'command_blocked',
        details: {},
        timestamp: new Date(),
      }),
    ).not.toThrow();
  });

  it('onIdentityEvent does not throw', () => {
    const event: IdentityEvent = {
      type: 'identity_registered',
      agentId: 'agent-1',
      chainId: 8453,
      details: { txHash: '0xabc' },
      timestamp: new Date(),
    };
    expect(() => observer.onIdentityEvent(event)).not.toThrow();
  });

  it('flush resolves', async () => {
    await expect(observer.flush()).resolves.toBeUndefined();
  });

  it('implements IObserver interface', () => {
    expect(typeof observer.onSessionStart).toBe('function');
    expect(typeof observer.onSessionEnd).toBe('function');
    expect(typeof observer.onToolInvocation).toBe('function');
    expect(typeof observer.onLLMCall).toBe('function');
    expect(typeof observer.onChannelMessage).toBe('function');
    expect(typeof observer.onError).toBe('function');
    expect(typeof observer.onSecurityEvent).toBe('function');
    expect(typeof observer.onIdentityEvent).toBe('function');
    expect(typeof observer.flush).toBe('function');
  });
});
