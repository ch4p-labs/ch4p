import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionNotes, type SessionNote } from './session-notes.js';

function makeNote(overrides: Partial<SessionNote> = {}): SessionNote {
  return {
    contextKey: 'telegram:user123',
    channelId: 'telegram',
    userId: 'user123',
    request: 'Write a report about ocean warming.',
    requestAt: Date.now(),
    recentActivity: [],
    ...overrides,
  };
}

describe('SessionNotes', () => {
  let tmpDir: string;
  let notes: SessionNotes;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'session-notes-test-'));
    notes = new SessionNotes(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('upsert creates a note; loadRecent returns it', () => {
    const note = makeNote();
    notes.upsert(note);
    const loaded = notes.loadRecent();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.contextKey).toBe('telegram:user123');
    expect(loaded[0]!.request).toBe('Write a report about ocean warming.');
    expect(loaded[0]!.recentActivity).toEqual([]);
  });

  it('upsert twice for same contextKey — second write replaces first', () => {
    notes.upsert(makeNote({ request: 'first request' }));
    notes.upsert(makeNote({ request: 'second request' }));
    const loaded = notes.loadRecent();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.request).toBe('second request');
  });

  it('appendActivity appends snippets, caps at 3, truncates to 200 chars', () => {
    notes.upsert(makeNote());
    notes.appendActivity('telegram:user123', 'Found 5 articles.');
    notes.appendActivity('telegram:user123', 'Summarised articles 1–3.');
    notes.appendActivity('telegram:user123', 'Started writing the intro section.');
    notes.appendActivity('telegram:user123', 'A'.repeat(300)); // should be truncated

    const loaded = notes.loadRecent();
    expect(loaded[0]!.recentActivity).toHaveLength(3); // capped at 3
    expect(loaded[0]!.recentActivity[0]).toBe('Summarised articles 1–3.');
    expect(loaded[0]!.recentActivity[1]).toBe('Started writing the intro section.');
    expect(loaded[0]!.recentActivity[2]).toHaveLength(200); // truncated
  });

  it('appendActivity is a no-op when note does not exist', () => {
    // Should not throw when file is absent
    expect(() => notes.appendActivity('nonexistent:key', 'some activity')).not.toThrow();
  });

  it('notes older than maxAgeMs are excluded from loadRecent', () => {
    const oldNote = makeNote({
      contextKey: 'telegram:old',
      requestAt: Date.now() - 15 * 60_000, // 15 minutes ago
    });
    const freshNote = makeNote({
      contextKey: 'telegram:fresh',
      requestAt: Date.now(),
    });
    notes.upsert(oldNote);
    notes.upsert(freshNote);

    const loaded = notes.loadRecent(10 * 60_000); // 10-minute window
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.channelId).toBe('telegram');
    expect(loaded[0]!.contextKey).toBe('telegram:fresh');
  });

  it('delete removes the note; subsequent loadRecent returns empty', () => {
    notes.upsert(makeNote());
    notes.delete('telegram:user123');
    expect(notes.loadRecent()).toHaveLength(0);
  });

  it('delete is a no-op when file does not exist', () => {
    expect(() => notes.delete('nonexistent:key')).not.toThrow();
  });

  it('loadRecent tolerates malformed JSON files silently', () => {
    // Create a valid note to ensure loadRecent still returns it
    notes.upsert(makeNote({ contextKey: 'telegram:valid' }));

    // Manually write a broken JSON file into the sessions dir
    writeFileSync(join(tmpDir, 'sessions', 'badfile.json'), '{not valid json', 'utf8');

    // loadRecent should skip the bad file and return the valid one
    const loaded = notes.loadRecent();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.contextKey).toBe('telegram:valid');
  });
});
