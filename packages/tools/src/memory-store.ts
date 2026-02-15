/**
 * MemoryStore tool — stores content in the memory backend.
 *
 * Lightweight tool that persists key-value entries with optional metadata
 * into the IMemoryBackend for later retrieval via semantic or keyword search.
 */

import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
  IMemoryBackend,
} from '@ch4p/core';
import { ToolError } from '@ch4p/core';

interface MemoryStoreArgs {
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extended ToolContext that includes the memory backend.
 * Tools that require memory access expect this extended context.
 */
export interface MemoryToolContext extends ToolContext {
  memoryBackend?: IMemoryBackend;
}

export class MemoryStoreTool implements ITool {
  readonly name = 'memory_store';
  readonly description =
    'Store content in persistent memory for later retrieval. Each entry ' +
    'has a unique key, content string, and optional metadata. Stored entries ' +
    'can be recalled using semantic or keyword search.';

  readonly weight = 'lightweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'Unique key for the memory entry. Use descriptive keys like "project/architecture" or "user/preferences".',
        minLength: 1,
        maxLength: 256,
      },
      content: {
        type: 'string',
        description: 'The content to store.',
        minLength: 1,
      },
      metadata: {
        type: 'object',
        description:
          'Optional metadata to associate with the entry (e.g. tags, source, timestamp).',
        additionalProperties: true,
      },
    },
    required: ['key', 'content'],
    additionalProperties: false,
  };

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { key, content, metadata } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof key !== 'string' || key.trim().length === 0) {
      errors.push('key must be a non-empty string.');
    }
    if (typeof key === 'string' && key.length > 256) {
      errors.push('key must not exceed 256 characters.');
    }

    if (typeof content !== 'string' || content.length === 0) {
      errors.push('content must be a non-empty string.');
    }

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        errors.push('metadata must be a plain object.');
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

    const memoryContext = context as MemoryToolContext;
    if (!memoryContext.memoryBackend) {
      throw new ToolError(
        'Memory backend is not available. Configure a memory backend to use memory tools.',
        this.name,
      );
    }

    const { key, content, metadata } = args as MemoryStoreArgs;

    try {
      await memoryContext.memoryBackend.store(key, content, metadata);
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to store memory entry: ${(err as Error).message}`,
      };
    }

    return {
      success: true,
      output: `Stored memory entry with key "${key}" (${content.length} chars).`,
      metadata: {
        key,
        contentLength: content.length,
        hasMetadata: metadata !== undefined,
      },
    };
  }
}
