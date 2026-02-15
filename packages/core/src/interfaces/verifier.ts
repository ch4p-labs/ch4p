/**
 * IVerifier — task-level outcome verification contract
 *
 * Inspired by AWM's code-augmented LLM-as-a-Judge pattern. Verifiers run
 * after the agent loop completes (or at configurable checkpoints) to assess
 * whether the task was accomplished correctly.
 *
 * Verification is a two-phase process:
 *   1. **Format check** (fast, code-based) — validates that the result
 *      matches structural expectations (e.g., JSON schema, file exists,
 *      HTTP 200). This catches obviously malformed outputs cheaply.
 *   2. **Semantic check** (optional, LLM-based) — evaluates whether the
 *      result actually satisfies the user's intent. Uses a separate LLM
 *      call to judge correctness, completeness, and quality.
 *
 * The combined result feeds back into the session so the agent can
 * self-correct on partial failures.
 */

import type { Message } from '../types/index.js';
import type { StateSnapshot, ToolResult } from './tool.js';

// ---------------------------------------------------------------------------
// Verification result types
// ---------------------------------------------------------------------------

export type VerificationOutcome = 'success' | 'partial' | 'failure';

export interface VerificationResult {
  /** Overall outcome of the verification. */
  outcome: VerificationOutcome;
  /** Confidence score from 0 to 1. */
  confidence: number;
  /** Human-readable explanation of the verdict. */
  reasoning: string;
  /** Specific issues found during verification. */
  issues?: VerificationIssue[];
  /** Suggestions for how the agent could fix partial/failed outcomes. */
  suggestions?: string[];
  /** Raw format check results. */
  formatCheck?: FormatCheckResult;
  /** Raw semantic check results (if an LLM judge was used). */
  semanticCheck?: SemanticCheckResult;
}

export interface VerificationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** The tool call or step where the issue was detected. */
  step?: string;
}

export interface FormatCheckResult {
  passed: boolean;
  errors?: string[];
}

export interface SemanticCheckResult {
  passed: boolean;
  score: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Verification context
// ---------------------------------------------------------------------------

export interface VerificationContext {
  /** The original user message that initiated the task. */
  taskDescription: string;
  /** The agent's final answer. */
  finalAnswer: string;
  /** Full conversation history. */
  messages: Message[];
  /** All tool results collected during execution. */
  toolResults: ToolResult[];
  /** State snapshots captured before/after tool executions. */
  stateSnapshots: Array<{
    tool: string;
    args: unknown;
    before?: StateSnapshot;
    after?: StateSnapshot;
  }>;
}

// ---------------------------------------------------------------------------
// IVerifier interface
// ---------------------------------------------------------------------------

export interface IVerifier {
  /** Unique identifier for this verifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;

  /**
   * Run format-level validation (fast, code-based).
   *
   * This should be cheap and deterministic — check structural properties
   * like response shape, file existence, API status codes, etc.
   */
  checkFormat(context: VerificationContext): Promise<FormatCheckResult>;

  /**
   * Run semantic-level validation (slower, may use LLM).
   *
   * Evaluates whether the result actually satisfies the user's intent.
   * This is optional — verifiers that only do format checks can return
   * a simple pass-through result.
   */
  checkSemantic?(context: VerificationContext): Promise<SemanticCheckResult>;

  /**
   * Run the full verification pipeline (format + semantic).
   *
   * Combines both checks and produces a unified VerificationResult.
   * The default implementation runs checkFormat first, then checkSemantic
   * if format passes.
   */
  verify(context: VerificationContext): Promise<VerificationResult>;
}
