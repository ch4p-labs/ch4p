/**
 * session-notes.ts — Lightweight crash-recovery journal for in-flight gateway sessions.
 *
 * When the gateway crashes mid-task, the agent loses all in-memory conversation state.
 * SessionNotes writes a tiny JSON note to disk before each agent run. On restart, any
 * note younger than RESUME_MAX_AGE_MS is re-injected into the appropriate channel so the
 * agent picks up where it left off — backed by the existing auto-recall memory summaries
 * for prior completed turns.
 *
 * Format: ~/.ch4p/sessions/{sha256(contextKey).slice(0,16)}.json
 * Lifecycle:
 *   upsert()         — called before each run (creates / replaces the note)
 *   appendActivity() — called after each LLM turn (appends brief progress snippet)
 *   delete()         — called on successful completion OR idle eviction
 *   loadRecent()     — called once on startup to find sessions to resume
 */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SessionNote {
  /** The context key used in conversationContexts — channel:userId or channel:group:groupId:… */
  contextKey: string;
  /** Channel that originated the request (used to look up the live IChannel on resume) */
  channelId: string;
  /** User within that channel */
  userId: string;
  /** Group / thread for group-chat contexts (optional) */
  groupId?: string;
  threadId?: string;
  /** The original user request text that triggered this run */
  request: string;
  /** Wall-clock timestamp (Date.now()) when the request was received */
  requestAt: number;
  /**
   * Rolling window of the last 3 assistant-message snippets (≤200 chars each).
   * Gives the restarted agent a brief "recent progress" bridge for the turn
   * that crashed before auto-summarise could fire.
   */
  recentActivity: string[];
}

export class SessionNotes {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'sessions');
    mkdirSync(this.dir, { recursive: true });
  }

  private keyToFile(contextKey: string): string {
    const hash = createHash('sha256').update(contextKey).digest('hex').slice(0, 16);
    return join(this.dir, `${hash}.json`);
  }

  /**
   * Upsert a note at the START of each agent run.
   * Replaces any prior note for the same contextKey. `recentActivity` resets
   * to empty so it only reflects the current run's progress.
   */
  upsert(note: SessionNote): void {
    const path = this.keyToFile(note.contextKey);
    writeFileSync(path, JSON.stringify(note, null, 2), 'utf8');
  }

  /**
   * Append a brief snippet of agent progress AFTER each LLM turn.
   * Capped at the last 3 entries; each snippet truncated to 200 chars.
   * Silent no-op if the note file doesn't exist yet.
   */
  appendActivity(contextKey: string, snippet: string): void {
    const path = this.keyToFile(contextKey);
    if (!existsSync(path)) return;
    try {
      const note = JSON.parse(readFileSync(path, 'utf8')) as SessionNote;
      note.recentActivity = [...note.recentActivity, snippet.slice(0, 200)].slice(-3);
      writeFileSync(path, JSON.stringify(note, null, 2), 'utf8');
    } catch {
      /* malformed JSON — leave unchanged */
    }
  }

  /**
   * Delete the note on successful completion or idle eviction.
   * Silent no-op if the file doesn't exist.
   */
  delete(contextKey: string): void {
    try {
      rmSync(this.keyToFile(contextKey));
    } catch {
      /* ignore ENOENT */
    }
  }

  /**
   * Return all notes younger than `maxAgeMs` (default 10 minutes).
   * Used once on startup to discover sessions that need to be resumed.
   * Skips unreadable / malformed files silently.
   */
  loadRecent(maxAgeMs = 10 * 60_000): SessionNote[] {
    const cutoff = Date.now() - maxAgeMs;
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
      const results: SessionNote[] = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.dir, file), 'utf8');
          const note = JSON.parse(raw) as SessionNote;
          if (typeof note.requestAt === 'number' && note.requestAt >= cutoff) {
            results.push(note);
          }
        } catch {
          /* malformed file — skip */
        }
      }
      return results;
    } catch {
      /* sessions dir missing or unreadable — return empty */
      return [];
    }
  }
}
