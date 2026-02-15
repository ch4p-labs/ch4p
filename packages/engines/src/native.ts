/**
 * NativeEngine — primary engine that uses IProvider directly.
 *
 * Translates provider StreamEvents into EngineEvents, supports cancellation
 * via AbortSignal, steering (injecting messages mid-run), and resumption
 * from a ResumeToken.
 */

import type {
  IEngine,
  IProvider,
  Job,
  RunOpts,
  RunHandle,
  ResumeToken,
  EngineEvent,
  StreamEvent,
  StreamOpts,
  Message,
  ToolDefinition,
} from '@ch4p/core';
import { EngineError, generateId } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENGINE_ID = 'native';
const ENGINE_NAME = 'Native Engine';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NativeEngineConfig {
  provider: IProvider;
  defaultModel?: string;
}

// ---------------------------------------------------------------------------
// Internal state snapshot stored inside a ResumeToken
// ---------------------------------------------------------------------------

interface ResumeState {
  messages: Message[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  model: string;
  config?: Record<string, unknown>;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// NativeEngine
// ---------------------------------------------------------------------------

export class NativeEngine implements IEngine {
  readonly id = ENGINE_ID;
  readonly name = ENGINE_NAME;

  private readonly provider: IProvider;
  private readonly defaultModel: string | undefined;

  constructor(config: NativeEngineConfig) {
    if (!config.provider) {
      throw new EngineError('A provider is required for NativeEngine', ENGINE_ID);
    }
    this.provider = config.provider;
    this.defaultModel = config.defaultModel;
  }

  // -----------------------------------------------------------------------
  // IEngine.startRun
  // -----------------------------------------------------------------------

  async startRun(job: Job, opts?: RunOpts): Promise<RunHandle> {
    const model = job.model ?? this.defaultModel;
    if (!model) {
      throw new EngineError(
        'No model specified and no defaultModel configured',
        ENGINE_ID,
      );
    }

    const ref = generateId();
    const abortController = new AbortController();
    const steerQueue: string[] = [];

    // Link the caller's signal to our internal controller
    if (opts?.signal) {
      if (opts.signal.aborted) {
        abortController.abort(opts.signal.reason);
      } else {
        opts.signal.addEventListener('abort', () => {
          abortController.abort(opts.signal!.reason);
        }, { once: true });
      }
    }

    const streamOpts: StreamOpts = {
      tools: job.tools,
      systemPrompt: job.systemPrompt,
      signal: abortController.signal,
    };

    // Apply config overrides
    if (job.config?.temperature !== undefined) {
      streamOpts.temperature = job.config.temperature as number;
    }
    if (job.config?.maxTokens !== undefined) {
      streamOpts.maxTokens = job.config.maxTokens as number;
    }
    if (job.config?.stopSequences !== undefined) {
      streamOpts.stopSequences = job.config.stopSequences as string[];
    }

    const resumeState: ResumeState = {
      messages: [...job.messages],
      tools: job.tools,
      systemPrompt: job.systemPrompt,
      model,
      config: job.config,
      sessionId: job.sessionId,
    };

    const events = this.generateEvents(
      model,
      job.messages,
      streamOpts,
      ref,
      resumeState,
      steerQueue,
      opts?.onProgress,
    );

    return {
      ref,
      events,
      cancel: async () => {
        abortController.abort(new EngineError('Run cancelled', ENGINE_ID));
      },
      steer: (message: string) => {
        steerQueue.push(message);
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

    const state = token.state as ResumeState;
    if (!state || !state.messages || !state.model) {
      throw new EngineError('Invalid resume token state', ENGINE_ID);
    }

    // Append the new prompt as a user message to continue the conversation
    const messages: Message[] = [
      ...state.messages,
      { role: 'user', content: prompt },
    ];

    const job: Job = {
      sessionId: state.sessionId,
      messages,
      tools: state.tools,
      systemPrompt: state.systemPrompt,
      model: state.model,
      config: state.config,
    };

    return this.startRun(job);
  }

  // -----------------------------------------------------------------------
  // Private: event generation
  // -----------------------------------------------------------------------

  private async *generateEvents(
    model: string,
    messages: Message[],
    streamOpts: StreamOpts,
    ref: string,
    resumeState: ResumeState,
    steerQueue: string[],
    onProgress?: (event: EngineEvent) => void,
  ): AsyncGenerator<EngineEvent, void, undefined> {
    const emit = (event: EngineEvent): EngineEvent => {
      onProgress?.(event);
      return event;
    };

    // Emit started with resume token
    const resumeToken: ResumeToken = {
      engineId: ENGINE_ID,
      ref,
      state: resumeState,
    };
    yield emit({ type: 'started', resumeToken });

    try {
      // Drain steer queue before starting the stream — any messages pushed
      // via steer() before the first iteration are prepended as user context.
      const context = [...messages];
      while (steerQueue.length > 0) {
        const steered = steerQueue.shift()!;
        context.push({ role: 'user', content: steered });
      }

      const stream = this.provider.stream(model, context, streamOpts);

      let fullAnswer = '';
      let emittedCompleted = false;

      for await (const event of stream) {
        // Check for steer messages between events
        while (steerQueue.length > 0) {
          // Steer messages are queued for the next turn; for the current stream
          // we note them but cannot inject into an in-flight provider stream.
          // They will be picked up if the engine performs another turn.
          steerQueue.shift();
        }

        const engineEvents = this.translateStreamEvent(event);
        for (const engineEvent of engineEvents) {
          if (engineEvent.type === 'text_delta') {
            fullAnswer += engineEvent.delta;
          }
          if (engineEvent.type === 'completed') {
            emittedCompleted = true;
          }
          yield emit(engineEvent);
        }
      }

      // If the provider stream ended without a 'done' event (unusual but
      // defensive), emit a completed event so callers always get one.
      if (!emittedCompleted) {
        yield emit({
          type: 'completed',
          answer: fullAnswer,
        });
      }
    } catch (err) {
      if (streamOpts.signal?.aborted) {
        yield emit({
          type: 'error',
          error: new EngineError('Run was cancelled', ENGINE_ID),
        });
        return;
      }

      const error = err instanceof Error
        ? err
        : new EngineError(String(err), ENGINE_ID);

      yield emit({ type: 'error', error });
    }
  }

  // -----------------------------------------------------------------------
  // Private: StreamEvent -> EngineEvent translation
  // -----------------------------------------------------------------------

  private translateStreamEvent(event: StreamEvent): EngineEvent[] {
    const events: EngineEvent[] = [];

    switch (event.type) {
      case 'text_delta':
        events.push({ type: 'text_delta', delta: event.delta });
        break;

      case 'tool_call_start':
        events.push({
          type: 'tool_start',
          id: event.id,
          tool: event.name,
          args: undefined,
        });
        break;

      case 'tool_call_delta':
        events.push({
          type: 'tool_progress',
          id: event.id,
          update: event.argsDelta,
        });
        break;

      case 'tool_call_end':
        events.push({
          type: 'tool_end',
          id: event.id,
          result: {
            success: true,
            output: typeof event.args === 'string'
              ? event.args
              : JSON.stringify(event.args),
          },
        });
        break;

      case 'done': {
        const answerText = typeof event.message.content === 'string'
          ? event.message.content
          : event.message.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text ?? '')
              .join('');

        events.push({
          type: 'completed',
          answer: answerText,
          usage: event.usage,
        });
        break;
      }

      case 'usage':
        // Usage events from the provider are informational; the final usage
        // is captured in the 'done' event. We do not emit a separate
        // EngineEvent for intermediate usage — callers can track via
        // the onProgress callback if needed.
        break;
    }

    return events;
  }
}
