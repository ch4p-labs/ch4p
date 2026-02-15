/**
 * MemoryRecall tool — queries the memory backend with hybrid search.
 *
 * Lightweight tool that performs semantic + keyword search against the
 * IMemoryBackend, returning ranked results.
 */

import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
} from '@ch4p/core';
import { ToolError } from '@ch4p/core';
import type { MemoryToolContext } from './memory-store.js';

interface MemoryRecallArgs {
  query: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export class MemoryRecallTool implements ITool {
  readonly name = 'memory_recall';
  readonly description =
    'Query persistent memory using hybrid search (semantic + keyword). ' +
    'Returns ranked results matching the query. Use this to recall ' +
    'previously stored information, context, or decisions.';

  readonly weight = 'lightweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Can be natural language or keywords.',
        minLength: 1,
      },
      limit: {
        type: 'number',
        description: `Maximum number of results to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
        minimum: 1,
        maximum: MAX_LIMIT,
      },
    },
    required: ['query'],
    additionalProperties: false,
  };

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { query, limit } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof query !== 'string' || query.trim().length === 0) {
      errors.push('query must be a non-empty string.');
    }

    if (limit !== undefined) {
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        errors.push('limit must be a positive integer.');
      }
      if (typeof limit === 'number' && limit > MAX_LIMIT) {
        errors.push(`limit cannot exceed ${MAX_LIMIT}.`);
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

    const { query, limit } = args as MemoryRecallArgs;
    const resultLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    try {
      const results = await memoryContext.memoryBackend.recall(query, {
        limit: resultLimit,
      });

      if (results.length === 0) {
        return {
          success: true,
          output: 'No matching memory entries found.',
          metadata: { query, resultCount: 0 },
        };
      }

      const formatted = results.map((r, i) => {
        const header = `[${i + 1}] ${r.key} (score: ${r.score.toFixed(3)}, match: ${r.matchType})`;
        const metaStr = r.metadata
          ? `\n    metadata: ${JSON.stringify(r.metadata)}`
          : '';
        return `${header}${metaStr}\n${r.content}`;
      });

      return {
        success: true,
        output: formatted.join('\n\n---\n\n'),
        metadata: {
          query,
          resultCount: results.length,
          topScore: results[0]?.score,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Memory recall failed: ${(err as Error).message}`,
      };
    }
  }
}
