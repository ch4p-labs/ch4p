import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OllamaEmbeddingProvider,
  ChainEmbeddingProvider,
  NoopEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from './embedding-provider.js';
import { createEmbeddingProvider } from './registry.js';

// ---------------------------------------------------------------------------
// OllamaEmbeddingProvider
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path — returns embeddings from /api/embed', async () => {
    const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: mockEmbeddings }),
    }));

    const provider = new OllamaEmbeddingProvider();
    const result = await provider.embed(['hello', 'world']);

    expect(result).toEqual(mockEmbeddings);
    expect(provider.id).toBe('ollama');
    expect(provider.dimensions).toBe(768);

    const [calledUrl, calledOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:11434/api/embed');
    expect(JSON.parse(calledOpts.body as string)).toMatchObject({
      model: 'nomic-embed-text',
      input: ['hello', 'world'],
    });
  });

  it('non-2xx response — throws with status in message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const provider = new OllamaEmbeddingProvider();
    await expect(provider.embed(['test'])).rejects.toThrow('Ollama embedding error: 503');
  });

  it('returns empty array for empty input without calling fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OllamaEmbeddingProvider();
    const result = await provider.embed([]);

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('respects custom baseUrl and model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [[1, 2]] }),
    }));

    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://192.0.2.5:11434/',
      model: 'mxbai-embed-large',
      dimensions: 1024,
    });
    await provider.embed(['test']);

    const [calledUrl, calledOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    // trailing slash stripped
    expect(calledUrl).toBe('http://192.0.2.5:11434/api/embed');
    expect(JSON.parse(calledOpts.body as string)).toMatchObject({ model: 'mxbai-embed-large' });
    expect(provider.dimensions).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// ChainEmbeddingProvider
// ---------------------------------------------------------------------------

describe('ChainEmbeddingProvider', () => {
  it('uses first provider when it succeeds', async () => {
    const p1 = new NoopEmbeddingProvider(4);
    const p2 = new NoopEmbeddingProvider(4);
    const spy1 = vi.spyOn(p1, 'embed').mockResolvedValueOnce([[1, 1, 1, 1]]);
    const spy2 = vi.spyOn(p2, 'embed');

    const chain = new ChainEmbeddingProvider([p1, p2]);
    const result = await chain.embed(['text']);

    expect(result).toEqual([[1, 1, 1, 1]]);
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).not.toHaveBeenCalled();
  });

  it('falls back to second provider when first throws', async () => {
    const p1 = new NoopEmbeddingProvider(4);
    const p2 = new NoopEmbeddingProvider(4);
    vi.spyOn(p1, 'embed').mockRejectedValueOnce(new Error('p1 down'));
    const spy2 = vi.spyOn(p2, 'embed').mockResolvedValueOnce([[2, 2, 2, 2]]);

    const chain = new ChainEmbeddingProvider([p1, p2]);
    const result = await chain.embed(['text']);

    expect(result).toEqual([[2, 2, 2, 2]]);
    expect(spy2).toHaveBeenCalledOnce();
  });

  it('falls back to third (noop) when first two fail', async () => {
    const p1 = new NoopEmbeddingProvider(4);
    const p2 = new NoopEmbeddingProvider(4);
    const p3 = new NoopEmbeddingProvider(4);
    vi.spyOn(p1, 'embed').mockRejectedValueOnce(new Error('p1 down'));
    vi.spyOn(p2, 'embed').mockRejectedValueOnce(new Error('p2 down'));
    const spy3 = vi.spyOn(p3, 'embed').mockResolvedValueOnce([[0, 0, 0, 0]]);

    const chain = new ChainEmbeddingProvider([p1, p2, p3]);
    const result = await chain.embed(['text']);

    expect(result).toEqual([[0, 0, 0, 0]]);
    expect(spy3).toHaveBeenCalledOnce();
  });

  it('throws last error when all providers fail', async () => {
    const p1 = new NoopEmbeddingProvider(4);
    vi.spyOn(p1, 'embed').mockRejectedValueOnce(new Error('only provider failed'));

    const chain = new ChainEmbeddingProvider([p1]);
    await expect(chain.embed(['text'])).rejects.toThrow('only provider failed');
  });

  it('id string encodes all provider ids', () => {
    const openai = new OpenAIEmbeddingProvider({ apiKey: 'sk-test', dimensions: 768 });
    const ollama = new OllamaEmbeddingProvider();
    const noop = new NoopEmbeddingProvider(768);

    const chain = new ChainEmbeddingProvider([openai, ollama, noop]);
    expect(chain.id).toBe('chain:openai|ollama|noop');
  });

  it('dimensions come from first provider', () => {
    const p1 = new NoopEmbeddingProvider(512);
    const p2 = new NoopEmbeddingProvider(1024);
    const chain = new ChainEmbeddingProvider([p1, p2]);
    expect(chain.dimensions).toBe(512);
  });

  it('throws when constructed with empty array', () => {
    expect(() => new ChainEmbeddingProvider([])).toThrow(
      'ChainEmbeddingProvider requires at least one provider',
    );
  });
});

// ---------------------------------------------------------------------------
// createEmbeddingProvider — chain factory
// ---------------------------------------------------------------------------

describe('createEmbeddingProvider — embeddingProviders chain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['OPENAI_API_KEY'];
  });

  it('embeddingProviders: [openai, ollama] with key → returns ChainEmbeddingProvider', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
    const provider = createEmbeddingProvider({
      embeddingProviders: ['openai', 'ollama'],
      embeddingDimensions: 768,
    });
    expect(provider).toBeInstanceOf(ChainEmbeddingProvider);
    // chain: openai|ollama|noop  (noop always appended as final fallback)
    expect(provider.id).toMatch(/^chain:openai\|ollama/);
    expect(provider.dimensions).toBe(768);
  });

  it('embeddingProviders: [openai, ollama] without key → skips openai, chain is ollama+noop', () => {
    // No OPENAI_API_KEY set
    const provider = createEmbeddingProvider({
      embeddingProviders: ['openai', 'ollama'],
      embeddingDimensions: 768,
    });
    // openai skipped → only ollama+noop remain → chain
    expect(provider).toBeInstanceOf(ChainEmbeddingProvider);
    expect(provider.id).toBe('chain:ollama|noop');
  });

  it('single provider resolves without wrapping in chain', () => {
    const provider = createEmbeddingProvider({ embeddingProviders: ['noop'], embeddingDimensions: 768 });
    expect(provider).toBeInstanceOf(NoopEmbeddingProvider);
    expect(provider.id).toBe('noop');
  });

  it('unknown provider name throws', () => {
    expect(() =>
      createEmbeddingProvider({ embeddingProviders: ['banana'] }),
    ).toThrow('Unknown embedding provider "banana"');
  });
});
