/**
 * SteeringQueue — Per-session message queue for live steering.
 *
 * Inspired by Lemon's BEAM mailbox pattern. The agent loop checks this queue
 * at defined yield points:
 *
 *   1. After each LLM stream chunk batch
 *   2. Between tool executions
 *   3. At loop iteration boundaries
 *   4. During tool execution (via AbortSignal)
 *
 * Messages are priority-sorted (higher first), then timestamp-ordered within
 * the same priority tier. Abort messages short-circuit all processing.
 */

export type SteeringMessageType = 'abort' | 'inject' | 'priority' | 'context_update';

export interface SteeringMessage {
  type: SteeringMessageType;
  content?: string;
  priority?: number;
  timestamp: Date;
}

export class SteeringQueue {
  private queue: SteeringMessage[] = [];

  /**
   * Push a message into the queue. The queue is re-sorted on every push
   * so that drain() always returns messages in priority-then-timestamp order.
   */
  push(msg: SteeringMessage): void {
    this.queue.push(msg);
    this.queue.sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }

  /**
   * Drain all messages from the queue, returning them in priority order.
   * After this call the queue is empty.
   */
  drain(): SteeringMessage[] {
    const messages = this.queue;
    this.queue = [];
    return messages;
  }

  /** Peek at the highest-priority message without removing it. */
  peek(): SteeringMessage | undefined {
    return this.queue[0];
  }

  /** Returns true if any pending message is an abort request. */
  hasAbort(): boolean {
    return this.queue.some((m) => m.type === 'abort');
  }

  /** Returns true if the queue has any pending messages. */
  hasMessages(): boolean {
    return this.queue.length > 0;
  }

  /** Discard all pending messages. */
  clear(): void {
    this.queue = [];
  }

  /** Number of messages currently in the queue. */
  get length(): number {
    return this.queue.length;
  }
}
