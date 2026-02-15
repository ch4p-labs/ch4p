import { vi } from 'vitest';
import { Session } from './session.js';
import type { SessionState } from './session.js';
import type { SessionConfig } from '@ch4p/core';

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    sessionId: 'test-session-1',
    engineId: 'echo',
    model: 'test-model',
    provider: 'test-provider',
    ...overrides,
  };
}

describe('Session', () => {
  describe('constructor', () => {
    it('creates a session in "created" state', () => {
      const session = new Session(makeConfig());
      expect(session.getState()).toBe('created');
    });

    it('assigns the session id from config', () => {
      const session = new Session(makeConfig({ sessionId: 'my-id' }));
      expect(session.getId()).toBe('my-id');
    });

    it('sets system prompt on the context when provided in config', () => {
      const session = new Session(
        makeConfig({ systemPrompt: 'You are helpful' }),
      );
      const msgs = session.getContext().getMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.role).toBe('system');
      expect(msgs[0]!.content).toBe('You are helpful');
    });

    it('does not set system prompt when not provided', () => {
      const session = new Session(makeConfig());
      const msgs = session.getContext().getMessages();
      expect(msgs).toHaveLength(0);
    });

    it('initializes metadata correctly', () => {
      const session = new Session(
        makeConfig({
          sessionId: 's1',
          channelId: 'ch1',
          userId: 'u1',
          engineId: 'native',
        }),
      );
      const meta = session.getMetadata();
      expect(meta.id).toBe('s1');
      expect(meta.channelId).toBe('ch1');
      expect(meta.userId).toBe('u1');
      expect(meta.engineId).toBe('native');
      expect(meta.loopIterations).toBe(0);
      expect(meta.toolInvocations).toBe(0);
      expect(meta.llmCalls).toBe(0);
      expect(meta.errors).toEqual([]);
      expect(meta.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('accessors', () => {
    it('returns the config via getConfig()', () => {
      const config = makeConfig({ model: 'gpt-4o' });
      const session = new Session(config);
      expect(session.getConfig().model).toBe('gpt-4o');
    });

    it('returns the context manager via getContext()', () => {
      const session = new Session(makeConfig());
      expect(session.getContext()).toBeDefined();
    });

    it('returns the steering queue via getSteering()', () => {
      const session = new Session(makeConfig());
      expect(session.getSteering()).toBeDefined();
    });
  });

  describe('lifecycle transitions', () => {
    it('created -> active', () => {
      const session = new Session(makeConfig());
      session.activate();
      expect(session.getState()).toBe('active');
    });

    it('active -> paused', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.pause();
      expect(session.getState()).toBe('paused');
    });

    it('paused -> active (resume)', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.pause();
      session.resume();
      expect(session.getState()).toBe('active');
    });

    it('active -> completed', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.complete();
      expect(session.getState()).toBe('completed');
      expect(session.getMetadata().endedAt).toBeInstanceOf(Date);
    });

    it('paused -> completed', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.pause();
      session.complete();
      expect(session.getState()).toBe('completed');
    });

    it('any state -> failed', () => {
      const session = new Session(makeConfig());
      const err = new Error('something broke');
      session.fail(err);
      expect(session.getState()).toBe('failed');
      expect(session.getMetadata().errors).toContain(err);
      expect(session.getMetadata().endedAt).toBeInstanceOf(Date);
    });

    it('throws when activating from completed', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.complete();
      expect(() => session.activate()).toThrow('Cannot activate');
    });

    it('throws when pausing from created', () => {
      const session = new Session(makeConfig());
      expect(() => session.pause()).toThrow('Cannot pause');
    });

    it('throws when resuming from active', () => {
      const session = new Session(makeConfig());
      session.activate();
      expect(() => session.resume()).toThrow('Cannot resume');
    });

    it('throws when completing from created', () => {
      const session = new Session(makeConfig());
      expect(() => session.complete()).toThrow('Cannot complete');
    });

    it('complete() clears the steering queue', () => {
      const session = new Session(makeConfig());
      session.activate();
      session.getSteering().push({
        type: 'inject',
        content: 'test',
        timestamp: new Date(),
      });
      session.complete();
      expect(session.getSteering().hasMessages()).toBe(false);
    });

    it('fail() clears the steering queue', () => {
      const session = new Session(makeConfig());
      session.getSteering().push({
        type: 'inject',
        content: 'test',
        timestamp: new Date(),
      });
      session.fail(new Error('oops'));
      expect(session.getSteering().hasMessages()).toBe(false);
    });
  });

  describe('stats tracking', () => {
    it('recordIteration increments counter', () => {
      const session = new Session(makeConfig());
      session.recordIteration();
      session.recordIteration();
      expect(session.getMetadata().loopIterations).toBe(2);
    });

    it('recordToolInvocation increments counter', () => {
      const session = new Session(makeConfig());
      session.recordToolInvocation();
      expect(session.getMetadata().toolInvocations).toBe(1);
    });

    it('recordLLMCall increments counter', () => {
      const session = new Session(makeConfig());
      session.recordLLMCall();
      session.recordLLMCall();
      session.recordLLMCall();
      expect(session.getMetadata().llmCalls).toBe(3);
    });

    it('recordError adds error without failing session', () => {
      const session = new Session(makeConfig());
      session.activate();
      const err = new Error('non-fatal');
      session.recordError(err);
      expect(session.getState()).toBe('active');
      expect(session.getMetadata().errors).toContain(err);
    });
  });

  describe('dispose', () => {
    it('clears context and steering', async () => {
      const session = new Session(makeConfig({ systemPrompt: 'sys' }));
      await session.getContext().addMessage({ role: 'user', content: 'hi' });
      session.getSteering().push({
        type: 'inject',
        content: 'steer',
        timestamp: new Date(),
      });

      session.dispose();

      // Context cleared (only system prompt remains via clear())
      const msgs = session.getContext().getMessages();
      expect(msgs).toHaveLength(1); // system prompt kept
      expect(session.getSteering().hasMessages()).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('returns a copy with the current state', () => {
      const session = new Session(makeConfig());
      session.activate();
      const meta = session.getMetadata();
      expect(meta.state).toBe('active');
    });
  });
});
