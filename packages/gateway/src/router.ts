/**
 * MessageRouter -- routes inbound channel messages to sessions.
 *
 * Uses the combination of channelId + userId to locate an existing
 * session. When no session exists for the sender, one is created
 * automatically from the default session configuration.
 */

import type { InboundMessage, SessionConfig } from '@ch4p/core';
import { generateId } from '@ch4p/core';
import type { SessionManager } from './session-manager.js';

export interface RouteResult {
  sessionId: string;
  config: SessionConfig;
}

export class MessageRouter {
  /**
   * Maps "channelId:userId" keys to session ids so subsequent messages
   * from the same user on the same channel reach the same session.
   */
  private routeMap = new Map<string, string>();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly defaultSessionConfig: Omit<SessionConfig, 'sessionId' | 'channelId' | 'userId'>,
  ) {}

  /**
   * Route an inbound message to a session.
   *
   * If a session already exists for the channel+user pair it is returned.
   * Otherwise a new session is created from the default config.
   *
   * Returns `null` only if the message cannot be attributed to a user
   * (missing channelId).
   */
  route(msg: InboundMessage): RouteResult | null {
    if (!msg.channelId) return null;

    const routeKey = this.buildRouteKey(msg.channelId, msg.from.userId);

    // Check for an existing session
    const existingId = this.routeMap.get(routeKey);
    if (existingId) {
      const session = this.sessionManager.getSession(existingId);
      if (session) {
        this.sessionManager.touchSession(existingId);
        return { sessionId: existingId, config: session.config };
      }
      // Session was ended externally -- clean up stale route
      this.routeMap.delete(routeKey);
    }

    // Create a new session
    const sessionId = generateId();
    const config: SessionConfig = {
      ...this.defaultSessionConfig,
      sessionId,
      channelId: msg.channelId,
      userId: msg.from.userId,
    };

    const state = this.sessionManager.createSession(config);
    this.routeMap.set(routeKey, sessionId);

    return { sessionId, config: state.config };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildRouteKey(channelId: string, userId?: string): string {
    return `${channelId}:${userId ?? 'anonymous'}`;
  }
}
