/**
 * render-markdown — Zero-dependency markdown-to-React renderer for the chat panel.
 *
 * Handles the subset of markdown the agent typically produces: fenced code blocks,
 * inline code, bold, italic, strikethrough, headings, lists, blockquotes, and links.
 * Only used for assistant messages — user messages render as plain text.
 */

import { createElement, Fragment, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

/**
 * Parse inline markdown tokens into React nodes.
 * Order matters: code > links > bold > italic > strikethrough.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Regex: inline code | links | bold | italic | strikethrough
  const inlineRe =
    /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = inlineRe.exec(text)) !== null) {
    // Leading plain text
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }

    const key = `${keyPrefix}-i${idx++}`;

    if (match[1]) {
      // Inline code: `code`
      nodes.push(createElement('code', { key }, match[1].slice(1, -1)));
    } else if (match[2]) {
      // Link: [text](url)
      nodes.push(
        createElement('a', { key, href: match[4], target: '_blank', rel: 'noopener noreferrer' }, match[3]),
      );
    } else if (match[5]) {
      // Bold: **text**
      nodes.push(createElement('strong', { key }, match[6]));
    } else if (match[7]) {
      // Italic: *text*
      nodes.push(createElement('em', { key }, match[8]));
    } else if (match[9]) {
      // Strikethrough: ~~text~~
      nodes.push(createElement('del', { key }, match[10]));
    }

    last = match.index + match[0].length;
  }

  // Trailing plain text
  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Block-level rendering
// ---------------------------------------------------------------------------

/**
 * Render a block of non-code lines into React elements.
 * Handles headings, unordered/ordered lists, blockquotes, and paragraphs.
 */
function renderBlock(lines: string[], blockKey: string): ReactNode[] {
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Heading: # through ######
    if (/^#{1,6}\s/.test(line)) {
      const text = line.replace(/^#{1,6}\s+/, '');
      elements.push(createElement('h3', { key: `${blockKey}-${i}` }, ...renderInline(text, `${blockKey}-${i}`)));
      i++;
      continue;
    }

    // Blockquote: > text
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        createElement(
          'blockquote',
          { key: `${blockKey}-${i}` },
          ...quoteLines.map((ql, qi) =>
            createElement('p', { key: `bq-${qi}` }, ...renderInline(ql, `${blockKey}-bq${qi}`)),
          ),
        ),
      );
      continue;
    }

    // Unordered list: - item or * item
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        createElement(
          'ul',
          { key: `${blockKey}-ul${i}` },
          ...items.map((item, ii) =>
            createElement('li', { key: `li-${ii}` }, ...renderInline(item, `${blockKey}-li${ii}`)),
          ),
        ),
      );
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        createElement(
          'ol',
          { key: `${blockKey}-ol${i}` },
          ...items.map((item, ii) =>
            createElement('li', { key: `li-${ii}` }, ...renderInline(item, `${blockKey}-oli${ii}`)),
          ),
        ),
      );
      continue;
    }

    // Blank line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (default)
    elements.push(
      createElement('p', { key: `${blockKey}-p${i}` }, ...renderInline(line, `${blockKey}-${i}`)),
    );
    i++;
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a markdown string into React nodes for the chat bubble.
 *
 * Splits on fenced code blocks first, then processes non-code segments
 * as block-level markdown.
 */
export function renderMarkdown(text: string): ReactNode {
  // Split by fenced code blocks: ```lang\n...\n```
  const fenceRe = /^```(\w*)\n([\s\S]*?)^```$/gm;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = fenceRe.exec(text)) !== null) {
    // Non-code text before this fence
    if (match.index > last) {
      const segment = text.slice(last, match.index);
      const lines = segment.split('\n');
      parts.push(...renderBlock(lines, `b${blockIdx++}`));
    }

    // Fenced code block
    const lang = match[1] || '';
    const code = match[2] || '';
    parts.push(
      createElement(
        'pre',
        { key: `code-${blockIdx}` },
        createElement(
          'code',
          { className: lang ? `language-${lang}` : undefined },
          code.replace(/\n$/, ''),
        ),
      ),
    );
    blockIdx++;
    last = match.index + match[0].length;
  }

  // Remaining text after last fence (or entire text if no fences)
  if (last < text.length) {
    const segment = text.slice(last);
    const lines = segment.split('\n');
    parts.push(...renderBlock(lines, `b${blockIdx}`));
  }

  return createElement(Fragment, null, ...parts);
}
