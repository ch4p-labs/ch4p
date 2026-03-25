/**
 * WebFetch tool — fetches URL content with HTML-to-text conversion.
 *
 * Heavyweight tool that retrieves web content via HTTP(S). Performs basic
 * HTML-to-text conversion (strip tags, decode entities). Supports timeout
 * and response size limits.
 *
 * Security: SSRF guards block requests to private/reserved IP ranges,
 * cloud metadata endpoints, and localhost. DNS resolution is validated
 * before connecting. Redirects are followed manually with SSRF checks
 * at each hop.
 */

import { randomBytes } from 'node:crypto';

import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
import { isBlockedHostname, resolveAndCheckPrivate } from './ssrf-guards.js';

// ---------------------------------------------------------------------------
// Local types for x402 payment handling (no dep on @ch4p/plugin-x402)
// ---------------------------------------------------------------------------

interface X402Req {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
}

interface X402Body {
  x402Version: number;
  error: string;
  accepts: X402Req[];
}

interface X402PayPayload {
  x402Version: 1;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string; to: string; value: string;
      validAfter: string; validBefore: string; nonce: string;
    };
  };
}

// ---------------------------------------------------------------------------

interface WebFetchArgs {
  url: string;
  prompt?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_OUTPUT_LENGTH = 50_000;
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// WebFetchTool
// ---------------------------------------------------------------------------

export class WebFetchTool implements ITool {
  readonly name = 'web_fetch';
  readonly description =
    'Fetch content from a URL. HTML is converted to plain text. ' +
    'Supports HTTP and HTTPS. An optional prompt can describe what ' +
    'information to focus on in the response.';

  readonly weight = 'heavyweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from. Must be a valid HTTP or HTTPS URL.',
        format: 'uri',
        minLength: 1,
      },
      prompt: {
        type: 'string',
        description:
          'Optional prompt describing what information to extract from the page.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  };

  private abortController: AbortController | null = null;

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { url, prompt } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof url !== 'string' || url.trim().length === 0) {
      errors.push('url must be a non-empty string.');
    }

    if (typeof url === 'string') {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.push('url must use http or https protocol.');
        }

        // Synchronous SSRF check on the hostname.
        if (isBlockedHostname(parsed.hostname)) {
          errors.push('url targets a blocked or private network address.');
        }
      } catch {
        errors.push('url must be a valid URL.');
      }
    }

    if (prompt !== undefined && typeof prompt !== 'string') {
      errors.push('prompt must be a string.');
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const validation = this.validate(args);
    if (!validation.valid) {
      return {
        success: false,
        output: '',
        error: `Invalid arguments: ${validation.errors!.join(' ')}`,
      };
    }

    const { url, prompt } = args as WebFetchArgs;

    // Upgrade http to https
    let fetchUrl = url.replace(/^http:\/\//, 'https://');

    if (context.abortSignal.aborted) {
      return {
        success: false,
        output: '',
        error: 'Request aborted before execution.',
      };
    }

    // Async SSRF check: resolve DNS and verify the resolved IPs are not private.
    try {
      const parsed = new URL(fetchUrl);
      const dnsCheck = await resolveAndCheckPrivate(parsed.hostname);
      if (dnsCheck.blocked) {
        return {
          success: false,
          output: '',
          error: `SSRF blocked: ${dnsCheck.reason}`,
          metadata: { url: fetchUrl, ssrfBlocked: true },
        };
      }
    } catch {
      return {
        success: false,
        output: '',
        error: 'Failed to parse URL for SSRF check.',
        metadata: { url: fetchUrl },
      };
    }

    // Create our own abort controller that chains with the context signal
    this.abortController = new AbortController();
    const onContextAbort = () => this.abortController?.abort();
    context.abortSignal.addEventListener('abort', onContextAbort, { once: true });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, DEFAULT_TIMEOUT_MS);

    try {
      context.onProgress(`Fetching ${fetchUrl}...`);

      // Manual redirect following with SSRF validation at each hop.
      let response: Response | null = null;
      let redirectCount = 0;

      while (redirectCount <= MAX_REDIRECTS) {
        response = await fetch(fetchUrl, {
          signal: this.abortController.signal,
          headers: {
            'User-Agent': 'ch4p/0.1.0',
            Accept: 'text/html, application/json, text/plain, */*',
          },
          redirect: 'manual', // We follow redirects ourselves for SSRF safety.
        });

        // Check for redirect responses.
        const status = response.status;
        if (status >= 300 && status < 400) {
          const location = response.headers.get('location');
          if (!location) break; // No location header — stop following.

          // Resolve relative URLs against the current URL.
          const redirectUrl = new URL(location, fetchUrl).toString();
          const redirectParsed = new URL(redirectUrl);

          // SSRF check on each redirect target.
          if (isBlockedHostname(redirectParsed.hostname)) {
            return {
              success: false,
              output: '',
              error: `SSRF blocked: redirect to private/blocked address ${redirectParsed.hostname}`,
              metadata: { url: fetchUrl, redirectUrl, ssrfBlocked: true },
            };
          }

          const redirectDns = await resolveAndCheckPrivate(redirectParsed.hostname);
          if (redirectDns.blocked) {
            return {
              success: false,
              output: '',
              error: `SSRF blocked on redirect: ${redirectDns.reason}`,
              metadata: { url: fetchUrl, redirectUrl, ssrfBlocked: true },
            };
          }

          fetchUrl = redirectUrl;
          redirectCount++;
          continue;
        }

        break; // Not a redirect — we have our final response.
      }

      if (!response) {
        return {
          success: false,
          output: '',
          error: 'Failed to obtain a response.',
          metadata: { url: fetchUrl },
        };
      }

      if (redirectCount > MAX_REDIRECTS) {
        return {
          success: false,
          output: '',
          error: `Too many redirects (${MAX_REDIRECTS} max).`,
          metadata: { url: fetchUrl, redirectCount },
        };
      }

      // --- x402 auto-payment ---
      if (response.status === 402) {
        const payResult = await this.tryX402Payment(response, context);
        if (!payResult.headerValue) {
          return {
            success: false,
            output: '',
            error:
              payResult.error ??
              'Payment required (x402). Configure x402.client.privateKey to enable auto-payment.',
            metadata: { url: fetchUrl, status: 402, x402Required: true },
          };
        }
        // Single retry with payment header — no recursive 402 loop.
        // Use redirect: 'manual' to prevent SSRF bypass via post-payment redirect.
        context.onProgress('Paying x402 fee and retrying...');
        const retryResponse = await fetch(fetchUrl, {
          signal: this.abortController!.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'ch4p/0.1.0',
            Accept: 'text/html, application/json, text/plain, */*',
            'X-PAYMENT': payResult.headerValue,
          },
        });
        // Reject redirect responses on the post-payment retry — the server
        // should return the paid content directly. Following redirects here
        // would bypass SSRF checks on the redirect target.
        if (retryResponse.status >= 300 && retryResponse.status < 400) {
          return {
            success: false,
            output: '',
            error: `Unexpected redirect (${retryResponse.status}) after x402 payment. Blocked for SSRF safety.`,
            metadata: { url: fetchUrl, status: retryResponse.status, x402Paid: true },
          };
        }
        if (!retryResponse.ok) {
          return {
            success: false,
            output: '',
            error: `HTTP ${retryResponse.status} after x402 payment: ${retryResponse.statusText}`,
            metadata: { url: fetchUrl, status: retryResponse.status, x402Paid: true },
          };
        }
        response = retryResponse;
      }
      // --- end x402 ---

      if (!response.ok) {
        return {
          success: false,
          output: '',
          error: `HTTP ${response.status}: ${response.statusText}`,
          metadata: {
            url: fetchUrl,
            status: response.status,
            statusText: response.statusText,
          },
        };
      }

      // Check content length before reading body
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          output: '',
          error: `Response too large: ${contentLength} bytes (limit: ${MAX_RESPONSE_SIZE}).`,
          metadata: { url: fetchUrl, contentLength: parseInt(contentLength, 10) },
        };
      }

      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.text();

      if (body.length > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          output: '',
          error: `Response body too large: ${body.length} bytes (limit: ${MAX_RESPONSE_SIZE}).`,
          metadata: { url: fetchUrl, size: body.length },
        };
      }

      let textContent: string;

      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        textContent = htmlToText(body);
      } else if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(body);
          textContent = JSON.stringify(json, null, 2);
        } catch {
          textContent = body;
        }
      } else {
        textContent = body;
      }

      // Truncate output if necessary
      if (textContent.length > MAX_OUTPUT_LENGTH) {
        textContent =
          textContent.slice(0, MAX_OUTPUT_LENGTH) +
          '\n\n... [content truncated] ...';
      }

      let output = textContent;
      if (prompt) {
        output = `[Prompt: ${prompt}]\n\n${textContent}`;
      }

      return {
        success: true,
        output,
        metadata: {
          url: fetchUrl,
          status: response.status,
          contentType,
          size: body.length,
          truncated: textContent.length > MAX_OUTPUT_LENGTH,
        },
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (context.abortSignal.aborted) {
          return {
            success: false,
            output: '',
            error: 'Request was aborted.',
          };
        }
        return {
          success: false,
          output: '',
          error: `Request timed out after ${DEFAULT_TIMEOUT_MS}ms.`,
          metadata: { url: fetchUrl, timedOut: true },
        };
      }

      return {
        success: false,
        output: '',
        error: `Fetch failed: ${(err as Error).message}`,
        metadata: { url: fetchUrl },
      };
    } finally {
      clearTimeout(timeoutId);
      context.abortSignal.removeEventListener('abort', onContextAbort);
      this.abortController = null;
    }
  }

  abort(_reason: string): void {
    this.abortController?.abort();
  }

  /**
   * Attempt an x402 auto-payment for a 402 response.
   *
   * Parses the 402 body, builds an EIP-3009 authorization struct, signs it
   * using context.x402Signer, and returns the base64-encoded X-PAYMENT header
   * value. Returns an error string if payment is not possible.
   */
  private async tryX402Payment(
    response: Response,
    context: ToolContext,
  ): Promise<{ headerValue?: string; error?: string }> {
    if (!context.x402Signer || !context.agentWalletAddress) {
      return {
        error:
          'No x402 signer configured. Set x402.client.privateKey to enable auto-payment.',
      };
    }

    let body: X402Body;
    try {
      const text = await response.text();
      body = JSON.parse(text) as X402Body;
    } catch {
      return { error: 'Could not parse x402 payment requirements from 402 response body.' };
    }

    // Prefer "exact" scheme; fall back to first entry.
    const req = body.accepts?.find((r) => r.scheme === 'exact') ?? body.accepts?.[0];
    if (!req) {
      return { error: 'No acceptable payment scheme found in 402 response.' };
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const authorization = {
      from:        context.agentWalletAddress,
      to:          req.payTo,
      value:       req.maxAmountRequired,
      validAfter:  '0',
      validBefore: String(nowSecs + req.maxTimeoutSeconds),
      nonce:       '0x' + randomBytes(32).toString('hex'),
    };

    let signature: string;
    try {
      signature = await context.x402Signer(authorization);
    } catch (err) {
      return { error: `x402 signing failed: ${(err as Error).message}` };
    }

    const payload: X402PayPayload = {
      x402Version: 1,
      scheme:      req.scheme,
      network:     req.network,
      payload:     { signature, authorization },
    };

    return { headerValue: Buffer.from(JSON.stringify(payload)).toString('base64') };
  }
}

/** Block-level elements whose boundaries should insert a newline. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'blockquote', 'pre',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'figure', 'figcaption',
]);

/** Tags whose entire content (open → close) should be dropped. */
const VOID_TAGS = new Set(['script', 'style', 'noscript']);

/**
 * Strip HTML tags using a single-pass character scanner.
 * Drops script/style/noscript blocks entirely, inserts newlines at block
 * element boundaries, removes comments, and passes through text content.
 *
 * No regex is used — this is immune to ReDoS, bad-tag-filter, and
 * incomplete-multi-character-sanitization issues.
 */
function stripHtmlTags(html: string): string {
  const out: string[] = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    // HTML comment: <!-- ... -->
    if (html[i] === '<' && html.startsWith('!--', i + 1)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }

    // Start of a tag
    if (html[i] === '<') {
      // Find the end of the tag
      const gt = html.indexOf('>', i + 1);
      if (gt === -1) { i++; continue; } // malformed — skip the <

      // Extract tag name (skip optional /)
      let nameStart = i + 1;
      const isClosing = html[nameStart] === '/';
      if (isClosing) nameStart++;
      let nameEnd = nameStart;
      while (nameEnd < gt && /[a-zA-Z0-9]/.test(html[nameEnd]!)) nameEnd++;
      const tagName = html.slice(nameStart, nameEnd).toLowerCase();

      // Void tags: skip everything until closing tag
      if (!isClosing && VOID_TAGS.has(tagName)) {
        const closePattern = `</${tagName}`;
        let searchFrom = gt + 1;
        while (searchFrom < len) {
          const closeIdx = html.indexOf(closePattern, searchFrom);
          if (closeIdx === -1) { i = len; break; }
          const closeGt = html.indexOf('>', closeIdx + closePattern.length);
          if (closeGt === -1) { i = len; break; }
          i = closeGt + 1;
          break;
        }
        if (i === searchFrom) i = len; // no closing tag found
        continue;
      }

      // Block-level tag: emit newline
      if (BLOCK_TAGS.has(tagName)) out.push('\n');

      i = gt + 1;
      continue;
    }

    // Plain text
    out.push(html[i]!);
    i++;
  }

  return out.join('');
}

/**
 * Basic HTML-to-text conversion.
 * Strips HTML tags, decodes common entities, collapses whitespace,
 * and preserves basic structural formatting.
 */
function htmlToText(html: string): string {
  let text = html;

  // Strip all HTML tags using a character-by-character scanner.
  // This avoids regex entirely — immune to ReDoS, bad-tag-filter, and
  // incomplete-multi-character-sanitization (CodeQL #28-33).
  text = stripHtmlTags(text);

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Collapse whitespace while preserving newlines
  text = text.replace(/[^\S\n]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** Decode common HTML entities. */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&laquo;': '\u00AB',
    '&raquo;': '\u00BB',
    '&bull;': '\u2022',
    '&hellip;': '\u2026',
    '&copy;': '\u00A9',
    '&reg;': '\u00AE',
    '&trade;': '\u2122',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  // Decode numeric entities (&#NNN; and &#xHHH;)
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10);
    return num > 0 && num < 0x110000 ? String.fromCodePoint(num) : '';
  });
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const num = parseInt(code, 16);
    return num > 0 && num < 0x110000 ? String.fromCodePoint(num) : '';
  });

  return result;
}
