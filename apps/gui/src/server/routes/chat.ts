/**
 * POST /api/chat — send a message and get a response.
 *
 * Proxies to the gateway's session API if running, otherwise returns
 * a helpful message explaining the gateway needs to be started.
 */

import { loadConfig, configExists } from '../config.js';

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  error?: string;
}

/**
 * Attempt to send a message through the gateway.
 * The gateway exposes POST /sessions (create) and POST /sessions/:id/steer.
 */
export async function handleChat(payload: ChatRequest): Promise<ChatResponse> {
  if (!configExists()) {
    return {
      reply: 'No configuration found. Run the Setup Wizard first to configure ch4p.',
      sessionId: '',
      error: 'no_config',
    };
  }

  const config = loadConfig();
  const port = config.gateway?.port ?? 18789;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Check if gateway is reachable
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!healthRes.ok) {
      return {
        reply: `Gateway returned status ${healthRes.status}. Make sure \`ch4p gateway\` is running.`,
        sessionId: '',
        error: 'gateway_error',
      };
    }

    // Create or reuse session
    let sessionId = payload.sessionId;

    if (!sessionId) {
      const createRes = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'gui' }),
      });
      if (!createRes.ok) {
        return {
          reply: 'Failed to create gateway session.',
          sessionId: '',
          error: 'session_create_failed',
        };
      }
      const session = await createRes.json() as { id: string };
      sessionId = session.id;
    }

    // Send message via steer endpoint
    const steerRes = await fetch(`${baseUrl}/sessions/${sessionId}/steer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: payload.message }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout for long responses
    });

    if (!steerRes.ok) {
      const errBody = await steerRes.text().catch(() => '');
      return {
        reply: `Gateway error (${steerRes.status}): ${errBody || 'Unknown error'}`,
        sessionId: sessionId!,
        error: 'steer_failed',
      };
    }

    const result = await steerRes.json() as { reply?: string; text?: string };
    return {
      reply: result.reply ?? result.text ?? '',
      sessionId: sessionId!,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Connection refused = gateway not running
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        reply: `Gateway is not running on port ${port}. Start it with \`ch4p gateway\` or \`ch4p start\`, then try again.`,
        sessionId: '',
        error: 'gateway_offline',
      };
    }

    if (message.includes('TimeoutError') || message.includes('timed out')) {
      return {
        reply: 'Request timed out. The agent may be processing a complex task.',
        sessionId: payload.sessionId ?? '',
        error: 'timeout',
      };
    }

    return {
      reply: `Error: ${message}`,
      sessionId: payload.sessionId ?? '',
      error: 'unknown',
    };
  }
}
