/**
 * IMemoryBackend — persistent memory contract
 *
 * Zero-dependency hybrid search: SQLite FTS5 for keywords + vector embeddings
 * for semantic search, merged with configurable weights. From ZeroClaw's design.
 */

export interface RecallOpts {
  limit?: number;
  vectorWeight?: number;   // 0-1, weight for semantic search (default 0.7)
  keywordWeight?: number;  // 0-1, weight for keyword search (default 0.3)
  minScore?: number;
  filter?: Record<string, unknown>;
  /** SQL key prefix filter — only return entries whose key starts with this string. */
  keyPrefix?: string;
}

export interface MemoryResult {
  key: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
  matchType: 'keyword' | 'vector' | 'hybrid';
}

export interface MemoryEntry {
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMemoryBackend {
  readonly id: string;

  store(key: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  recall(query: string, opts?: RecallOpts): Promise<MemoryResult[]>;
  forget(key: string): Promise<boolean>;
  list(prefix?: string): Promise<MemoryEntry[]>;
  reindex(): Promise<void>;
  close(): Promise<void>;
}
