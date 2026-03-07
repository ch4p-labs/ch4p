/**
 * LRU embedding cache backed by SQLite.
 *
 * Caches embeddings by content hash (SHA-256) to avoid redundant
 * API calls. Evicts least-recently-accessed entries when the cache
 * exceeds its maximum size.
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import { embeddingToBlob, blobToEmbedding } from './vector.js';

export interface EmbeddingCacheOpts {
  /** Maximum number of cached embeddings (default: 10,000) */
  maxEntries?: number;
}

export class EmbeddingCache {
  private readonly maxEntries: number;

  // Prepared statements — allocated once, reused on every call.
  private readonly getStmt: Statement;
  private readonly updateAccessStmt: Statement;
  private readonly setStmt: Statement;
  private readonly countStmt: Statement;
  private readonly pruneStmt: Statement;
  private readonly clearStmt: Statement;

  constructor(db: Database.Database, opts: EmbeddingCacheOpts = {}) {
    this.maxEntries = opts.maxEntries ?? 10_000;

    this.getStmt = db.prepare(
      'SELECT embedding FROM embedding_cache WHERE content_hash = ?',
    );
    this.updateAccessStmt = db.prepare(
      'UPDATE embedding_cache SET accessed_at = ? WHERE content_hash = ?',
    );
    this.setStmt = db.prepare(
      'INSERT OR REPLACE INTO embedding_cache (content_hash, embedding, accessed_at) VALUES (?, ?, ?)',
    );
    this.countStmt = db.prepare(
      'SELECT COUNT(*) as cnt FROM embedding_cache',
    );
    this.pruneStmt = db.prepare(`
      DELETE FROM embedding_cache
      WHERE content_hash IN (
        SELECT content_hash FROM embedding_cache
        ORDER BY accessed_at ASC
        LIMIT ?
      )
    `);
    this.clearStmt = db.prepare('DELETE FROM embedding_cache');
  }

  /**
   * Look up a cached embedding by content.
   * Probabilistically updates the access timestamp on hit (~10% of reads).
   */
  get(content: string): number[] | null {
    const hash = this.hashContent(content);

    const row = this.getStmt.get(hash) as { embedding: Buffer } | undefined;
    if (!row) return null;

    // Probabilistic LRU update — only write accessed_at ~10% of the time.
    // Preserves LRU ordering in aggregate while eliminating 90% of the
    // autocommit write overhead (WAL append + sync) on cache reads.
    if (Math.random() < 0.1) {
      this.updateAccessStmt.run(new Date().toISOString(), hash);
    }

    const floats = blobToEmbedding(row.embedding);
    return Array.from(floats);
  }

  /**
   * Store an embedding in the cache.
   */
  set(content: string, embedding: number[]): void {
    const hash = this.hashContent(content);
    const blob = embeddingToBlob(embedding);
    const now = new Date().toISOString();

    this.setStmt.run(hash, blob, now);
  }

  /**
   * Evict least-recently-accessed entries to stay within maxEntries.
   */
  prune(): number {
    const countRow = this.countStmt.get() as { cnt: number };

    const excess = countRow.cnt - this.maxEntries;
    if (excess <= 0) return 0;

    const result = this.pruneStmt.run(excess);
    return result.changes;
  }

  /**
   * Get the number of entries in the cache.
   */
  size(): number {
    const row = this.countStmt.get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.clearStmt.run();
  }

  /**
   * Compute SHA-256 hash of content for cache key.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
