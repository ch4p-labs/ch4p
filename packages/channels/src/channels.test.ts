/**
 * Channel adapter tests.
 *
 * Tests for CliChannel, TelegramChannel, DiscordChannel, SlackChannel,
 * and ChannelRegistry. Network-dependent channels are tested via mock
 * fetch() to avoid requiring real API tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CliChannel } from './cli.js';
import { TelegramChannel } from './telegram.js';
import { DiscordChannel, DiscordIntents } from './discord.js';
import { SlackChannel } from './slack.js';
import { ChannelRegistry } from './index.js';
import type {
  IChannel,
  InboundMessage,
  OutboundMessage,
  Recipient,
  PresenceEvent,
} from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock fetch that returns configurable responses. */
function createMockFetch(responses: Array<{ ok: boolean; data: unknown }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex % responses.length]!;
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.ok ? 200 : 400,
      json: async () => resp.data,
      text: async () => JSON.stringify(resp.data),
    };
  });
}

// ===========================================================================
// CliChannel
// ===========================================================================

describe('CliChannel', () => {
  it('has correct id and name', () => {
    const ch = new CliChannel();
    expect(ch.id).toBe('cli');
    expect(ch.name).toBe('CLI');
  });

  it('is unhealthy before start', async () => {
    const ch = new CliChannel();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('starts and becomes healthy', async () => {
    const ch = new CliChannel();
    await ch.start({});
    expect(await ch.isHealthy()).toBe(true);
    await ch.stop();
  });

  it('stops and becomes unhealthy', async () => {
    const ch = new CliChannel();
    await ch.start({});
    await ch.stop();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('sends text messages to stdout', async () => {
    const ch = new CliChannel();
    await ch.start({});

    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const result = await ch.send(
      { channelId: 'cli', userId: 'user1' },
      { text: 'Hello, world!' },
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(writeSpy).toHaveBeenCalledWith('Hello, world!\n');

    writeSpy.mockRestore();
    await ch.stop();
  });

  it('formats markdown output for terminal', async () => {
    const ch = new CliChannel();
    await ch.start({});

    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await ch.send(
      { channelId: 'cli' },
      { text: '# Hello\n**bold** text', format: 'markdown' },
    );

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('HELLO');
    expect(output).toContain('bold text');
    expect(output).not.toContain('**');

    writeSpy.mockRestore();
    await ch.stop();
  });

  it('strips HTML output', async () => {
    const ch = new CliChannel();
    await ch.start({});

    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await ch.send(
      { channelId: 'cli' },
      { text: '<b>Bold</b> <i>italic</i>', format: 'html' },
    );

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('Bold italic');
    expect(output).not.toContain('<b>');

    writeSpy.mockRestore();
    await ch.stop();
  });

  it('registers message handler', () => {
    const ch = new CliChannel();
    const handler = vi.fn();
    ch.onMessage(handler);
    // Handler registration doesn't throw.
  });

  it('onPresence is a no-op', () => {
    const ch = new CliChannel();
    // Should not throw.
    ch.onPresence(vi.fn());
  });

  it('handles start when already running', async () => {
    const ch = new CliChannel();
    await ch.start({});
    await ch.start({}); // Second start should be a no-op.
    expect(await ch.isHealthy()).toBe(true);
    await ch.stop();
  });

  it('handles send failure gracefully', async () => {
    const ch = new CliChannel();
    await ch.start({});

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw new Error('Write failed');
    });

    const result = await ch.send(
      { channelId: 'cli' },
      { text: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Write failed');

    writeSpy.mockRestore();
    await ch.stop();
  });
});

// ===========================================================================
// TelegramChannel
// ===========================================================================

describe('TelegramChannel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id and name', () => {
    const ch = new TelegramChannel();
    expect(ch.id).toBe('telegram');
    expect(ch.name).toBe('Telegram');
  });

  it('is unhealthy before start', async () => {
    const ch = new TelegramChannel();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('throws if no token provided', async () => {
    const ch = new TelegramChannel();
    await expect(ch.start({})).rejects.toThrow('requires a "token"');
  });

  it('starts successfully with valid token', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123, username: 'test_bot' } } }, // getMe
      { ok: true, data: { ok: true, result: true } }, // deleteWebhook
      { ok: true, data: { ok: true, result: [] } }, // first getUpdates poll
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await ch.start({ token: 'test-token-123' });

    expect(await ch.isHealthy()).toBe(true);
    // At least getMe + deleteWebhook should have been called.
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);

    await ch.stop();
  });

  it('throws if getMe fails', async () => {
    globalThis.fetch = createMockFetch([
      { ok: true, data: { ok: false, description: 'Unauthorized' } },
    ]) as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await expect(ch.start({ token: 'bad-token' })).rejects.toThrow('Telegram API error');
  });

  it('sends text messages', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } }, // getMe
      { ok: true, data: { ok: true, result: true } }, // deleteWebhook
      { ok: true, data: { ok: true, result: { message_id: 42 } } }, // sendMessage
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await ch.start({ token: 'test-token' });

    const result = await ch.send(
      { channelId: 'telegram', userId: '12345' },
      { text: 'Hello Telegram!' },
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('42');

    await ch.stop();
  });

  it('returns error when no userId in recipient', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await ch.start({ token: 'test-token' });

    const result = await ch.send(
      { channelId: 'telegram' },
      { text: 'No recipient' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('userId or groupId');

    await ch.stop();
  });

  it('processes webhook updates', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ token: 'test-token' });

    ch.handleWebhookUpdate({
      update_id: 1,
      message: {
        message_id: 100,
        from: { id: 999, first_name: 'Test', username: 'tester' },
        chat: { id: 999, type: 'private' },
        text: 'Hello from Telegram',
        date: Math.floor(Date.now() / 1000),
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Hello from Telegram');
    expect(received[0]!.from.userId).toBe('999');
    expect(received[0]!.id).toBe('100');

    await ch.stop();
  });

  it('filters messages by allowedUsers', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ token: 'test-token', allowedUsers: ['111'] });

    // Allowed user.
    ch.handleWebhookUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 111 },
        chat: { id: 111, type: 'private' },
        text: 'Allowed',
        date: Math.floor(Date.now() / 1000),
      },
    });

    // Blocked user.
    ch.handleWebhookUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 222 },
        chat: { id: 222, type: 'private' },
        text: 'Blocked',
        date: Math.floor(Date.now() / 1000),
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Allowed');

    await ch.stop();
  });

  it('handles photo attachments', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ token: 'test-token' });

    ch.handleWebhookUpdate({
      update_id: 1,
      message: {
        message_id: 50,
        from: { id: 111 },
        chat: { id: 111, type: 'private' },
        text: 'Look at this',
        date: Math.floor(Date.now() / 1000),
        photo: [
          { file_id: 'small_id', file_size: 1000 },
          { file_id: 'large_id', file_size: 5000 },
        ],
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.attachments).toHaveLength(1);
    expect(received[0]!.attachments![0]!.url).toBe('large_id'); // Uses largest.
    expect(received[0]!.attachments![0]!.type).toBe('image');

    await ch.stop();
  });

  it('handles group messages with groupId', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ token: 'test-token' });

    ch.handleWebhookUpdate({
      update_id: 1,
      message: {
        message_id: 60,
        from: { id: 111 },
        chat: { id: -100123, type: 'supergroup' },
        text: 'Group msg',
        date: Math.floor(Date.now() / 1000),
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.from.groupId).toBe('-100123');

    await ch.stop();
  });

  it('stops cleanly', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
      { ok: true, data: { ok: true, result: true } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await ch.start({ token: 'test-token' });
    await ch.stop();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('requires webhookUrl in webhook mode', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, result: { id: 123 } } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new TelegramChannel();
    await expect(ch.start({ token: 'test-token', mode: 'webhook' }))
      .rejects.toThrow('webhookUrl');
  });
});

// ===========================================================================
// DiscordChannel
// ===========================================================================

describe('DiscordChannel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id and name', () => {
    const ch = new DiscordChannel();
    expect(ch.id).toBe('discord');
    expect(ch.name).toBe('Discord');
  });

  it('is unhealthy before start', async () => {
    const ch = new DiscordChannel();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('throws if no token provided', async () => {
    const ch = new DiscordChannel();
    await expect(ch.start({})).rejects.toThrow('requires a "token"');
  });

  it('exports intent constants', () => {
    expect(DiscordIntents.GUILDS).toBe(1 << 0);
    expect(DiscordIntents.GUILD_MESSAGES).toBe(1 << 9);
    expect(DiscordIntents.MESSAGE_CONTENT).toBe(1 << 15);
    expect(DiscordIntents.DIRECT_MESSAGES).toBe(1 << 12);
  });

  it('registers message and presence handlers', () => {
    const ch = new DiscordChannel();
    const msgHandler = vi.fn();
    const presHandler = vi.fn();
    ch.onMessage(msgHandler);
    ch.onPresence(presHandler);
    // No throw.
  });

  it('send returns error without proper recipient', async () => {
    const ch = new DiscordChannel();
    // Try to send without a channel ID.
    const result = await ch.send(
      { channelId: 'discord' },
      { text: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('groupId');
  });
});

// ===========================================================================
// SlackChannel
// ===========================================================================

describe('SlackChannel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id and name', () => {
    const ch = new SlackChannel();
    expect(ch.id).toBe('slack');
    expect(ch.name).toBe('Slack');
  });

  it('is unhealthy before start', async () => {
    const ch = new SlackChannel();
    expect(await ch.isHealthy()).toBe(false);
  });

  it('throws if no botToken provided', async () => {
    const ch = new SlackChannel();
    await expect(ch.start({})).rejects.toThrow('requires a "botToken"');
  });

  it('starts in events mode without appToken', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U123', team_id: 'T456' } }, // auth.test
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await ch.start({ botToken: 'xoxb-test-token' });

    expect(await ch.isHealthy()).toBe(true);
    await ch.stop();
  });

  it('sends messages via chat.postMessage', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U123' } }, // auth.test
      { ok: true, data: { ok: true, ts: '1234567890.123456', channel: 'C01' } }, // chat.postMessage
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await ch.start({ botToken: 'xoxb-test-token' });

    const result = await ch.send(
      { channelId: 'slack', groupId: 'C01' },
      { text: 'Hello Slack!' },
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('1234567890.123456');
    await ch.stop();
  });

  it('sends threaded replies', async () => {
    const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const body = opts?.body ? JSON.parse(opts.body as string) : {};
      if ((url as string).includes('auth.test')) {
        return { ok: true, json: async () => ({ ok: true, user_id: 'U123' }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          ts: '1234567890.999',
          channel: body.channel,
        }),
      };
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await ch.start({ botToken: 'xoxb-test-token' });

    const result = await ch.send(
      { channelId: 'slack', groupId: 'C01' },
      { text: 'Thread reply', replyTo: '1234567890.123456' },
    );

    expect(result.success).toBe(true);

    // Verify thread_ts was sent.
    const postCall = mockFetch.mock.calls.find(
      (c) => (c[0] as string).includes('chat.postMessage'),
    );
    expect(postCall).toBeDefined();
    const sentBody = JSON.parse(postCall![1]!.body as string);
    expect(sentBody.thread_ts).toBe('1234567890.123456');

    await ch.stop();
  });

  it('returns error without proper recipient', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U123' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await ch.start({ botToken: 'xoxb-test-token' });

    const result = await ch.send(
      { channelId: 'slack' },
      { text: 'No target' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('groupId');
    await ch.stop();
  });

  it('handles Events API url_verification', () => {
    const ch = new SlackChannel();
    const response = ch.handleEventsPayload({
      type: 'url_verification',
      challenge: 'test-challenge-123',
    });

    expect(response.status).toBe(200);
    expect(response.body.challenge).toBe('test-challenge-123');
  });

  it('handles Events API message callback', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token' });

    const response = ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        user: 'U_USER1',
        text: 'Hello from Slack!',
        ts: '1234567890.123456',
      },
    });

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Hello from Slack!');
    expect(received[0]!.from.userId).toBe('U_USER1');
    expect(received[0]!.from.groupId).toBe('C01');

    await ch.stop();
  });

  it('ignores bot messages', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token' });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        user: 'U_BOT', // Same as bot user.
        text: 'My own message',
        ts: '1234567890.100',
      },
    });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        bot_id: 'B_OTHER',
        text: 'Another bot message',
        ts: '1234567890.200',
      },
    });

    expect(received).toHaveLength(0);
    await ch.stop();
  });

  it('filters by allowedChannels', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token', allowedChannels: ['C_ALLOWED'] });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C_ALLOWED',
        user: 'U1',
        text: 'Allowed channel',
        ts: '1.1',
      },
    });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C_BLOCKED',
        user: 'U1',
        text: 'Blocked channel',
        ts: '1.2',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Allowed channel');
    await ch.stop();
  });

  it('filters by allowedUsers', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token', allowedUsers: ['U_GOOD'] });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        user: 'U_GOOD',
        text: 'Allowed user',
        ts: '1.1',
      },
    });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        user: 'U_BAD',
        text: 'Blocked user',
        ts: '1.2',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Allowed user');
    await ch.stop();
  });

  it('handles file attachments in messages', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token' });

    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C01',
        user: 'U1',
        text: 'Here is a file',
        ts: '1.1',
        files: [
          {
            id: 'F01',
            name: 'report.pdf',
            mimetype: 'application/pdf',
            url_private: 'https://files.slack.com/files-pri/F01/report.pdf',
            size: 1024,
          },
          {
            id: 'F02',
            name: 'photo.png',
            mimetype: 'image/png',
            url_private: 'https://files.slack.com/files-pri/F02/photo.png',
            size: 2048,
          },
        ],
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.attachments).toHaveLength(2);
    expect(received[0]!.attachments![0]!.type).toBe('file');
    expect(received[0]!.attachments![0]!.filename).toBe('report.pdf');
    expect(received[0]!.attachments![1]!.type).toBe('image');
    expect(received[0]!.attachments![1]!.filename).toBe('photo.png');

    await ch.stop();
  });

  it('verifies Slack request signatures', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await ch.start({ botToken: 'xoxb-test-token', signingSecret: 'test-secret' });

    // With signing secret configured, an invalid signature should fail.
    const valid = await ch.verifySignature('body', '12345', 'v0=invalid');
    expect(valid).toBe(false);

    // Without signing secret, verification is skipped.
    const ch2 = new SlackChannel();
    await ch2.start({ botToken: 'xoxb-test-token' });
    const skipped = await ch2.verifySignature('body', '12345', 'anything');
    expect(skipped).toBe(true);

    await ch.stop();
    await ch2.stop();
  });

  it('requires appToken for socket mode', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    await expect(ch.start({ botToken: 'xoxb-test', mode: 'socket' }))
      .rejects.toThrow('appToken');
  });

  it('handles message subtypes by ignoring them', async () => {
    const mockFetch = createMockFetch([
      { ok: true, data: { ok: true, user_id: 'U_BOT' } },
    ]);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const ch = new SlackChannel();
    const received: InboundMessage[] = [];
    ch.onMessage((msg) => received.push(msg));

    await ch.start({ botToken: 'xoxb-test-token' });

    // Messages with subtypes (channel_join, etc.) should be ignored.
    ch.handleEventsPayload({
      type: 'event_callback',
      event: {
        type: 'message',
        subtype: 'channel_join',
        channel: 'C01',
        user: 'U1',
        text: 'joined the channel',
        ts: '1.1',
      },
    });

    expect(received).toHaveLength(0);
    await ch.stop();
  });
});

// ===========================================================================
// ChannelRegistry
// ===========================================================================

describe('ChannelRegistry', () => {
  it('registers and retrieves channels', () => {
    const reg = new ChannelRegistry();
    const ch = new CliChannel();
    reg.register(ch);

    expect(reg.has('cli')).toBe(true);
    expect(reg.get('cli')).toBe(ch);
  });

  it('lists all registered channels', () => {
    const reg = new ChannelRegistry();
    reg.register(new CliChannel());

    const list = reg.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('cli');
  });

  it('returns undefined for unregistered channel', () => {
    const reg = new ChannelRegistry();
    expect(reg.get('nonexistent')).toBeUndefined();
    expect(reg.has('nonexistent')).toBe(false);
  });

  it('overwrites existing channel with same id', () => {
    const reg = new ChannelRegistry();
    const ch1 = new CliChannel();
    const ch2 = new CliChannel();

    reg.register(ch1);
    reg.register(ch2);

    expect(reg.get('cli')).toBe(ch2);
    expect(reg.list()).toHaveLength(1);
  });

  it('clears all channels', () => {
    const reg = new ChannelRegistry();
    reg.register(new CliChannel());
    reg.register(new TelegramChannel());

    reg.clear();
    expect(reg.list()).toHaveLength(0);
  });

  it('createFromConfig starts a channel', async () => {
    const reg = new ChannelRegistry();
    const ch = new CliChannel();
    reg.register(ch);

    const started = await reg.createFromConfig('cli', {});
    expect(started).toBe(ch);
    expect(await ch.isHealthy()).toBe(true);
    await ch.stop();
  });

  it('createFromConfig throws for unregistered channel', async () => {
    const reg = new ChannelRegistry();
    await expect(reg.createFromConfig('missing', {}))
      .rejects.toThrow('not registered');
  });

  it('registers multiple different channel types', () => {
    const reg = new ChannelRegistry();
    reg.register(new CliChannel());
    reg.register(new TelegramChannel());
    reg.register(new DiscordChannel());
    reg.register(new SlackChannel());

    expect(reg.list()).toHaveLength(4);
    expect(reg.has('cli')).toBe(true);
    expect(reg.has('telegram')).toBe(true);
    expect(reg.has('discord')).toBe(true);
    expect(reg.has('slack')).toBe(true);
  });
});
