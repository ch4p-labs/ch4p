import { vi } from 'vitest';
import { BedrockProvider } from './bedrock.js';
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

function bedrockConverseResponse(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      message: {
        role: 'assistant',
        content: [{ text: 'Hello' }],
      },
    },
    stopReason: 'end_turn',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
    ...overrides,
  };
}

function validProvider(overrides: Record<string, unknown> = {}) {
  return new BedrockProvider({
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    maxRetries: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('BedrockProvider', () => {
  describe('constructor', () => {
    it('throws ProviderError when region is empty', () => {
      expect(() => new BedrockProvider({
        region: '',
        accessKeyId: 'AKID',
        secretAccessKey: 'secret',
      })).toThrow(ProviderError);
      expect(() => new BedrockProvider({
        region: '',
        accessKeyId: 'AKID',
        secretAccessKey: 'secret',
      })).toThrow('region is required');
    });

    it('throws ProviderError when accessKeyId is empty', () => {
      expect(() => new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: '',
        secretAccessKey: 'secret',
      })).toThrow(ProviderError);
      expect(() => new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: '',
        secretAccessKey: 'secret',
      })).toThrow('access key ID is required');
    });

    it('throws ProviderError when secretAccessKey is empty', () => {
      expect(() => new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: 'AKID',
        secretAccessKey: '',
      })).toThrow(ProviderError);
      expect(() => new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: 'AKID',
        secretAccessKey: '',
      })).toThrow('secret access key is required');
    });

    it('accepts valid config', () => {
      const provider = validProvider();
      expect(provider.id).toBe('bedrock');
      expect(provider.name).toBe('AWS Bedrock');
    });

    it('constructs baseUrl from region', () => {
      const provider = validProvider();
      expect(provider).toBeDefined();
      // Verify by calling complete and checking URL
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

    it('includes known Bedrock models', async () => {
      const provider = validProvider();
      const models = await provider.listModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('anthropic.claude-sonnet-4-20250514-v1:0');
      expect(ids).toContain('amazon.nova-pro-v1:0');
    });
  });

  // -------------------------------------------------------------------------
  // supportsTools
  // -------------------------------------------------------------------------

  describe('supportsTools', () => {
    const provider = validProvider();

    it('returns true for known models with tool support', () => {
      expect(provider.supportsTools('anthropic.claude-sonnet-4-20250514-v1:0')).toBe(true);
      expect(provider.supportsTools('amazon.nova-pro-v1:0')).toBe(true);
    });

    it('returns false for unknown models', () => {
      expect(provider.supportsTools('anthropic.claude-unknown-v1:0')).toBe(false);
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
      const count = await provider.countTokens('anthropic.claude-sonnet-4-20250514-v1:0', messages);
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
      const count = await provider.countTokens('anthropic.claude-sonnet-4-20250514-v1:0', messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe('complete', () => {
    it('sends request to correct Bedrock Converse endpoint', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('bedrock-runtime.us-east-1.amazonaws.com');
      expect(url).toContain('/model/');
      expect(url).toContain('/converse');
    });

    it('includes AWS Signature V4 Authorization header', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toContain('AWS4-HMAC-SHA256');
      expect(headers['Authorization']).toContain('Credential=');
      expect(headers['x-amz-date']).toBeDefined();
    });

    it('includes x-amz-security-token when sessionToken provided', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'FwoGZXIvYXdzEBYaDH...',
        maxRetries: 0,
      });
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['x-amz-security-token']).toBe('FwoGZXIvYXdzEBYaDH...');
    });

    it('maps response to CompletionResult', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      const result = await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
    });

    it('maps tool calls from toolUse blocks', async () => {
      const response = bedrockConverseResponse({
        output: {
          message: {
            role: 'assistant',
            content: [
              { text: 'Let me search' },
              {
                toolUse: {
                  toolUseId: 'tool_123',
                  name: 'web_search',
                  input: { query: 'weather' },
                },
              },
            ],
          },
        },
        stopReason: 'tool_use',
      });
      mockFetch(jsonResponse(response));
      const provider = validProvider();
      const result = await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'search for weather' },
      ]);

      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls![0]!.name).toBe('web_search');
      expect(result.message.toolCalls![0]!.args).toEqual({ query: 'weather' });
    });

    it('extracts system messages to top-level system field', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body.system).toBeDefined();
      expect(body.system[0].text).toBe('You are helpful');
      // Messages should NOT contain system role
      const roles = body.messages.map((m: { role: string }) => m.role);
      expect(roles).not.toContain('system');
    });

    it('returns undefined cost for unknown models', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      const result = await provider.complete('unknown-model', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.cost).toBeUndefined();
    });

    it('sends tools when provided', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = validProvider();
      await provider.complete(
        'anthropic.claude-sonnet-4-20250514-v1:0',
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
      expect(body.toolConfig).toBeDefined();
      expect(body.toolConfig.tools).toHaveLength(1);
      expect(body.toolConfig.tools[0].toolSpec.name).toBe('search');
    });
  });

  // -------------------------------------------------------------------------
  // fetchWithRetry
  // -------------------------------------------------------------------------

  describe('fetchWithRetry', () => {
    it('does NOT retry on 401 (auth error)', async () => {
      mockFetch(jsonResponse({ message: 'unauthorized' }, 401));
      const provider = new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: 'AKID',
        secretAccessKey: 'secret',
        maxRetries: 3,
      });
      await expect(
        provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
          { role: 'user', content: 'hi' },
        ]),
      ).rejects.toThrow();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      mockFetch(jsonResponse({ message: 'bad request' }, 400));
      const provider = new BedrockProvider({
        region: 'us-east-1',
        accessKeyId: 'AKID',
        secretAccessKey: 'secret',
        maxRetries: 3,
      });
      await expect(
        provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
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
    it('uses custom baseUrl when provided', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = new BedrockProvider({
        region: 'us-west-2',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        baseUrl: 'https://proxy.example.com',
        maxRetries: 0,
      });
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('https://proxy.example.com');
    });

    it('maps Bedrock stop reasons correctly', async () => {
      // end_turn => stop
      mockFetch(jsonResponse(bedrockConverseResponse({ stopReason: 'end_turn' })));
      let provider = validProvider();
      let result = await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('stop');

      // max_tokens => max_tokens
      mockFetch(jsonResponse(bedrockConverseResponse({ stopReason: 'max_tokens' })));
      provider = validProvider();
      result = await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('max_tokens');

      // tool_use => tool_use
      mockFetch(jsonResponse(bedrockConverseResponse({ stopReason: 'tool_use' })));
      provider = validProvider();
      result = await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);
      expect(result.finishReason).toBe('tool_use');
    });

    it('constructs URL from region by default', async () => {
      mockFetch(jsonResponse(bedrockConverseResponse()));
      const provider = new BedrockProvider({
        region: 'eu-west-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        maxRetries: 0,
      });
      await provider.complete('anthropic.claude-sonnet-4-20250514-v1:0', [
        { role: 'user', content: 'hi' },
      ]);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('bedrock-runtime.eu-west-1.amazonaws.com');
    });
  });
});
