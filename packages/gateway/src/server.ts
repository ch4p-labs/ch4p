/**
 * GatewayServer -- lightweight HTTP control plane.
 *
 * Exposes a minimal REST API for health checks, session listing,
 * session steering (injecting a human message mid-run), and
 * session termination. Uses the Node.js built-in `http` module
 * with zero external dependencies.
 *
 * Routes:
 *   GET    /health              - liveness probe
 *   GET    /sessions            - list active sessions
 *   POST   /sessions/:id/steer  - steer (inject message into) a session
 *   DELETE /sessions/:id        - end a session
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { SessionManager } from './session-manager.js';

export interface GatewayServerOptions {
  port: number;
  sessionManager: SessionManager;
}

export class GatewayServer {
  private server: Server | null = null;
  private readonly port: number;
  private readonly sessionManager: SessionManager;

  constructor(options: GatewayServerOptions) {
    this.port = options.port;
    this.sessionManager = options.sessionManager;
  }

  /** Start listening on the configured port. */
  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err: unknown) => {
          this.sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  /** Gracefully close the server. */
  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Request handling
  // ---------------------------------------------------------------------------

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // GET /health
    if (method === 'GET' && url === '/health') {
      this.sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // GET /sessions
    if (method === 'GET' && url === '/sessions') {
      const sessions = this.sessionManager.listSessions().map((s) => ({
        sessionId: s.config.sessionId,
        channelId: s.config.channelId,
        userId: s.config.userId,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.lastActiveAt.toISOString(),
      }));
      this.sendJson(res, 200, { sessions });
      return;
    }

    // Match /sessions/:id routes
    const sessionMatch = url.match(/^\/sessions\/([^/]+)(\/steer)?$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1]!;
      const isSteer = sessionMatch[2] === '/steer';

      // POST /sessions/:id/steer
      if (method === 'POST' && isSteer) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          this.sendJson(res, 404, { error: 'Session not found' });
          return;
        }

        const body = await this.readBody(req);
        const payload = JSON.parse(body) as { message?: string };
        if (!payload.message) {
          this.sendJson(res, 400, { error: 'Missing "message" in request body' });
          return;
        }

        this.sessionManager.touchSession(sessionId);
        this.sendJson(res, 200, {
          sessionId,
          steered: true,
          message: payload.message,
        });
        return;
      }

      // DELETE /sessions/:id
      if (method === 'DELETE' && !isSteer) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          this.sendJson(res, 404, { error: 'Session not found' });
          return;
        }
        this.sessionManager.endSession(sessionId);
        this.sendJson(res, 200, { sessionId, ended: true });
        return;
      }
    }

    // Fallback: 404
    this.sendJson(res, 404, { error: 'Not found' });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}
