/**
 * Tests for the zero-dependency markdown-to-React renderer.
 *
 * Since renderMarkdown uses createElement (not JSX) and returns plain
 * React element objects, we can inspect the tree without a DOM.
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render-markdown';
import type { ReactElement } from 'react';

// Helper: flatten a React element tree into a flat array of elements.
function flatten(node: unknown): unknown[] {
  if (node == null || typeof node === 'string' || typeof node === 'number') return [node];
  if (Array.isArray(node)) return node.flatMap(flatten);
  const el = node as ReactElement;
  if (el.props?.children != null) {
    return [el, ...flatten(el.props.children)];
  }
  return [el];
}

// Helper: find all elements of a given type in the tree.
function findByType(node: unknown, type: string): ReactElement[] {
  return flatten(node).filter(
    (n) => n != null && typeof n === 'object' && (n as ReactElement).type === type,
  ) as ReactElement[];
}

// Helper: extract all text from a React tree.
function extractText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  const el = node as ReactElement;
  if (el.props?.children != null) return extractText(el.props.children);
  return '';
}

describe('renderMarkdown', () => {
  // ─── Plain text ──────────────────────────────────────────────────────

  it('renders plain text as a paragraph', () => {
    const result = renderMarkdown('Hello world');
    const paragraphs = findByType(result, 'p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(extractText(result)).toContain('Hello world');
  });

  // ─── Inline formatting ───────────────────────────────────────────────

  it('renders **bold** as <strong>', () => {
    const result = renderMarkdown('This is **bold** text');
    const strongs = findByType(result, 'strong');
    expect(strongs).toHaveLength(1);
    expect(extractText(strongs[0]!)).toBe('bold');
  });

  it('renders *italic* as <em>', () => {
    const result = renderMarkdown('This is *italic* text');
    const ems = findByType(result, 'em');
    expect(ems).toHaveLength(1);
    expect(extractText(ems[0]!)).toBe('italic');
  });

  it('renders ~~strikethrough~~ as <del>', () => {
    const result = renderMarkdown('This is ~~deleted~~ text');
    const dels = findByType(result, 'del');
    expect(dels).toHaveLength(1);
    expect(extractText(dels[0]!)).toBe('deleted');
  });

  it('renders inline `code` as <code>', () => {
    const result = renderMarkdown('Use the `npm install` command');
    const codes = findByType(result, 'code');
    expect(codes).toHaveLength(1);
    expect(extractText(codes[0]!)).toBe('npm install');
  });

  it('renders [links](url) as <a>', () => {
    const result = renderMarkdown('Visit [Example](https://example.com) today');
    const links = findByType(result, 'a');
    expect(links).toHaveLength(1);
    expect(links[0]!.props.href).toBe('https://example.com');
    expect(extractText(links[0]!)).toBe('Example');
    expect(links[0]!.props.target).toBe('_blank');
  });

  // ─── Block-level elements ────────────────────────────────────────────

  it('renders headings as <h3>', () => {
    const result = renderMarkdown('# Title\n## Subtitle\n### Section');
    const headings = findByType(result, 'h3');
    expect(headings).toHaveLength(3);
    expect(extractText(headings[0]!)).toBe('Title');
    expect(extractText(headings[1]!)).toBe('Subtitle');
  });

  it('renders unordered lists', () => {
    const result = renderMarkdown('- Item one\n- Item two\n- Item three');
    const uls = findByType(result, 'ul');
    expect(uls).toHaveLength(1);
    const lis = findByType(uls[0]!, 'li');
    expect(lis).toHaveLength(3);
    expect(extractText(lis[0]!)).toBe('Item one');
  });

  it('renders ordered lists', () => {
    const result = renderMarkdown('1. First\n2. Second\n3. Third');
    const ols = findByType(result, 'ol');
    expect(ols).toHaveLength(1);
    const lis = findByType(ols[0]!, 'li');
    expect(lis).toHaveLength(3);
    expect(extractText(lis[0]!)).toBe('First');
  });

  it('renders blockquotes', () => {
    const result = renderMarkdown('> This is a quote\n> Second line');
    const quotes = findByType(result, 'blockquote');
    expect(quotes).toHaveLength(1);
    expect(extractText(quotes[0]!)).toContain('This is a quote');
  });

  // ─── Fenced code blocks ──────────────────────────────────────────────

  it('renders fenced code blocks as <pre><code>', () => {
    const md = '```js\nconst x = 1;\n```';
    const result = renderMarkdown(md);
    const pres = findByType(result, 'pre');
    expect(pres).toHaveLength(1);
    const codes = findByType(pres[0]!, 'code');
    expect(codes).toHaveLength(1);
    expect(codes[0]!.props.className).toBe('language-js');
    expect(extractText(codes[0]!)).toBe('const x = 1;');
  });

  it('renders code blocks without language', () => {
    const md = '```\nhello\n```';
    const result = renderMarkdown(md);
    // Filter to codes inside <pre> (not inline codes)
    const preCodes = findByType(result, 'pre').flatMap((pre) => findByType(pre, 'code'));
    expect(preCodes).toHaveLength(1);
    expect(preCodes[0]!.props.className).toBeUndefined();
  });

  // ─── Mixed content ──────────────────────────────────────────────────

  it('handles text before and after code blocks', () => {
    const md = 'Before\n```\ncode\n```\nAfter';
    const result = renderMarkdown(md);
    const text = extractText(result);
    expect(text).toContain('Before');
    expect(text).toContain('code');
    expect(text).toContain('After');
  });

  it('handles inline formatting inside lists', () => {
    const result = renderMarkdown('- **Bold item**\n- *Italic item*');
    const strongs = findByType(result, 'strong');
    const ems = findByType(result, 'em');
    expect(strongs).toHaveLength(1);
    expect(ems).toHaveLength(1);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────

  it('handles empty string', () => {
    const result = renderMarkdown('');
    expect(result).toBeDefined();
  });

  it('handles string with only whitespace', () => {
    const result = renderMarkdown('   \n\n   ');
    expect(result).toBeDefined();
  });

  it('handles multiple bold segments in one line', () => {
    const result = renderMarkdown('**one** and **two**');
    const strongs = findByType(result, 'strong');
    expect(strongs).toHaveLength(2);
  });
});
