/**
 * Vector storage + cosine similarity search.
 *
 * Stores float32 embeddings as BLOBs in SQLite and performs brute-force
 * cosine similarity search. Sufficient for up to ~100k memories.
 */

import type Database from 'better-sqlite3';

export interface VectorResult {
  key: string;
  content: string;
  score: number;
}

export class VectorSearch {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Search for the most similar memories using cosine similarity.
   *
   * @param queryEmbedding - The query vector as Float32Array
   * @param limit          - Maximum results to return (default 20)
   * @param minScore       - Minimum similarity threshold (default 0.0)
   * @param keyPrefix      - Optional key prefix to scope results to a namespace
   * @returns Scored results sorted by similarity (higher = more similar)
   */
  search(queryEmbedding: Float32Array, limit = 20, minScore = 0.0, keyPrefix?: string): VectorResult[] {
    // Fetch memories that have embeddings, optionally scoped to a key prefix
    let sql = `SELECT key, content, embedding FROM memories WHERE embedding IS NOT NULL`;
    const params: unknown[] = [];

    if (keyPrefix) {
      sql += ` AND key LIKE ?`;
      params.push(`${keyPrefix}%`);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      key: string;
      content: string;
      embedding: Buffer;
    }>;

    // Compute similarity scores
    const scored: VectorResult[] = [];
    for (const row of rows) {
      const stored = blobToEmbedding(row.embedding);
      if (stored.length !== queryEmbedding.length) continue;

      const score = cosineSimilarity(queryEmbedding, stored);
      if (score >= minScore) {
        scored.push({
          key: row.key,
          content: row.content,
          score,
        });
      }
    }

    // Sort descending by similarity, take top results
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// Vector math helpers
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Convert a number array (from embedding API) to a Buffer for SQLite BLOB storage.
 * Uses Float32Array for compact storage (4 bytes per dimension).
 */
export function embeddingToBlob(embedding: number[]): Buffer {
  const floats = new Float32Array(embedding);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

/**
 * Convert a SQLite BLOB buffer back to Float32Array.
 */
export function blobToEmbedding(blob: Buffer): Float32Array {
  // Create a properly aligned copy
  const aligned = new ArrayBuffer(blob.length);
  const view = new Uint8Array(aligned);
  view.set(blob);
  return new Float32Array(aligned);
}
