/**
 * WebFetch tool — fetches URL content with HTML-to-text conversion.
 *
 * Heavyweight tool that retrieves web content via HTTP(S). Performs basic
 * HTML-to-text conversion (strip tags, decode entities). Supports timeout
 * and response size limits.
 */

import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
// ToolError available from @ch4p/core if needed

interface WebFetchArgs {
  url: string;
  prompt?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_OUTPUT_LENGTH = 50_000;

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
    const fetchUrl = url.replace(/^http:\/\//, 'https://');

    if (context.abortSignal.aborted) {
      return {
        success: false,
        output: '',
        error: 'Request aborted before execution.',
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

      const response = await fetch(fetchUrl, {
        signal: this.abortController.signal,
        headers: {
          'User-Agent': 'ch4p/0.1.0',
          Accept: 'text/html, application/json, text/plain, */*',
        },
        redirect: 'follow',
      });

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
}

/**
 * Basic HTML-to-text conversion.
 * Strips HTML tags, decodes common entities, collapses whitespace,
 * and preserves basic structural formatting.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script and style blocks entirely
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Replace block-level elements with newlines
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|section|article|header|footer|nav|main|aside|figure|figcaption)\b[^>]*\/?>/gi, '\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

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
