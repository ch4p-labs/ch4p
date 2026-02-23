/**
 * Integration tests for SQLiteMemoryBackend.
 *
 * Covers the keyPrefix / namespace isolation feature:
 *   - Recall with keyPrefix returns only entries in that namespace.
 *   - Recall without keyPrefix returns all entries (backward compatibility).
 *   - User A cannot accidentally recall user B's memories.
 *   - Store and recall round-trip (FTS keyword search path).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMemoryBackend } from './sqlite-backend.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let backend: SQLiteMemoryBackend;

/**
 * Create a fresh in-memory SQLite backend for each test.
 * Using ':memory:' means each test gets an isolated database with no
 * on-disk state to clean up.
 */
beforeEach(() => {
  backend = new SQLiteMemoryBackend({ dbPath: ':memory:' });
});

afterEach(async () => {
  await backend.close();
});

// ---------------------------------------------------------------------------
// Basic store / recall smoke test
// ---------------------------------------------------------------------------

describe('SQLiteMemoryBackend — basic store and recall', () => {
  it('stores and recalls an entry by keyword', async () => {
    await backend.store('test:entry:1', 'TypeScript is a typed superset of JavaScript');

    const results = await backend.recall('TypeScript');

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.key).toBe('test:entry:1');
    expect(results[0]!.content).toContain('TypeScript');
  });

  it('returns empty array when no entries match the query', async () => {
    await backend.store('test:unrelated', 'Something completely unrelated to the search');

    const results = await backend.recall('xyzzy-no-match-expected');
    expect(results.length).toBe(0);
  });

  it('upserts on key conflict — updates content', async () => {
    await backend.store('test:key', 'original content');
    await backend.store('test:key', 'updated content');

    const entries = await backend.list('test:');
    expect(entries.length).toBe(1);
    expect(entries[0]!.content).toBe('updated content');
  });
});

// ---------------------------------------------------------------------------
// keyPrefix namespace isolation
// ---------------------------------------------------------------------------

describe('SQLiteMemoryBackend — keyPrefix namespace isolation', () => {
  beforeEach(async () => {
    // Seed with entries across two user namespaces and a global entry.
    await backend.store('u:telegram:1:conv:2024-a', 'Telegram user 1 prefers dark mode');
    await backend.store('u:telegram:1:conv:2024-b', 'Telegram user 1 uses TypeScript');
    await backend.store('u:discord:2:conv:2024-a', 'Discord user 2 prefers dark mode');
    await backend.store('global:setting', 'dark mode is a popular UI preference');
  });

  it('recall with keyPrefix returns only entries in that namespace', async () => {
    const results = await backend.recall('dark mode', { keyPrefix: 'u:telegram:1:' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.key).toMatch(/^u:telegram:1:/);
    }
  });

  it('recall with a different keyPrefix returns only that namespace', async () => {
    const results = await backend.recall('dark mode', { keyPrefix: 'u:discord:2:' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.key).toMatch(/^u:discord:2:/);
    }
  });

  it('recall without keyPrefix returns all matching entries (backward compatible)', async () => {
    const results = await backend.recall('dark mode');

    // Should include entries from both namespaces and global.
    const keys = results.map((r) => r.key);
    const hasTelegram = keys.some((k) => k.startsWith('u:telegram:1:'));
    const hasDiscord = keys.some((k) => k.startsWith('u:discord:2:'));
    const hasGlobal = keys.some((k) => k === 'global:setting');

    expect(hasTelegram || hasDiscord || hasGlobal).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('namespace isolation: telegram user cannot see discord memories', async () => {
    const telegramResults = await backend.recall('dark mode', { keyPrefix: 'u:telegram:1:' });
    const discordResults = await backend.recall('dark mode', { keyPrefix: 'u:discord:2:' });

    const telegramKeys = new Set(telegramResults.map((r) => r.key));
    const discordKeys = new Set(discordResults.map((r) => r.key));

    // No overlap between the two namespaces.
    for (const k of telegramKeys) {
      expect(discordKeys.has(k)).toBe(false);
    }
  });

  it('returns empty array when keyPrefix matches no stored keys', async () => {
    const results = await backend.recall('dark mode', { keyPrefix: 'u:slack:99:' });
    expect(results.length).toBe(0);
  });

  it('recall finds the correct content when keyPrefix narrows to one entry', async () => {
    // Only 'u:telegram:1:conv:2024-b' contains "TypeScript".
    const results = await backend.recall('TypeScript', { keyPrefix: 'u:telegram:1:' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.key).toBe('u:telegram:1:conv:2024-b');
    expect(results[0]!.content).toContain('TypeScript');
    // Ensure no discord entries leaked in.
    for (const r of results) {
      expect(r.key.startsWith('u:telegram:1:')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// list() with prefix
// ---------------------------------------------------------------------------

describe('SQLiteMemoryBackend — list() with prefix', () => {
  beforeEach(async () => {
    await backend.store('u:telegram:1:a', 'telegram entry a');
    await backend.store('u:telegram:1:b', 'telegram entry b');
    await backend.store('u:discord:2:a', 'discord entry a');
  });

  it('list with prefix returns only matching entries', async () => {
    const entries = await backend.list('u:telegram:1:');
    expect(entries.length).toBe(2);
    for (const e of entries) {
      expect(e.key.startsWith('u:telegram:1:')).toBe(true);
    }
  });

  it('list without prefix returns all entries', async () => {
    const entries = await backend.list();
    expect(entries.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// forget()
// ---------------------------------------------------------------------------

describe('SQLiteMemoryBackend — forget()', () => {
  it('removes an entry by key', async () => {
    await backend.store('to-delete', 'delete me');
    const deleted = await backend.forget('to-delete');
    expect(deleted).toBe(true);

    const entries = await backend.list();
    expect(entries.find((e) => e.key === 'to-delete')).toBeUndefined();
  });

  it('returns false for a key that does not exist', async () => {
    const deleted = await backend.forget('nonexistent-key');
    expect(deleted).toBe(false);
  });
});
