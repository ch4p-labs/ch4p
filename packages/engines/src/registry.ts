/**
 * Engine registry — central registry for execution engines.
 *
 * Maps engine IDs to IEngine instances. Follows the same pattern as
 * ProviderRegistry in @ch4p/providers.
 */

import type { IEngine } from '@ch4p/core';
import { EngineError } from '@ch4p/core';

export class EngineRegistry {
  private readonly engines = new Map<string, IEngine>();

  /**
   * Register an engine instance under its id.
   * If an engine with the same id already exists, it is replaced.
   */
  register(engine: IEngine): void {
    this.engines.set(engine.id, engine);
  }

  /**
   * Get an engine by id.
   * Throws EngineError if not found.
   */
  get(id: string): IEngine {
    const engine = this.engines.get(id);
    if (!engine) {
      throw new EngineError(
        `Engine "${id}" not found. Available: ${[...this.engines.keys()].join(', ') || '(none)'}`,
        id,
      );
    }
    return engine;
  }

  /**
   * Check if an engine is registered.
   */
  has(id: string): boolean {
    return this.engines.has(id);
  }

  /**
   * List all registered engine IDs.
   */
  list(): string[] {
    return [...this.engines.keys()];
  }

  /**
   * Clear all registered engines.
   */
  clear(): void {
    this.engines.clear();
  }
}
