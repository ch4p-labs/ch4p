import { vi } from 'vitest';
import { OllamaProvider } from './ollama.js';
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ollamaChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: 'llama3.1',
    message: { role: 'assistant', content: 'Hello' },
    done: true,
    prompt_eval_count: 10,
    eval_count: 5,
    ...overrides,
  };
}

function ollamaTagsResponse() {
  return {
    models: [
      {
        name: 'llama3.1:latest',
        model: 'llama3.1',
        modified_at: '2024-01-01T00:00:00Z',
        size: 4_000_000_000,
        digest: 'abc123',
        details: {
          format: 'gguf',
          family: 'llama',
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
      {
        name: 'mistral:latest',
        model: 'mistral',
        modified_at: '2024-01-01T00:00:00Z',
        size: 4_000_000_000,
        digest: 'def456',
        details: {
          format: 'gguf',
          family: 'mistral',
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
      {
        name: 'llava:latest',
        model: 'llava',
        modified_at: '2024-01-01T00:00:00Z',
        size: 4_000_000_000,
        digest: 'ghi789',
        details: {
          format: 'gguf',
          family: 'llama',
          families: ['llama', 'clip'],
          parameter_size: '13B',
          quantization_level: 'Q4_0',
        },
      },
    ],
  };
}

function validProvider(overrides: Record<string, unknown> = {}) {
  return new OllamaProvider({
    baseUrl: 'http://localhost:11434',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('OllamaProvider', () => {
  describe('constructor', () => {
    it('creates without config (uses defaults)', () => {
      const provider = new OllamaProvider();
      expect(provider.id).toBe('ollama');
      expect(provider.name).toBe('Ollama');
    });

    it('accepts custom baseUrl', () => {
      const provider = new OllamaProvider({ baseUrl: 'http://remote:11434' });
      expect(provider).toBeDefined();
    });

    it('strips trailing slash from baseUrl', () => {
      const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434//' });
      expect(provider).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listModels
  // -------------------------------------------------------------------------

  describe('listModels', () => {
    it('fetches models from /api/tags and returns ModelInfo[]', async () => {
      mockFetch(jsonResponse(ollamaTagsResponse()));
      const provider = validProvider();
      const models = await provider.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models).toHaveLength(3);
      for (const model of models) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('contextWindow');
        expect(model).toHaveProperty('maxOutputTokens');
        expect(model).toHaveProperty('supportsTools');
        expect(model).toHaveProperty('supportsVision');
      }
    });

    it('calls the correct URL', async () => {
      mockFetch(jsonResponse(ollamaTagsResponse()));
      const provider = validProvider();
      await provider.listModels();

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:11434/api/tags');
    });

    it('marks tool-capable models correctly', async () => {
      mockFetch(jsonResponse(ollamaTagsResponse()));
      const provider = validProvider();
      const models = await provider.listModels();

      const llama = models.find((m) => m.id === 'llama3.1:latest');
      expect(llama?.supportsTools).toBe(true);

      const mistral = models.find((m) => m.id === 'mistral:latest');
      expect(mistral?.supportsTools).toBe(true);
    });

    it('marks vision-capable models correctly', async () => {
      mockFetch(jsonResponse(ollamaTagsResponse()));
      const provider = validProvider();
      const models = await provider.listModels();

      const llava = models.find((m) => m.id === 'llava:latest');
      expect(llava?.supportsVision).toBe(true);

      const llama = models.find((m) => m.id === 'llama3.1:latest');
      expect(llama?.supportsVision).toBe(false);
    });

    it('estimates context window from parameter size', async () => {
      mockFetch(jsonResponse(ollamaTagsResponse()));
      const provider = validProvider();
      const models = await provider.listModels();

      // 7B => 8192
      const llama = models.find((m) => m.id === 'llama3.1:latest');
      expect(llama?.contextWindow).toBe(8_192);

      // 13B => 32768
      const llava = models.find((m) => m.id === 'llava:latest');
      expect(llava?.contextWindow).toBe(32_768);
    });

    it('throws ProviderError when server is unreachable', async () => {
      mockFetch(() => {
        throw new TypeError('fetch failed');
      });
      const provider = validProvider();
      await expect(provider.listModels()).rejects.toThrow(ProviderError);
      await expect(provider.listModels()).rejects.toThrow('Cannot connect to Ollama');
    });

    it('throws ProviderError on non-ok status', async () => {
      mockFetch(jsonResponse({ error: 'not found' }, 404));
      const provider = validProvider();
      await expect(provider.listModels()).rejects.toThrow(ProviderError);
      await expect(provider.listModels()).rejects.toThrow('Failed to list models');
    });
  });

  // -------------------------------------------------------------------------
  // supportsTools
  // -------------------------------------------------------------------------

  describe('supportsTools', () => {
    const provider = validProvider();

    it('returns true for known tool-capable models', () => {
      expect(provider.supportsTools('llama3.1')).toBe(true);
      expect(provider.supportsTools('llama3.2')).toBe(true);
      expect(provider.supportsTools('mistral')).toBe(true);
      expect(provider.supportsTools('qwen2.5')).toBe(true);
      expect(provider.supportsTools('command-r')).toBe(true);
    });

    it('returns true for models with tag suffix', () => {
      expect(provider.supportsTools('llama3.1:latest')).toBe(true);
      expect(provider.supportsTools('mistral:7b-instruct')).toBe(true);
    });

    it('returns false for models without tool support', () => {
      expect(provider.supportsTools('phi3')).toBe(false);
      expect(provider.supportsTools('llama2')).toBe(false);
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
      const count = await provider.countTokens('llama3.1', messages);
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
      const count = await provider.countTokens('llama3.1', messages);
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
      const count = await provider.countTokens('llama3.1', messages);
      const nameLen = 'search'.length;
      const argsLen = JSON.stringify({ query: 'test' }).length;
      expect(count).toBe(Math.ceil((nameLen + argsLen) / 4));
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('sends request to /api/chat', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:11434/api/chat');
    });

    it('sends only Content-Type header (no auth)', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['x-api-key']).toBeUndefined();
    });

    it('sends correct body shape with stream: false', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body).toHaveProperty('model', 'llama3.1');
      expect(body).toHaveProperty('messages');
      expect(body.stream).toBe(false);
    });

    it('maps response to CompletionResult with message and usage', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('llama3.1', [
        { role: 'user', content: 'hi' },
      ]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
    });

    it('maps tool_calls in response to ToolCall[]', async () => {
      const responseData = ollamaChatResponse({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'web_search',
                arguments: { query: 'weather' },
              },
            },
          ],
        },
      });
      mockFetch(jsonResponse(responseData));
      const provider = validProvider();
      const result = await provider.complete('llama3.1', [
        { role: 'user', content: 'search for weather' },
      ]);

      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls![0]!.name).toBe('web_search');
      expect(result.message.toolCalls![0]!.args).toEqual({ query: 'weather' });
      expect(result.finishReason).toBe('tool_use');
    });

    it('maps done_reason "length" to max_tokens', async () => {
      mockFetch(jsonResponse(ollamaChatResponse({ done_reason: 'length' })));
      const provider = validProvider();
      const result = await provider.complete('llama3.1', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('max_tokens');
    });

    it('does not include cost (Ollama is local)', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      const result = await provider.complete('llama3.1', [
        { role: 'user', content: 'hi' },
      ]);
      // Ollama complete doesn't compute cost
      expect(result.cost).toBeUndefined();
    });

    it('handles missing usage fields gracefully', async () => {
      const responseData = ollamaChatResponse({
        prompt_eval_count: undefined,
        eval_count: undefined,
      });
      mockFetch(jsonResponse(responseData));
      const provider = validProvider();
      const result = await provider.complete('llama3.1', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ProviderError on non-ok response', async () => {
      mockFetch(jsonResponse({ error: 'model not found' }, 404));
      const provider = validProvider();
      await expect(
        provider.complete('nonexistent-model', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow(ProviderError);
      await expect(
        provider.complete('nonexistent-model', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Ollama API error');
    });

    it('throws ProviderError when server is unreachable', async () => {
      mockFetch(() => {
        throw new TypeError('fetch failed');
      });
      const provider = validProvider();
      await expect(
        provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow(ProviderError);
      await expect(
        provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('Cannot connect to Ollama');
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      // When signal is already aborted, fetch itself throws
      mockFetch(() => {
        throw new DOMException('The operation was aborted.', 'AbortError');
      });
      const provider = validProvider();
      await expect(
        provider.complete('llama3.1', [{ role: 'user', content: 'hi' }], {
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('sends system prompt via opts', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'llama3.1',
        [{ role: 'user', content: 'hi' }],
        { systemPrompt: 'Be concise' },
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('Be concise');
    });

    it('sends tools for tool-capable models', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'llama3.1',
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
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
    });

    it('does NOT send tools for non-tool-capable models', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'phi3',
        [{ role: 'user', content: 'hi' }],
        {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: { type: 'object' },
            },
          ],
        },
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.tools).toBeUndefined();
    });

    it('uses custom baseUrl for all endpoints', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = new OllamaProvider({ baseUrl: 'http://remote:8080' });
      await provider.complete('llama3.1', [{ role: 'user', content: 'hi' }]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('http://remote:8080/api/chat');
    });

    it('sends options when temperature and maxTokens are provided', async () => {
      mockFetch(jsonResponse(ollamaChatResponse()));
      const provider = validProvider();
      await provider.complete(
        'llama3.1',
        [{ role: 'user', content: 'hi' }],
        { temperature: 0.5, maxTokens: 1024 },
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.options).toBeDefined();
      expect(body.options.temperature).toBe(0.5);
      expect(body.options.num_predict).toBe(1024);
    });
  });
});
