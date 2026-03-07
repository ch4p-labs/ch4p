/**
 * FTS5 keyword search module.
 *
 * Queries the SQLite FTS5 virtual table using BM25 ranking.
 * Handles query escaping for FTS5 syntax.
 */

import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface FTSResult {
  key: string;
  content: string;
  score: number;
}

export class FTSSearch {
  // Prepared statements — two variants per query (with/without keyPrefix).
  private readonly searchStmt: Statement;
  private readonly searchPrefixStmt: Statement;
  private readonly fallbackStmt: Statement;
  private readonly fallbackPrefixStmt: Statement;

  constructor(db: Database.Database) {
    this.searchStmt = db.prepare(`
      SELECT m.key, m.content, rank AS score
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank LIMIT ?
    `);

    this.searchPrefixStmt = db.prepare(`
      SELECT m.key, m.content, rank AS score
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ? AND m.key LIKE ?
      ORDER BY rank LIMIT ?
    `);

    this.fallbackStmt = db.prepare(`
      SELECT key, content
      FROM memories
      WHERE (content LIKE ? OR key LIKE ?)
      ORDER BY updated_at DESC LIMIT ?
    `);

    this.fallbackPrefixStmt = db.prepare(`
      SELECT key, content
      FROM memories
      WHERE (content LIKE ? OR key LIKE ?) AND key LIKE ?
      ORDER BY updated_at DESC LIMIT ?
    `);
  }

  /**
   * Search the FTS5 index using BM25 ranking.
   *
   * @param query     - User search query (will be escaped for FTS5)
   * @param limit     - Maximum results to return (default 20)
   * @param keyPrefix - Optional key prefix to scope results to a namespace
   * @returns Scored results sorted by relevance (higher score = more relevant)
   */
  search(query: string, limit = 20, keyPrefix?: string): FTSResult[] {
    const escaped = this.escapeQuery(query);
    if (!escaped) return [];

    try {
      let rows: Array<{ key: string; content: string; score: number }>;

      if (keyPrefix) {
        rows = this.searchPrefixStmt.all(escaped, `${keyPrefix}%`, limit) as typeof rows;
      } else {
        rows = this.searchStmt.all(escaped, limit) as typeof rows;
      }

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
      return this.fallbackSearch(query, limit, keyPrefix);
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
  private fallbackSearch(query: string, limit: number, keyPrefix?: string): FTSResult[] {
    const pattern = `%${query}%`;

    let rows: Array<{ key: string; content: string }>;

    if (keyPrefix) {
      rows = this.fallbackPrefixStmt.all(pattern, pattern, `${keyPrefix}%`, limit) as typeof rows;
    } else {
      rows = this.fallbackStmt.all(pattern, pattern, limit) as typeof rows;
    }

    // Assign decreasing scores based on position
    return rows.map((row, i) => ({
      key: row.key,
      content: row.content,
      score: 1.0 - i * (0.9 / Math.max(rows.length - 1, 1)),
    }));
  }
}
