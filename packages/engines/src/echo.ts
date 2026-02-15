/**
 * EchoEngine — test/debug engine that echoes back the last user message.
 *
 * Useful for testing the agent loop, channel wiring, and event plumbing
 * without requiring an LLM provider or API keys.
 */

import type {
  IEngine,
  Job,
  RunOpts,
  RunHandle,
  ResumeToken,
  EngineEvent,
  Message,
} from '@ch4p/core';
import { EngineError, generateId } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENGINE_ID = 'echo';
const ENGINE_NAME = 'Echo Engine';

// ---------------------------------------------------------------------------
// EchoEngine
// ---------------------------------------------------------------------------

export class EchoEngine implements IEngine {
  readonly id = ENGINE_ID;
  readonly name = ENGINE_NAME;

  // -----------------------------------------------------------------------
  // IEngine.startRun
  // -----------------------------------------------------------------------

  async startRun(job: Job, opts?: RunOpts): Promise<RunHandle> {
    const ref = generateId();
    const abortController = new AbortController();

    // Link the caller's signal
    if (opts?.signal) {
      if (opts.signal.aborted) {
        abortController.abort(opts.signal.reason);
      } else {
        opts.signal.addEventListener('abort', () => {
          abortController.abort(opts.signal!.reason);
        }, { once: true });
      }
    }

    const lastUserMessage = this.extractLastUserMessage(job.messages);
    const echoText = `[echo] ${lastUserMessage}`;

    const events = this.generateEvents(
      ref,
      echoText,
      abortController.signal,
      opts?.onProgress,
    );

    return {
      ref,
      events,
      cancel: async () => {
        abortController.abort(new EngineError('Run cancelled', ENGINE_ID));
      },
      steer: (_message: string) => {
        // Echo engine ignores steer messages — nothing to redirect.
      },
    };
  }

  // -----------------------------------------------------------------------
  // IEngine.resume
  // -----------------------------------------------------------------------

  async resume(token: ResumeToken, prompt: string): Promise<RunHandle> {
    if (token.engineId !== ENGINE_ID) {
      throw new EngineError(
        `Cannot resume: token engine "${token.engineId}" does not match "${ENGINE_ID}"`,
        ENGINE_ID,
      );
    }

    const job: Job = {
      sessionId: (token.state as { sessionId?: string })?.sessionId ?? generateId(),
      messages: [{ role: 'user', content: prompt }],
    };

    return this.startRun(job);
  }

  // -----------------------------------------------------------------------
  // Private: event generation
  // -----------------------------------------------------------------------

  private async *generateEvents(
    ref: string,
    echoText: string,
    signal: AbortSignal,
    onProgress?: (event: EngineEvent) => void,
  ): AsyncGenerator<EngineEvent, void, undefined> {
    const emit = (event: EngineEvent): EngineEvent => {
      onProgress?.(event);
      return event;
    };

    // started
    const resumeToken: ResumeToken = {
      engineId: ENGINE_ID,
      ref,
      state: { echoText },
    };
    yield emit({ type: 'started', resumeToken });

    // Check for cancellation
    if (signal.aborted) {
      yield emit({
        type: 'error',
        error: new EngineError('Run was cancelled', ENGINE_ID),
      });
      return;
    }

    // text_delta — emit the entire echo as a single delta
    yield emit({ type: 'text_delta', delta: echoText });

    // completed
    yield emit({
      type: 'completed',
      answer: echoText,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  }

  // -----------------------------------------------------------------------
  // Private: helpers
  // -----------------------------------------------------------------------

  private extractLastUserMessage(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        // Extract text from content blocks
        const textParts = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '');
        if (textParts.length > 0) {
          return textParts.join('');
        }
      }
    }
    return '(no user message)';
  }
}
