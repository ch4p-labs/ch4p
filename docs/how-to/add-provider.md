# How to Add a New LLM Provider

This guide walks you through implementing the `IProvider` interface to add support for a new LLM engine in ch4p.

---

## Prerequisites

- A working ch4p development environment
- TypeScript familiarity
- API documentation for the target LLM provider

---

## Step 1: Create the Provider File

Create a new file in `packages/providers/src/`:

```bash
touch packages/providers/src/my-provider.ts
```

---

## Step 2: Implement IProvider

Import the interface and implement all required methods:

```typescript
import type {
  IProvider,
  ModelInfo,
  TokenUsage,
  StreamOpts,
  CompleteOpts,
  StreamEvent,
  CompletionResult,
} from '@ch4p/core';
import type { Message } from '@ch4p/core';

export class MyProvider implements IProvider {
  readonly id = 'my-provider';
  readonly name = 'My Provider';

  async listModels(): Promise<ModelInfo[]> {
    // Return available models from this provider.
    return [{
      id: 'my-model-v1',
      name: 'My Model v1',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
      supportsVision: false,
    }];
  }

  async *stream(
    model: string,
    context: Message[],
    opts?: StreamOpts,
  ): AsyncIterable<StreamEvent> {
    // Map ch4p messages to provider format, send request,
    // yield StreamEvent chunks as they arrive from the API.
  }

  async complete(
    model: string,
    context: Message[],
    opts?: CompleteOpts,
  ): Promise<CompletionResult> {
    // Non-streaming completion. Map messages, send request,
    // return CompletionResult with message, usage, and finishReason.
  }

  async countTokens(model: string, messages: Message[]): Promise<number> {
    // Estimate token count for the given messages.
    // Can use a heuristic (chars / 4) if exact counting is unavailable.
  }

  supportsTools(model: string): boolean {
    // Return whether the given model supports tool calling.
    return true;
  }
}
```

---

## Step 3: Map Message Formats

ch4p uses a unified message format. Your provider must translate in both directions.

```typescript
private toProviderFormat(messages: Message[]): ProviderMessage[] {
  return messages.map(msg => ({
    role: this.mapRole(msg.role),
    content: this.mapContent(msg.content),
  }));
}

private fromProviderResponse(raw: ProviderRawResponse): CompletionResponse {
  return {
    content: raw.output.text,
    model: raw.model,
    usage: {
      inputTokens: raw.usage.prompt_tokens,
      outputTokens: raw.usage.completion_tokens,
    },
    stopReason: this.mapStopReason(raw.stop_reason),
    toolCalls: this.extractToolCalls(raw),
  };
}
```

---

## Step 4: Handle Tool Calls

If the provider supports function/tool calling, map between ch4p's tool format and the provider's:

```typescript
private mapToolDefinitions(tools: ToolDefinition[]): ProviderToolFormat[] {
  return tools.map(tool => ({
    // Map to provider's expected tool schema
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

private extractToolCalls(raw: ProviderRawResponse): ToolCall[] | undefined {
  if (!raw.tool_calls) return undefined;
  return raw.tool_calls.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));
}
```

---

## Step 5: Register the Provider

Add your provider to the provider registry in `packages/providers/src/index.ts`:

```typescript
import { MyProvider } from './my-provider.js';

export const providers = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider,
  ollama: OllamaProvider,
  'my-provider': MyProvider,
};
```

---

## Step 6: Add Configuration Schema

Add your provider's configuration fields to the config schema:

```typescript
'my-provider': {
  apiKey: { type: 'string', required: true },
  baseUrl: { type: 'string', default: 'https://api.my-provider.com/v1' },
  model: { type: 'string', default: 'my-model-v1' },
  maxTokens: { type: 'number', default: 4096 },
}
```

---

## Step 7: Test the Provider

Use the built-in provider test harness:

```bash
ch4p doctor --provider my-provider
```

This validates:
- Connection and authentication
- Completion request/response cycle
- Streaming support
- Tool call round-trip (if supported)
- Model listing

---

## Common Pitfalls

- **Streaming format**: Some providers use SSE, others use newline-delimited JSON. Match the transport correctly.
- **Token counting**: Map token usage fields accurately. ch4p uses `inputTokens` and `outputTokens`.
- **Finish reasons**: Map the provider's stop reasons to ch4p's enum: `stop`, `tool_use`, `max_tokens`, `error`.
- **Rate limiting**: Implement retry logic with exponential backoff in your HTTP client setup.
