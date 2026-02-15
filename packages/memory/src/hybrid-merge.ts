/**
 * Weighted merge of FTS5 keyword results and vector similarity results.
 *
 * Normalizes scores to [0, 1] within each result set, then computes a
 * weighted combined score. Default weighting: 0.7 vector + 0.3 keyword.
 */

import type { MemoryResult } from '@ch4p/core';

export interface ScoredResult {
  key: string;
  content: string;
  score: number;
}

export interface HybridMergeOpts {
  vectorWeight?: number;
  keywordWeight?: number;
  limit?: number;
}

/**
 * Merge keyword (FTS5) and vector search results with configurable weights.
 *
 * @param ftsResults    - Results from FTS5 keyword search
 * @param vectorResults - Results from vector cosine similarity search
 * @param opts          - Weights and limit options
 * @returns Merged results sorted by combined score, with matchType annotation
 */
export function hybridMerge(
  ftsResults: ScoredResult[],
  vectorResults: ScoredResult[],
  opts: HybridMergeOpts = {},
): MemoryResult[] {
  const vectorWeight = opts.vectorWeight ?? 0.7;
  const keywordWeight = opts.keywordWeight ?? 0.3;
  const limit = opts.limit ?? 20;

  // Normalize scores to [0, 1]
  const normalizedFts = normalizeScores(ftsResults);
  const normalizedVector = normalizeScores(vectorResults);

  // Build a map keyed by memory key
  const merged = new Map<string, {
    key: string;
    content: string;
    keywordScore: number;
    vectorScore: number;
    inKeyword: boolean;
    inVector: boolean;
  }>();

  for (const r of normalizedFts) {
    merged.set(r.key, {
      key: r.key,
      content: r.content,
      keywordScore: r.score,
      vectorScore: 0,
      inKeyword: true,
      inVector: false,
    });
  }

  for (const r of normalizedVector) {
    const existing = merged.get(r.key);
    if (existing) {
      existing.vectorScore = r.score;
      existing.inVector = true;
      // Use the longer content if available
      if (r.content.length > existing.content.length) {
        existing.content = r.content;
      }
    } else {
      merged.set(r.key, {
        key: r.key,
        content: r.content,
        keywordScore: 0,
        vectorScore: r.score,
        inKeyword: false,
        inVector: true,
      });
    }
  }

  // Compute combined scores and determine match type
  const results: MemoryResult[] = [];

  for (const entry of merged.values()) {
    const combinedScore =
      entry.vectorScore * vectorWeight +
      entry.keywordScore * keywordWeight;

    let matchType: MemoryResult['matchType'];
    if (entry.inKeyword && entry.inVector) {
      matchType = 'hybrid';
    } else if (entry.inVector) {
      matchType = 'vector';
    } else {
      matchType = 'keyword';
    }

    results.push({
      key: entry.key,
      content: entry.content,
      score: combinedScore,
      matchType,
    });
  }

  // Sort by combined score descending, then take top results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Normalize scores to [0, 1] using min-max normalization.
 * If all scores are identical, all normalized scores become 1.
 */
function normalizeScores(results: ScoredResult[]): ScoredResult[] {
  if (results.length === 0) return [];

  const scores = results.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  return results.map((r) => ({
    key: r.key,
    content: r.content,
    score: range === 0 ? 1.0 : (r.score - min) / range,
  }));
}
