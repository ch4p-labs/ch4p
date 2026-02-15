/**
 * Grep tool — searches file contents using regex patterns.
 *
 * Lightweight tool that performs line-by-line content search across files.
 * Supports glob filtering, multiple output modes, and context lines.
 * Uses Node.js fs + readline for memory-efficient streaming search.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
import { SecurityError } from '@ch4p/core';

interface GrepArgs {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  context_lines?: number;
}

type OutputMode = 'content' | 'files_with_matches' | 'count';

const MAX_RESULTS = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Extensions that should never be searched. */
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.flac',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.sqlite', '.db', '.sqlite3',
  '.class', '.pyc', '.o', '.obj', '.wasm',
]);

/** Directories to always skip. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next',
  '__pycache__', '.tox', '.venv', 'venv', '.cache', 'coverage',
]);

export class GrepTool implements ITool {
  readonly name = 'grep';
  readonly description =
    'Search file contents using regular expressions. Supports glob pattern ' +
    'filtering, multiple output modes (content, files_with_matches, count), ' +
    'and context lines around matches.';

  readonly weight = 'lightweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for.',
        minLength: 1,
      },
      path: {
        type: 'string',
        description:
          'File or directory to search in. Defaults to the session working directory.',
      },
      glob: {
        type: 'string',
        description:
          'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}"). Only files matching this pattern are searched.',
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description:
          'Output mode: "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts.',
        default: 'files_with_matches',
      },
      context_lines: {
        type: 'number',
        description: 'Number of context lines to show before and after each match. Only used with output_mode "content".',
        minimum: 0,
        maximum: 20,
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  };

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { pattern, path, glob, output_mode, context_lines } = args as Record<
      string,
      unknown
    >;
    const errors: string[] = [];

    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      errors.push('pattern must be a non-empty string.');
    }

    // Validate regex
    if (typeof pattern === 'string') {
      try {
        new RegExp(pattern);
      } catch {
        errors.push(`Invalid regular expression: ${pattern}`);
      }
    }

    if (path !== undefined && typeof path !== 'string') {
      errors.push('path must be a string.');
    }

    if (glob !== undefined && typeof glob !== 'string') {
      errors.push('glob must be a string.');
    }

    if (
      output_mode !== undefined &&
      !['content', 'files_with_matches', 'count'].includes(output_mode as string)
    ) {
      errors.push('output_mode must be "content", "files_with_matches", or "count".');
    }

    if (context_lines !== undefined) {
      if (
        typeof context_lines !== 'number' ||
        !Number.isInteger(context_lines) ||
        context_lines < 0
      ) {
        errors.push('context_lines must be a non-negative integer.');
      }
      if (typeof context_lines === 'number' && context_lines > 20) {
        errors.push('context_lines cannot exceed 20.');
      }
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

    const {
      pattern,
      path: searchPath,
      glob: globPattern,
      output_mode: outputMode = 'files_with_matches',
      context_lines: contextLines = 0,
    } = args as GrepArgs;

    const regex = new RegExp(pattern, 'g');
    const basePath = searchPath
      ? resolve(context.cwd, searchPath)
      : context.cwd;

    // Validate search path
    const pathValidation = context.securityPolicy.validatePath(basePath, 'read');
    if (!pathValidation.allowed) {
      throw new SecurityError(
        `Search path blocked: ${pathValidation.reason ?? basePath}`,
        { path: basePath },
      );
    }

    const resolvedBase = pathValidation.canonicalPath ?? basePath;

    // Determine if searching a single file or a directory
    let fileStat;
    try {
      fileStat = await stat(resolvedBase);
    } catch {
      return {
        success: false,
        output: '',
        error: `Path not found: ${resolvedBase}`,
      };
    }

    const files: string[] = [];

    if (fileStat.isFile()) {
      files.push(resolvedBase);
    } else if (fileStat.isDirectory()) {
      await collectFiles(resolvedBase, files, globPattern, context);
    } else {
      return {
        success: false,
        output: '',
        error: `Path is not a file or directory: ${resolvedBase}`,
      };
    }

    // Search files
    const mode = outputMode as OutputMode;
    const results: string[] = [];
    let totalMatches = 0;
    let filesWithMatches = 0;
    let resultLimitReached = false;

    for (const file of files) {
      if (context.abortSignal.aborted) break;
      if (resultLimitReached) break;

      const matches = await searchFile(file, regex, mode, contextLines);
      if (matches === null) continue; // File could not be read

      if (matches.matchCount > 0) {
        filesWithMatches++;
        totalMatches += matches.matchCount;

        const relPath = relative(context.cwd, file);

        switch (mode) {
          case 'files_with_matches':
            results.push(relPath);
            break;
          case 'count':
            results.push(`${relPath}:${matches.matchCount}`);
            break;
          case 'content':
            for (const line of matches.lines) {
              results.push(`${relPath}:${line}`);
              if (results.length >= MAX_RESULTS) {
                resultLimitReached = true;
                break;
              }
            }
            break;
        }

        if (results.length >= MAX_RESULTS) {
          resultLimitReached = true;
        }
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        output: 'No matches found.',
        metadata: { pattern, filesSearched: files.length, matches: 0 },
      };
    }

    let output = results.join('\n');
    if (resultLimitReached) {
      output += `\n\n(results truncated at ${MAX_RESULTS} entries)`;
    }

    return {
      success: true,
      output,
      metadata: {
        pattern,
        filesSearched: files.length,
        filesWithMatches,
        totalMatches,
        truncated: resultLimitReached,
      },
    };
  }
}

/** Recursively collect files from a directory, respecting skip lists and glob. */
async function collectFiles(
  dir: string,
  files: string[],
  globPattern: string | undefined,
  context: ToolContext,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip inaccessible directories
  }

  for (const entry of entries) {
    if (context.abortSignal.aborted) return;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;

      // Validate directory access
      const dirValidation = context.securityPolicy.validatePath(fullPath, 'read');
      if (!dirValidation.allowed) continue;

      await collectFiles(fullPath, files, globPattern, context);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;

      // Apply glob filter if provided
      if (globPattern && !matchGlob(entry.name, globPattern)) continue;

      files.push(fullPath);
    }
  }
}

/** Simple glob matching for filenames. Supports *, ?, and {a,b} patterns. */
function matchGlob(filename: string, pattern: string): boolean {
  // Expand {a,b,c} brace patterns
  const expanded = expandBraces(pattern);
  return expanded.some((p) => matchSimpleGlob(filename, p));
}

/** Match a simple glob pattern (no braces). */
function matchSimpleGlob(str: string, pattern: string): boolean {
  let regexStr = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i++; // Skip second *
        if (pattern[i + 1] === '/') i++; // Skip / after **
      } else {
        regexStr += '[^/]*';
      }
    } else if (c === '?') {
      regexStr += '[^/]';
    } else if (c === '.') {
      regexStr += '\\.';
    } else {
      regexStr += c;
    }
  }
  regexStr += '$';
  try {
    return new RegExp(regexStr, 'i').test(str);
  } catch {
    return false;
  }
}

/** Expand {a,b,c} brace expressions into multiple patterns. */
function expandBraces(pattern: string): string[] {
  const braceStart = pattern.indexOf('{');
  if (braceStart === -1) return [pattern];

  const braceEnd = pattern.indexOf('}', braceStart);
  if (braceEnd === -1) return [pattern];

  const prefix = pattern.slice(0, braceStart);
  const suffix = pattern.slice(braceEnd + 1);
  const alternatives = pattern.slice(braceStart + 1, braceEnd).split(',');

  const results: string[] = [];
  for (const alt of alternatives) {
    results.push(...expandBraces(prefix + alt.trim() + suffix));
  }
  return results;
}

interface SearchResult {
  matchCount: number;
  lines: string[];
}

/** Search a single file for matches. */
async function searchFile(
  filePath: string,
  regex: RegExp,
  mode: OutputMode,
  contextLines: number,
): Promise<SearchResult | null> {
  let fileSize;
  try {
    const stats = await stat(filePath);
    fileSize = stats.size;
  } catch {
    return null;
  }

  if (fileSize > MAX_FILE_SIZE) return null;

  let content: string;
  try {
    const buffer = await readFile(filePath);
    // Quick binary check
    const sampleSize = Math.min(buffer.length, 512);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0) return null; // Binary file
    }
    content = buffer.toString('utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const matchingLineIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Reset regex state for each line (global flag)
    regex.lastIndex = 0;
    if (regex.test(lines[i]!)) {
      matchingLineIndices.push(i);
    }
  }

  if (matchingLineIndices.length === 0) {
    return { matchCount: 0, lines: [] };
  }

  if (mode === 'files_with_matches' || mode === 'count') {
    return { matchCount: matchingLineIndices.length, lines: [] };
  }

  // Build output lines with context
  const outputLines: string[] = [];
  const includedLines = new Set<number>();

  for (const matchIdx of matchingLineIndices) {
    const start = Math.max(0, matchIdx - contextLines);
    const end = Math.min(lines.length - 1, matchIdx + contextLines);

    // Add separator if there is a gap between context groups
    if (outputLines.length > 0 && !includedLines.has(start - 1)) {
      outputLines.push('--');
    }

    for (let i = start; i <= end; i++) {
      if (includedLines.has(i)) continue;
      includedLines.add(i);

      const lineNum = i + 1;
      const separator = i === matchIdx ? ':' : '-';
      outputLines.push(`${lineNum}${separator}${lines[i]}`);
    }
  }

  return { matchCount: matchingLineIndices.length, lines: outputLines };
}
