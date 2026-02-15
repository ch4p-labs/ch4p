import { chunkMarkdown } from './chunker.js';

describe('chunkMarkdown', () => {
  describe('empty/whitespace input', () => {
    it('returns empty array for empty string', () => {
      expect(chunkMarkdown('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(chunkMarkdown('   \n\n   ')).toEqual([]);
    });
  });

  describe('single chunk', () => {
    it('returns single chunk for short text', () => {
      const result = chunkMarkdown('Hello world');
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe('Hello world');
    });

    it('returns empty headings when no headings present', () => {
      const result = chunkMarkdown('Just some text.');
      expect(result[0]!.headings).toEqual([]);
    });
  });

  describe('heading tracking', () => {
    it('tracks heading hierarchy', () => {
      const md = `# Title

Some intro text.

## Section 1

Content under section 1.`;

      const result = chunkMarkdown(md, { maxChunkSize: 5000 });
      // When everything fits, it should be in one chunk with the deepest headings
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('resets headings when encountering same or higher level', () => {
      const md = `## Section A

Text A.

## Section B

Text B.`;

      const result = chunkMarkdown(md, { maxChunkSize: 30 });
      // Should produce chunks; Section B replaces Section A
      const lastChunk = result[result.length - 1]!;
      expect(lastChunk.headings).toContain('Section B');
      expect(lastChunk.headings).not.toContain('Section A');
    });

    it('builds nested heading context', () => {
      const md = `# Main

## Sub

### Subsub

Content here.`;

      const result = chunkMarkdown(md, { maxChunkSize: 5000 });
      const lastChunk = result[result.length - 1]!;
      expect(lastChunk.headings).toContain('Main');
      expect(lastChunk.headings).toContain('Sub');
      expect(lastChunk.headings).toContain('Subsub');
    });
  });

  describe('chunking by size', () => {
    it('splits into multiple chunks when text exceeds maxChunkSize', () => {
      const para1 = 'A'.repeat(60);
      const para2 = 'B'.repeat(60);
      const md = `${para1}\n\n${para2}`;

      const result = chunkMarkdown(md, { maxChunkSize: 80 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('respects default maxChunkSize of 1000', () => {
      const shortText = 'Hello world.';
      const result = chunkMarkdown(shortText);
      expect(result).toHaveLength(1);
    });

    it('splits large paragraphs that exceed maxChunkSize', () => {
      const hugeParagraph = 'A'.repeat(3000);
      const result = chunkMarkdown(hugeParagraph, { maxChunkSize: 1000 });
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('overlap', () => {
    it('applies overlap between chunks', () => {
      const para1 = 'The first paragraph with some content here.';
      const para2 = 'The second paragraph with different content.';
      const md = `${para1}\n\n${para2}`;

      const result = chunkMarkdown(md, {
        maxChunkSize: 50,
        overlap: 10,
      });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles zero overlap', () => {
      const para1 = 'Short one.';
      const para2 = 'Short two.';
      const md = `${para1}\n\n${para2}`;

      const result = chunkMarkdown(md, {
        maxChunkSize: 15,
        overlap: 0,
      });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('paragraph boundary splitting', () => {
    it('splits on double newlines', () => {
      const md = `Para 1.\n\nPara 2.\n\nPara 3.`;
      const result = chunkMarkdown(md, { maxChunkSize: 5000 });
      // All fits in one chunk
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toContain('Para 1.');
      expect(result[0]!.content).toContain('Para 3.');
    });

    it('handles multiple consecutive newlines', () => {
      const md = `Para 1.\n\n\n\nPara 2.`;
      const result = chunkMarkdown(md, { maxChunkSize: 5000 });
      expect(result).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles text with only headings', () => {
      const md = `# Title\n\n## Section\n\n### Subsection`;
      const result = chunkMarkdown(md, { maxChunkSize: 5000 });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('handles single paragraph exactly at maxChunkSize', () => {
      const text = 'A'.repeat(100);
      const result = chunkMarkdown(text, { maxChunkSize: 100 });
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe(text);
    });
  });
});
