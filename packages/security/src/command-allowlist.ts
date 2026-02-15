/**
 * CommandAllowlist -- Command execution filtering
 *
 * Only explicitly allowed commands may be executed. Shell metacharacters
 * that could enable injection are blocked in arguments unless the command
 * is explicitly marked for shell mode.
 */

import type { CommandValidation } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CommandAllowlistConfig {
  /**
   * Commands that may be executed. If not provided, a sensible default set
   * is used (git, npm, node, etc.).
   */
  allowedCommands?: string[];

  /**
   * Commands that are allowed to use shell metacharacters in their args.
   * Most commands should NOT be in this list. Use with extreme caution.
   */
  shellModeCommands?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default set of commands an agent may invoke. */
const DEFAULT_ALLOWED_COMMANDS: readonly string[] = [
  'git',
  'npm',
  'pnpm',
  'node',
  'npx',
  'cargo',
  'ls',
  'cat',
  'grep',
  'find',
  'wc',
  'sort',
  'head',
  'tail',
  'mkdir',
  'cp',
  'mv',
  'echo',
  'touch',
] as const;

/**
 * Shell metacharacters and patterns that can enable injection attacks.
 * We match these against individual arguments.
 */
const SHELL_INJECTION_PATTERNS: readonly RegExp[] = [
  /\|/,                  // pipe
  /;/,                   // command separator
  /&&/,                  // logical AND (chain)
  /\|\|/,               // logical OR (chain)
  /\$\(/,               // command substitution $(...)
  /`/,                   // backtick command substitution
  />\s*/,               // output redirection
  /<\s*/,               // input redirection
  /\$\{/,               // variable expansion ${...}
  /\beval\b/,           // eval keyword
  /\bsource\b/,         // source keyword
  /\bexec\b/,           // exec keyword
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CommandAllowlist {
  private readonly allowedCommands: Set<string>;
  private readonly shellModeCommands: Set<string>;

  constructor(config: CommandAllowlistConfig = {}) {
    this.allowedCommands = new Set(
      config.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS
    );
    this.shellModeCommands = new Set(config.shellModeCommands ?? []);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Validate a command + arguments.
   *
   * 1. The base command must be in the allowlist.
   * 2. Arguments must not contain shell metacharacters unless the command
   *    is explicitly in shellModeCommands.
   */
  validateCommand(command: string, args: string[]): CommandValidation {
    // Extract the base command name (strip any path prefix).
    const base = this.extractBaseName(command);

    // ---- 1. Allowlist check ----
    if (!this.allowedCommands.has(base)) {
      return {
        allowed: false,
        reason: `Command "${base}" is not in the allowlist`,
      };
    }

    // ---- 2. Shell metacharacter check ----
    if (!this.shellModeCommands.has(base)) {
      for (const arg of args) {
        const injection = this.detectInjection(arg);
        if (injection) {
          return {
            allowed: false,
            reason: `Argument contains shell metacharacter: ${injection} (in "${arg}")`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /** Check if a command is in the allowlist (without validating args). */
  isAllowed(command: string): boolean {
    return this.allowedCommands.has(this.extractBaseName(command));
  }

  /** Get the current allowlist as an immutable copy. */
  getAllowedCommands(): ReadonlySet<string> {
    return new Set(this.allowedCommands);
  }

  /** Get the current shell-mode commands as an immutable copy. */
  getShellModeCommands(): ReadonlySet<string> {
    return new Set(this.shellModeCommands);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Extract the base command name from a potentially absolute path.
   * e.g. `/usr/bin/git` -> `git`
   */
  private extractBaseName(command: string): string {
    const lastSlash = command.lastIndexOf('/');
    return lastSlash === -1 ? command : command.slice(lastSlash + 1);
  }

  /**
   * Scan a single argument for shell injection patterns.
   * Returns the matched pattern description if found, otherwise null.
   */
  private detectInjection(arg: string): string | null {
    for (const pattern of SHELL_INJECTION_PATTERNS) {
      if (pattern.test(arg)) {
        return pattern.source;
      }
    }
    return null;
  }
}
