import { vi } from 'vitest';
import { ConsoleObserver } from './console-observer.js';
import type { LogLevel } from './console-observer.js';
import type {
  SessionMeta,
  SessionStats,
  ToolInvocationEvent,
  LLMCallEvent,
  ChannelMessageEvent,
  SecurityEvent,
} from '@ch4p/core';

function makeMeta(): SessionMeta {
  return {
    sessionId: 'sess-1',
    engineId: 'echo',
    startedAt: new Date(),
    channelId: 'ch-1',
    userId: 'user-1',
  };
}

function makeStats(): SessionStats {
  return {
    duration: 1500,
    toolInvocations: 3,
    llmCalls: 2,
    tokensUsed: { inputTokens: 100, outputTokens: 50 },
    errors: 0,
  };
}

describe('ConsoleObserver', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log level filtering', () => {
    it('logs info and above at "info" level', () => {
      const observer = new ConsoleObserver('info');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('suppresses info at "warn" level', () => {
      const observer = new ConsoleObserver('warn');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('suppresses info at "error" level', () => {
      const observer = new ConsoleObserver('error');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('logs everything at "debug" level', () => {
      const observer = new ConsoleObserver('debug');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('onSessionStart', () => {
    it('logs session start with meta', () => {
      const observer = new ConsoleObserver('info');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('SESSION'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('started'),
      );
    });

    it('includes session id in output', () => {
      const observer = new ConsoleObserver('info');
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('sess-1'),
      );
    });
  });

  describe('onSessionEnd', () => {
    it('logs session end with stats', () => {
      const observer = new ConsoleObserver('info');
      observer.onSessionEnd(makeMeta(), makeStats());
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('ended'),
      );
    });

    it('includes duration in output', () => {
      const observer = new ConsoleObserver('info');
      observer.onSessionEnd(makeMeta(), makeStats());
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('1.50s'),
      );
    });

    it('includes cost when available', () => {
      const observer = new ConsoleObserver('info');
      const stats = makeStats();
      stats.tokensUsed.totalCost = 0.0123;
      observer.onSessionEnd(makeMeta(), stats);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('$0.0123'),
      );
    });
  });

  describe('onToolInvocation', () => {
    it('logs tool error at error level', () => {
      const observer = new ConsoleObserver('error');
      const event: ToolInvocationEvent = {
        sessionId: 'sess-1',
        tool: 'bash',
        args: {},
        result: { success: false, output: '' },
        duration: 100,
        error: new Error('command failed'),
      };
      observer.onToolInvocation(event);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('FAIL'),
      );
    });

    it('logs successful tools at debug level', () => {
      const observer = new ConsoleObserver('debug');
      const event: ToolInvocationEvent = {
        sessionId: 'sess-1',
        tool: 'read_file',
        args: {},
        result: { success: true, output: 'content' },
        duration: 50,
      };
      observer.onToolInvocation(event);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('OK'),
      );
    });

    it('does not log successful tools at info level', () => {
      const observer = new ConsoleObserver('info');
      const event: ToolInvocationEvent = {
        sessionId: 'sess-1',
        tool: 'read_file',
        args: {},
        result: { success: true, output: 'content' },
        duration: 50,
      };
      observer.onToolInvocation(event);
      expect(consoleSpy.log).not.toHaveBeenCalledWith(
        expect.stringContaining('TOOL'),
      );
    });
  });

  describe('onLLMCall', () => {
    it('logs at debug level', () => {
      const observer = new ConsoleObserver('debug');
      const event: LLMCallEvent = {
        sessionId: 'sess-1',
        provider: 'openai',
        model: 'gpt-4o',
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 500,
        finishReason: 'stop',
      };
      observer.onLLMCall(event);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('LLM'),
      );
    });
  });

  describe('onChannelMessage', () => {
    it('logs at debug level', () => {
      const observer = new ConsoleObserver('debug');
      const event: ChannelMessageEvent = {
        channelId: 'ch-1',
        direction: 'inbound',
        messageLength: 42,
        timestamp: new Date(),
      };
      observer.onChannelMessage(event);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('MSG'),
      );
    });
  });

  describe('onError', () => {
    it('logs errors at error level', () => {
      const observer = new ConsoleObserver('error');
      observer.onError(new Error('test error'), { phase: 'init' });
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR'),
      );
    });
  });

  describe('onSecurityEvent', () => {
    it('logs security events at warn level', () => {
      const observer = new ConsoleObserver('warn');
      const event: SecurityEvent = {
        type: 'command_blocked',
        details: { command: 'rm -rf /' },
        timestamp: new Date(),
      };
      observer.onSecurityEvent(event);
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY'),
      );
    });
  });

  describe('flush', () => {
    it('resolves immediately (no-op for console)', async () => {
      const observer = new ConsoleObserver();
      await expect(observer.flush()).resolves.toBeUndefined();
    });
  });

  describe('default log level', () => {
    it('defaults to info', () => {
      const observer = new ConsoleObserver();
      // Should log session start (info level)
      observer.onSessionStart(makeMeta());
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });
});
