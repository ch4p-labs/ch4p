/**
 * @ch4p/memory — zero-dependency hybrid search using SQLite.
 *
 * Combines FTS5 (BM25 keyword search) with vector embeddings (cosine similarity)
 * in a single SQLite database. Informed by research on hybrid search architectures.
 */

// Backends
export { SQLiteMemoryBackend } from './sqlite-backend.js';
export type { SQLiteBackendOpts } from './sqlite-backend.js';
export { MarkdownMemoryBackend } from './markdown-backend.js';
export type { MarkdownBackendOpts } from './markdown-backend.js';
export { NoopMemoryBackend } from './noop-backend.js';

// Search modules
export { FTSSearch } from './fts.js';
export type { FTSResult } from './fts.js';
export { VectorSearch, cosineSimilarity, embeddingToBlob, blobToEmbedding } from './vector.js';
export type { VectorResult } from './vector.js';

// Hybrid merge
export { hybridMerge } from './hybrid-merge.js';
export type { ScoredResult, HybridMergeOpts } from './hybrid-merge.js';

// Chunking
export { chunkMarkdown } from './chunker.js';
export type { ChunkResult, ChunkOpts } from './chunker.js';

// Embedding
export { EmbeddingCache } from './embedding-cache.js';
export type { EmbeddingCacheOpts } from './embedding-cache.js';
export {
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  ChainEmbeddingProvider,
  NoopEmbeddingProvider,
} from './embedding-provider.js';
export type {
  IEmbeddingProvider,
  OpenAIEmbeddingOpts,
  OllamaEmbeddingOpts,
} from './embedding-provider.js';

// Registry / factory
export { createMemoryBackend, createEmbeddingProvider } from './registry.js';
export type { MemoryConfig } from './registry.js';
