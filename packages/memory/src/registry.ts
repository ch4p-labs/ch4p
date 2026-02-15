/**
 * Memory backend registry / factory.
 *
 * Creates the appropriate memory backend from configuration.
 * Supports: sqlite (default), markdown (fallback), noop (disabled).
 */

import type { IMemoryBackend } from '@ch4p/core';
import { MemoryError } from '@ch4p/core';
import { SQLiteMemoryBackend } from './sqlite-backend.js';
import { MarkdownMemoryBackend } from './markdown-backend.js';
import { NoopMemoryBackend } from './noop-backend.js';
import {
  OpenAIEmbeddingProvider,
  NoopEmbeddingProvider,
} from './embedding-provider.js';
import type { IEmbeddingProvider } from './embedding-provider.js';

export interface MemoryConfig {
  /** Backend type: 'sqlite' | 'markdown' | 'noop' (default: 'sqlite') */
  backend?: string;
  /** Path for SQLite database or markdown directory */
  path?: string;
  /** Embedding provider: 'openai' | 'noop' | undefined */
  embeddingProvider?: string;
  /** OpenAI API key (for openai embedding provider) */
  openaiApiKey?: string;
  /** OpenAI embedding model (default: text-embedding-3-small) */
  embeddingModel?: string;
  /** Embedding dimensions (default: 1536) */
  embeddingDimensions?: number;
  /** OpenAI base URL override */
  openaiBaseUrl?: string;
  /** Maximum embedding cache entries (default: 10,000) */
  maxCacheEntries?: number;
  /** Default vector weight for hybrid search (default: 0.7) */
  vectorWeight?: number;
  /** Default keyword weight for hybrid search (default: 0.3) */
  keywordWeight?: number;
}

/**
 * Create a memory backend from configuration.
 *
 * @param config - Memory configuration
 * @returns Configured memory backend
 */
export function createMemoryBackend(config: MemoryConfig = {}): IMemoryBackend {
  const backendType = config.backend ?? 'sqlite';

  switch (backendType) {
    case 'sqlite':
      return createSQLiteBackend(config);

    case 'markdown':
      return createMarkdownBackend(config);

    case 'noop':
    case 'none':
    case 'disabled':
      return new NoopMemoryBackend();

    default:
      throw new MemoryError(`Unknown memory backend: ${backendType}`, {
        backend: backendType,
        available: ['sqlite', 'markdown', 'noop'],
      });
  }
}

/**
 * Create the embedding provider from configuration.
 */
export function createEmbeddingProvider(config: MemoryConfig = {}): IEmbeddingProvider {
  const provider = config.embeddingProvider;

  if (!provider || provider === 'noop') {
    return new NoopEmbeddingProvider(config.embeddingDimensions);
  }

  if (provider === 'openai') {
    const apiKey = config.openaiApiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      console.warn(
        '[memory] No OpenAI API key found. Falling back to noop embedding provider. ' +
        'Set OPENAI_API_KEY or pass openaiApiKey in config.',
      );
      return new NoopEmbeddingProvider(config.embeddingDimensions);
    }

    return new OpenAIEmbeddingProvider({
      apiKey,
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
      baseUrl: config.openaiBaseUrl,
    });
  }

  throw new MemoryError(`Unknown embedding provider: ${provider}`, {
    provider,
    available: ['openai', 'noop'],
  });
}

// ---------------------------------------------------------------------------
// Backend constructors
// ---------------------------------------------------------------------------

function createSQLiteBackend(config: MemoryConfig): SQLiteMemoryBackend {
  const dbPath = config.path ?? defaultSQLitePath();
  const embeddingProvider = config.embeddingProvider
    ? createEmbeddingProvider(config)
    : undefined;

  return new SQLiteMemoryBackend({
    dbPath,
    embeddingProvider,
    maxCacheEntries: config.maxCacheEntries,
  });
}

function createMarkdownBackend(config: MemoryConfig): MarkdownMemoryBackend {
  const dirPath = config.path ?? defaultMarkdownPath();
  return new MarkdownMemoryBackend({ dirPath });
}

/**
 * Default SQLite database path.
 * Uses XDG data directory convention.
 */
function defaultSQLitePath(): string {
  const dataDir = process.env['XDG_DATA_HOME']
    ?? (process.env['HOME']
      ? `${process.env['HOME']}/.local/share`
      : '/tmp');
  return `${dataDir}/ch4p/memory.db`;
}

/**
 * Default markdown directory path.
 */
function defaultMarkdownPath(): string {
  const dataDir = process.env['XDG_DATA_HOME']
    ?? (process.env['HOME']
      ? `${process.env['HOME']}/.local/share`
      : '/tmp');
  return `${dataDir}/ch4p/memories`;
}
