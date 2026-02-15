/**
 * IEngine — execution engine contract
 *
 * From Lemon's multi-engine architecture. The native engine uses IProvider directly.
 * CLI engines wrap subprocess calls. All engines share this interface.
 */

import type { Message, ToolDefinition } from '../types/index.js';
import type { ToolResult } from './tool.js';
import type { TokenUsage } from './provider.js';

export interface Job {
  sessionId: string;
  messages: Message[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  model?: string;
  config?: Record<string, unknown>;
}

export interface RunOpts {
  signal?: AbortSignal;
  onProgress?: (event: EngineEvent) => void;
}

export interface ResumeToken {
  engineId: string;
  ref: string;
  state: unknown;
}

export interface RunHandle {
  readonly ref: string;
  events: AsyncIterable<EngineEvent>;
  cancel(): Promise<void>;
  steer(message: string): void;
}

export type EngineEvent =
  | { type: 'started'; resumeToken?: ResumeToken }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; id: string; tool: string; args: unknown }
  | { type: 'tool_progress'; id: string; update: string }
  | { type: 'tool_end'; id: string; result: ToolResult }
  | { type: 'completed'; answer: string; usage?: TokenUsage }
  | { type: 'error'; error: Error };

export interface IEngine {
  readonly id: string;
  readonly name: string;

  startRun(job: Job, opts?: RunOpts): Promise<RunHandle>;
  resume(token: ResumeToken, prompt: string): Promise<RunHandle>;
}
