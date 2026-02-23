import { describe, it, expect, vi } from 'vitest';
import { X402PayTool } from './x402-pay-tool.js';
import type { X402ToolContext } from './x402-pay-tool.js';
import type { X402Response, X402PaymentAuthorization } from './types.js';
import type { ToolContext } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

function makeContext(overrides: Partial<X402ToolContext> = {}): ToolContext {
  return {
    sessionId: 'test-session',
    cwd: '/tmp',
    securityPolicy: {} as ToolContext['securityPolicy'],
    abortSignal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
  } as unknown as ToolContext;
}

function makeX402Response(overrides: Partial<X402Response> = {}): string {
  const response: X402Response = {
    x402Version: 1,
    error: 'X402',
    accepts: [
      {
        scheme: 'exact',
        network: 'base',
        maxAmountRequired: '1000000',
        resource: '/sessions',
        description: 'Test payment',
        mimeType: 'application/json',
        payTo: RECIPIENT,
        maxTimeoutSeconds: 300,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        extra: {},
      },
    ],
    ...overrides,
  };
  return JSON.stringify(response);
}

const tool = new X402PayTool();

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe('X402PayTool.validate', () => {
  it('passes with url + x402_response', () => {
    const r = tool.validate({ url: 'https://example.com/sessions', x402_response: '{}' });
    expect(r.valid).toBe(true);
  });

  it('passes with all fields', () => {
    const r = tool.validate({
      url: 'https://example.com/sessions',
      x402_response: '{}',
      wallet_address: WALLET,
    });
    expect(r.valid).toBe(true);
  });

  it('fails when url is missing', () => {
    const r = tool.validate({ x402_response: '{}' });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('url must be a non-empty string.');
  });

  it('fails when x402_response is missing', () => {
    const r = tool.validate({ url: 'https://example.com' });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('x402_response must be a non-empty string.');
  });

  it('fails on invalid wallet_address format', () => {
    const r = tool.validate({
      url: 'https://example.com',
      x402_response: '{}',
      wallet_address: 'not-an-address',
    });
    expect(r.valid).toBe(false);
    expect(r.errors?.some((e) => e.includes('wallet_address'))).toBe(true);
  });

  it('fails when args is not an object', () => {
    const r = tool.validate('string');
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// execute — error cases
// ---------------------------------------------------------------------------

describe('X402PayTool.execute — error cases', () => {
  it('returns error when args are invalid', async () => {
    const result = await tool.execute({}, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error when x402_response is not valid JSON', async () => {
    const result = await tool.execute(
      { url: 'https://example.com/sessions', x402_response: 'not json', wallet_address: WALLET },
      makeContext(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not valid JSON');
  });

  it('returns error when accepts array is empty', async () => {
    const result = await tool.execute(
      {
        url: 'https://example.com/sessions',
        x402_response: JSON.stringify({ x402Version: 1, error: 'X402', accepts: [] }),
        wallet_address: WALLET,
      },
      makeContext(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('no payment requirements');
  });

  it('returns error when no wallet address is available', async () => {
    const result = await tool.execute(
      {
        url: 'https://example.com/sessions',
        x402_response: makeX402Response(),
        // no wallet_address in args or context
      },
      makeContext(), // no agentWalletAddress in context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('No wallet address');
  });

  it('returns error when signer throws', async () => {
    const context = makeContext({
      agentWalletAddress: WALLET,
      x402Signer: async () => {
        throw new Error('key vault unavailable');
      },
    } as Partial<X402ToolContext>);
    const result = await tool.execute(
      { url: 'https://example.com/sessions', x402_response: makeX402Response() },
      context,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Signing failed');
    expect(result.error).toContain('key vault unavailable');
  });
});

// ---------------------------------------------------------------------------
// execute — success cases
// ---------------------------------------------------------------------------

describe('X402PayTool.execute — success cases', () => {
  it('builds payment header with explicit wallet_address (placeholder sig)', async () => {
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: makeX402Response(),
        wallet_address: WALLET,
      },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('X-PAYMENT header value');
    expect(result.metadata?.unsigned).toBe(true);
    expect(result.metadata?.payTo).toBe(RECIPIENT);
    expect(result.metadata?.amount).toBe('1000000');
    expect(result.metadata?.network).toBe('base');
  });

  it('uses agentWalletAddress from context when no explicit address', async () => {
    const context = makeContext({ agentWalletAddress: WALLET } as Partial<X402ToolContext>);
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: makeX402Response(),
      },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain(WALLET);
  });

  it('uses x402Signer when provided (no placeholder)', async () => {
    const signer = vi.fn<[X402PaymentAuthorization], Promise<string>>()
      .mockResolvedValue('0xdeadbeef');
    const context = makeContext({
      agentWalletAddress: WALLET,
      x402Signer: signer,
    } as Partial<X402ToolContext>);
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: makeX402Response(),
      },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.unsigned).toBe(false);
    expect(signer).toHaveBeenCalledOnce();
    // Decode the header and check the signature.
    const headerValue = result.metadata?.headerValue as string;
    const decoded = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf-8'));
    expect(decoded.payload.signature).toBe('0xdeadbeef');
  });

  it('produces a valid base64-encoded X402PaymentPayload', async () => {
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: makeX402Response(),
        wallet_address: WALLET,
      },
      makeContext(),
    );
    const headerValue = result.metadata?.headerValue as string;
    const decoded = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf-8'));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('base');
    expect(decoded.payload.authorization.from).toBe(WALLET);
    expect(decoded.payload.authorization.to).toBe(RECIPIENT);
    expect(decoded.payload.authorization.value).toBe('1000000');
    expect(decoded.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('prefers Base network requirement over others', async () => {
    const response: X402Response = {
      x402Version: 1,
      error: 'X402',
      accepts: [
        {
          scheme: 'exact',
          network: 'ethereum',
          maxAmountRequired: '2000000000000000',
          resource: '/sessions',
          description: 'ETH payment',
          mimeType: 'application/json',
          payTo: RECIPIENT,
          maxTimeoutSeconds: 60,
          asset: '0x0',
          extra: {},
        },
        {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: '1000000',
          resource: '/sessions',
          description: 'USDC on Base',
          mimeType: 'application/json',
          payTo: RECIPIENT,
          maxTimeoutSeconds: 300,
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          extra: {},
        },
      ],
    };
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: JSON.stringify(response),
        wallet_address: WALLET,
      },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.network).toBe('base');
    expect(result.metadata?.amount).toBe('1000000');
  });

  it('outputs a warning when signature is unsigned', async () => {
    const result = await tool.execute(
      {
        url: 'https://gateway.example.com/sessions',
        x402_response: makeX402Response(),
        wallet_address: WALLET,
      },
      makeContext(),
    );
    expect(result.output).toContain('WARNING');
    expect(result.output).toContain('Placeholder signature');
  });

  it('does not output a warning when signed', async () => {
    const context = makeContext({
      agentWalletAddress: WALLET,
      x402Signer: async () => '0xsig',
    } as Partial<X402ToolContext>);
    const result = await tool.execute(
      { url: 'https://example.com/sessions', x402_response: makeX402Response() },
      context,
    );
    expect(result.output).not.toContain('WARNING');
  });
});

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

describe('X402PayTool metadata', () => {
  it('has correct name and weight', () => {
    expect(tool.name).toBe('x402_pay');
    expect(tool.weight).toBe('lightweight');
  });

  it('has required fields in parameters schema', () => {
    const schema = tool.parameters;
    expect(schema.required).toContain('url');
    expect(schema.required).toContain('x402_response');
    expect(schema.required).not.toContain('wallet_address');
  });
});
