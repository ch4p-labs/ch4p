/**
 * CanvasChannel — IChannel adapter for bidirectional canvas communication.
 *
 * Translates C2S (client-to-server) WebSocket messages into the standard
 * {@link InboundMessage} format expected by the agent loop, and provides
 * a `send()` method that pushes text responses back to the connected
 * WebSocket client via an injected `sendToClient` function.
 */

import type {
  IChannel,
  ChannelConfig,
  Recipient,
  OutboundMessage,
  SendResult,
  InboundMessage,
} from '@ch4p/core';
import { generateId } from '@ch4p/core';
import type { C2SMessage, S2CMessage } from './protocol.js';

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

export interface CanvasChannelConfig extends ChannelConfig {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// CanvasChannel class
// ---------------------------------------------------------------------------

export class CanvasChannel implements IChannel {
  readonly id = 'canvas';
  readonly name = 'Canvas';

  private messageHandler: ((msg: InboundMessage) => void) | null = null;
  private sendFn: ((msg: S2CMessage) => void) | null = null;
  private sessionId = '';

  // -----------------------------------------------------------------------
  // IChannel lifecycle
  // -----------------------------------------------------------------------

  async start(config: ChannelConfig): Promise<void> {
    const canvasConfig = config as CanvasChannelConfig;
    this.sessionId = canvasConfig.sessionId ?? '';
  }

  async stop(): Promise<void> {
    this.messageHandler = null;
    this.sendFn = null;
  }

  // -----------------------------------------------------------------------
  // IChannel messaging
  // -----------------------------------------------------------------------

  async send(_to: Recipient, message: OutboundMessage): Promise<SendResult> {
    if (!this.sendFn) {
      return { success: false, error: 'No WebSocket client connected.' };
    }

    this.sendFn({
      type: 's2c:text:complete',
      text: message.text,
    });

    return { success: true, messageId: generateId(12) };
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.messageHandler = handler;
  }

  async isHealthy(): Promise<boolean> {
    return this.sendFn !== null;
  }

  // -----------------------------------------------------------------------
  // Canvas-specific wiring (called by gateway / WS bridge)
  // -----------------------------------------------------------------------

  /**
   * Inject the WebSocket send function. Called by the WS bridge once the
   * WebSocket connection is established.
   */
  setSendFunction(fn: (msg: S2CMessage) => void): void {
    this.sendFn = fn;
  }

  /**
   * Process an incoming C2S message from the WebSocket client and translate
   * it into an {@link InboundMessage} that the agent loop can consume.
   */
  handleClientMessage(msg: C2SMessage): void {
    if (!this.messageHandler) return;

    const base: Omit<InboundMessage, 'text'> = {
      id: generateId(12),
      channelId: this.sessionId || 'canvas',
      from: {
        channelId: this.sessionId || 'canvas',
        userId: 'canvas-user',
      },
      timestamp: new Date(),
      raw: msg,
    };

    switch (msg.type) {
      case 'c2s:message':
        this.messageHandler({ ...base, text: msg.text });
        break;

      case 'c2s:click':
        this.messageHandler({
          ...base,
          text: `[USER_CLICK] Component: ${msg.componentId}${msg.actionId ? `, Action: ${msg.actionId}` : ''}`,
        });
        break;

      case 'c2s:input':
        this.messageHandler({
          ...base,
          text: `[USER_INPUT] Component: ${msg.componentId}${msg.field ? `, Field: ${msg.field}` : ''}, Value: ${msg.value}`,
        });
        break;

      case 'c2s:form_submit':
        this.messageHandler({
          ...base,
          text: `[FORM_SUBMIT] Component: ${msg.componentId}, Values: ${JSON.stringify(msg.values)}`,
        });
        break;

      case 'c2s:select':
        this.messageHandler({
          ...base,
          text: `[USER_SELECT] Components: ${msg.componentIds.join(', ')}`,
        });
        break;

      case 'c2s:steer':
        this.messageHandler({
          ...base,
          text: `[STEER:${msg.steerType}] ${msg.message}`,
        });
        break;

      case 'c2s:abort':
        this.messageHandler({
          ...base,
          text: `[ABORT] ${msg.reason ?? 'User requested abort'}`,
        });
        break;

      case 'c2s:drag':
        // Drag events are handled directly by CanvasState via the WS bridge,
        // not forwarded to the agent.
        break;

      case 'c2s:ping':
        // Ping/pong is handled by the WS bridge, not the channel.
        break;
    }
  }
}
