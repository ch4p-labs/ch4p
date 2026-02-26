/**
 * Embedding provider interface + implementations.
 *
 * Defines the contract for computing vector embeddings from text,
 * plus concrete implementations: OpenAI (via fetch), Ollama (local),
 * Chain (multi-provider fallback), and Noop (fallback).
 */

export interface IEmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// OpenAI text-embedding-3-small via native fetch
// ---------------------------------------------------------------------------

export interface OpenAIEmbeddingOpts {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  maxBatchSize?: number;
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'openai';
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxBatchSize: number;

  constructor(opts: OpenAIEmbeddingOpts) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'text-embedding-3-small';
    this.dimensions = opts.dimensions ?? 1536;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.maxBatchSize = opts.maxBatchSize ?? 100;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];

    // Batch requests to stay within API limits
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const batchResults = await this.embedBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown error');
      throw new Error(
        `OpenAI embedding request failed (${response.status}): ${body}`,
      );
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to preserve input order
    const sorted = json.data.sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }
}

// ---------------------------------------------------------------------------
// Ollama embedding provider — uses the /api/embed batch endpoint
// ---------------------------------------------------------------------------

export interface OllamaEmbeddingOpts {
  /** Embedding model to use. Default: 'nomic-embed-text' (768-dim). */
  model?: string;
  /** Ollama server base URL. Default: 'http://localhost:11434'. */
  baseUrl?: string;
  /** Expected output dimensions. Default: 768 (native for nomic-embed-text). */
  dimensions?: number;
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'ollama';
  readonly dimensions: number;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: OllamaEmbeddingOpts = {}) {
    this.model = opts.model ?? 'nomic-embed-text';
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.dimensions = opts.dimensions ?? 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as { embeddings: number[][] };
    return json.embeddings;
  }
}

// ---------------------------------------------------------------------------
// Chain provider — tries providers in order, falls back on any error
// ---------------------------------------------------------------------------

export class ChainEmbeddingProvider implements IEmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;

  constructor(private readonly providers: IEmbeddingProvider[]) {
    if (providers.length === 0) {
      throw new Error('ChainEmbeddingProvider requires at least one provider');
    }
    this.id = `chain:${providers.map((p) => p.id).join('|')}`;
    // Canonical dimension comes from the first (highest-priority) provider
    this.dimensions = providers[0]!.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.embed(texts);
      } catch (err) {
        console.warn(
          `[memory] Embedding provider "${provider.id}" failed, trying next: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
        lastError = err;
      }
    }
    throw lastError ?? new Error('All embedding providers failed');
  }
}

// ---------------------------------------------------------------------------
// Noop provider — returns zero vectors, used when no API key is available
// ---------------------------------------------------------------------------

export class NoopEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'noop';
  readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array<number>(this.dimensions).fill(0));
  }
}
