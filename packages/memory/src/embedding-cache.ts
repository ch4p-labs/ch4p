/**
 * LRU embedding cache backed by SQLite.
 *
 * Caches embeddings by content hash (SHA-256) to avoid redundant
 * API calls. Evicts least-recently-accessed entries when the cache
 * exceeds its maximum size.
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { embeddingToBlob, blobToEmbedding } from './vector.js';

export interface EmbeddingCacheOpts {
  /** Maximum number of cached embeddings (default: 10,000) */
  maxEntries?: number;
}

export class EmbeddingCache {
  private readonly db: Database.Database;
  private readonly maxEntries: number;

  constructor(db: Database.Database, opts: EmbeddingCacheOpts = {}) {
    this.db = db;
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  /**
   * Look up a cached embedding by content.
   * Updates the access timestamp on hit.
   *
   * @param content - The text content to look up
   * @returns The cached embedding, or null if not found
   */
  get(content: string): number[] | null {
    const hash = this.hashContent(content);

    const row = this.db.prepare(`
      SELECT embedding FROM embedding_cache WHERE content_hash = ?
    `).get(hash) as { embedding: Buffer } | undefined;

    if (!row) return null;

    // Update access time for LRU tracking
    this.db.prepare(`
      UPDATE embedding_cache SET accessed_at = ? WHERE content_hash = ?
    `).run(new Date().toISOString(), hash);

    const floats = blobToEmbedding(row.embedding);
    return Array.from(floats);
  }

  /**
   * Store an embedding in the cache.
   *
   * @param content   - The text content (used to compute hash key)
   * @param embedding - The embedding vector to cache
   */
  set(content: string, embedding: number[]): void {
    const hash = this.hashContent(content);
    const blob = embeddingToBlob(embedding);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO embedding_cache (content_hash, embedding, accessed_at)
      VALUES (?, ?, ?)
    `).run(hash, blob, now);
  }

  /**
   * Evict least-recently-accessed entries to stay within maxEntries.
   * Called automatically or can be invoked manually.
   */
  prune(): number {
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM embedding_cache',
    ).get() as { cnt: number };

    const excess = countRow.cnt - this.maxEntries;
    if (excess <= 0) return 0;

    // Delete the oldest entries
    const result = this.db.prepare(`
      DELETE FROM embedding_cache
      WHERE content_hash IN (
        SELECT content_hash FROM embedding_cache
        ORDER BY accessed_at ASC
        LIMIT ?
      )
    `).run(excess);

    return result.changes;
  }

  /**
   * Get the number of entries in the cache.
   */
  size(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM embedding_cache',
    ).get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.db.prepare('DELETE FROM embedding_cache').run();
  }

  /**
   * Compute SHA-256 hash of content for cache key.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
