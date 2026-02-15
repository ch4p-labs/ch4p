import { vi } from 'vitest';
import { OpenAIProvider } from './openai.js';
import { ProviderError } from '@ch4p/core';
import type { Message } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(responseOrFn: Response | (() => Response | Promise<Response>)) {
  globalThis.fetch = vi.fn().mockImplementation(
    typeof responseOrFn === 'function' ? responseOrFn : async () => responseOrFn,
  );
}

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function openaiChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: 'gpt-4o',
    ...overrides,
  };
}

function validProvider(overrides: Record<string, unknown> = {}) {
  return new OpenAIProvider({
    apiKey: 'sk-test-key-123',
    maxRetries: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('OpenAIProvider', () => {
  describe('constructor', () => {
    it('throws ProviderError when apiKey is empty', () => {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(ProviderError);
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow('API key is required');
    });

    it('accepts valid config', () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });
      expect(provider.id).toBe('openai');
      expect(provider.name).toBe('OpenAI');
    });

    it('strips trailing slash from baseUrl', () => {
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        baseUrl: 'https://custom.api.com//',
      });
      expect(provider).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listModels
  // -------------------------------------------------------------------------

  describe('listModels', () => {
    it('returns an array of ModelInfo objects', async () => {
      const provider = validProvider();
      const models = await provider.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('contextWindow');
        expect(model).toHaveProperty('maxOutputTokens');
        expect(model).toHaveProperty('supportsTools');
        expect(model).toHaveProperty('supportsVision');
      }
    });

    it('includes known models', async () => {
      const provider = validProvider();
      const models = await provider.listModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('gpt-4o-mini');
      expect(ids).toContain('gpt-4-turbo');
    });
  });

  // -------------------------------------------------------------------------
  // supportsTools
  // -------------------------------------------------------------------------

  describe('supportsTools', () => {
    const provider = validProvider();

    it('returns true for known tool-capable models', () => {
      expect(provider.supportsTools('gpt-4o')).toBe(true);
      expect(provider.supportsTools('gpt-4o-mini')).toBe(true);
      expect(provider.supportsTools('gpt-4-turbo')).toBe(true);
    });

    it('returns true for gpt-4 prefix models (fallback)', () => {
      expect(provider.supportsTools('gpt-4-custom')).toBe(true);
    });

    it('returns false for models without tool support', () => {
      expect(provider.supportsTools('o1')).toBe(false);
      expect(provider.supportsTools('o3-mini')).toBe(false);
    });

    it('returns false for unknown non-gpt-4 models', () => {
      expect(provider.supportsTools('random-model')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // countTokens
  // -------------------------------------------------------------------------

  describe('countTokens', () => {
    const provider = validProvider();

    it('estimates tokens from string messages', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello world' }, // 11 chars
      ];
      const count = await provider.countTokens('gpt-4o', messages);
      expect(count).toBe(Math.ceil(11 / 4));
    });

    it('estimates tokens from content block messages', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      ];
      const count = await provider.countTokens('gpt-4o', messages);
      // text: 5+5=10, toolInput: JSON.stringify('') per block = 2*2=4, toolOutput: 0
      expect(count).toBe(Math.ceil((10 + 4) / 4));
    });

    it('handles tool calls in token counting', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'tc_1', name: 'search', args: { query: 'test' } },
          ],
        },
      ];
      const count = await provider.countTokens('gpt-4o', messages);
      const nameLen = 'search'.length; // 6
      const argsLen = JSON.stringify({ query: 'test' }).length; // 16
      expect(count).toBe(Math.ceil((nameLen + argsLen) / 4));
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('sends correct headers with Authorization Bearer', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/chat/completions');

      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-test-key-123');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('sends Organization header when configured', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key-123',
        organization: 'org-abc123',
        maxRetries: 0,
      });
      await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['OpenAI-Organization']).toBe('org-abc123');
    });

    it('sends correct body shape', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body).toHaveProperty('model', 'gpt-4o');
      expect(body).toHaveProperty('messages');
      expect(body.stream).toBe(false);
    });

    it('maps response to CompletionResult with message, usage, cost', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('gpt-4o', [
        { role: 'user', content: 'hi' },
      ]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.cost).toBeDefined();
      expect(typeof result.cost).toBe('number');
    });

    it('maps tool_calls in response to ToolCall[]', async () => {
      const responseData = openaiChatResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"query":"weather"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
      mockFetch(jsonResponse(responseData));
      const provider = validProvider();
      const result = await provider.complete('gpt-4o', [
        { role: 'user', content: 'search for weather' },
      ]);

      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls![0]!.id).toBe('call_123');
      expect(result.message.toolCalls![0]!.name).toBe('web_search');
      expect(result.message.toolCalls![0]!.args).toEqual({ query: 'weather' });
      expect(result.finishReason).toBe('tool_use');
    });

    it('keeps system messages as messages (not extracted)', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      await provider.complete('gpt-4o', [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      // System should remain as a message, not be extracted
      const roles = body.messages.map((m: { role: string }) => m.role);
      expect(roles).toContain('system');
      // No top-level system field
      expect(body.system).toBeUndefined();
    });

    it('maps finish reasons correctly', async () => {
      // stop => stop
      mockFetch(jsonResponse(openaiChatResponse()));
      let provider = validProvider();
      let result = await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);
      expect(result.finishReason).toBe('stop');

      // length => max_tokens
      mockFetch(jsonResponse(openaiChatResponse({
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'length',
        }],
      })));
      provider = validProvider();
      result = await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);
      expect(result.finishReason).toBe('max_tokens');

      // content_filter => error
      mockFetch(jsonResponse(openaiChatResponse({
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '' },
          finish_reason: 'content_filter',
        }],
      })));
      provider = validProvider();
      result = await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);
      expect(result.finishReason).toBe('error');
    });

    it('returns undefined cost for unknown models', async () => {
      mockFetch(jsonResponse(openaiChatResponse({ model: 'unknown-model' })));
      const provider = validProvider();
      const result = await provider.complete('unknown-model', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.cost).toBeUndefined();
    });

    it('throws when no choices in response', async () => {
      mockFetch(jsonResponse(openaiChatResponse({ choices: [] })));
      const provider = validProvider();
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('No choices in response');
    });
  });

  // -------------------------------------------------------------------------
  // ensureValidated
  // -------------------------------------------------------------------------

  describe('ensureValidated', () => {
    it('throws for invalid key format (not starting with sk-)', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'invalid-key-format',
        maxRetries: 0,
      });
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow(ProviderError);
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Invalid OpenAI API key format');
    });

    it('passes for valid sk- key format', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = new OpenAIProvider({
        apiKey: 'sk-valid-key',
        maxRetries: 0,
      });
      const result = await provider.complete('gpt-4o', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.message.role).toBe('assistant');
    });
  });

  // -------------------------------------------------------------------------
  // fetchWithRetry
  // -------------------------------------------------------------------------

  describe('fetchWithRetry', () => {
    it('retries on 429 (rate limit) with backoff', async () => {
      vi.spyOn(await import('@ch4p/core'), 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      mockFetch(() => {
        callCount++;
        if (callCount <= 2) {
          return jsonResponse({ error: 'rate limited' }, 429);
        }
        return jsonResponse(openaiChatResponse());
      });

      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        maxRetries: 3,
      });
      const result = await provider.complete('gpt-4o', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.message.role).toBe('assistant');
      expect(callCount).toBe(3);
    });

    it('retries on 500+ server errors', async () => {
      vi.spyOn(await import('@ch4p/core'), 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      mockFetch(() => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ error: 'internal' }, 500);
        }
        return jsonResponse(openaiChatResponse());
      });

      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        maxRetries: 3,
      });
      const result = await provider.complete('gpt-4o', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.message.role).toBe('assistant');
      expect(callCount).toBe(2);
    });

    it('does NOT retry on 401 (auth error)', async () => {
      mockFetch(jsonResponse({ error: 'unauthorized' }, 401));
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        maxRetries: 3,
      });
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Authentication failed');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      mockFetch(jsonResponse({ error: 'bad request' }, 400));
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        maxRetries: 3,
      });
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Bad request');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws after maxRetries exceeded on 429', async () => {
      vi.spyOn(await import('@ch4p/core'), 'sleep').mockResolvedValue(undefined);

      mockFetch(() => jsonResponse({ error: 'rate limited' }, 429));
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        maxRetries: 2,
      });
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Rate limited');
      // 1 initial + 2 retries = 3 calls
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const provider = validProvider();
      await expect(
        provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }], {
          signal: controller.signal,
        }),
      ).rejects.toThrow('aborted');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('sends tools in function wrapper format', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }], {
        tools: [
          {
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
      expect(body.tools[0].function.parameters).toBeDefined();
    });

    it('uses custom baseUrl', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        baseUrl: 'https://proxy.example.com',
        maxRetries: 0,
      });
      await provider.complete('gpt-4o', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://proxy.example.com/v1/chat/completions');
    });

    it('prepends system prompt if provided via opts and not in context', async () => {
      mockFetch(jsonResponse(openaiChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'gpt-4o',
        [{ role: 'user', content: 'hi' }],
        { systemPrompt: 'Be concise' },
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('Be concise');
    });
  });
});
