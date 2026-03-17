import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChat } from './chat.js';

vi.mock('../config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
}));

import { configExists, loadConfig } from '../config.js';

const mockConfigExists = vi.mocked(configExists);
const mockLoadConfig = vi.mocked(loadConfig);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('handleChat', () => {
  it('returns error when no config exists', async () => {
    mockConfigExists.mockReturnValue(false);
    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('no_config');
    expect(result.reply).toContain('Setup Wizard');
    expect(result.sessionId).toBe('');
  });

  it('returns gateway_offline when gateway is not running', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789 },
    } as unknown as ReturnType<typeof loadConfig>);

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('gateway_offline');
    expect(result.reply).toContain('not running');
    expect(result.reply).toContain('18789');
  });

  it('returns gateway_error when health check fails', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789 },
    } as unknown as ReturnType<typeof loadConfig>);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 503 }),
    );

    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('gateway_error');
    expect(result.reply).toContain('503');
  });

  it('creates session and sends message on success', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789 },
    } as unknown as ReturnType<typeof loadConfig>);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (String(url).includes('/health')) {
        return new Response('ok', { status: 200 });
      }
      if (String(url).includes('/sessions') && !String(url).includes('/steer')) {
        return new Response(JSON.stringify({ id: 'sess-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).includes('/steer')) {
        return new Response(JSON.stringify({ reply: 'Hello! I am ch4p.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });

    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBeUndefined();
    expect(result.reply).toBe('Hello! I am ch4p.');
    expect(result.sessionId).toBe('sess-123');
    expect(callCount).toBe(3); // health + create session + steer
  });

  it('reuses existing session ID', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789 },
    } as unknown as ReturnType<typeof loadConfig>);

    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('/health')) {
        return new Response('ok', { status: 200 });
      }
      if (String(url).includes('/steer')) {
        return new Response(JSON.stringify({ reply: 'response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });

    const result = await handleChat({ message: 'hello', sessionId: 'existing-sess' });
    expect(result.sessionId).toBe('existing-sess');
    // Should NOT create a new session
    expect(calls.some(c => c.includes('/sessions') && !c.includes('/steer'))).toBe(false);
  });

  it('uses configured gateway port', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 9999 },
    } as unknown as ReturnType<typeof loadConfig>);

    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(String(url));
      return new Response('', { status: 503 });
    });

    await handleChat({ message: 'test' });
    expect(calls[0]).toContain('127.0.0.1:9999');
  });

  it('handles steer failure', async () => {
    mockConfigExists.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      gateway: { port: 18789 },
    } as unknown as ReturnType<typeof loadConfig>);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/health')) {
        return new Response('ok', { status: 200 });
      }
      if (String(url).includes('/sessions') && !String(url).includes('/steer')) {
        return new Response(JSON.stringify({ id: 'sess-456' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).includes('/steer')) {
        return new Response('Internal error', { status: 500 });
      }
      return new Response('', { status: 404 });
    });

    const result = await handleChat({ message: 'hello' });
    expect(result.error).toBe('steer_failed');
    expect(result.sessionId).toBe('sess-456');
  });
});
