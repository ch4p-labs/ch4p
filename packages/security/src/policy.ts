/**
 * DefaultSecurityPolicy -- Composed implementation of ISecurityPolicy
 *
 * The main entry point for the security package. Composes all subsystems
 * (FilesystemScope, CommandAllowlist, SecretStore, OutputSanitizer,
 * InputValidator, AutonomyGuard, SecurityAuditor) behind the
 * ISecurityPolicy interface.
 *
 * Users instantiate this class with a workspace path and optional overrides;
 * everything else is wired up with secure defaults.
 */

import { resolve } from 'node:path';
import type {
  ISecurityPolicy,
  AutonomyLevel,
  PathOperation,
  PathValidation,
  CommandValidation,
  ActionDescriptor,
  AuditResult,
  SanitizationResult,
  InputValidationResult,
  ConversationContext,
  AgentTrustContext,
  AgentTrustDecision,
  IIdentityProvider,
} from '@ch4p/core';

import { FilesystemScope } from './filesystem-scope.js';
import { CommandAllowlist } from './command-allowlist.js';
import { SecretStore } from './secrets.js';
import { OutputSanitizer } from './output-sanitizer.js';
import { InputValidator } from './input-validator.js';
import { AutonomyGuard } from './autonomy.js';
import { SecurityAuditor } from './audit.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DefaultSecurityPolicyConfig {
  /** Absolute path to the workspace root. All filesystem access is scoped here. */
  workspace: string;

  /**
   * Autonomy level controlling which operations require confirmation.
   * Default: 'supervised'
   */
  autonomyLevel?: AutonomyLevel;

  /**
   * Commands allowed for execution. If not provided, sensible defaults
   * are used (git, npm, node, etc.).
   */
  allowedCommands?: string[];

  /**
   * Additional filesystem paths to block beyond the built-in system dirs.
   * Must be absolute paths.
   */
  blockedPaths?: string[];

  /**
   * Path to the encrypted secrets file.
   * Defaults to ~/.ch4p/secrets.enc
   */
  secretsStorePath?: string;

  /**
   * Optional identity provider for on-chain trust gating (ERC-8004).
   * When provided, enables checkAgentTrust() for reputation-based access control.
   */
  identityProvider?: IIdentityProvider;

  /**
   * Trust thresholds for gating external agent connections.
   * Only used when identityProvider is set.
   */
  trust?: {
    minReputation?: number;
    minValidation?: number;
    trustedClients?: string[];
    trustedValidators?: string[];
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultSecurityPolicy implements ISecurityPolicy {
  readonly autonomyLevel: AutonomyLevel;

  private readonly filesystemScope: FilesystemScope;
  private readonly commandAllowlist: CommandAllowlist;
  private readonly secretStore: SecretStore;
  private readonly outputSanitizer: OutputSanitizer;
  private readonly inputValidator: InputValidator;
  private readonly autonomyGuard: AutonomyGuard;
  private readonly securityAuditor: SecurityAuditor;
  private readonly identityProvider: IIdentityProvider | null;
  private readonly trustConfig: { minReputation: number; minValidation: number; trustedClients: string[]; trustedValidators: string[] };

  constructor(config: DefaultSecurityPolicyConfig) {
    this.autonomyLevel = config.autonomyLevel ?? 'supervised';

    // Compute secrets store path the same way SecretStore does internally,
    // so we can pass it to the auditor without accessing a private field.
    const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/tmp';
    const secretsPath = config.secretsStorePath ?? resolve(home, '.ch4p', 'secrets.enc');

    // Wire up subsystems.
    this.filesystemScope = new FilesystemScope({
      workspaceRoot: config.workspace,
      extraBlockedPaths: config.blockedPaths,
    });

    this.commandAllowlist = new CommandAllowlist({
      allowedCommands: config.allowedCommands,
    });

    this.secretStore = new SecretStore({
      storePath: secretsPath,
    });

    this.outputSanitizer = new OutputSanitizer();
    this.inputValidator = new InputValidator();
    this.autonomyGuard = new AutonomyGuard(this.autonomyLevel);

    this.securityAuditor = new SecurityAuditor({
      workspace: config.workspace,
      autonomyLevel: this.autonomyLevel,
      allowedCommands: this.commandAllowlist.getAllowedCommands(),
      blockedPaths: this.filesystemScope.getBlockedPaths(),
      secretsStorePath: secretsPath,
    });

    // Identity / trust (optional — no-op when not configured).
    this.identityProvider = config.identityProvider ?? null;
    this.trustConfig = {
      minReputation: config.trust?.minReputation ?? 0,
      minValidation: config.trust?.minValidation ?? 0,
      trustedClients: config.trust?.trustedClients ?? [],
      trustedValidators: config.trust?.trustedValidators ?? [],
    };
  }

  // -----------------------------------------------------------------------
  // ISecurityPolicy -- ZeroClaw filesystem scoping
  // -----------------------------------------------------------------------

  validatePath(path: string, operation: PathOperation): PathValidation {
    return this.filesystemScope.validatePath(path, operation);
  }

  validateCommand(command: string, args: string[]): CommandValidation {
    return this.commandAllowlist.validateCommand(command, args);
  }

  requiresConfirmation(action: ActionDescriptor): boolean {
    return this.autonomyGuard.requiresConfirmation(action);
  }

  audit(): AuditResult[] {
    return this.securityAuditor.audit();
  }

  // -----------------------------------------------------------------------
  // ISecurityPolicy -- Bagman I/O boundary defense
  // -----------------------------------------------------------------------

  sanitizeOutput(text: string): SanitizationResult {
    return this.outputSanitizer.sanitize(text);
  }

  validateInput(text: string, conversationContext?: ConversationContext): InputValidationResult {
    return this.inputValidator.validate(text, conversationContext);
  }

  // -----------------------------------------------------------------------
  // ISecurityPolicy -- ERC-8004 on-chain trust gating
  // -----------------------------------------------------------------------

  async checkAgentTrust(agentId: string, context: AgentTrustContext): Promise<AgentTrustDecision> {
    if (!this.identityProvider) {
      return { allowed: true, reason: 'No identity provider configured; trust check skipped.' };
    }

    try {
      const reputation = await this.identityProvider.getReputation(
        agentId,
        this.trustConfig.trustedClients.length > 0 ? this.trustConfig.trustedClients : undefined,
      );

      const validation = await this.identityProvider.getValidationSummary(
        agentId,
        this.trustConfig.trustedValidators.length > 0 ? this.trustConfig.trustedValidators : undefined,
      );

      const repScore = reputation.normalizedScore;
      const valScore = validation.averageResponse;

      if (repScore < this.trustConfig.minReputation) {
        return {
          allowed: false,
          reason: `Reputation score ${repScore} below minimum ${this.trustConfig.minReputation} for ${context.operation}.`,
          reputationScore: repScore,
          validationScore: valScore,
        };
      }

      if (valScore < this.trustConfig.minValidation) {
        return {
          allowed: false,
          reason: `Validation score ${valScore} below minimum ${this.trustConfig.minValidation} for ${context.operation}.`,
          reputationScore: repScore,
          validationScore: valScore,
        };
      }

      return {
        allowed: true,
        reason: `Agent ${agentId} meets trust thresholds for ${context.operation}.`,
        reputationScore: repScore,
        validationScore: valScore,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        allowed: false,
        reason: `Trust check failed: ${message}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Subsystem accessors (for advanced usage / testing)
  // -----------------------------------------------------------------------

  /** Access the underlying FilesystemScope instance. */
  getFilesystemScope(): FilesystemScope {
    return this.filesystemScope;
  }

  /** Access the underlying CommandAllowlist instance. */
  getCommandAllowlist(): CommandAllowlist {
    return this.commandAllowlist;
  }

  /** Access the underlying SecretStore instance. */
  getSecretStore(): SecretStore {
    return this.secretStore;
  }
}
