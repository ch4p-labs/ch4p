/**
 * render-markdown — Zero-dependency markdown-to-React renderer for chat.
 * Copied from apps/web/src/chat/render-markdown.tsx to avoid cross-package dep.
 */

import { createElement, Fragment, type ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlineRe =
    /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = inlineRe.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-i${idx++}`;
    if (match[1]) {
      nodes.push(createElement('code', { key }, match[1].slice(1, -1)));
    } else if (match[2]) {
      nodes.push(createElement('a', { key, href: match[4], target: '_blank', rel: 'noopener noreferrer' }, match[3]));
    } else if (match[5]) {
      nodes.push(createElement('strong', { key }, match[6]));
    } else if (match[7]) {
      nodes.push(createElement('em', { key }, match[8]));
    } else if (match[9]) {
      nodes.push(createElement('del', { key }, match[10]));
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBlock(lines: string[], blockKey: string): ReactNode[] {
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (/^#{1,6}\s/.test(line)) {
      const text = line.replace(/^#{1,6}\s+/, '');
      elements.push(createElement('h3', { key: `${blockKey}-${i}` }, ...renderInline(text, `${blockKey}-${i}`)));
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        createElement('blockquote', { key: `${blockKey}-${i}` },
          ...quoteLines.map((ql, qi) =>
            createElement('p', { key: `bq-${qi}` }, ...renderInline(ql, `${blockKey}-bq${qi}`)))),
      );
      continue;
    }

    if (/^[\-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-*]\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[\-*]\s+/, ''));
        i++;
      }
      elements.push(
        createElement('ul', { key: `${blockKey}-ul${i}` },
          ...items.map((item, ii) =>
            createElement('li', { key: `li-${ii}` }, ...renderInline(item, `${blockKey}-li${ii}`)))),
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        createElement('ol', { key: `${blockKey}-ol${i}` },
          ...items.map((item, ii) =>
            createElement('li', { key: `li-${ii}` }, ...renderInline(item, `${blockKey}-oli${ii}`)))),
      );
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    elements.push(createElement('p', { key: `${blockKey}-p${i}` }, ...renderInline(line, `${blockKey}-${i}`)));
    i++;
  }

  return elements;
}

export function renderMarkdown(text: string): ReactNode {
  const fenceRe = /^```(\w*)\n([\s\S]*?)^```$/gm;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(...renderBlock(text.slice(last, match.index).split('\n'), `b${blockIdx++}`));
    }
    const lang = match[1] || '';
    const code = match[2] || '';
    parts.push(
      createElement('pre', { key: `code-${blockIdx}` },
        createElement('code', { className: lang ? `language-${lang}` : undefined }, code.replace(/\n$/, ''))),
    );
    blockIdx++;
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(...renderBlock(text.slice(last).split('\n'), `b${blockIdx}`));
  }

  return createElement(Fragment, null, ...parts);
}
