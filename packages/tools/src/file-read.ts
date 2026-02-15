/**
 * FileRead tool — reads file contents with line numbers.
 *
 * Lightweight tool that reads files from the filesystem, adding line number
 * prefixes for easy reference. Supports offset/limit for large files and
 * detects binary files to avoid garbled output.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
import { SecurityError } from '@ch4p/core';

interface FileReadArgs {
  path: string;
  offset?: number;
  limit?: number;
}

const DEFAULT_LINE_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

/** Known binary file extensions that should not be read as text. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.wav', '.flac',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.sqlite', '.db', '.sqlite3',
  '.class', '.pyc', '.pyo', '.o', '.obj',
  '.wasm',
]);

export class FileReadTool implements ITool {
  readonly name = 'file_read';
  readonly description =
    'Read the contents of a file from the filesystem. Lines are returned with ' +
    'line number prefixes. Supports offset and limit for reading portions of ' +
    'large files. Binary files are detected and rejected.';

  readonly weight = 'lightweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to read.',
        minLength: 1,
      },
      offset: {
        type: 'number',
        description:
          'Line number to start reading from (1-based). Defaults to 1.',
        minimum: 1,
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of lines to read. Defaults to 2000.',
        minimum: 1,
      },
    },
    required: ['path'],
    additionalProperties: false,
  };

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { path, offset, limit } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof path !== 'string' || path.trim().length === 0) {
      errors.push('path must be a non-empty string.');
    }

    if (offset !== undefined) {
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 1) {
        errors.push('offset must be a positive integer (1-based).');
      }
    }

    if (limit !== undefined) {
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        errors.push('limit must be a positive integer.');
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

    const { path: filePath, offset, limit } = args as FileReadArgs;
    const absolutePath = resolve(context.cwd, filePath);

    // Validate path against security policy
    const pathValidation = context.securityPolicy.validatePath(absolutePath, 'read');
    if (!pathValidation.allowed) {
      throw new SecurityError(
        `Path blocked: ${pathValidation.reason ?? absolutePath}`,
        { path: absolutePath },
      );
    }

    const resolvedPath = pathValidation.canonicalPath ?? absolutePath;

    // Check for binary file extension
    const ext = extname(resolvedPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return {
        success: false,
        output: '',
        error: `Cannot read binary file (${ext}). Use an appropriate tool for this file type.`,
        metadata: { path: resolvedPath, extension: ext, binary: true },
      };
    }

    // Check file exists and get metadata
    let fileStats;
    try {
      fileStats = await stat(resolvedPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `File not found: ${resolvedPath}`,
        };
      }
      return {
        success: false,
        output: '',
        error: `Cannot access file: ${(err as Error).message}`,
      };
    }

    if (!fileStats.isFile()) {
      return {
        success: false,
        output: '',
        error: `Path is not a file: ${resolvedPath}. Use ls or glob for directories.`,
      };
    }

    // Read the file contents
    let content: string;
    try {
      const buffer = await readFile(resolvedPath);

      // Detect binary content by checking for null bytes in the first 8KB
      const sampleSize = Math.min(buffer.length, 8192);
      for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) {
          return {
            success: false,
            output: '',
            error: 'File appears to be binary (contains null bytes).',
            metadata: { path: resolvedPath, size: fileStats.size, binary: true },
          };
        }
      }

      content = buffer.toString('utf-8');
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${(err as Error).message}`,
      };
    }

    // Handle empty files
    if (content.length === 0) {
      return {
        success: true,
        output: '(empty file)',
        metadata: { path: resolvedPath, lines: 0, size: 0 },
      };
    }

    // Split into lines and apply offset/limit
    const allLines = content.split('\n');
    const startLine = (offset ?? 1) - 1; // Convert 1-based to 0-based
    const lineLimit = limit ?? DEFAULT_LINE_LIMIT;
    const endLine = Math.min(startLine + lineLimit, allLines.length);
    const selectedLines = allLines.slice(startLine, endLine);

    // Format with line numbers, truncating long lines
    const maxLineNumWidth = String(endLine).length;
    const formattedLines = selectedLines.map((line, idx) => {
      const lineNum = String(startLine + idx + 1).padStart(maxLineNumWidth, ' ');
      const truncatedLine =
        line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH) + '...(truncated)'
          : line;
      return `${lineNum}\t${truncatedLine}`;
    });

    const output = formattedLines.join('\n');

    const metadata: Record<string, unknown> = {
      path: resolvedPath,
      totalLines: allLines.length,
      startLine: startLine + 1,
      endLine,
      size: fileStats.size,
    };

    if (endLine < allLines.length) {
      metadata.truncated = true;
      metadata.remainingLines = allLines.length - endLine;
    }

    return {
      success: true,
      output,
      metadata,
    };
  }
}
