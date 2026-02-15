/**
 * Glob tool — finds files matching glob patterns.
 *
 * Lightweight tool that performs file pattern matching across the filesystem.
 * Results are sorted by modification time (most recent first).
 * Uses recursive directory traversal with glob pattern matching.
 */

import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
import { SecurityError } from '@ch4p/core';

interface GlobArgs {
  pattern: string;
  path?: string;
}

const MAX_RESULTS = 1000;

/** Directories to always skip during traversal. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next',
  '__pycache__', '.tox', '.venv', 'venv', '.cache', 'coverage',
]);

export class GlobTool implements ITool {
  readonly name = 'glob';
  readonly description =
    'Find files matching a glob pattern. Supports standard glob syntax ' +
    'including *, **, ?, and {a,b} brace expansion. Results are sorted by ' +
    'modification time (most recent first).';

  readonly weight = 'lightweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.{js,jsx}").',
        minLength: 1,
      },
      path: {
        type: 'string',
        description:
          'Directory to search in. Defaults to the session working directory.',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  };

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { pattern, path } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      errors.push('pattern must be a non-empty string.');
    }

    if (path !== undefined && typeof path !== 'string') {
      errors.push('path must be a string.');
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

    const { pattern, path: searchPath } = args as GlobArgs;
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

    // Parse the pattern to determine the search strategy
    const patternParts = pattern.split('/');
    const matcher = compileGlobPattern(pattern);

    const matches: Array<{ path: string; mtime: number }> = [];

    await collectMatches(
      resolvedBase,
      '',
      patternParts,
      matcher,
      matches,
      context,
    );

    if (matches.length === 0) {
      return {
        success: true,
        output: 'No files matched the pattern.',
        metadata: { pattern, basePath: resolvedBase, matches: 0 },
      };
    }

    // Sort by modification time, most recent first
    matches.sort((a, b) => b.mtime - a.mtime);

    const truncated = matches.length > MAX_RESULTS;
    const displayMatches = truncated ? matches.slice(0, MAX_RESULTS) : matches;

    let output = displayMatches.map((m) => m.path).join('\n');
    if (truncated) {
      output += `\n\n(showing ${MAX_RESULTS} of ${matches.length} matches)`;
    }

    return {
      success: true,
      output,
      metadata: {
        pattern,
        basePath: resolvedBase,
        matches: matches.length,
        truncated,
      },
    };
  }
}

/** Recursively collect files matching a glob pattern. */
async function collectMatches(
  basePath: string,
  relativePath: string,
  patternParts: string[],
  matcher: (path: string) => boolean,
  matches: Array<{ path: string; mtime: number }>,
  context: ToolContext,
): Promise<void> {
  if (context.abortSignal.aborted) return;
  if (matches.length >= MAX_RESULTS * 2) return; // Safety limit during collection

  const currentDir = join(basePath, relativePath);

  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (context.abortSignal.aborted) return;

    const entryRelative = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    const entryFull = join(basePath, entryRelative);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;

      // Validate directory access
      const dirValidation = context.securityPolicy.validatePath(entryFull, 'read');
      if (!dirValidation.allowed) continue;

      await collectMatches(
        basePath,
        entryRelative,
        patternParts,
        matcher,
        matches,
        context,
      );
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      if (matcher(entryRelative)) {
        try {
          const fileStat = await stat(entryFull);
          matches.push({
            path: entryFull,
            mtime: fileStat.mtimeMs,
          });
        } catch {
          // Skip files we cannot stat
        }
      }
    }
  }
}

/** Compile a glob pattern into a matching function. */
function compileGlobPattern(pattern: string): (path: string) => boolean {
  const expanded = expandBraces(pattern);
  const regexes = expanded.map(globToRegex);

  return (path: string) => regexes.some((re) => re.test(path));
}

/** Convert a glob pattern to a RegExp. */
function globToRegex(pattern: string): RegExp {
  let regexStr = '^';
  let i = 0;

  while (i < pattern.length) {
    const c = pattern[i]!;

    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path segments
        if (pattern[i + 2] === '/') {
          regexStr += '(?:.+/)?';
          i += 3;
        } else {
          regexStr += '.*';
          i += 2;
        }
      } else {
        // * matches within a single segment
        regexStr += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if (c === '.') {
      regexStr += '\\.';
      i++;
    } else if (c === '(' || c === ')' || c === '+' || c === '^' || c === '$' || c === '|') {
      regexStr += '\\' + c;
      i++;
    } else if (c === '[') {
      // Character class — pass through
      const closeBracket = pattern.indexOf(']', i + 1);
      if (closeBracket === -1) {
        regexStr += '\\[';
        i++;
      } else {
        regexStr += pattern.slice(i, closeBracket + 1);
        i = closeBracket + 1;
      }
    } else {
      regexStr += c;
      i++;
    }
  }

  regexStr += '$';

  try {
    return new RegExp(regexStr);
  } catch {
    // Fallback: match nothing
    return /(?!)/;
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
