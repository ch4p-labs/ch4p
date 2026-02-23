/**
 * Tests for WebFetchTool — x402 auto-payment handling.
 *
 * Kept in a separate file so the SSRF guard mocks here don't interfere
 * with the DNS-resolution tests in web-fetch.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolContext } from '@ch4p/core';

// Mock SSRF guards before importing WebFetchTool so all tests use the mocked version.
vi.mock('./ssrf-guards.js', () => ({
  isBlockedHostname: vi.fn().mockReturnValue(false),
  resolveAndCheckPrivate: vi.fn().mockResolvedValue({ blocked: false }),
}));

import { WebFetchTool } from './web-fetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: 'x402-test',
    cwd: '/tmp/ch4p-x402-test',
    securityPolicy: {
      validatePath: vi.fn().mockReturnValue({ allowed: true, canonicalPath: undefined }),
      validateCommand: vi.fn().mockReturnValue({ allowed: true }),
      autonomyLevel: 'full' as const,
      requiresConfirmation: vi.fn().mockReturnValue(false),
      audit: vi.fn().mockReturnValue([]),
      sanitizeOutput: vi.fn().mockImplementation((text: string) => ({
        clean: text,
        redacted: false,
      })),
    },
    abortSignal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
  };
}

function make402Body(opts: {
  scheme?: string;
  network?: string;
  payTo?: string;
  maxAmountRequired?: string;
  maxTimeoutSeconds?: number;
} = {}) {
  return JSON.stringify({
    x402Version: 1,
    error: 'X402',
    accepts: [
      {
        scheme:               opts.scheme               ?? 'exact',
        network:              opts.network              ?? 'base',
        maxAmountRequired:    opts.maxAmountRequired    ?? '1000000',
        resource:             '/api/data',
        description:          'Access fee',
        mimeType:             'application/json',
        payTo:                opts.payTo                ?? '0xRecipient0000000000000000000000000000001',
        maxTimeoutSeconds:    opts.maxTimeoutSeconds    ?? 300,
        asset:                '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        extra:                {},
      },
    ],
  });
}

function makeResponse(status: number, body: string, statusText = ''): Response {
  let parsed: unknown = null;
  try { parsed = JSON.parse(body); } catch { /* not JSON */ }
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue(parsed),
  } as unknown as Response;
}

// ===========================================================================
// x402 auto-payment
// ===========================================================================

describe('WebFetchTool — x402 auto-payment', () => {
  let tool: WebFetchTool;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tool = new WebFetchTool();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------

  it('returns x402Required when no signer is configured', async () => {
    // Arrange: fetch returns 402, no signer on context.
    globalThis.fetch = vi.fn().mockResolvedValueOnce(makeResponse(402, make402Body()));

    const ctx = makeContext(); // no x402Signer, no agentWalletAddress

    // Act
    const result = await tool.execute({ url: 'https://example.com/api' }, ctx);

    // Assert
    expect(result.success).toBe(false);
    expect(result.metadata?.x402Required).toBe(true);
    expect(result.error).toContain('x402.client.privateKey');
  });

  // -------------------------------------------------------------------------

  it('signs, retries with X-PAYMENT header, and returns success on 200', async () => {
    // Arrange: first call → 402, second call → 200 with content.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(402, make402Body()))
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: vi.fn().mockResolvedValue('Secret data'),
      } as unknown as Response);
    globalThis.fetch = mockFetch;

    const mockSigner = vi.fn().mockResolvedValue('0xdeadbeef_signature');
    const ctx = makeContext({
      x402Signer:         mockSigner,
      agentWalletAddress: '0xPayerWallet0000000000000000000000000001',
    });

    // Act
    const result = await tool.execute({ url: 'https://example.com/api' }, ctx);

    // Assert: success
    expect(result.success).toBe(true);
    expect(result.output).toContain('Secret data');

    // The signer was called with the correct payer and recipient.
    expect(mockSigner).toHaveBeenCalledOnce();
    const authArg = mockSigner.mock.calls[0][0] as Record<string, string>;
    expect(authArg.from).toBe('0xPayerWallet0000000000000000000000000001');
    expect(authArg.to).toBe('0xRecipient0000000000000000000000000000001');
    expect(authArg.value).toBe('1000000');
    expect(authArg.nonce).toMatch(/^0x[0-9a-f]{64}$/);

    // Second fetch call included the X-PAYMENT header.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, retryOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    const headers = retryOptions.headers as Record<string, string>;
    expect(headers['X-PAYMENT']).toBeDefined();
    // Value is valid base64-encoded JSON.
    const decoded = JSON.parse(Buffer.from(headers['X-PAYMENT'], 'base64').toString());
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('base');
    expect(decoded.payload.signature).toBe('0xdeadbeef_signature');

    // Progress callback was called.
    expect(ctx.onProgress).toHaveBeenCalledWith(expect.stringContaining('x402'));
  });

  // -------------------------------------------------------------------------

  it('returns failure with x402Paid metadata when retry itself fails', async () => {
    // Arrange: 402 → 403 (access denied even after payment).
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(402, make402Body()))
      .mockResolvedValueOnce(makeResponse(403, '{"error":"Forbidden"}', 'Forbidden'));

    const ctx = makeContext({
      x402Signer:         vi.fn().mockResolvedValue('0xsig'),
      agentWalletAddress: '0xPayer0000000000000000000000000000000001',
    });

    const result = await tool.execute({ url: 'https://example.com/api' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
    expect(result.metadata?.x402Paid).toBe(true);
  });

  // -------------------------------------------------------------------------

  it('returns parse error when 402 body is not valid JSON', async () => {
    // Arrange: 402 with non-JSON body.
    globalThis.fetch = vi.fn().mockResolvedValueOnce(makeResponse(402, 'not-json'));

    const ctx = makeContext({
      x402Signer:         vi.fn().mockResolvedValue('0xsig'),
      agentWalletAddress: '0xPayer0000000000000000000000000000000001',
    });

    const result = await tool.execute({ url: 'https://example.com/api' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('parse');
  });

  // -------------------------------------------------------------------------

  it('returns signer error when signing throws', async () => {
    // Arrange: 402 with valid body, signer rejects.
    globalThis.fetch = vi.fn().mockResolvedValueOnce(makeResponse(402, make402Body()));

    const ctx = makeContext({
      x402Signer: vi.fn().mockRejectedValue(new Error('Hardware wallet disconnected')),
      agentWalletAddress: '0xPayer0000000000000000000000000000000001',
    });

    const result = await tool.execute({ url: 'https://example.com/api' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Hardware wallet disconnected');
  });
});
