import { vi } from 'vitest';
import { MultiObserver } from './multi-observer.js';
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

function makeMockObserver(): IObserver {
  return {
    onSessionStart: vi.fn(),
    onSessionEnd: vi.fn(),
    onToolInvocation: vi.fn(),
    onLLMCall: vi.fn(),
    onChannelMessage: vi.fn(),
    onError: vi.fn(),
    onSecurityEvent: vi.fn(),
    flush: vi.fn(async () => {}),
  };
}

function makeMeta(): SessionMeta {
  return {
    sessionId: 'sess-1',
    engineId: 'echo',
    startedAt: new Date(),
  };
}

function makeStats(): SessionStats {
  return {
    duration: 1000,
    toolInvocations: 1,
    llmCalls: 1,
    tokensUsed: { inputTokens: 10, outputTokens: 20 },
    errors: 0,
  };
}

describe('MultiObserver', () => {
  let child1: IObserver;
  let child2: IObserver;
  let multi: MultiObserver;

  beforeEach(() => {
    child1 = makeMockObserver();
    child2 = makeMockObserver();
    multi = new MultiObserver([child1, child2]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onSessionStart', () => {
    it('delegates to all children', () => {
      const meta = makeMeta();
      multi.onSessionStart(meta);
      expect(child1.onSessionStart).toHaveBeenCalledWith(meta);
      expect(child2.onSessionStart).toHaveBeenCalledWith(meta);
    });
  });

  describe('onSessionEnd', () => {
    it('delegates to all children', () => {
      const meta = makeMeta();
      const stats = makeStats();
      multi.onSessionEnd(meta, stats);
      expect(child1.onSessionEnd).toHaveBeenCalledWith(meta, stats);
      expect(child2.onSessionEnd).toHaveBeenCalledWith(meta, stats);
    });
  });

  describe('onToolInvocation', () => {
    it('delegates to all children', () => {
      const event: ToolInvocationEvent = {
        sessionId: 'sess-1',
        tool: 'bash',
        args: {},
        result: { success: true, output: 'ok' },
        duration: 50,
      };
      multi.onToolInvocation(event);
      expect(child1.onToolInvocation).toHaveBeenCalledWith(event);
      expect(child2.onToolInvocation).toHaveBeenCalledWith(event);
    });
  });

  describe('onLLMCall', () => {
    it('delegates to all children', () => {
      const event: LLMCallEvent = {
        sessionId: 'sess-1',
        provider: 'openai',
        model: 'gpt-4o',
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        finishReason: 'stop',
      };
      multi.onLLMCall(event);
      expect(child1.onLLMCall).toHaveBeenCalledWith(event);
      expect(child2.onLLMCall).toHaveBeenCalledWith(event);
    });
  });

  describe('onChannelMessage', () => {
    it('delegates to all children', () => {
      const event: ChannelMessageEvent = {
        channelId: 'ch-1',
        direction: 'inbound',
        messageLength: 42,
        timestamp: new Date(),
      };
      multi.onChannelMessage(event);
      expect(child1.onChannelMessage).toHaveBeenCalledWith(event);
      expect(child2.onChannelMessage).toHaveBeenCalledWith(event);
    });
  });

  describe('onError', () => {
    it('delegates to all children', () => {
      const error = new Error('test');
      const ctx = { phase: 'init' };
      multi.onError(error, ctx);
      expect(child1.onError).toHaveBeenCalledWith(error, ctx);
      expect(child2.onError).toHaveBeenCalledWith(error, ctx);
    });
  });

  describe('onSecurityEvent', () => {
    it('delegates to all children', () => {
      const event: SecurityEvent = {
        type: 'command_blocked',
        details: {},
        timestamp: new Date(),
      };
      multi.onSecurityEvent(event);
      expect(child1.onSecurityEvent).toHaveBeenCalledWith(event);
      expect(child2.onSecurityEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('onIdentityEvent', () => {
    it('delegates to all children that implement it', () => {
      const event: IdentityEvent = {
        type: 'trust_check_passed',
        agentId: 'agent-1',
        chainId: 8453,
        details: { operation: 'delegate' },
        timestamp: new Date(),
      };
      const child1WithIdentity = { ...child1, onIdentityEvent: vi.fn() };
      const child2WithIdentity = { ...child2, onIdentityEvent: vi.fn() };
      const multi2 = new MultiObserver([child1WithIdentity, child2WithIdentity]);
      multi2.onIdentityEvent(event);
      expect(child1WithIdentity.onIdentityEvent).toHaveBeenCalledWith(event);
      expect(child2WithIdentity.onIdentityEvent).toHaveBeenCalledWith(event);
    });

    it('does not throw when children lack onIdentityEvent', () => {
      // makeMockObserver() does not include onIdentityEvent — it's optional
      const event: IdentityEvent = {
        type: 'trust_check_failed',
        agentId: 'agent-2',
        details: { reason: 'low score' },
        timestamp: new Date(),
      };
      expect(() => multi.onIdentityEvent(event)).not.toThrow();
    });
  });

  describe('error isolation', () => {
    it('catches errors from child observers without propagating', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const brokenChild = makeMockObserver();
      (brokenChild.onSessionStart as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('child exploded');
      });

      const safe = new MultiObserver([brokenChild, child2]);
      safe.onSessionStart(makeMeta());

      // child2 should still have been called
      expect(child2.onSessionStart).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('continues calling remaining children after one throws', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const brokenChild = makeMockObserver();
      (brokenChild.onError as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('broken');
      });

      const multi2 = new MultiObserver([brokenChild, child1, child2]);
      multi2.onError(new Error('test'), {});

      expect(child1.onError).toHaveBeenCalled();
      expect(child2.onError).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('flush', () => {
    it('flushes all children', async () => {
      await multi.flush();
      expect(child1.flush).toHaveBeenCalled();
      expect(child2.flush).toHaveBeenCalled();
    });

    it('catches errors during flush', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const brokenChild = makeMockObserver();
      (brokenChild.flush as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('flush failed'));

      const safe = new MultiObserver([brokenChild, child2]);
      await safe.flush();

      // Should not throw
      expect(child2.flush).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('empty children list', () => {
    it('does not throw with no children', () => {
      const empty = new MultiObserver([]);
      expect(() => empty.onSessionStart(makeMeta())).not.toThrow();
    });
  });
});
