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

/** Read last N lines from a file (tail). */
function tailFile(filePath: string, maxLines: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    // Remove trailing empty line from split
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
      lines: tailFile(filePath, maxLines),
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  if (latestStderr) {
    const filePath = join(logsDir, latestStderr);
    const stat = statSync(filePath);
    entries.push({
      source: 'stderr',
      file: latestStderr,
      lines: tailFile(filePath, maxLines),
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  return { logsDir, entries, available: files };
}
