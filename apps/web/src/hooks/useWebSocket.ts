/**
 * useWebSocket — React hook for WebSocket connection to the ch4p gateway.
 *
 * Manages connection lifecycle, auto-reconnect with exponential backoff,
 * and message parsing. Incoming S2C messages are forwarded to the provided
 * handler callback.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { C2SMessage, S2CMessage } from '@ch4p/canvas';
import { decodeS2C, encodeMessage } from '@ch4p/canvas';

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

interface UseWebSocketResult {
  send: (msg: C2SMessage) => void;
  connected: boolean;
}

export function useWebSocket(
  sessionId: string,
  onMessage: (msg: S2CMessage) => void,
): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectMs = useRef(INITIAL_RECONNECT_MS);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState(false);

  // Stable ref for the onMessage callback to avoid reconnect loops
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    // Build WebSocket URL (relative to current host)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = new URLSearchParams(window.location.search).get('token');
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${host}/ws/${sessionId}${tokenParam}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectMs.current = INITIAL_RECONNECT_MS;

      // Start ping keepalive
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeMessage({ type: 'c2s:ping', timestamp: new Date().toISOString() }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = decodeS2C(event.data as string);
        onMessageRef.current(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      cleanup();
      // Reconnect with exponential backoff
      setTimeout(() => {
        reconnectMs.current = Math.min(reconnectMs.current * 2, MAX_RECONNECT_MS);
        connect();
      }, reconnectMs.current);
    };

    ws.onerror = () => {
      // Will trigger onclose
    };
  }, [sessionId]);

  const cleanup = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      cleanup();
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // Prevent reconnect on intentional close
        ws.close();
        wsRef.current = null;
      }
    };
  }, [connect, cleanup]);

  const send = useCallback((msg: C2SMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage(msg));
    }
  }, []);

  return { send, connected };
}
