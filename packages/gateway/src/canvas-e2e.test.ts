/**
 * Canvas end-to-end integration tests.
 *
 * Starts a real GatewayServer with canvas support on an ephemeral port,
 * connects via WebSocket, and exercises the full canvas protocol:
 *   - Static file serving (index.html)
 *   - WebSocket upgrade and handshake
 *   - Initial snapshot delivery
 *   - C2S → S2C round-trip (ping/pong, messages, drag)
 *   - Agent event bridge (status, text, tool events)
 *   - Canvas state sync through WS
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { generateId } from '@ch4p/core';
import { SessionManager } from './session-manager.js';
import { GatewayServer } from './server.js';
import { CanvasSessionManager } from './canvas-session.js';
import type { S2CMessage, C2SMessage, CardComponent } from '@ch4p/canvas';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a message collector that records messages from the moment it's attached.
 * Attach BEFORE opening the WS to capture initial handshake messages.
 */
function createCollector(ws: WebSocket): {
  messages: S2CMessage[];
  waitFor: (count: number, timeoutMs?: number) => Promise<S2CMessage[]>;
} {
  const messages: S2CMessage[] = [];

  ws.on('message', (data) => {
    try {
      messages.push(JSON.parse(data.toString()) as S2CMessage);
    } catch {
      // skip
    }
  });

  return {
    messages,
    waitFor(count: number, timeoutMs = 3000): Promise<S2CMessage[]> {
      return new Promise((res) => {
        if (messages.length >= count) { res(messages.slice()); return; }
        const timer = setTimeout(() => { clearInterval(check); res(messages.slice()); }, timeoutMs);
        const check = setInterval(() => {
          if (messages.length >= count) {
            clearTimeout(timer);
            clearInterval(check);
            res(messages.slice());
          }
        }, 10);
      });
    },
  };
}

/** Collect N additional messages from a WebSocket, with timeout. */
function collectMessages(ws: WebSocket, count: number, timeoutMs = 3000): Promise<S2CMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: S2CMessage[] = [];
    const timer = setTimeout(() => {
      resolve(messages); // Resolve with what we have
    }, timeoutMs);

    const handler = (data: unknown) => {
      try {
        const msg = JSON.parse(String(data)) as S2CMessage;
        messages.push(msg);
        if (messages.length >= count) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(messages);
        }
      } catch {
        // Skip unparseable messages
      }
    };

    ws.on('message', handler);

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for WebSocket to be open. */
function waitForOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error('WS open timeout')), timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Send a C2S message over WS. */
function sendC2S(ws: WebSocket, msg: C2SMessage): void {
  ws.send(JSON.stringify(msg));
}

// ---------------------------------------------------------------------------
// Temporary static dir for tests
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpStaticDir = resolve(__dirname, '..', '__test_static__');

function setupStaticDir(): void {
  if (!existsSync(tmpStaticDir)) {
    mkdirSync(tmpStaticDir, { recursive: true });
  }
  writeFileSync(
    resolve(tmpStaticDir, 'index.html'),
    '<!DOCTYPE html><html><body><h1>Canvas Test</h1></body></html>',
  );
}

function cleanupStaticDir(): void {
  if (existsSync(tmpStaticDir)) {
    rmSync(tmpStaticDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Canvas E2E', () => {
  let server: GatewayServer;
  let sessionManager: SessionManager;
  let canvasSessionManager: CanvasSessionManager;
  let baseUrl: string;
  let wsBaseUrl: string;
  let connections: WebSocket[] = [];

  beforeEach(async () => {
    setupStaticDir();
    sessionManager = new SessionManager();
    canvasSessionManager = new CanvasSessionManager();
    connections = [];

    server = new GatewayServer({
      port: 0, // Ephemeral port
      host: '127.0.0.1',
      sessionManager,
      canvasSessionManager,
      staticDir: tmpStaticDir,
    });

    await server.start();
    const addr = server.getAddress()!;
    baseUrl = `http://${addr.host}:${addr.port}`;
    wsBaseUrl = `ws://${addr.host}:${addr.port}`;
  });

  afterEach(async () => {
    // Close all WS connections
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    connections = [];
    canvasSessionManager.endAll();
    await server.stop();
    cleanupStaticDir();
  });

  // -------------------------------------------------------------------------
  // Static file serving
  // -------------------------------------------------------------------------

  describe('static file serving', () => {
    it('serves index.html at root', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Canvas Test');
    });

    it('SPA fallback serves index.html for unknown paths', async () => {
      const res = await fetch(`${baseUrl}/nonexistent-route`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Canvas Test'); // Falls back to index.html
    });

    it('health endpoint still works alongside static', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
    });
  });

  // -------------------------------------------------------------------------
  // WebSocket connection
  // -------------------------------------------------------------------------

  describe('WebSocket connection', () => {
    it('upgrades to WebSocket on /ws/:sessionId', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);

      await waitForOpen(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('auto-creates canvas session on connect', async () => {
      const sessionId = generateId(16);
      expect(canvasSessionManager.hasSession(sessionId)).toBe(false);

      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Wait a tick for the session to be created
      await new Promise((r) => setTimeout(r, 50));
      expect(canvasSessionManager.hasSession(sessionId)).toBe(true);
    });

    it('sends initial snapshot on connect', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      // Attach collector BEFORE open to catch initial messages
      const collector = createCollector(ws);
      await waitForOpen(ws);

      const messages = await collector.waitFor(2, 2000);
      const snapshot = messages.find((m) => m.type === 's2c:canvas:snapshot');
      expect(snapshot).toBeDefined();
    });

    it('sends initial idle status on connect', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      // Attach collector BEFORE open to catch initial messages
      const collector = createCollector(ws);
      await waitForOpen(ws);

      const messages = await collector.waitFor(2, 2000);
      const status = messages.find(
        (m) => m.type === 's2c:agent:status' && (m as { status: string }).status === 'idle',
      );
      expect(status).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Ping / Pong
  // -------------------------------------------------------------------------

  describe('ping/pong keepalive', () => {
    it('responds to ping with pong', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Drain initial messages
      await collectMessages(ws, 2, 500);

      // Send ping
      sendC2S(ws, { type: 'c2s:ping', timestamp: new Date().toISOString() });

      const messages = await collectMessages(ws, 1, 2000);
      expect(messages.some((m) => m.type === 's2c:pong')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Canvas state sync
  // -------------------------------------------------------------------------

  describe('canvas state sync through WS', () => {
    it('receives add_node when state changes server-side', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Drain initial messages
      await collectMessages(ws, 2, 500);

      // Modify state server-side
      const canvasState = canvasSessionManager.getCanvasState(sessionId);
      expect(canvasState).toBeDefined();

      canvasState!.addComponent(
        { id: 'test-card', type: 'card', title: 'Hello', body: 'World' } as CardComponent,
        { x: 100, y: 200 },
      );

      const messages = await collectMessages(ws, 1, 2000);
      const change = messages.find((m) => m.type === 's2c:canvas:change');
      expect(change).toBeDefined();
      expect((change as { change: { type: string } }).change.type).toBe('add_node');
    });

    it('drag updates server state', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Add a component server-side first
      const canvasState = canvasSessionManager.getCanvasState(sessionId)!;
      canvasState.addComponent(
        { id: 'draggable', type: 'card', title: 'Drag Me', body: '' } as CardComponent,
        { x: 0, y: 0 },
      );

      // Drain messages
      await collectMessages(ws, 3, 500);

      // Send drag from client
      sendC2S(ws, {
        type: 'c2s:drag',
        componentId: 'draggable',
        position: { x: 500, y: 600 },
      });

      // Wait for server to process
      await new Promise((r) => setTimeout(r, 100));

      const node = canvasState.getNode('draggable');
      expect(node!.position.x).toBe(500);
      expect(node!.position.y).toBe(600);
    });
  });

  // -------------------------------------------------------------------------
  // Agent event bridge
  // -------------------------------------------------------------------------

  describe('agent event bridge', () => {
    it('receives agent events pushed through bridge', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Drain initial messages
      await collectMessages(ws, 2, 500);

      // Get the bridge from the session
      const entry = canvasSessionManager.getSession(sessionId);
      expect(entry).toBeDefined();
      expect(entry!.bridge).toBeDefined();

      // Push agent events through the bridge
      entry!.bridge!.handleAgentEvent({ type: 'thinking' });
      entry!.bridge!.handleAgentEvent({ type: 'text', delta: 'Hello', partial: 'Hello' });
      entry!.bridge!.handleAgentEvent({ type: 'complete', answer: 'Hello world!' });

      const messages = await collectMessages(ws, 5, 2000);

      expect(messages.some((m) =>
        m.type === 's2c:agent:status' && (m as { status: string }).status === 'thinking',
      )).toBe(true);

      expect(messages.some((m) =>
        m.type === 's2c:text:delta' && (m as { delta: string }).delta === 'Hello',
      )).toBe(true);

      expect(messages.some((m) =>
        m.type === 's2c:text:complete' && (m as { text: string }).text === 'Hello world!',
      )).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('sends error for invalid JSON', async () => {
      const sessionId = generateId(16);
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`);
      connections.push(ws);
      await waitForOpen(ws);

      // Drain initial messages
      await collectMessages(ws, 2, 500);

      // Send invalid JSON
      ws.send('this is not json{{{');

      const messages = await collectMessages(ws, 1, 2000);
      expect(messages.some((m) => m.type === 's2c:error')).toBe(true);
    });
  });
});
