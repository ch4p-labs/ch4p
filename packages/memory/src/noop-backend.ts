/**
 * No-op memory backend.
 *
 * All methods are no-ops. Used when memory is disabled in configuration.
 */

import type { IMemoryBackend, RecallOpts, MemoryResult, MemoryEntry } from '@ch4p/core';

export class NoopMemoryBackend implements IMemoryBackend {
  readonly id = 'noop';

  async store(
    _key: string,
    _content: string,
    _metadata?: Record<string, unknown>,
  ): Promise<void> {
    // No-op
  }

  async recall(_query: string, _opts?: RecallOpts): Promise<MemoryResult[]> {
    return [];
  }

  async forget(_key: string): Promise<boolean> {
    return false;
  }

  async list(_prefix?: string): Promise<MemoryEntry[]> {
    return [];
  }

  async reindex(): Promise<void> {
    // No-op
  }

  async close(): Promise<void> {
    // No-op
  }
}
