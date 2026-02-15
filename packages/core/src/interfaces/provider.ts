/**
 * IProvider — LLM provider contract
 *
 * Every LLM provider (Anthropic, OpenAI, Google, OpenRouter, Ollama, etc.)
 * implements this interface. Swap providers via config, zero code changes.
 */

import type { Message, ToolDefinition } from '../types/index.js';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
}

export interface StreamOpts {
  tools?: ToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  signal?: AbortSignal;
}

export type CompleteOpts = StreamOpts;

export type StreamEvent =
  | { type: 'text_delta'; delta: string; partial: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; argsDelta: string }
  | { type: 'tool_call_end'; id: string; args: unknown }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done'; message: Message; usage: TokenUsage; cost?: number };

export interface IProvider {
  readonly id: string;
  readonly name: string;

  listModels(): Promise<ModelInfo[]>;
  stream(model: string, context: Message[], opts?: StreamOpts): AsyncIterable<StreamEvent>;
  complete(model: string, context: Message[], opts?: CompleteOpts): Promise<CompletionResult>;
  countTokens(model: string, messages: Message[]): Promise<number>;
  supportsTools(model: string): boolean;
}

export interface CompletionResult {
  message: Message;
  usage: TokenUsage;
  cost?: number;
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
}
