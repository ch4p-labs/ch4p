/**
 * GET /api/logs — read gateway log files.
 *
 * Returns the last N lines from gateway stdout and stderr logs.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getLogsDir } from '../config.js';

export interface LogEntry {
  source: 'stdout' | 'stderr';
  file: string;
  lines: string[];
  size: number;
  modified: string;
}

export interface LogsResponse {
  logsDir: string;
  entries: LogEntry[];
  available: string[];
}

/** Gateway startup marker (ANSI-stripped). */
const STARTUP_MARKER = 'ch4p Gateway';

/**
 * Read lines from the last gateway session only.
 * Finds the last occurrence of the startup marker and returns from there.
 * Falls back to last N lines if no marker is found.
 */
function readFromLastSession(filePath: string, maxLines: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Find the last startup marker
    let lastStartup = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]!.includes(STARTUP_MARKER)) {
        lastStartup = i;
        break;
      }
    }

    // If found, return from startup to end (capped at maxLines)
    if (lastStartup >= 0) {
      return lines.slice(lastStartup, lastStartup + maxLines);
    }

    // No marker found — fall back to tail
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/** Read last N lines from a file (tail), no session filtering. */
function tailFile(filePath: string, maxLines: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export function getLogs(maxLines = 200): LogsResponse {
  const logsDir = getLogsDir();

  if (!existsSync(logsDir)) {
    return { logsDir, entries: [], available: [] };
  }

  // List all log files
  let files: string[];
  try {
    files = readdirSync(logsDir).filter(f => f.endsWith('.log')).sort();
  } catch {
    return { logsDir, entries: [], available: [] };
  }

  const entries: LogEntry[] = [];

  // Read the most recent stdout and stderr logs
  const stdoutFiles = files.filter(f => f.includes('stdout'));
  const stderrFiles = files.filter(f => f.includes('stderr'));

  // Take the most recent of each (sorted alphabetically, last = most recent by naming convention)
  const latestStdout = stdoutFiles[stdoutFiles.length - 1];
  const latestStderr = stderrFiles[stderrFiles.length - 1];

  if (latestStdout) {
    const filePath = join(logsDir, latestStdout);
    const stat = statSync(filePath);
    entries.push({
      source: 'stdout',
      file: latestStdout,
      lines: readFromLastSession(filePath, maxLines),
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  if (latestStderr) {
    const filePath = join(logsDir, latestStderr);
    const stat = statSync(filePath);
    // Only include stderr if it was modified after the stdout file's last
    // startup (i.e., errors occurred during the current session, not old crashes).
    const stdoutPath = latestStdout ? join(logsDir, latestStdout) : null;
    const stdoutMtime = stdoutPath ? statSync(stdoutPath).mtime.getTime() : 0;
    const stderrMtime = stat.mtime.getTime();
    const isCurrentSession = stderrMtime >= stdoutMtime;

    entries.push({
      source: 'stderr',
      file: latestStderr,
      lines: isCurrentSession ? tailFile(filePath, maxLines) : [],
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  return { logsDir, entries, available: files };
}
