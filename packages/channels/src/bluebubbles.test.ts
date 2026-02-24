/**
 * BlueBubblesChannel unit tests.
 *
 * Validates BlueBubbles REST API integration, webhook event processing,
 * access control, health checks, and lifecycle methods.
 * All fetch calls are mocked — no real network traffic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlueBubblesChannel } from './bluebubbles.js';
import type { BlueBubblesConfig, BlueBubblesEvent } from './bluebubbles.js';
import type { InboundMessage } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: BlueBubblesConfig = {
  host: 'http://localhost:1234',
  password: 'test-password',
};

function serverInfoResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 200, data: { os_version: '14.0', server_version: '1.9.0' } }),
    text: async () => '',
  };
}

function sendMessageResponse(guid = 'msg-guid-123') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 200, message: 'Success', data: { guid } }),
    text: async () => '',
  };
}

function createEvent(overrides: Partial<BlueBubblesEvent['data']> = {}): BlueBubblesEvent {
  return {
    type: 'new-message',
    data: {
      guid: 'bb-msg-001',
      text: 'Hello from iMessage!',
      handle: { address: '+15551234567', id: '+15551234567' },
      chats: [{ guid: 'iMessage;-;+15551234567', chatIdentifier: '+15551234567' }],
      dateCreated: 1700000000000,
      isFromMe: false,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlueBubblesChannel', () => {
  let channel: BlueBubblesChannel;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    channel = new BlueBubblesChannel();
    fetchMock = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(async () => {
    try {
      await channel.stop();
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  // ---- Lifecycle ----

  describe('lifecycle', () => {
    it('should have correct id and name', () => {
      expect(channel.id).toBe('bluebubbles');
      expect(channel.name).toBe('BlueBubbles');
    });

    it('should require host in config', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await expect(
        channel.start({ password: 'pass' } as BlueBubblesConfig),
      ).rejects.toThrow('host');
    });

    it('should require password in config', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await expect(
        channel.start({ host: 'http://localhost:1234' } as BlueBubblesConfig),
      ).rejects.toThrow('password');
    });

    it('should start successfully when server is reachable', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      // Health check was made during start.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/server/info');
      expect(url).toContain('password=test-password');
    });

    it('should throw when server is unreachable on start', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(channel.start(baseConfig)).rejects.toThrow('Cannot connect');
    });

    it('should strip trailing slash from host', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start({ ...baseConfig, host: 'http://localhost:1234///' });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url.startsWith('http://localhost:1234/api/')).toBe(true);
    });

    it('should stop and clear state', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);
      await channel.stop();

      expect(await channel.isHealthy()).toBe(false);
    });
  });

  // ---- Health check ----

  describe('isHealthy', () => {
    it('should return false when not started', async () => {
      expect(await channel.isHealthy()).toBe(false);
    });

    it('should return true when server responds OK', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      expect(await channel.isHealthy()).toBe(true);
    });

    it('should return false when server returns non-200 status', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 500, data: null }),
        text: async () => '',
      });
      expect(await channel.isHealthy()).toBe(false);
    });
  });

  // ---- Inbound event handling ----

  describe('handleIncomingEvent', () => {
    it('should process new-message events', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent());

      expect(received).toHaveLength(1);
      expect(received[0]!.text).toBe('Hello from iMessage!');
      expect(received[0]!.from.userId).toBe('+15551234567');
      expect(received[0]!.id).toBe('bb-msg-001');
    });

    it('should skip non new-message events', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent({
        type: 'updated-message',
        data: createEvent().data,
      });

      expect(received).toHaveLength(0);
    });

    it('should skip messages from self', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ isFromMe: true }));

      expect(received).toHaveLength(0);
    });

    it('should skip messages with no text', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ text: undefined }));

      expect(received).toHaveLength(0);
    });

    it('should skip messages with no sender address', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ handle: {} }));

      expect(received).toHaveLength(0);
    });

    it('should filter by allowedAddresses', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start({ ...baseConfig, allowedAddresses: ['+15559999999'] });

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      // Not in allowed list.
      channel.handleIncomingEvent(createEvent());
      expect(received).toHaveLength(0);

      // In allowed list.
      channel.handleIncomingEvent(createEvent({
        handle: { address: '+15559999999' },
      }));
      expect(received).toHaveLength(1);
    });

    it('should set groupId for group chats', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({
        chats: [{ guid: 'chat12345', chatIdentifier: 'chat12345' }],
      }));

      expect(received[0]!.from.groupId).toBe('chat12345');
    });

    it('should not process when channel is not started', () => {
      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent());

      expect(received).toHaveLength(0);
    });
  });

  // ---- Send ----

  describe('send', () => {
    it('should return error when not started', async () => {
      const result = await channel.send(
        { channelId: 'chat-guid', userId: 'user-1' },
        { text: 'Hello' },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not started');
    });

    it('should send message via BlueBubbles API', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce(sendMessageResponse('sent-guid'));

      const result = await channel.send(
        { channelId: 'iMessage;-;+15551234567' },
        { text: 'Reply from ch4p!' },
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sent-guid');

      const sendCall = fetchMock.mock.calls[1];
      const url = sendCall[0] as string;
      expect(url).toContain('/api/v1/message/text');
      expect(url).toContain('password=test-password');

      const body = JSON.parse(sendCall[1].body);
      expect(body.chatGuid).toBe('iMessage;-;+15551234567');
      expect(body.message).toBe('Reply from ch4p!');
    });

    it('should handle API errors gracefully', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await channel.send(
        { channelId: 'chat-guid' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should handle non-200 status in response body', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 400, message: 'Bad request', error: { message: 'Chat not found' } }),
        text: async () => '',
      });

      const result = await channel.send(
        { channelId: 'bad-chat' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Chat not found');
    });

    it('should return error when no chat GUID specified', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const result = await channel.send(
        { channelId: '' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No chat GUID');
    });
  });

  // ---- onMessage ----

  describe('onMessage', () => {
    it('should replace previous handler', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const first: InboundMessage[] = [];
      const second: InboundMessage[] = [];

      channel.onMessage((msg) => first.push(msg));
      channel.onMessage((msg) => second.push(msg));

      channel.handleIncomingEvent(createEvent());

      expect(first).toHaveLength(0);
      expect(second).toHaveLength(1);
    });
  });

  // ---- Timeouts ----

  describe('timeouts', () => {
    it('should return timeout error when send exceeds API_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      // Simulate AbortError from the AbortController timeout.
      const abortErr = new DOMException('The operation was aborted', 'AbortError');
      fetchMock.mockRejectedValueOnce(abortErr);

      const result = await channel.send(
        { channelId: 'iMessage;-;+15551234567' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.error).toContain('15000');
    });

    it('should return false from isHealthy when health check times out', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      // Simulate AbortError from the health timeout.
      const abortErr = new DOMException('The operation was aborted', 'AbortError');
      fetchMock.mockRejectedValueOnce(abortErr);

      expect(await channel.isHealthy()).toBe(false);
    });

    it('should return false from isHealthy when response.ok is false', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => '',
      });

      expect(await channel.isHealthy()).toBe(false);
    });
  });

  // ---- Malformed webhook payloads ----

  describe('malformed webhook payloads', () => {
    it('should silently skip event with missing data object', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      // data is undefined.
      channel.handleIncomingEvent({ type: 'new-message', data: undefined } as unknown as BlueBubblesEvent);
      expect(received).toHaveLength(0);
    });

    it('should silently skip event with null data', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent({ type: 'new-message', data: null } as unknown as BlueBubblesEvent);
      expect(received).toHaveLength(0);
    });

    it('should skip event with empty text string', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ text: '' }));
      expect(received).toHaveLength(0);
    });

    it('should skip event with missing handle object entirely', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent({
        type: 'new-message',
        data: {
          guid: 'test-guid',
          text: 'No handle here',
          isFromMe: false,
          dateCreated: 1700000000000,
        },
      } as BlueBubblesEvent);
      expect(received).toHaveLength(0);
    });

    it('should skip when no message handler is registered', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      // Don't register a handler — handleIncomingEvent should bail silently.
      expect(() => channel.handleIncomingEvent(createEvent())).not.toThrow();
    });
  });

  // ---- Group chat identifier edge cases ----

  describe('group chat identifier parsing', () => {
    it('should not set groupId when chatIdentifier does not start with "chat"', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({
        chats: [{ guid: 'iMessage;-;+15551234567', chatIdentifier: '+15551234567' }],
      }));

      expect(received).toHaveLength(1);
      expect(received[0]!.from.groupId).toBeUndefined();
    });

    it('should set groupId when chatIdentifier is exactly "chat"', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({
        chats: [{ guid: 'chat-only-guid', chatIdentifier: 'chat' }],
      }));

      expect(received).toHaveLength(1);
      expect(received[0]!.from.groupId).toBe('chat-only-guid');
    });

    it('should use senderAddress as channelId when chats array is empty', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ chats: [] }));

      expect(received).toHaveLength(1);
      expect(received[0]!.channelId).toBe('+15551234567');
      expect(received[0]!.from.groupId).toBeUndefined();
    });

    it('should use senderAddress as channelId when chats is undefined', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ chats: undefined }));

      expect(received).toHaveLength(1);
      expect(received[0]!.channelId).toBe('+15551234567');
      expect(received[0]!.from.groupId).toBeUndefined();
    });

    it('should handle chat with undefined chatIdentifier (no groupId)', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({
        chats: [{ guid: 'some-guid', chatIdentifier: undefined }],
      }));

      expect(received).toHaveLength(1);
      expect(received[0]!.channelId).toBe('some-guid');
      expect(received[0]!.from.groupId).toBeUndefined();
    });
  });

  // ---- GUID fallback and misc edge cases ----

  describe('GUID fallback and edge cases', () => {
    it('should generate fallback ID when event guid is missing', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({ guid: undefined }));

      expect(received).toHaveLength(1);
      expect(received[0]!.id).toMatch(/^bb-\d+-[a-z0-9]+$/);
    });

    it('should fall back to handle.id when handle.address is missing', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      channel.handleIncomingEvent(createEvent({
        handle: { id: 'user@example.com' },
      }));

      expect(received).toHaveLength(1);
      expect(received[0]!.from.userId).toBe('user@example.com');
    });

    it('should use current time when dateCreated is missing', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      const before = Date.now();
      channel.handleIncomingEvent(createEvent({ dateCreated: undefined }));
      const after = Date.now();

      expect(received).toHaveLength(1);
      const ts = received[0]!.timestamp.getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('should prefer groupId over channelId for send', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce(sendMessageResponse());

      await channel.send(
        { channelId: 'fallback-guid', userId: 'u', groupId: 'group-guid' },
        { text: 'Hi group' },
      );

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.chatGuid).toBe('group-guid');
    });

    it('should include raw event in inbound message', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      const received: InboundMessage[] = [];
      channel.onMessage((msg) => received.push(msg));

      const event = createEvent();
      channel.handleIncomingEvent(event);

      expect(received[0]!.raw).toBe(event);
    });

    it('should handle send when response text() throws', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => { throw new Error('Body stream already consumed'); },
      });

      const result = await channel.send(
        { channelId: 'chat-guid' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('502');
    });

    it('should handle network error on send', async () => {
      fetchMock.mockResolvedValueOnce(serverInfoResponse());
      await channel.start(baseConfig);

      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

      const result = await channel.send(
        { channelId: 'chat-guid' },
        { text: 'Hello' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNRESET');
    });
  });
});
