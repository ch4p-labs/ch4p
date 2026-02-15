import { vi } from 'vitest';
import { GoogleProvider } from './google.js';
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

function geminiChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: 'Hello' }],
          role: 'model',
        },
        finishReason: 'STOP',
        ...(overrides.candidate ?? {}),
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
      ...(overrides.usageMetadata ?? {}),
    },
    ...overrides,
  };
}

function validProvider(overrides: Record<string, unknown> = {}) {
  return new GoogleProvider({
    apiKey: 'AIzaTestKey123',
    maxRetries: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('GoogleProvider', () => {
  describe('constructor', () => {
    it('throws ProviderError when apiKey is empty', () => {
      expect(() => new GoogleProvider({ apiKey: '' })).toThrow(ProviderError);
      expect(() => new GoogleProvider({ apiKey: '' })).toThrow('API key is required');
    });

    it('accepts valid config', () => {
      const provider = new GoogleProvider({ apiKey: 'AIzaTestKey123' });
      expect(provider.id).toBe('google');
      expect(provider.name).toBe('Google AI');
    });

    it('strips trailing slash from baseUrl', () => {
      const provider = new GoogleProvider({
        apiKey: 'AIzaTestKey123',
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

    it('includes known Gemini models', async () => {
      const provider = validProvider();
      const models = await provider.listModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('gemini-2.0-flash');
      expect(ids).toContain('gemini-1.5-pro');
      expect(ids).toContain('gemini-1.5-flash');
    });
  });

  // -------------------------------------------------------------------------
  // supportsTools
  // -------------------------------------------------------------------------

  describe('supportsTools', () => {
    const provider = validProvider();

    it('returns true for known Gemini models', () => {
      expect(provider.supportsTools('gemini-2.0-flash')).toBe(true);
      expect(provider.supportsTools('gemini-1.5-pro')).toBe(true);
    });

    it('returns true for gemini- prefix fallback', () => {
      expect(provider.supportsTools('gemini-3.0-ultra')).toBe(true);
    });

    it('returns false for non-gemini models', () => {
      expect(provider.supportsTools('gpt-4')).toBe(false);
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
        { role: 'user', content: 'Hello world' },
      ];
      const count = await provider.countTokens('gemini-2.0-flash', messages);
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
      const count = await provider.countTokens('gemini-2.0-flash', messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('sends request to correct Gemini endpoint', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = validProvider();
      await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('models/gemini-2.0-flash:generateContent');
      expect(url).toContain('key=AIzaTestKey123');
    });

    it('maps response to CompletionResult', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'hi' },
      ]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
    });

    it('maps tool calls from function call parts', async () => {
      const response = geminiChatResponse({
        candidates: [{
          content: {
            parts: [
              { text: 'Let me search' },
              {
                functionCall: {
                  name: 'web_search',
                  args: { query: 'weather' },
                },
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      });
      mockFetch(jsonResponse(response));
      const provider = validProvider();
      const result = await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'search for weather' },
      ]);

      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls![0]!.name).toBe('web_search');
      expect(result.message.toolCalls![0]!.args).toEqual({ query: 'weather' });
    });

    it('extracts system messages to systemInstruction', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = validProvider();
      await provider.complete('gemini-2.0-flash', [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body.systemInstruction).toBeDefined();
      // Messages should NOT contain system role — it's in systemInstruction
      const roles = body.contents.map((m: { role: string }) => m.role);
      expect(roles).not.toContain('system');
    });

    it('returns undefined cost for unknown models', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('unknown-model', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.cost).toBeUndefined();
    });

    it('sends tools when provided', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'gemini-2.0-flash',
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
      expect(body.tools).toBeDefined();
      expect(body.tools[0].functionDeclarations).toHaveLength(1);
      expect(body.tools[0].functionDeclarations[0].name).toBe('search');
    });
  });

  // -------------------------------------------------------------------------
  // ensureValidated
  // -------------------------------------------------------------------------

  describe('ensureValidated', () => {
    it('throws for invalid key format (not starting with AIza)', async () => {
      const provider = new GoogleProvider({
        apiKey: 'invalid-key-format',
        maxRetries: 0,
      });
      await expect(
        provider.complete('gemini-2.0-flash', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow(ProviderError);
      await expect(
        provider.complete('gemini-2.0-flash', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow('Invalid Google AI API key format');
    });

    it('passes for valid AIza key format', async () => {
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = new GoogleProvider({
        apiKey: 'AIzaValidKey123',
        maxRetries: 0,
      });
      const result = await provider.complete('gemini-2.0-flash', [
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
      const provider = new GoogleProvider({
        apiKey: 'AIzaTestKey123',
        maxRetries: 3,
      });
      await expect(
        provider.complete('gemini-2.0-flash', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      mockFetch(jsonResponse({ error: { message: 'bad request' } }, 400));
      const provider = new GoogleProvider({
        apiKey: 'AIzaTestKey123',
        maxRetries: 3,
      });
      await expect(
        provider.complete('gemini-2.0-flash', [
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
      mockFetch(jsonResponse(geminiChatResponse()));
      const provider = new GoogleProvider({
        apiKey: 'AIzaTestKey123',
        baseUrl: 'https://proxy.example.com',
        maxRetries: 0,
      });
      await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('https://proxy.example.com');
    });

    it('maps Gemini finish reasons correctly', async () => {
      // STOP => stop
      mockFetch(jsonResponse(geminiChatResponse({
        candidates: [{
          content: { parts: [{ text: 'ok' }], role: 'model' },
          finishReason: 'STOP',
        }],
      })));
      let provider = validProvider();
      let result = await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('stop');

      // MAX_TOKENS => max_tokens
      mockFetch(jsonResponse(geminiChatResponse({
        candidates: [{
          content: { parts: [{ text: 'ok' }], role: 'model' },
          finishReason: 'MAX_TOKENS',
        }],
      })));
      provider = validProvider();
      result = await provider.complete('gemini-2.0-flash', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('max_tokens');
    });
  });
});
