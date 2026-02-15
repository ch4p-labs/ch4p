/**
 * ITool — tool execution contract
 *
 * Tools are classified as lightweight (run on main thread) or heavyweight
 * (run in worker threads). The weight field determines execution strategy.
 *
 * AWM (Agent World Model) extensions:
 *   - getStateSnapshot(): optional method for observable state diffs after
 *     execution. Enables database-backed verification of tool outcomes.
 *   - validate() is now mandatory in the agent loop (step-level validation).
 */

import type { JSONSchema7 } from '../types/json-schema.js';
import type { ISecurityPolicy } from './security.js';

export interface ToolContext {
  sessionId: string;
  cwd: string;
  securityPolicy: ISecurityPolicy;
  abortSignal: AbortSignal;
  onProgress: (update: string) => void;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** Post-execution state snapshot for verification. Populated automatically
   *  by the agent loop when the tool implements getStateSnapshot(). */
  stateSnapshot?: StateSnapshot;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * StateSnapshot — observable state captured before and/or after tool execution.
 *
 * Inspired by AWM's database-backed state verification. Each snapshot records
 * a keyed set of state values so downstream verifiers can diff pre vs post
 * execution and confirm the tool achieved its intended effect.
 */
export interface StateSnapshot {
  /** ISO-8601 timestamp when the snapshot was taken. */
  timestamp: string;
  /** Key-value pairs representing observable state (e.g., file contents,
   *  database rows, process outputs). Values should be JSON-serialisable. */
  state: Record<string, unknown>;
  /** Optional human-readable description of what changed. */
  description?: string;
}

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly weight: 'lightweight' | 'heavyweight';

  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
  abort?(reason: string): void;
  validate?(args: unknown): ValidationResult;

  /**
   * Capture the current observable state relevant to this tool.
   *
   * Called by the agent loop before and after tool execution to produce
   * state diffs for verification. Tools that interact with external state
   * (filesystem, databases, APIs) should implement this to enable
   * AWM-style outcome verification.
   *
   * @param args — The tool call arguments (so the snapshot can be scoped
   *   to the relevant state, e.g., the file being edited).
   * @param context — The tool execution context.
   */
  getStateSnapshot?(args: unknown, context: ToolContext): Promise<StateSnapshot>;
}
