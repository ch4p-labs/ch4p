import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EmbeddingCache } from './embedding-cache.js';
import { embeddingToBlob, blobToEmbedding } from './vector.js';

function createCacheDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      content_hash TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cache_accessed ON embedding_cache(accessed_at);
  `);
  return db;
}

describe('EmbeddingCache', () => {
  let db: Database.Database;
  let cache: EmbeddingCache;

  beforeEach(() => {
    db = createCacheDb();
    cache = new EmbeddingCache(db, { maxEntries: 5 });
  });

  it('returns null for a cache miss', () => {
    expect(cache.get('not cached')).toBeNull();
  });

  it('stores and retrieves an embedding', () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set('hello world', embedding);

    const result = cache.get('hello world');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result![0]).toBeCloseTo(0.1, 5);
    expect(result![1]).toBeCloseTo(0.2, 5);
    expect(result![2]).toBeCloseTo(0.3, 5);
  });

  it('overwrites on duplicate content', () => {
    cache.set('same key', [1.0, 2.0]);
    cache.set('same key', [3.0, 4.0]);

    const result = cache.get('same key');
    expect(result!.length).toBe(2);
    expect(result![0]).toBeCloseTo(3.0, 5);
    expect(cache.size()).toBe(1);
  });

  it('prunes excess entries by LRU order', () => {
    // Fill cache to limit (5)
    for (let i = 0; i < 5; i++) {
      cache.set(`entry-${i}`, [i]);
    }
    expect(cache.size()).toBe(5);

    // Add 2 more — now 7 entries, 2 over limit
    cache.set('entry-5', [5]);
    cache.set('entry-6', [6]);
    expect(cache.size()).toBe(7);

    // Prune should remove the 2 oldest
    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.size()).toBe(5);

    // The oldest entries should be gone
    expect(cache.get('entry-0')).toBeNull();
    expect(cache.get('entry-1')).toBeNull();
    // Newer entries should remain
    expect(cache.get('entry-6')).not.toBeNull();
  });

  it('clear() removes all entries', () => {
    cache.set('a', [1]);
    cache.set('b', [2]);
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('prune returns 0 when under limit', () => {
    cache.set('only-one', [1]);
    expect(cache.prune()).toBe(0);
  });

  it('get() returns correct data regardless of probabilistic LRU update', () => {
    // The LRU update only fires ~10% of the time, but the returned data
    // must always be correct.
    cache.set('test', [0.5, 0.6, 0.7]);

    // Call get() many times — data should always be correct
    for (let i = 0; i < 50; i++) {
      const result = cache.get('test');
      expect(result).not.toBeNull();
      expect(result![0]).toBeCloseTo(0.5, 5);
      expect(result![1]).toBeCloseTo(0.6, 5);
      expect(result![2]).toBeCloseTo(0.7, 5);
    }
  });
});
