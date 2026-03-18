/**
 * GUI Server — raw node:http server for the ch4p graphical interface.
 *
 * Zero external dependencies. Follows the same pattern as
 * packages/gateway/src/server.ts: createServer + if/else route dispatch.
 * Copies serveStatic() locally to avoid pulling in the gateway bundle (which imports ws).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static.js';
import { configExists, loadConfig } from './config.js';
import { getStatus } from './routes/status.js';
import { getDoctorResults } from './routes/doctor.js';
import { getAuditResults } from './routes/audit.js';
import { getSafeConfig, applySafeUpdates } from './routes/config.js';
import { getEnginesData } from './routes/engines.js';
import { applyOnboard } from './routes/onboard.js';
import { handleChat, type ChatRequest } from './routes/chat.js';
import { getChannels } from './routes/channels.js';
import { getTools } from './routes/tools.js';
import { getLogs } from './routes/logs.js';
import type { OnboardPayload } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_048_576) { // 1 MB limit
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  // CORS headers for dev proxy
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ----- API routes -----

  if (method === 'GET' && url === '/api/status') {
    sendJson(res, 200, getStatus());
    return;
  }

  if (method === 'GET' && url === '/api/doctor') {
    sendJson(res, 200, getDoctorResults());
    return;
  }

  if (method === 'GET' && url === '/api/audit') {
    sendJson(res, 200, getAuditResults());
    return;
  }

  if (method === 'GET' && url === '/api/engines') {
    sendJson(res, 200, getEnginesData());
    return;
  }

  if (method === 'GET' && url === '/api/channels') {
    sendJson(res, 200, getChannels());
    return;
  }

  if (method === 'GET' && url === '/api/tools') {
    sendJson(res, 200, getTools());
    return;
  }

  if (method === 'GET' && (url === '/api/logs' || url?.startsWith('/api/logs?'))) {
    const params = new URL(url, 'http://localhost').searchParams;
    const lines = parseInt(params.get('lines') ?? '200', 10);
    sendJson(res, 200, getLogs(Math.min(lines, 1000)));
    return;
  }

  if (method === 'POST' && url === '/api/onboard') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as OnboardPayload;
      const result = applyOnboard(payload);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid request' });
    }
    return;
  }

  if (method === 'POST' && url === '/api/chat') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as ChatRequest;
      const result = await handleChat(payload);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid request' });
    }
    return;
  }

  if (method === 'GET' && url === '/api/config') {
    const config = getSafeConfig();
    if (!config) {
      sendJson(res, 404, { error: 'No config file found' });
      return;
    }
    sendJson(res, 200, config);
    return;
  }

  if (method === 'PATCH' && url === '/api/config') {
    try {
      const body = await readBody(req);
      const updates = JSON.parse(body) as Record<string, unknown>;
      const result = applySafeUpdates(updates);
      if (!result) {
        sendJson(res, 404, { error: 'No config file found' });
        return;
      }
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid request' });
    }
    return;
  }

  // ----- Static file serving (SPA fallback) -----

  if (serveStatic(req, res, staticDir)) {
    return;
  }

  // ----- 404 -----

  sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gateway auto-start
// ---------------------------------------------------------------------------

async function isGatewayRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForGateway(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isGatewayRunning(port)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/** Stored gateway auth token after auto-pairing. */
let gatewayAuthToken: string | null = null;

/** Get the gateway auth token (used by chat route). */
export function getGatewayAuthToken(): string | null {
  return gatewayAuthToken;
}

/**
 * Try to start the gateway if it's not already running.
 * Captures the pairing code from stdout and auto-pairs.
 */
async function ensureGateway(): Promise<ChildProcess | null> {
  let gatewayPort = 18789;
  try {
    if (configExists()) {
      const config = loadConfig();
      gatewayPort = config.gateway?.port ?? 18789;
    }
  } catch { /* use default */ }

  if (await isGatewayRunning(gatewayPort)) {
    console.log(`  Gateway already running on port ${gatewayPort}`);
    return null;
  }

  // Find the CLI entry point to spawn `ch4p gateway`
  const cliPaths = [
    resolve(__dirname, '..', '..', '..', 'cli', 'dist', 'index.js'),
    resolve(__dirname, '..', '..', 'cli', 'dist', 'index.js'),
  ];

  let cliEntry: string | undefined;
  const { existsSync } = await import('node:fs');
  for (const p of cliPaths) {
    if (existsSync(p)) { cliEntry = p; break; }
  }

  if (!cliEntry) {
    console.log('  Gateway CLI not found — chat will require manual gateway start');
    return null;
  }

  console.log(`  Starting gateway on port ${gatewayPort}...`);

  const child = spawn(process.execPath, [cliEntry, 'gateway'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // Capture pairing code from stdout using a promise
  let pairingCode: string | null = null;
  const codePromise = new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10000);
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const stripped = text.replace(/\x1b\[\d*(;\d+)*m/g, '');
      const match = stripped.match(/pairing code:\s*([A-Z0-9]{5,8})/i);
      if (match && !pairingCode) {
        pairingCode = match[1]!;
        clearTimeout(timeout);
        resolve(pairingCode);
      }
    });
  });

  child.stderr?.resume();
  child.on('error', (err) => console.error(`  Gateway error: ${err.message}`));
  child.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`  Gateway exited with code ${code}`);
  });

  // Wait for both: gateway healthy + pairing code captured
  const [healthy, capturedCode] = await Promise.all([
    waitForGateway(gatewayPort),
    codePromise,
  ]);

  if (!healthy) {
    console.log('  Gateway may not be ready — chat might not work immediately');
    return child;
  }

  console.log(`  Gateway started on port ${gatewayPort}`);

  // Auto-pair if we captured a code
  if (capturedCode) {
    try {
      const pairRes = await fetch(`http://127.0.0.1:${gatewayPort}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: capturedCode, label: 'ch4p-gui' }),
        signal: AbortSignal.timeout(5000),
      });
      if (pairRes.ok) {
        const pairData = await pairRes.json() as { token?: string };
        if (pairData.token) {
          gatewayAuthToken = pairData.token;
          console.log('  GUI auto-paired with gateway');
        }
      }
    } catch {
      console.log('  Auto-pairing failed — chat may require manual pairing');
    }
  }

  return child;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createGuiServer(options?: { port?: number; staticDir?: string }): {
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
} {
  const port = options?.port ?? 4810;
  const host = '127.0.0.1';
  const staticDir = options?.staticDir ?? resolve(__dirname, '..', 'client');
  let gatewayChild: ChildProcess | null = null;

  const server = createServer((req, res) => {
    handleRequest(req, res, staticDir).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
    });
  });

  return {
    start: async () => {
      // Auto-start gateway
      gatewayChild = await ensureGateway();

      return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => {
          const addr = server.address();
          const boundPort = typeof addr === 'object' && addr ? addr.port : port;
          resolve({ port: boundPort, host });
        });
      });
    },
    stop: async () => {
      // Kill gateway child if we spawned it
      if (gatewayChild && !gatewayChild.killed) {
        gatewayChild.kill('SIGTERM');
        gatewayChild = null;
      }
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry (when run directly)
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith('/server/index.js') || process.argv[1].endsWith('/server/index.mjs'));

if (isMainModule) {
  let port = 4810;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--port' && process.argv[i + 1]) {
      const p = parseInt(process.argv[i + 1]!, 10);
      if (!isNaN(p) && p > 0 && p <= 65535) port = p;
    }
  }

  const gui = createGuiServer({ port });
  gui.start().then(({ port: p, host: h }) => {
    console.log(`\n  ch4p GUI running at http://${h}:${p}\n`);
  }).catch((err: unknown) => {
    console.error('Failed to start GUI server:', err);
    process.exit(1);
  });
}
