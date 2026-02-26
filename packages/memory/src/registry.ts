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
  OllamaEmbeddingProvider,
  ChainEmbeddingProvider,
  NoopEmbeddingProvider,
} from './embedding-provider.js';
import type { IEmbeddingProvider } from './embedding-provider.js';

export interface MemoryConfig {
  /** Backend type: 'sqlite' | 'markdown' | 'noop' (default: 'sqlite') */
  backend?: string;
  /** Path for SQLite database or markdown directory */
  path?: string;
  /** Single embedding provider: 'openai' | 'ollama' | 'noop' | undefined */
  embeddingProvider?: string;
  /**
   * Ordered list of embedding providers to try in sequence.
   * Takes precedence over `embeddingProvider` when set.
   * Example: ['openai', 'ollama'] — tries OpenAI first, falls back to Ollama,
   * then noop (always appended as final fallback).
   */
  embeddingProviders?: string[];
  /** OpenAI API key (for openai embedding provider) */
  openaiApiKey?: string;
  /** OpenAI embedding model (default: text-embedding-3-small) */
  embeddingModel?: string;
  /** Embedding dimensions (default: 768) */
  embeddingDimensions?: number;
  /** OpenAI base URL override */
  openaiBaseUrl?: string;
  /** Ollama server base URL (default: http://localhost:11434) */
  ollamaBaseUrl?: string;
  /** Ollama embedding model (default: nomic-embed-text) */
  ollamaEmbeddingModel?: string;
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
 *
 * When `embeddingProviders` is set, builds a ChainEmbeddingProvider that tries
 * each provider in order and falls back on error. A NoopEmbeddingProvider is
 * always appended as the final fallback if not already present.
 *
 * When only `embeddingProvider` (singular) is set, wraps it in a chain with
 * noop for backward compatibility.
 */
export function createEmbeddingProvider(config: MemoryConfig = {}): IEmbeddingProvider {
  const dims = config.embeddingDimensions ?? 768;

  // Resolve the ordered provider list.
  // `embeddingProviders` (plural) takes precedence; fall back to singular form.
  const providerNames: string[] = config.embeddingProviders
    ?? (config.embeddingProvider && config.embeddingProvider !== 'noop'
      ? [config.embeddingProvider, 'noop']
      : ['noop']);

  const built: IEmbeddingProvider[] = [];

  for (const name of providerNames) {
    if (name === 'noop') {
      built.push(new NoopEmbeddingProvider(dims));
    } else if (name === 'openai') {
      const apiKey = config.openaiApiKey ?? process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        console.warn('[memory] OpenAI embedding: no API key found, skipping provider');
        continue;
      }
      built.push(new OpenAIEmbeddingProvider({
        apiKey,
        model: config.embeddingModel ?? 'text-embedding-3-small',
        dimensions: dims,
        baseUrl: config.openaiBaseUrl,
      }));
    } else if (name === 'ollama') {
      built.push(new OllamaEmbeddingProvider({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaEmbeddingModel,
        dimensions: dims,
      }));
    } else {
      throw new MemoryError(`Unknown embedding provider "${name}". Options: openai, ollama, noop`, {
        provider: name,
        available: ['openai', 'ollama', 'noop'],
      });
    }
  }

  // Always ensure noop is the final fallback so embed() never fully fails.
  if (!built.some((p) => p.id === 'noop')) {
    built.push(new NoopEmbeddingProvider(dims));
  }

  if (built.length === 1) return built[0]!; // no chain needed
  return new ChainEmbeddingProvider(built);
}

// ---------------------------------------------------------------------------
// Backend constructors
// ---------------------------------------------------------------------------

function createSQLiteBackend(config: MemoryConfig): SQLiteMemoryBackend {
  const dbPath = config.path ?? defaultSQLitePath();
  const embeddingProvider = (config.embeddingProvider || config.embeddingProviders?.length)
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
