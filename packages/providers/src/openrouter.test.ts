import { vi } from 'vitest';
import { OpenRouterProvider } from './openrouter.js';
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

function openRouterChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    model: 'openrouter/auto',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
    ...overrides,
  };
}

function validProvider(overrides: Record<string, unknown> = {}) {
  return new OpenRouterProvider({
    apiKey: 'sk-or-test-key-123',
    maxRetries: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('OpenRouterProvider', () => {
  describe('constructor', () => {
    it('throws ProviderError when apiKey is empty', () => {
      expect(() => new OpenRouterProvider({ apiKey: '' })).toThrow(ProviderError);
      expect(() => new OpenRouterProvider({ apiKey: '' })).toThrow('API key is required');
    });

    it('accepts valid config', () => {
      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test-key' });
      expect(provider.id).toBe('openrouter');
      expect(provider.name).toBe('OpenRouter');
    });

    it('strips trailing slash from baseUrl', () => {
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-test-key',
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

    it('includes known OpenRouter models', async () => {
      const provider = validProvider();
      const models = await provider.listModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('openrouter/auto');
      expect(ids).toContain('anthropic/claude-sonnet-4');
      expect(ids).toContain('openai/gpt-4o');
    });
  });

  // -------------------------------------------------------------------------
  // supportsTools
  // -------------------------------------------------------------------------

  describe('supportsTools', () => {
    const provider = validProvider();

    it('returns true for known models with tool support', () => {
      expect(provider.supportsTools('openrouter/auto')).toBe(true);
      expect(provider.supportsTools('anthropic/claude-sonnet-4')).toBe(true);
      expect(provider.supportsTools('openai/gpt-4o')).toBe(true);
    });

    it('returns true for unknown models (default true)', () => {
      expect(provider.supportsTools('custom/model')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // countTokens
  // -------------------------------------------------------------------------

  describe('countTokens', () => {
    const provider = validProvider();

    it('estimates tokens from string messages', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello world' },
      ];
      const count = await provider.countTokens('openrouter/auto', messages);
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
      const count = await provider.countTokens('openrouter/auto', messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('sends correct headers including OpenRouter-specific ones', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-test-key-123',
        siteUrl: 'https://myapp.com',
        siteName: 'My App',
        maxRetries: 0,
      });
      await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/chat/completions');
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-or-test-key-123');
      expect(headers['HTTP-Referer']).toBe('https://myapp.com');
      expect(headers['X-Title']).toBe('My App');
    });

    it('maps response to CompletionResult', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
    });

    it('sends correct body shape', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = validProvider();
      await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body).toHaveProperty('model', 'openrouter/auto');
      expect(body).toHaveProperty('messages');
      expect(body.stream).toBe(false);
    });

    it('maps tool calls from response', async () => {
      const response = openRouterChatResponse({
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Let me search',
            tool_calls: [{
              id: 'tc_123',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: JSON.stringify({ query: 'weather' }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
      mockFetch(jsonResponse(response));
      const provider = validProvider();
      const result = await provider.complete('openrouter/auto', [
        { role: 'user', content: 'search' },
      ]);

      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls![0]!.name).toBe('web_search');
      expect(result.message.toolCalls![0]!.args).toEqual({ query: 'weather' });
    });

    it('sends tools when provided', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'openrouter/auto',
        [{ role: 'user', content: 'hi' }],
        {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
        },
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].function.name).toBe('search');
    });

    it('returns undefined cost for unknown models', async () => {
      mockFetch(jsonResponse(openRouterChatResponse({ model: 'custom/unknown-model' })));
      const provider = validProvider();
      const result = await provider.complete('custom/unknown-model', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.cost).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // ensureValidated
  // -------------------------------------------------------------------------

  describe('ensureValidated', () => {
    it('throws for invalid key format (not starting with sk-or-)', async () => {
      const provider = new OpenRouterProvider({
        apiKey: 'invalid-key-format',
        maxRetries: 0,
      });
      await expect(
        provider.complete('openrouter/auto', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow(ProviderError);
      await expect(
        provider.complete('openrouter/auto', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow('Invalid OpenRouter API key format');
    });

    it('passes for valid sk-or- key format', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-valid-key',
        maxRetries: 0,
      });
      const result = await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.message.role).toBe('assistant');
    });
  });

  // -------------------------------------------------------------------------
  // fetchWithRetry
  // -------------------------------------------------------------------------

  describe('fetchWithRetry', () => {
    it('does NOT retry on 401 (auth error)', async () => {
      mockFetch(jsonResponse({ error: { message: 'unauthorized' } }, 401));
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-test-key',
        maxRetries: 3,
      });
      await expect(
        provider.complete('openrouter/auto', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 403 (model access denied)', async () => {
      mockFetch(jsonResponse({ error: { message: 'access denied' } }, 403));
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-test-key',
        maxRetries: 3,
      });
      await expect(
        provider.complete('openrouter/auto', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('uses custom baseUrl', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = new OpenRouterProvider({
        apiKey: 'sk-or-test-key',
        baseUrl: 'https://proxy.example.com',
        maxRetries: 0,
      });
      await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('https://proxy.example.com');
    });

    it('maps finish reasons correctly', async () => {
      // stop => stop
      mockFetch(jsonResponse(openRouterChatResponse()));
      let provider = validProvider();
      let result = await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('stop');

      // length => max_tokens
      mockFetch(jsonResponse(openRouterChatResponse({
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'length',
        }],
      })));
      provider = validProvider();
      result = await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('max_tokens');
    });

    it('omits HTTP-Referer and X-Title when not configured', async () => {
      mockFetch(jsonResponse(openRouterChatResponse()));
      const provider = validProvider(); // no siteUrl or siteName
      await provider.complete('openrouter/auto', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['HTTP-Referer']).toBeUndefined();
      expect(headers['X-Title']).toBeUndefined();
    });
  });
});
