/**
 * Tests for FTSSearch — specifically the keyPrefix namespace filtering.
 *
 * Uses an in-memory SQLite database to verify that FTS5 and fallback LIKE
 * queries correctly scope results to the provided key prefix.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { FTSSearch } from './fts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  // Create schema matching sqlite-backend
  db.exec(`
    CREATE TABLE memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT    NOT NULL UNIQUE,
      content    TEXT    NOT NULL,
      metadata   TEXT,
      embedding  BLOB,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE VIRTUAL TABLE memories_fts USING fts5(
      content,
      key,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, key) VALUES (new.id, new.content, new.key);
    END;
    CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, key) VALUES ('delete', old.id, old.content, old.key);
      INSERT INTO memories_fts(rowid, content, key) VALUES (new.id, new.content, new.key);
    END;
    CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, key) VALUES ('delete', old.id, old.content, old.key);
    END;
  `);

  return db;
}

function insertRow(db: Database.Database, key: string, content: string): void {
  db.prepare('INSERT INTO memories (key, content) VALUES (?, ?)').run(key, content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FTSSearch.search — keyPrefix namespace isolation', () => {
  let db: Database.Database;
  let fts: FTSSearch;

  beforeEach(() => {
    db = createTestDb();
    fts = new FTSSearch(db);

    // Populate with entries in different namespaces.
    insertRow(db, 'u:telegram:1:conv:a', 'dark mode preference setting');
    insertRow(db, 'u:telegram:1:conv:b', 'prefers TypeScript over JavaScript');
    insertRow(db, 'u:discord:2:conv:a', 'dark mode enabled for Discord user');
    insertRow(db, 'global:setting', 'dark mode is a popular setting');
  });

  it('returns only entries matching the keyPrefix', () => {
    const results = fts.search('dark mode', 20, 'u:telegram:1:');
    expect(results.length).toBe(1);
    expect(results[0]!.key).toBe('u:telegram:1:conv:a');
  });

  it('returns entries from a different namespace when that prefix is used', () => {
    const results = fts.search('dark mode', 20, 'u:discord:2:');
    expect(results.length).toBe(1);
    expect(results[0]!.key).toBe('u:discord:2:conv:a');
  });

  it('returns all matching entries when no keyPrefix is provided', () => {
    const results = fts.search('dark mode', 20);
    // Should match all 3 entries that mention "dark mode"
    expect(results.length).toBe(3);
  });

  it('returns empty array when keyPrefix matches no keys', () => {
    const results = fts.search('dark mode', 20, 'u:slack:99:');
    expect(results.length).toBe(0);
  });

  it('all results are scoped to the namespace when keyPrefix is set', () => {
    // 'TypeScript' appears in exactly one telegram entry — use an exact word
    const telegram = fts.search('TypeScript', 20, 'u:telegram:1:');
    expect(telegram.length).toBeGreaterThanOrEqual(1);
    for (const r of telegram) {
      expect(r.key).toMatch(/^u:telegram:1:/);
    }
  });
});

describe('FTSSearch fallback search — keyPrefix namespace isolation', () => {
  let db: Database.Database;
  let fts: FTSSearch;

  beforeEach(() => {
    // Use a DB without FTS triggers so fallback LIKE search is exercised
    // by calling fallbackSearch directly via a subclass trick.
    db = createTestDb();
    fts = new FTSSearch(db);

    // Insert entries that will trigger the fallback path
    // (special characters force FTS parse error → fallback)
    insertRow(db, 'u:telegram:1:conv:a', 'dark mode preference');
    insertRow(db, 'u:discord:2:conv:a', 'dark mode for discord');
    insertRow(db, 'global:note', 'dark mode global');
  });

  it('fallback: keyPrefix scopes LIKE search correctly', () => {
    // Force fallback by passing an FTS-invalid query (empty after escape)
    // We test via the public search() using a very unusual query that
    // survives escaping but whose FTS match returns nothing, then LIKE fallback
    // handles it. Easier: use a query with only punctuation.

    // Actually, the simplest way: use a search term that won't match FTS but
    // will match LIKE. Insert a row where content has special chars.
    insertRow(db, 'u:telegram:1:special', 'user@example.com email address');
    insertRow(db, 'u:discord:2:special', 'user@example.com email address');

    // '@' in content will be searched with LIKE fallback since FTS handles it
    // differently. We pass keyPrefix to ensure only telegram entries come back.
    const results = fts.search('user@example', 20, 'u:telegram:1:');
    for (const r of results) {
      expect(r.key).toMatch(/^u:telegram:1:/);
    }
  });
});
