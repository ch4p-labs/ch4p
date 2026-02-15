import { vi } from 'vitest';
import { EchoEngine } from './echo.js';
import type { Job, EngineEvent, ResumeToken } from '@ch4p/core';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    sessionId: 'sess-1',
    messages: [
      { role: 'user', content: 'Hello world' },
    ],
    ...overrides,
  };
}

async function collectEvents(events: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> {
  const collected: EngineEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('EchoEngine', () => {
  let engine: EchoEngine;

  beforeEach(() => {
    engine = new EchoEngine();
  });

  describe('properties', () => {
    it('has id "echo"', () => {
      expect(engine.id).toBe('echo');
    });

    it('has name "Echo Engine"', () => {
      expect(engine.name).toBe('Echo Engine');
    });
  });

  describe('startRun', () => {
    it('returns a RunHandle with ref and events', async () => {
      const handle = await engine.startRun(makeJob());
      expect(handle.ref).toBeTruthy();
      expect(handle.events).toBeDefined();
      expect(typeof handle.cancel).toBe('function');
      expect(typeof handle.steer).toBe('function');
    });

    it('emits started, text_delta, and completed events', async () => {
      const handle = await engine.startRun(makeJob());
      const events = await collectEvents(handle.events);

      const types = events.map((e) => e.type);
      expect(types).toContain('started');
      expect(types).toContain('text_delta');
      expect(types).toContain('completed');
    });

    it('echoes back the last user message with [echo] prefix', async () => {
      const handle = await engine.startRun(
        makeJob({ messages: [{ role: 'user', content: 'ping' }] }),
      );
      const events = await collectEvents(handle.events);

      const textDelta = events.find((e) => e.type === 'text_delta');
      expect(textDelta).toBeDefined();
      if (textDelta?.type === 'text_delta') {
        expect(textDelta.delta).toBe('[echo] ping');
      }
    });

    it('extracts last user message from multiple messages', async () => {
      const handle = await engine.startRun(
        makeJob({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'response' },
            { role: 'user', content: 'second' },
          ],
        }),
      );
      const events = await collectEvents(handle.events);

      const completed = events.find((e) => e.type === 'completed');
      if (completed?.type === 'completed') {
        expect(completed.answer).toBe('[echo] second');
      }
    });

    it('handles content block arrays', async () => {
      const handle = await engine.startRun(
        makeJob({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'block content' },
              ],
            },
          ],
        }),
      );
      const events = await collectEvents(handle.events);

      const completed = events.find((e) => e.type === 'completed');
      if (completed?.type === 'completed') {
        expect(completed.answer).toBe('[echo] block content');
      }
    });

    it('returns "(no user message)" when no user messages exist', async () => {
      const handle = await engine.startRun(
        makeJob({
          messages: [
            { role: 'system', content: 'system prompt' },
          ],
        }),
      );
      const events = await collectEvents(handle.events);

      const completed = events.find((e) => e.type === 'completed');
      if (completed?.type === 'completed') {
        expect(completed.answer).toBe('[echo] (no user message)');
      }
    });

    it('includes a resume token in the started event', async () => {
      const handle = await engine.startRun(makeJob());
      const events = await collectEvents(handle.events);

      const started = events.find((e) => e.type === 'started');
      if (started?.type === 'started') {
        expect(started.resumeToken).toBeDefined();
        expect(started.resumeToken!.engineId).toBe('echo');
        expect(started.resumeToken!.ref).toBe(handle.ref);
      }
    });

    it('calls onProgress for each event when provided', async () => {
      const onProgress = vi.fn();
      const handle = await engine.startRun(makeJob(), { onProgress });
      await collectEvents(handle.events);

      expect(onProgress).toHaveBeenCalledTimes(3); // started, text_delta, completed
    });

    it('emits error event when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const handle = await engine.startRun(makeJob(), {
        signal: controller.signal,
      });
      const events = await collectEvents(handle.events);

      const types = events.map((e) => e.type);
      expect(types).toContain('started');
      expect(types).toContain('error');
    });

    it('completed event includes zero usage', async () => {
      const handle = await engine.startRun(makeJob());
      const events = await collectEvents(handle.events);

      const completed = events.find((e) => e.type === 'completed');
      if (completed?.type === 'completed') {
        expect(completed.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
      }
    });
  });

  describe('resume', () => {
    it('resumes from a resume token', async () => {
      // First run to get a token
      const firstHandle = await engine.startRun(makeJob());
      const firstEvents = await collectEvents(firstHandle.events);
      const started = firstEvents.find((e) => e.type === 'started');

      expect(started?.type).toBe('started');
      if (started?.type !== 'started') return;

      const token = started.resumeToken!;
      const resumeHandle = await engine.resume(token, 'resumed message');
      const resumeEvents = await collectEvents(resumeHandle.events);

      const completed = resumeEvents.find((e) => e.type === 'completed');
      if (completed?.type === 'completed') {
        expect(completed.answer).toBe('[echo] resumed message');
      }
    });

    it('throws for wrong engine id in token', async () => {
      const badToken: ResumeToken = {
        engineId: 'wrong-engine',
        ref: 'ref-1',
        state: {},
      };

      await expect(engine.resume(badToken, 'test')).rejects.toThrow(
        'Cannot resume',
      );
    });
  });

  describe('cancel', () => {
    it('cancel() does not throw', async () => {
      const handle = await engine.startRun(makeJob());
      await collectEvents(handle.events);
      await expect(handle.cancel()).resolves.not.toThrow();
    });
  });

  describe('steer', () => {
    it('steer() does not throw (no-op for echo)', async () => {
      const handle = await engine.startRun(makeJob());
      expect(() => handle.steer('new direction')).not.toThrow();
    });
  });
});
