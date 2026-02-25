/**
 * SQLite hybrid search memory backend.
 *
 * Combines FTS5 (BM25 keyword search) with vector embeddings (cosine similarity)
 * in a single SQLite database. Zero external dependencies beyond better-sqlite3.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { generateId, MemoryError } from '@ch4p/core';
import type { IMemoryBackend, RecallOpts, MemoryResult, MemoryEntry } from '@ch4p/core';
import type { IEmbeddingProvider } from './embedding-provider.js';
import { FTSSearch } from './fts.js';
import { VectorSearch, embeddingToBlob } from './vector.js';
import { hybridMerge } from './hybrid-merge.js';
import { EmbeddingCache } from './embedding-cache.js';

export interface SQLiteBackendOpts {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Optional embedding provider for vector search */
  embeddingProvider?: IEmbeddingProvider;
  /** Maximum embedding cache entries (default: 10,000) */
  maxCacheEntries?: number;
}

export class SQLiteMemoryBackend implements IMemoryBackend {
  readonly id = 'sqlite';

  private db: Database.Database;
  private readonly embeddingProvider: IEmbeddingProvider | undefined;
  private readonly fts: FTSSearch;
  private readonly vector: VectorSearch;
  private readonly cache: EmbeddingCache;
  private closed = false;

  constructor(opts: SQLiteBackendOpts) {
    // Ensure parent directory exists
    const dir = dirname(opts.dbPath);
    mkdirSync(dir, { recursive: true });

    this.db = new Database(opts.dbPath);
    this.embeddingProvider = opts.embeddingProvider;

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Initialize schema
    this.initSchema();

    // Initialize search modules
    this.fts = new FTSSearch(this.db);
    this.vector = new VectorSearch(this.db);
    this.cache = new EmbeddingCache(this.db, {
      maxEntries: opts.maxCacheEntries,
    });
  }

  /**
   * Store a memory, computing embeddings if a provider is available.
   * Upserts on key conflict.
   */
  async store(
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.assertOpen();

    const now = new Date().toISOString();
    const id = generateId();
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    // Compute embedding if provider is available
    let embeddingBlob: Buffer | null = null;
    if (this.embeddingProvider) {
      try {
        const embedding = await this.getOrComputeEmbedding(content);
        if (embedding) {
          embeddingBlob = embeddingToBlob(embedding);
        }
      } catch (err) {
        // Log but don't fail -- memory is still stored without embedding
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[memory] Failed to compute embedding for "${key}": ${message}`);
      }
    }

    // Upsert using INSERT OR REPLACE
    // We need to handle the FTS triggers correctly -- REPLACE triggers
    // DELETE then INSERT, so triggers will fire properly.
    this.db.prepare(`
      INSERT INTO memories (id, key, content, metadata, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        embedding = excluded.embedding,
        updated_at = excluded.updated_at
    `).run(id, key, content, metaJson, embeddingBlob, now, now);
  }

  /**
   * Recall memories using hybrid search (FTS5 + vector).
   */
  async recall(query: string, opts: RecallOpts = {}): Promise<MemoryResult[]> {
    this.assertOpen();

    const limit = opts.limit ?? 20;
    const vectorWeight = opts.vectorWeight ?? 0.7;
    const keywordWeight = opts.keywordWeight ?? 0.3;
    const minScore = opts.minScore ?? 0;
    const keyPrefix = opts.keyPrefix;

    // Run FTS5 keyword search (scoped to keyPrefix if provided)
    const ftsResults = this.fts.search(query, limit * 2, keyPrefix);

    // Run vector search if provider is available (scoped to keyPrefix if provided)
    let vectorResults: Array<{ key: string; content: string; score: number }> = [];
    if (this.embeddingProvider) {
      try {
        const queryEmbedding = await this.getOrComputeEmbedding(query);
        if (queryEmbedding) {
          const queryFloat = new Float32Array(queryEmbedding);
          vectorResults = this.vector.search(queryFloat, limit * 2, minScore, keyPrefix);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[memory] Vector search failed: ${message}`);
      }
    }

    // Merge results
    let results = hybridMerge(ftsResults, vectorResults, {
      vectorWeight,
      keywordWeight,
      limit,
    });

    // Apply minimum score filter
    if (minScore > 0) {
      results = results.filter((r) => r.score >= minScore);
    }

    // Apply metadata filter if provided
    if (opts.filter && Object.keys(opts.filter).length > 0) {
      results = this.applyMetadataFilter(results, opts.filter);
    }

    // Enrich results with metadata
    return this.enrichWithMetadata(results);
  }

  /**
   * Delete a memory by key.
   */
  async forget(key: string): Promise<boolean> {
    this.assertOpen();

    const result = this.db.prepare(
      'DELETE FROM memories WHERE key = ?',
    ).run(key);

    return result.changes > 0;
  }

  /**
   * List all memories, optionally filtered by key prefix.
   */
  async list(prefix?: string): Promise<MemoryEntry[]> {
    this.assertOpen();

    let rows: Array<{
      key: string;
      content: string;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    }>;

    if (prefix) {
      rows = this.db.prepare(`
        SELECT key, content, metadata, created_at, updated_at
        FROM memories
        WHERE key LIKE ?
        ORDER BY key
      `).all(`${prefix}%`) as typeof rows;
    } else {
      rows = this.db.prepare(`
        SELECT key, content, metadata, created_at, updated_at
        FROM memories
        ORDER BY key
      `).all() as typeof rows;
    }

    return rows.map((row) => ({
      key: row.key,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Rebuild FTS index and recompute all embeddings.
   */
  async reindex(): Promise<void> {
    this.assertOpen();

    // Rebuild FTS5 index
    this.db.prepare(
      "INSERT INTO memories_fts(memories_fts) VALUES('rebuild')",
    ).run();

    // Recompute embeddings if provider is available
    if (this.embeddingProvider) {
      const rows = this.db.prepare(
        'SELECT key, content FROM memories',
      ).all() as Array<{ key: string; content: string }>;

      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const texts = batch.map((r) => r.content);

        try {
          const embeddings = await this.embeddingProvider.embed(texts);

          const updateStmt = this.db.prepare(
            'UPDATE memories SET embedding = ? WHERE key = ?',
          );

          const tx = this.db.transaction(() => {
            for (let j = 0; j < batch.length; j++) {
              const embedding = embeddings[j];
              const row = batch[j];
              if (embedding && row) {
                const blob = embeddingToBlob(embedding);
                updateStmt.run(blob, row.key);
                // Update cache too
                this.cache.set(row.content, embedding);
              }
            }
          });

          tx();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[memory] Reindex batch failed: ${message}`);
        }
      }
    }

    // Prune embedding cache
    this.cache.prune();
  }

  /**
   * Close the SQLite connection.
   */
  async close(): Promise<void> {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create all required tables, indexes, and triggers.
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        metadata TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        key, content,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, key, content) VALUES (new.rowid, new.key, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content) VALUES('delete', old.rowid, old.key, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content) VALUES('delete', old.rowid, old.key, old.content);
        INSERT INTO memories_fts(rowid, key, content) VALUES (new.rowid, new.key, new.content);
      END;

      CREATE TABLE IF NOT EXISTS embedding_cache (
        content_hash TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        accessed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_cache_accessed ON embedding_cache(accessed_at);
    `);
  }

  /**
   * Get an embedding from cache or compute it via the provider.
   */
  private async getOrComputeEmbedding(content: string): Promise<number[] | null> {
    if (!this.embeddingProvider) return null;

    // Check cache first
    const cached = this.cache.get(content);
    if (cached) return cached;

    // Compute new embedding
    const results = await this.embeddingProvider.embed([content]);
    const embedding = results[0];
    if (!embedding) return null;

    // Cache the result
    this.cache.set(content, embedding);

    // Periodically prune the cache
    if (Math.random() < 0.01) {
      this.cache.prune();
    }

    return embedding;
  }

  /**
   * Filter results by metadata key-value pairs.
   */
  private applyMetadataFilter(
    results: MemoryResult[],
    filter: Record<string, unknown>,
  ): MemoryResult[] {
    const keys = results.map((r) => r.key);
    if (keys.length === 0) return [];

    // Fetch metadata for all result keys
    const placeholders = keys.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT key, metadata FROM memories WHERE key IN (${placeholders})
    `).all(...keys) as Array<{ key: string; metadata: string | null }>;

    const metaMap = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.metadata) {
        metaMap.set(row.key, JSON.parse(row.metadata) as Record<string, unknown>);
      }
    }

    return results.filter((result) => {
      const meta = metaMap.get(result.key);
      if (!meta) return false;

      return Object.entries(filter).every(
        ([k, v]) => meta[k] === v,
      );
    });
  }

  /**
   * Attach metadata from the database to search results.
   */
  private enrichWithMetadata(results: MemoryResult[]): MemoryResult[] {
    if (results.length === 0) return results;

    const keys = results.map((r) => r.key);
    const placeholders = keys.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT key, metadata FROM memories WHERE key IN (${placeholders})
    `).all(...keys) as Array<{ key: string; metadata: string | null }>;

    const metaMap = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.metadata) {
        metaMap.set(row.key, JSON.parse(row.metadata) as Record<string, unknown>);
      }
    }

    return results.map((result) => ({
      ...result,
      metadata: metaMap.get(result.key),
    }));
  }

  /**
   * Guard against operations on a closed database.
   */
  private assertOpen(): void {
    if (this.closed) {
      throw new MemoryError('SQLite backend is closed');
    }
  }
}
