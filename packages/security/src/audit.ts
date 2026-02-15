/**
 * SecurityAuditor -- Configuration audit checks
 *
 * Runs a battery of checks against the current security configuration
 * and reports findings as numbered AuditResult entries. Each check
 * produces a pass / warn / fail severity with a human-readable message.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AuditResult,
  AuditSeverity,
  AutonomyLevel,
} from '@ch4p/core';

// ---------------------------------------------------------------------------
// Configuration accepted by the auditor
// ---------------------------------------------------------------------------

export interface SecurityAuditorConfig {
  /** Absolute path to the workspace root. */
  workspace: string;

  /** Current autonomy level. */
  autonomyLevel: AutonomyLevel;

  /** Set of commands in the allowlist. */
  allowedCommands: ReadonlySet<string>;

  /** Set of blocked filesystem paths. */
  blockedPaths: ReadonlySet<string>;

  /** Path to the encrypted secrets file. */
  secretsStorePath: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SecurityAuditor {
  private readonly config: SecurityAuditorConfig;

  constructor(config: SecurityAuditorConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Run all audit checks and return a list of findings.
   *
   * Each finding has a unique numeric `id`, a short `name`, a `severity`
   * (pass/warn/fail), and a descriptive `message`.
   */
  audit(): AuditResult[] {
    const results: AuditResult[] = [];
    let nextId = 1;

    const add = (name: string, severity: AuditSeverity, message: string): void => {
      results.push({ id: nextId++, name, severity, message });
    };

    // ---- 1. Workspace directory exists ----
    this.checkWorkspaceExists(add);

    // ---- 2. Workspace is not a system directory ----
    this.checkWorkspaceNotSystem(add);

    // ---- 3. Autonomy level ----
    this.checkAutonomyLevel(add);

    // ---- 4. Blocked paths configured ----
    this.checkBlockedPaths(add);

    // ---- 5. Command allowlist ----
    this.checkCommandAllowlist(add);

    // ---- 6. Secrets file ----
    this.checkSecretsFile(add);

    // ---- 7. Dangerous commands not in allowlist ----
    this.checkDangerousCommands(add);

    return results;
  }

  // -----------------------------------------------------------------------
  // Individual checks
  // -----------------------------------------------------------------------

  private checkWorkspaceExists(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const ws = this.config.workspace;
    if (existsSync(ws)) {
      try {
        const stats = statSync(ws);
        if (stats.isDirectory()) {
          add('workspace_exists', 'pass', `Workspace directory exists: ${ws}`);
        } else {
          add('workspace_exists', 'fail', `Workspace path exists but is not a directory: ${ws}`);
        }
      } catch {
        add('workspace_exists', 'fail', `Cannot stat workspace path: ${ws}`);
      }
    } else {
      add('workspace_exists', 'fail', `Workspace directory does not exist: ${ws}`);
    }
  }

  private checkWorkspaceNotSystem(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const dangerous = ['/', '/etc', '/root', '/usr', '/var', '/tmp', '/sys', '/proc', '/dev'];
    const ws = resolve(this.config.workspace);

    if (dangerous.includes(ws)) {
      add(
        'workspace_safe_location',
        'fail',
        `Workspace is set to a system directory "${ws}" -- this is dangerous`,
      );
    } else {
      add('workspace_safe_location', 'pass', 'Workspace is not a system directory');
    }
  }

  private checkAutonomyLevel(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const level = this.config.autonomyLevel;

    switch (level) {
      case 'readonly':
        add('autonomy_level', 'pass', 'Autonomy level is "readonly" (most restrictive)');
        break;
      case 'supervised':
        add(
          'autonomy_level',
          'pass',
          'Autonomy level is "supervised" (executions require confirmation)',
        );
        break;
      case 'full':
        add(
          'autonomy_level',
          'warn',
          'Autonomy level is "full" -- all operations auto-approved without confirmation',
        );
        break;
    }
  }

  private checkBlockedPaths(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const count = this.config.blockedPaths.size;

    if (count === 0) {
      add(
        'blocked_paths',
        'fail',
        'No blocked paths configured -- system directories are unprotected',
      );
    } else if (count < 5) {
      add(
        'blocked_paths',
        'warn',
        `Only ${count} blocked path(s) configured -- consider adding more system directories`,
      );
    } else {
      add('blocked_paths', 'pass', `${count} blocked paths configured`);
    }
  }

  private checkCommandAllowlist(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const count = this.config.allowedCommands.size;

    if (count === 0) {
      add(
        'command_allowlist',
        'warn',
        'Command allowlist is empty -- no commands can be executed',
      );
    } else if (count > 50) {
      add(
        'command_allowlist',
        'warn',
        `Command allowlist contains ${count} commands -- consider reducing for tighter security`,
      );
    } else {
      add('command_allowlist', 'pass', `${count} command(s) in allowlist`);
    }
  }

  private checkSecretsFile(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const storePath = this.config.secretsStorePath;

    if (!existsSync(storePath)) {
      // Not necessarily a problem -- the store is created on first write.
      add(
        'secrets_file',
        'pass',
        'Secrets file does not exist yet (will be created on first use)',
      );
      return;
    }

    try {
      const stats = statSync(storePath);
      const mode = stats.mode & 0o777;

      // Check file permissions (Unix). Owner read/write only (0o600).
      if ((mode & 0o077) !== 0) {
        add(
          'secrets_file',
          'fail',
          `Secrets file has overly permissive permissions: 0o${mode.toString(8)} (expected 0o600)`,
        );
      } else {
        add('secrets_file', 'pass', 'Secrets file has correct permissions (0o600)');
      }
    } catch {
      add('secrets_file', 'warn', `Cannot stat secrets file: ${storePath}`);
    }
  }

  private checkDangerousCommands(
    add: (name: string, severity: AuditSeverity, message: string) => void,
  ): void {
    const dangerous = ['rm', 'chmod', 'chown', 'kill', 'sudo', 'su', 'dd', 'mkfs', 'fdisk', 'reboot', 'shutdown'];
    const present: string[] = [];

    for (const cmd of dangerous) {
      if (this.config.allowedCommands.has(cmd)) {
        present.push(cmd);
      }
    }

    if (present.length > 0) {
      add(
        'dangerous_commands',
        'warn',
        `Dangerous command(s) in allowlist: ${present.join(', ')}`,
      );
    } else {
      add('dangerous_commands', 'pass', 'No dangerous commands in allowlist');
    }
  }
}
