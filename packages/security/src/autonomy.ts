/**
 * AutonomyGuard -- Operation confirmation based on autonomy level
 *
 * Controls which operations require explicit human confirmation before
 * execution. Three levels provide a graduated trust model:
 *
 * - readonly:   Reads auto-approved. Writes and executes require confirmation.
 * - supervised: Reads and writes auto-approved. Executes require confirmation.
 * - full:       Everything auto-approved (no confirmations).
 */

import type {
  AutonomyLevel,
  ActionDescriptor,
} from '@ch4p/core';

// ---------------------------------------------------------------------------
// Action type classification
// ---------------------------------------------------------------------------

/**
 * Classify an action type string into a broad category.
 *
 * The mapping is intentionally conservative: anything not recognized as
 * a read is treated as a write, and explicit execution keywords are
 * recognized separately.
 */
type ActionCategory = 'read' | 'write' | 'execute';

/** Action types that are always classified as reads. */
const READ_ACTIONS: ReadonlySet<string> = new Set([
  'read',
  'list',
  'get',
  'view',
  'search',
  'query',
  'inspect',
  'stat',
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'grep',
]);

/** Action types that are always classified as executes. */
const EXECUTE_ACTIONS: ReadonlySet<string> = new Set([
  'execute',
  'run',
  'exec',
  'spawn',
  'shell',
  'command',
  'script',
  'invoke',
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AutonomyGuard {
  private readonly level: AutonomyLevel;

  constructor(autonomyLevel: AutonomyLevel) {
    this.level = autonomyLevel;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Determine whether the given action requires human confirmation
   * under the current autonomy level.
   *
   * Returns `true` if confirmation is needed, `false` if auto-approved.
   */
  requiresConfirmation(action: ActionDescriptor): boolean {
    const category = this.classifyAction(action.type);

    switch (this.level) {
      case 'readonly':
        // Only reads are auto-approved.
        return category !== 'read';

      case 'supervised':
        // Reads and writes are auto-approved; executes need confirmation.
        return category === 'execute';

      case 'full':
        // Everything is auto-approved.
        return false;

      default:
        return true;
    }
  }

  /** Get the current autonomy level. */
  getLevel(): AutonomyLevel {
    return this.level;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Classify an action type string into read / write / execute.
   *
   * Comparison is case-insensitive. Unknown types default to 'write'
   * (conservative: require confirmation in readonly mode).
   */
  private classifyAction(actionType: string): ActionCategory {
    const lower = actionType.toLowerCase();

    if (EXECUTE_ACTIONS.has(lower)) {
      return 'execute';
    }

    if (READ_ACTIONS.has(lower)) {
      return 'read';
    }

    // Default: treat unknown actions as writes (conservative).
    return 'write';
  }
}
