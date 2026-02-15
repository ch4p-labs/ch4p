/**
 * FTS5 keyword search module.
 *
 * Queries the SQLite FTS5 virtual table using BM25 ranking.
 * Handles query escaping for FTS5 syntax.
 */

import type Database from 'better-sqlite3';

export interface FTSResult {
  key: string;
  content: string;
  score: number;
}

export class FTSSearch {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Search the FTS5 index using BM25 ranking.
   *
   * @param query  - User search query (will be escaped for FTS5)
   * @param limit  - Maximum results to return (default 20)
   * @returns Scored results sorted by relevance (higher score = more relevant)
   */
  search(query: string, limit = 20): FTSResult[] {
    const escaped = this.escapeQuery(query);
    if (!escaped) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT
          m.key,
          m.content,
          rank AS score
        FROM memories_fts
        JOIN memories m ON memories_fts.rowid = m.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const rows = stmt.all(escaped, limit) as Array<{
        key: string;
        content: string;
        score: number;
      }>;

      // FTS5 rank values are negative (more negative = more relevant).
      // Convert to positive scores where higher = better.
      return rows.map((row) => ({
        key: row.key,
        content: row.content,
        score: -row.score,
      }));
    } catch {
      // If the query fails (e.g. invalid FTS syntax despite escaping),
      // fall back to a simple LIKE search.
      return this.fallbackSearch(query, limit);
    }
  }

  /**
   * Escape a user query for safe FTS5 matching.
   *
   * FTS5 has special syntax characters: AND, OR, NOT, *, (, ), ", NEAR.
   * We wrap each token in double quotes to treat them as literals.
   */
  private escapeQuery(query: string): string {
    const trimmed = query.trim();
    if (!trimmed) return '';

    // Split on whitespace, wrap each token in double quotes.
    // Escape any embedded double quotes by doubling them.
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    return tokens
      .map((token) => `"${token.replace(/"/g, '""')}"`)
      .join(' ');
  }

  /**
   * Fallback search using LIKE when FTS5 query fails.
   */
  private fallbackSearch(query: string, limit: number): FTSResult[] {
    const pattern = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT key, content
      FROM memories
      WHERE content LIKE ? OR key LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(pattern, pattern, limit) as Array<{
      key: string;
      content: string;
    }>;

    // Assign decreasing scores based on position
    return rows.map((row, i) => ({
      key: row.key,
      content: row.content,
      score: 1.0 - i * (0.9 / Math.max(rows.length - 1, 1)),
    }));
  }
}
