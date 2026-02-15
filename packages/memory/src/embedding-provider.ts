/**
 * Embedding provider interface + implementations.
 *
 * Defines the contract for computing vector embeddings from text,
 * plus two concrete implementations: OpenAI (via fetch) and Noop (fallback).
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
