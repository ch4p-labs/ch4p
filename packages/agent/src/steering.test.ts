import { vi } from 'vitest';
import { SteeringQueue } from './steering.js';
import type { SteeringMessage } from './steering.js';

describe('SteeringQueue', () => {
  let queue: SteeringQueue;

  beforeEach(() => {
    queue = new SteeringQueue();
  });

  describe('push', () => {
    it('adds a message to the queue', () => {
      const msg: SteeringMessage = {
        type: 'inject',
        content: 'hello',
        timestamp: new Date(),
      };
      queue.push(msg);
      expect(queue.length).toBe(1);
    });

    it('sorts messages by priority (higher first)', () => {
      const low: SteeringMessage = {
        type: 'inject',
        content: 'low',
        priority: 1,
        timestamp: new Date('2024-01-01'),
      };
      const high: SteeringMessage = {
        type: 'abort',
        content: 'high',
        priority: 10,
        timestamp: new Date('2024-01-02'),
      };
      queue.push(low);
      queue.push(high);

      const drained = queue.drain();
      expect(drained[0]!.content).toBe('high');
      expect(drained[1]!.content).toBe('low');
    });

    it('sorts same-priority messages by timestamp (earliest first)', () => {
      const first: SteeringMessage = {
        type: 'inject',
        content: 'first',
        priority: 5,
        timestamp: new Date('2024-01-01'),
      };
      const second: SteeringMessage = {
        type: 'inject',
        content: 'second',
        priority: 5,
        timestamp: new Date('2024-01-02'),
      };
      queue.push(second);
      queue.push(first);

      const drained = queue.drain();
      expect(drained[0]!.content).toBe('first');
      expect(drained[1]!.content).toBe('second');
    });

    it('treats undefined priority as 0', () => {
      const noPriority: SteeringMessage = {
        type: 'inject',
        content: 'none',
        timestamp: new Date('2024-01-01'),
      };
      const withPriority: SteeringMessage = {
        type: 'inject',
        content: 'has-priority',
        priority: 1,
        timestamp: new Date('2024-01-01'),
      };
      queue.push(noPriority);
      queue.push(withPriority);

      const drained = queue.drain();
      expect(drained[0]!.content).toBe('has-priority');
      expect(drained[1]!.content).toBe('none');
    });
  });

  describe('drain', () => {
    it('returns all messages and empties the queue', () => {
      queue.push({ type: 'inject', content: 'a', timestamp: new Date() });
      queue.push({ type: 'inject', content: 'b', timestamp: new Date() });

      const messages = queue.drain();
      expect(messages).toHaveLength(2);
      expect(queue.length).toBe(0);
      expect(queue.hasMessages()).toBe(false);
    });

    it('returns empty array when queue is empty', () => {
      const messages = queue.drain();
      expect(messages).toEqual([]);
    });
  });

  describe('peek', () => {
    it('returns the highest-priority message without removing it', () => {
      queue.push({ type: 'inject', content: 'low', priority: 1, timestamp: new Date() });
      queue.push({ type: 'abort', content: 'high', priority: 10, timestamp: new Date() });

      const peeked = queue.peek();
      expect(peeked!.content).toBe('high');
      expect(queue.length).toBe(2); // not removed
    });

    it('returns undefined for empty queue', () => {
      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('hasAbort', () => {
    it('returns true when an abort message is present', () => {
      queue.push({ type: 'abort', content: 'stop', timestamp: new Date() });
      expect(queue.hasAbort()).toBe(true);
    });

    it('returns false when no abort message is present', () => {
      queue.push({ type: 'inject', content: 'hi', timestamp: new Date() });
      expect(queue.hasAbort()).toBe(false);
    });

    it('returns false for empty queue', () => {
      expect(queue.hasAbort()).toBe(false);
    });
  });

  describe('hasMessages', () => {
    it('returns true when messages exist', () => {
      queue.push({ type: 'inject', content: 'x', timestamp: new Date() });
      expect(queue.hasMessages()).toBe(true);
    });

    it('returns false for empty queue', () => {
      expect(queue.hasMessages()).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all pending messages', () => {
      queue.push({ type: 'inject', content: 'a', timestamp: new Date() });
      queue.push({ type: 'abort', content: 'b', timestamp: new Date() });

      queue.clear();
      expect(queue.length).toBe(0);
      expect(queue.hasMessages()).toBe(false);
      expect(queue.hasAbort()).toBe(false);
    });
  });

  describe('length', () => {
    it('tracks the number of messages', () => {
      expect(queue.length).toBe(0);
      queue.push({ type: 'inject', content: 'a', timestamp: new Date() });
      expect(queue.length).toBe(1);
      queue.push({ type: 'inject', content: 'b', timestamp: new Date() });
      expect(queue.length).toBe(2);
      queue.drain();
      expect(queue.length).toBe(0);
    });
  });
});
