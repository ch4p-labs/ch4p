import {
  Ch4pError,
  SecurityError,
  ProviderError,
  ToolError,
  ChannelError,
  MemoryError,
  EngineError,
  ConfigError,
} from './index.js';

// ─── Ch4pError (base class) ─────────────────────────────────────────────────

describe('Ch4pError', () => {
  it('creates an error with message and code', () => {
    const err = new Ch4pError('something failed', 'SOME_CODE');
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('SOME_CODE');
    expect(err.context).toBeUndefined();
  });

  it('creates an error with optional context', () => {
    const ctx = { key: 'value', num: 42 };
    const err = new Ch4pError('failed', 'CODE', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('sets name to Ch4pError', () => {
    const err = new Ch4pError('msg', 'CODE');
    expect(err.name).toBe('Ch4pError');
  });

  it('extends Error', () => {
    const err = new Ch4pError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Ch4pError);
  });

  it('has a stack trace', () => {
    const err = new Ch4pError('msg', 'CODE');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Ch4pError');
  });

  it('is catchable as Error', () => {
    try {
      throw new Ch4pError('test', 'TEST');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Ch4pError).code).toBe('TEST');
    }
  });

  it('preserves context as readonly', () => {
    const ctx = { a: 1 };
    const err = new Ch4pError('msg', 'CODE', ctx);
    // The readonly modifier prevents reassignment at compile time,
    // but at runtime we verify the value is correctly stored.
    expect(err.context).toBe(ctx);
  });
});

// ─── SecurityError ───────────────────────────────────────────────────────────

describe('SecurityError', () => {
  it('sets code to SECURITY_ERROR', () => {
    const err = new SecurityError('access denied');
    expect(err.code).toBe('SECURITY_ERROR');
  });

  it('sets name to SecurityError', () => {
    const err = new SecurityError('access denied');
    expect(err.name).toBe('SecurityError');
  });

  it('extends Ch4pError', () => {
    const err = new SecurityError('access denied');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('stores the error message', () => {
    const err = new SecurityError('blocked path /etc/passwd');
    expect(err.message).toBe('blocked path /etc/passwd');
  });

  it('accepts optional context', () => {
    const ctx = { path: '/etc/passwd', operation: 'read' };
    const err = new SecurityError('blocked', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('has undefined context when not provided', () => {
    const err = new SecurityError('blocked');
    expect(err.context).toBeUndefined();
  });
});

// ─── ProviderError ───────────────────────────────────────────────────────────

describe('ProviderError', () => {
  it('sets code to PROVIDER_ERROR', () => {
    const err = new ProviderError('rate limited', 'openai');
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('sets name to ProviderError', () => {
    const err = new ProviderError('rate limited', 'openai');
    expect(err.name).toBe('ProviderError');
  });

  it('stores the provider name', () => {
    const err = new ProviderError('rate limited', 'anthropic');
    expect(err.provider).toBe('anthropic');
  });

  it('extends Ch4pError', () => {
    const err = new ProviderError('failed', 'openai');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('merges provider into context', () => {
    const err = new ProviderError('failed', 'openai', { status: 429 });
    expect(err.context).toEqual({ status: 429, provider: 'openai' });
  });

  it('includes provider in context even without extra context', () => {
    const err = new ProviderError('failed', 'anthropic');
    expect(err.context).toEqual({ provider: 'anthropic' });
  });

  it('stores the message correctly', () => {
    const err = new ProviderError('API key invalid', 'openai');
    expect(err.message).toBe('API key invalid');
  });
});

// ─── ToolError ───────────────────────────────────────────────────────────────

describe('ToolError', () => {
  it('sets code to TOOL_ERROR', () => {
    const err = new ToolError('execution failed', 'file_read');
    expect(err.code).toBe('TOOL_ERROR');
  });

  it('sets name to ToolError', () => {
    const err = new ToolError('failed', 'shell_exec');
    expect(err.name).toBe('ToolError');
  });

  it('stores the tool name', () => {
    const err = new ToolError('timeout', 'web_search');
    expect(err.tool).toBe('web_search');
  });

  it('extends Ch4pError', () => {
    const err = new ToolError('failed', 'tool');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('merges tool into context', () => {
    const err = new ToolError('failed', 'file_write', { path: '/tmp/foo' });
    expect(err.context).toEqual({ path: '/tmp/foo', tool: 'file_write' });
  });

  it('includes tool in context even without extra context', () => {
    const err = new ToolError('failed', 'bash');
    expect(err.context).toEqual({ tool: 'bash' });
  });
});

// ─── ChannelError ────────────────────────────────────────────────────────────

describe('ChannelError', () => {
  it('sets code to CHANNEL_ERROR', () => {
    const err = new ChannelError('connection lost', 'telegram');
    expect(err.code).toBe('CHANNEL_ERROR');
  });

  it('sets name to ChannelError', () => {
    const err = new ChannelError('failed', 'discord');
    expect(err.name).toBe('ChannelError');
  });

  it('stores the channel name', () => {
    const err = new ChannelError('auth failed', 'slack');
    expect(err.channel).toBe('slack');
  });

  it('extends Ch4pError', () => {
    const err = new ChannelError('failed', 'telegram');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('merges channel into context', () => {
    const err = new ChannelError('failed', 'discord', { guild: '12345' });
    expect(err.context).toEqual({ guild: '12345', channel: 'discord' });
  });

  it('includes channel in context even without extra context', () => {
    const err = new ChannelError('failed', 'slack');
    expect(err.context).toEqual({ channel: 'slack' });
  });
});

// ─── MemoryError ─────────────────────────────────────────────────────────────

describe('MemoryError', () => {
  it('sets code to MEMORY_ERROR', () => {
    const err = new MemoryError('index corrupted');
    expect(err.code).toBe('MEMORY_ERROR');
  });

  it('sets name to MemoryError', () => {
    const err = new MemoryError('failed');
    expect(err.name).toBe('MemoryError');
  });

  it('extends Ch4pError', () => {
    const err = new MemoryError('failed');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts optional context', () => {
    const ctx = { backend: 'sqlite', operation: 'recall' };
    const err = new MemoryError('query failed', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('has undefined context when not provided', () => {
    const err = new MemoryError('failed');
    expect(err.context).toBeUndefined();
  });
});

// ─── EngineError ─────────────────────────────────────────────────────────────

describe('EngineError', () => {
  it('sets code to ENGINE_ERROR', () => {
    const err = new EngineError('run failed', 'native');
    expect(err.code).toBe('ENGINE_ERROR');
  });

  it('sets name to EngineError', () => {
    const err = new EngineError('failed', 'claude-cli');
    expect(err.name).toBe('EngineError');
  });

  it('stores the engine name', () => {
    const err = new EngineError('crashed', 'codex');
    expect(err.engine).toBe('codex');
  });

  it('extends Ch4pError', () => {
    const err = new EngineError('failed', 'native');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('merges engine into context', () => {
    const err = new EngineError('timeout', 'native', { duration: 30000 });
    expect(err.context).toEqual({ duration: 30000, engine: 'native' });
  });

  it('includes engine in context even without extra context', () => {
    const err = new EngineError('failed', 'claude-cli');
    expect(err.context).toEqual({ engine: 'claude-cli' });
  });
});

// ─── ConfigError ─────────────────────────────────────────────────────────────

describe('ConfigError', () => {
  it('sets code to CONFIG_ERROR', () => {
    const err = new ConfigError('missing required field');
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('sets name to ConfigError', () => {
    const err = new ConfigError('invalid');
    expect(err.name).toBe('ConfigError');
  });

  it('extends Ch4pError', () => {
    const err = new ConfigError('failed');
    expect(err).toBeInstanceOf(Ch4pError);
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts optional context', () => {
    const ctx = { field: 'agent.model', expected: 'string' };
    const err = new ConfigError('invalid type', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('has undefined context when not provided', () => {
    const err = new ConfigError('bad config');
    expect(err.context).toBeUndefined();
  });
});

// ─── Cross-cutting error behavior ───────────────────────────────────────────

describe('Error hierarchy', () => {
  it('all error subclasses are instances of Ch4pError', () => {
    const errors = [
      new SecurityError('msg'),
      new ProviderError('msg', 'p'),
      new ToolError('msg', 't'),
      new ChannelError('msg', 'c'),
      new MemoryError('msg'),
      new EngineError('msg', 'e'),
      new ConfigError('msg'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Ch4pError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('all error subclasses have distinct names', () => {
    const names = new Set([
      new SecurityError('msg').name,
      new ProviderError('msg', 'p').name,
      new ToolError('msg', 't').name,
      new ChannelError('msg', 'c').name,
      new MemoryError('msg').name,
      new EngineError('msg', 'e').name,
      new ConfigError('msg').name,
    ]);
    expect(names.size).toBe(7);
  });

  it('all error subclasses have distinct codes', () => {
    const codes = new Set([
      new SecurityError('msg').code,
      new ProviderError('msg', 'p').code,
      new ToolError('msg', 't').code,
      new ChannelError('msg', 'c').code,
      new MemoryError('msg').code,
      new EngineError('msg', 'e').code,
      new ConfigError('msg').code,
    ]);
    expect(codes.size).toBe(7);
  });

  it('errors can be caught by their specific type', () => {
    const throwAndCatch = (errorFn: () => never) => {
      try {
        errorFn();
      } catch (e) {
        return e;
      }
    };

    const secErr = throwAndCatch(() => {
      throw new SecurityError('sec');
    });
    expect(secErr).toBeInstanceOf(SecurityError);
    expect(secErr).not.toBeInstanceOf(ProviderError);

    const provErr = throwAndCatch(() => {
      throw new ProviderError('prov', 'openai');
    });
    expect(provErr).toBeInstanceOf(ProviderError);
    expect(provErr).not.toBeInstanceOf(SecurityError);
  });

  it('errors serialize well with JSON.stringify on context', () => {
    const err = new ProviderError('rate limited', 'openai', {
      retryAfter: 5,
      status: 429,
    });
    const serialized = JSON.stringify({
      name: err.name,
      message: err.message,
      code: err.code,
      context: err.context,
    });
    const parsed = JSON.parse(serialized);
    expect(parsed.name).toBe('ProviderError');
    expect(parsed.code).toBe('PROVIDER_ERROR');
    expect(parsed.context.retryAfter).toBe(5);
    expect(parsed.context.provider).toBe('openai');
  });
});
