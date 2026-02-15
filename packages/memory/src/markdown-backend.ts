/**
 * Simple markdown file memory backend (fallback).
 *
 * Stores memories as individual markdown files in a directory.
 * Uses basic string matching for recall (no vector search).
 * For users who prefer file-based storage over SQLite.
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { IMemoryBackend, RecallOpts, MemoryResult, MemoryEntry } from '@ch4p/core';

export interface MarkdownBackendOpts {
  /** Directory to store markdown memory files */
  dirPath: string;
}

interface MarkdownMemoryFile {
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class MarkdownMemoryBackend implements IMemoryBackend {
  readonly id = 'markdown';

  private readonly dirPath: string;

  constructor(opts: MarkdownBackendOpts) {
    this.dirPath = opts.dirPath;
    mkdirSync(this.dirPath, { recursive: true });
  }

  /**
   * Store a memory as a markdown file.
   */
  async store(
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const filePath = this.keyToPath(key);
    const now = new Date().toISOString();

    // Check if file already exists to preserve created_at
    let createdAt = now;
    if (existsSync(filePath)) {
      try {
        const existing = this.readMemoryFile(filePath);
        if (existing) {
          createdAt = existing.createdAt;
        }
      } catch {
        // Ignore -- use current time
      }
    }

    const fileContent = this.formatMemoryFile({
      key,
      content,
      metadata,
      createdAt,
      updatedAt: now,
    });

    writeFileSync(filePath, fileContent, 'utf-8');
  }

  /**
   * Recall memories using simple string matching.
   * Scores are based on the number of query terms found in the content.
   */
  async recall(query: string, opts: RecallOpts = {}): Promise<MemoryResult[]> {
    const limit = opts.limit ?? 20;
    const minScore = opts.minScore ?? 0;
    const files = this.listFiles();

    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (queryTerms.length === 0) return [];

    const results: MemoryResult[] = [];

    for (const filePath of files) {
      const memory = this.readMemoryFile(filePath);
      if (!memory) continue;

      // Apply metadata filter if provided
      if (opts.filter && Object.keys(opts.filter).length > 0) {
        if (!memory.metadata) continue;
        const matches = Object.entries(opts.filter).every(
          ([k, v]) => memory.metadata?.[k] === v,
        );
        if (!matches) continue;
      }

      // Score based on term frequency
      const lowerContent = memory.content.toLowerCase();
      const lowerKey = memory.key.toLowerCase();
      let matchCount = 0;

      for (const term of queryTerms) {
        if (lowerContent.includes(term)) matchCount++;
        if (lowerKey.includes(term)) matchCount += 0.5;
      }

      const score = matchCount / queryTerms.length;
      if (score > minScore) {
        results.push({
          key: memory.key,
          content: memory.content,
          score,
          metadata: memory.metadata,
          matchType: 'keyword',
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Delete a memory file.
   */
  async forget(key: string): Promise<boolean> {
    const filePath = this.keyToPath(key);
    if (!existsSync(filePath)) return false;

    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all memories, optionally filtered by key prefix.
   */
  async list(prefix?: string): Promise<MemoryEntry[]> {
    const files = this.listFiles();
    const entries: MemoryEntry[] = [];

    for (const filePath of files) {
      const memory = this.readMemoryFile(filePath);
      if (!memory) continue;

      if (prefix && !memory.key.startsWith(prefix)) continue;

      entries.push({
        key: memory.key,
        content: memory.content,
        metadata: memory.metadata,
        createdAt: new Date(memory.createdAt),
        updatedAt: new Date(memory.updatedAt),
      });
    }

    entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }

  /**
   * No-op for markdown backend (no index to rebuild).
   */
  async reindex(): Promise<void> {
    // Nothing to do -- markdown backend has no index
  }

  /**
   * No-op for markdown backend (no connection to close).
   */
  async close(): Promise<void> {
    // Nothing to do -- file-based storage needs no cleanup
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert a memory key to a file path.
   * Sanitizes the key to be filesystem-safe.
   */
  private keyToPath(key: string): string {
    const sanitized = key
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 200); // Limit filename length

    const filename = sanitized || 'unnamed';
    return join(this.dirPath, `${filename}.md`);
  }

  /**
   * List all markdown files in the memory directory.
   */
  private listFiles(): string[] {
    if (!existsSync(this.dirPath)) return [];

    return readdirSync(this.dirPath)
      .filter((f) => extname(f) === '.md')
      .map((f) => join(this.dirPath, f));
  }

  /**
   * Format a memory entry as a markdown file with YAML-like frontmatter.
   */
  private formatMemoryFile(memory: MarkdownMemoryFile): string {
    const lines: string[] = ['---'];
    lines.push(`key: ${memory.key}`);
    lines.push(`created_at: ${memory.createdAt}`);
    lines.push(`updated_at: ${memory.updatedAt}`);

    if (memory.metadata && Object.keys(memory.metadata).length > 0) {
      lines.push(`metadata: ${JSON.stringify(memory.metadata)}`);
    }

    lines.push('---');
    lines.push('');
    lines.push(memory.content);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Read and parse a memory markdown file.
   */
  private readMemoryFile(filePath: string): MarkdownMemoryFile | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return this.parseMemoryFile(raw, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse a memory file's frontmatter and content.
   */
  private parseMemoryFile(
    raw: string,
    filePath: string,
  ): MarkdownMemoryFile | null {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      // No frontmatter -- treat entire file as content
      const key = basename(filePath, '.md');
      const stat = statSync(filePath);
      return {
        key,
        content: raw.trim(),
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      };
    }

    const frontmatter = fmMatch[1]!;
    const content = fmMatch[2]!.trim();

    // Parse simple YAML-like frontmatter
    const keyMatch = frontmatter.match(/^key:\s*(.+)$/m);
    const createdMatch = frontmatter.match(/^created_at:\s*(.+)$/m);
    const updatedMatch = frontmatter.match(/^updated_at:\s*(.+)$/m);
    const metaMatch = frontmatter.match(/^metadata:\s*(.+)$/m);

    const key = keyMatch?.[1]?.trim() ?? basename(filePath, '.md');
    const stat = statSync(filePath);

    let metadata: Record<string, unknown> | undefined;
    if (metaMatch?.[1]) {
      try {
        metadata = JSON.parse(metaMatch[1]) as Record<string, unknown>;
      } catch {
        // Ignore malformed metadata
      }
    }

    return {
      key,
      content,
      metadata,
      createdAt: createdMatch?.[1]?.trim() ?? stat.birthtime.toISOString(),
      updatedAt: updatedMatch?.[1]?.trim() ?? stat.mtime.toISOString(),
    };
  }
}
