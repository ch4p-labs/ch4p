/**
 * POST /api/chat — send a message and get a synchronous response.
 *
 * Spawns `ch4p agent -m "message"` as a subprocess, captures output,
 * extracts the agent's reply, and kills the process. The agent subprocess
 * may not exit cleanly (event listeners keep it alive), so we force-kill
 * after capturing the response.
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { configExists } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  error?: string;
}

/** Find the CLI entry point. */
function findCliEntry(): string | null {
  const paths = [
    resolve(__dirname, '..', '..', '..', '..', 'cli', 'dist', 'index.js'),
    resolve(__dirname, '..', '..', '..', 'cli', 'dist', 'index.js'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Strip ANSI escape codes. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[\d*(;\d+)*m/g, '');
}

/**
 * Extract the agent's reply from CLI output.
 * Output format: preamble → "◆ ch4p" or "◆ c" → reply lines → verification footer
 *
 * Filters out:
 *   - Thinking blocks (dim/italic text from extended thinking)
 *   - Tool calls (lines starting with │ gutter character)
 *   - Session/preamble lines ([SESSION], sid=, ❯ You)
 *   - Token/usage footers
 */
function extractReply(raw: string): string {
  const clean = stripAnsi(raw);
  const lines = clean.split('\n');

  // Find the agent response marker
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.startsWith('◆ ch4p') || t.startsWith('◆ c')) {
      startIdx = i + 1;
    }
  }

  if (startIdx < 0) {
    // No marker — filter out preamble and tool/thinking noise
    const filtered = lines.filter(l => {
      const t = l.trim();
      return t && !isNoiseLine(t);
    });
    return filtered.join('\n').trim() || clean.trim();
  }

  // Collect reply lines, filtering out thinking/tool/footer noise
  const replyLines: string[] = [];
  let inThinking = false;

  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i]!.trim();

    // Stop at verification/usage footer
    if (t.startsWith('│ verify') || t.startsWith('│ All ') ||
        t.startsWith('│ ⚠') || t.startsWith('│ ✓') ||
        t.match(/^\d+\s*in\s*[│|]/) || t.match(/^tokens:/i) ||
        t.match(/^\d+ input.*\d+ output/)) break;

    // Skip tool call gutter lines
    if (t.startsWith('│')) continue;

    // Skip thinking indicator (extended thinking appears before text)
    // Thinking lines are typically short, indented, and appear before the actual response
    if (!replyLines.length && !t) {
      // Skip empty lines before content starts
      continue;
    }

    // Skip common noise patterns
    if (isNoiseLine(t)) continue;

    replyLines.push(lines[i]!);
  }

  const result = replyLines.join('\n').trim() || clean.trim();

  // Friendly error for expired OAuth tokens
  if (result.includes('OAuth token has expired') || result.includes('authentication_error')) {
    return 'Your Claude CLI session has expired. Run `claude` in your terminal to re-authenticate, then try again.';
  }

  return result;
}

/** Check if a line is noise (preamble, tool output, session info, etc.) */
function isNoiseLine(t: string): boolean {
  return !!(
    t.includes('❯ You') ||
    t.includes('[SESSION]') ||
    t.includes('sid=') ||
    t.startsWith('│') ||
    t.match(/^Done\s*$/) ||
    t.match(/^\d+ input.*\d+ output/) ||
    t.match(/^tokens:/i)
  );
}

export async function handleChat(payload: ChatRequest): Promise<ChatResponse> {
  if (!configExists()) {
    return {
      reply: 'No configuration found. Run the Setup Wizard first to configure ch4p.',
      sessionId: '',
      error: 'no_config',
    };
  }

  const cliEntry = findCliEntry();
  if (!cliEntry) {
    return {
      reply: 'CLI not found. Build with `pnpm -r build` first.',
      sessionId: '',
      error: 'cli_not_found',
    };
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;
    let responseTimer: ReturnType<typeof setTimeout> | null = null;

    // Use a stable session ID for GUI chat so memory persists across messages.
    // The CH4P_SESSION_ID env var is picked up by the agent to use a consistent
    // session context for auto-recall and auto-save.
    const sessionId = payload.sessionId || 'gui-chat';

    const child = spawn(process.execPath, [cliEntry, 'agent', '-m', payload.message], {
      env: { ...process.env, CH4P_SESSION_ID: sessionId },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();

      // Check if we have a complete response (agent marker + content after it)
      const clean = stripAnsi(stdout);
      const hasMarker = clean.includes('◆ ch4p') || clean.includes('◆ c');
      const reply = hasMarker ? extractReply(stdout) : '';

      // Once we have a non-empty reply, wait a short beat for any remaining
      // output, then resolve and kill the process
      if (reply && !resolved && !responseTimer) {
        responseTimer = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          child.kill('SIGKILL');
          resolve({
            reply: extractReply(stdout),
            sessionId: payload.sessionId ?? 'cli',
          });
        }, 1500); // wait 1.5s for any trailing output after first reply detected
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', () => {
      if (resolved) return;
      resolved = true;
      if (responseTimer) clearTimeout(responseTimer);

      if (stdout.trim()) {
        resolve({
          reply: extractReply(stdout),
          sessionId: payload.sessionId ?? 'cli',
        });
      } else {
        resolve({
          reply: `Agent error: ${stripAnsi(stderr.trim()) || 'No response'}`,
          sessionId: '',
          error: 'agent_error',
        });
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      if (responseTimer) clearTimeout(responseTimer);
      resolve({
        reply: `Failed to start agent: ${err.message}`,
        sessionId: '',
        error: 'spawn_error',
      });
    });

    // Hard timeout — kill after 90 seconds no matter what
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      if (responseTimer) clearTimeout(responseTimer);
      child.kill('SIGKILL');

      if (stdout.trim()) {
        resolve({
          reply: extractReply(stdout),
          sessionId: payload.sessionId ?? 'cli',
        });
      } else {
        resolve({
          reply: 'Request timed out. The agent may be unavailable.',
          sessionId: '',
          error: 'timeout',
        });
      }
    }, 90_000);
  });
}
