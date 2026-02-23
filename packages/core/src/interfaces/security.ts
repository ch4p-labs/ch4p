/**
 * ISecurityPolicy — scoping and permissions contract
 *
 * Security-first defaults from ZeroClaw + Bagman-inspired I/O boundary defense.
 * Everything is ON by default. Users opt out, never opt in.
 */

export type AutonomyLevel = 'readonly' | 'supervised' | 'full';
export type PathOperation = 'read' | 'write' | 'execute';

export interface PathValidation {
  allowed: boolean;
  reason?: string;
  canonicalPath?: string;
}

export interface CommandValidation {
  allowed: boolean;
  reason?: string;
}

export interface ActionDescriptor {
  type: string;
  target: string;
  details?: Record<string, unknown>;
}

export type AuditSeverity = 'pass' | 'warn' | 'fail';

export interface AuditResult {
  id: number;
  name: string;
  severity: AuditSeverity;
  message: string;
}

export interface SanitizationResult {
  clean: string;
  redacted: boolean;
  redactedPatterns?: string[];
}

export interface InputValidationResult {
  safe: boolean;
  threats: ThreatDetection[];
}

export interface ThreatDetection {
  type: 'extraction' | 'injection' | 'role_manipulation' | 'jailbreak' | 'exfiltration';
  pattern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface ISecurityPolicy {
  readonly autonomyLevel: AutonomyLevel;

  // ZeroClaw filesystem scoping
  validatePath(path: string, operation: PathOperation): PathValidation;
  validateCommand(command: string, args: string[]): CommandValidation;
  requiresConfirmation(action: ActionDescriptor): boolean;
  audit(): AuditResult[];

  // Bagman-inspired I/O boundary defense
  sanitizeOutput(text: string): SanitizationResult;
  validateInput(text: string, conversationContext?: ConversationContext): InputValidationResult;

  // ERC-8004 on-chain trust gating (optional — no-op when identity plugin is absent)
  checkAgentTrust?(agentId: string, context: AgentTrustContext): Promise<AgentTrustDecision>;
}

/** Context for on-chain trust assessment. */
export interface AgentTrustContext {
  /** What operation is being gated. */
  operation: 'delegate' | 'mcp_connect' | 'a2a_call' | 'tool_proxy';
  /** Chain ID of the identity registry. */
  chainId?: number;
  /** Pre-fetched reputation score (if available). */
  reputationScore?: number;
  /** Pre-fetched validation score (if available). */
  validationScore?: number;
}

/** Result of an on-chain trust check. */
export interface AgentTrustDecision {
  allowed: boolean;
  reason: string;
  reputationScore?: number;
  validationScore?: number;
}

export interface ConversationContext {
  turnCount: number;
  sensitiveKeywords: Set<string>;
  extractionAttempts: number;
  overrideAttempts: number;
}
