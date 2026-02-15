/**
 * Markdown chunking utilities.
 *
 * Splits markdown text into chunks on double newlines while preserving
 * heading hierarchy. Configurable chunk size with overlap for context
 * continuity across chunk boundaries.
 */

export interface ChunkResult {
  content: string;
  headings: string[];
}

export interface ChunkOpts {
  /** Maximum chunk size in characters (default: 1000) */
  maxChunkSize?: number;
  /** Overlap between consecutive chunks in characters (default: 100) */
  overlap?: number;
}

/**
 * Split markdown text into semantic chunks.
 *
 * Strategy:
 * 1. Split on double newlines (paragraph boundaries)
 * 2. Track heading hierarchy (# through ######)
 * 3. Merge small paragraphs up to maxChunkSize
 * 4. Split oversized paragraphs with overlap
 * 5. Attach parent headings to each chunk for context
 *
 * @param text - Markdown content to chunk
 * @param opts - Chunking options
 * @returns Array of chunks with their heading context
 */
export function chunkMarkdown(text: string, opts: ChunkOpts = {}): ChunkResult[] {
  const maxChunkSize = opts.maxChunkSize ?? 1000;
  const overlap = opts.overlap ?? 100;

  if (!text.trim()) return [];

  // Split on double newlines (paragraph/section boundaries)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length === 0) return [];

  const chunks: ChunkResult[] = [];
  // Track current heading hierarchy by level (1-6)
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentChunk = '';
  let currentHeadings: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Check if this paragraph is a heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/m);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const headingText = headingMatch[2]!.trim();

      // Pop headings at same or lower level
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1]!.level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text: headingText });
    }

    // Get the current heading context
    const headings = headingStack.map((h) => h.text);

    // Check if adding this paragraph would exceed the max chunk size
    const combined = currentChunk
      ? `${currentChunk}\n\n${trimmed}`
      : trimmed;

    if (combined.length <= maxChunkSize) {
      // Fits in current chunk
      currentChunk = combined;
      currentHeadings = headings;
    } else {
      // Flush current chunk if non-empty
      if (currentChunk) {
        chunks.push({
          content: currentChunk,
          headings: [...currentHeadings],
        });
      }

      // If this single paragraph exceeds maxChunkSize, split it
      if (trimmed.length > maxChunkSize) {
        const subChunks = splitLargeParagraph(trimmed, maxChunkSize, overlap);
        for (const sub of subChunks) {
          chunks.push({
            content: sub,
            headings: [...headings],
          });
        }
        currentChunk = '';
        currentHeadings = headings;
      } else {
        // Start new chunk with overlap from previous
        const overlapText = getOverlapSuffix(currentChunk, overlap);
        currentChunk = overlapText ? `${overlapText}\n\n${trimmed}` : trimmed;
        currentHeadings = headings;

        // If overlap pushed us over the limit, just use the paragraph alone
        if (currentChunk.length > maxChunkSize) {
          currentChunk = trimmed;
        }
      }
    }
  }

  // Flush remaining chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk,
      headings: [...currentHeadings],
    });
  }

  return chunks;
}

/**
 * Split a large paragraph into smaller chunks with overlap.
 */
function splitLargeParagraph(
  text: string,
  maxSize: number,
  overlap: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    if (end < text.length) {
      // Try to break at a sentence or word boundary
      const breakPoint = findBreakPoint(text, start, end);
      end = breakPoint;
    } else {
      end = text.length;
    }

    chunks.push(text.slice(start, end).trim());

    // Move start forward, keeping overlap
    start = Math.max(start + 1, end - overlap);
  }

  return chunks.filter(Boolean);
}

/**
 * Find a good break point near the end position.
 * Prefer sentence boundaries (. ! ?), then word boundaries (space).
 */
function findBreakPoint(text: string, start: number, idealEnd: number): number {
  // Look backwards from idealEnd for a sentence boundary
  const searchStart = Math.max(start, idealEnd - 200);
  for (let i = idealEnd; i >= searchStart; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === ' ' || next === '\n') {
        return i + 1;
      }
    }
  }

  // Fall back to word boundary
  for (let i = idealEnd; i >= searchStart; i--) {
    if (text[i] === ' ' || text[i] === '\n') {
      return i;
    }
  }

  // No good break point found; hard break
  return idealEnd;
}

/**
 * Get the trailing portion of text for overlap context.
 */
function getOverlapSuffix(text: string, overlap: number): string {
  if (!text || overlap <= 0) return '';
  if (text.length <= overlap) return text;

  const suffix = text.slice(-overlap);
  // Try to start at a word boundary
  const spaceIdx = suffix.indexOf(' ');
  if (spaceIdx > 0 && spaceIdx < overlap / 2) {
    return suffix.slice(spaceIdx + 1);
  }
  return suffix;
}
