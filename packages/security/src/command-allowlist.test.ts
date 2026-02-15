/**
 * Tests for CommandAllowlist -- command validation, shell metacharacter
 * detection, allowlist management, and base name extraction.
 */

import { CommandAllowlist } from './command-allowlist.js';

describe('CommandAllowlist', () => {
  // -----------------------------------------------------------------------
  // Constructor & defaults
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default allowed commands when none are provided', () => {
      const allowlist = new CommandAllowlist();
      const cmds = allowlist.getAllowedCommands();
      expect(cmds.has('git')).toBe(true);
      expect(cmds.has('npm')).toBe(true);
      expect(cmds.has('node')).toBe(true);
      expect(cmds.has('ls')).toBe(true);
      expect(cmds.has('cat')).toBe(true);
    });

    it('uses custom allowed commands when provided', () => {
      const allowlist = new CommandAllowlist({
        allowedCommands: ['python', 'pip'],
      });
      const cmds = allowlist.getAllowedCommands();
      expect(cmds.has('python')).toBe(true);
      expect(cmds.has('pip')).toBe(true);
      expect(cmds.has('git')).toBe(false);
      expect(cmds.has('npm')).toBe(false);
    });

    it('has empty shellModeCommands by default', () => {
      const allowlist = new CommandAllowlist();
      expect(allowlist.getShellModeCommands().size).toBe(0);
    });

    it('accepts custom shellModeCommands', () => {
      const allowlist = new CommandAllowlist({
        shellModeCommands: ['bash'],
      });
      expect(allowlist.getShellModeCommands().has('bash')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isAllowed
  // -----------------------------------------------------------------------

  describe('isAllowed', () => {
    it('returns true for allowed commands', () => {
      const allowlist = new CommandAllowlist();
      expect(allowlist.isAllowed('git')).toBe(true);
      expect(allowlist.isAllowed('npm')).toBe(true);
    });

    it('returns false for disallowed commands', () => {
      const allowlist = new CommandAllowlist();
      expect(allowlist.isAllowed('rm')).toBe(false);
      expect(allowlist.isAllowed('sudo')).toBe(false);
      expect(allowlist.isAllowed('curl')).toBe(false);
    });

    it('extracts base name from absolute path', () => {
      const allowlist = new CommandAllowlist();
      expect(allowlist.isAllowed('/usr/bin/git')).toBe(true);
      expect(allowlist.isAllowed('/usr/local/bin/node')).toBe(true);
    });

    it('extracts base name from relative path', () => {
      const allowlist = new CommandAllowlist();
      expect(allowlist.isAllowed('./node_modules/.bin/npm')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getAllowedCommands / getShellModeCommands
  // -----------------------------------------------------------------------

  describe('getAllowedCommands', () => {
    it('returns an immutable copy', () => {
      const allowlist = new CommandAllowlist();
      const cmds = allowlist.getAllowedCommands() as Set<string>;
      cmds.add('danger');
      expect(allowlist.isAllowed('danger')).toBe(false);
    });
  });

  describe('getShellModeCommands', () => {
    it('returns an immutable copy', () => {
      const allowlist = new CommandAllowlist({ shellModeCommands: ['bash'] });
      const cmds = allowlist.getShellModeCommands() as Set<string>;
      cmds.add('zsh');
      expect(allowlist.getShellModeCommands().has('zsh')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // validateCommand -- allowlist check
  // -----------------------------------------------------------------------

  describe('validateCommand - allowlist', () => {
    it('allows a command on the allowlist with safe args', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('git', ['status']);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects a command not on the allowlist', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('rm', ['-rf', '/']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowlist');
    });

    it('rejects unknown commands with empty args', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('malware', []);
      expect(result.allowed).toBe(false);
    });

    it('handles command with absolute path', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('/usr/bin/git', ['log']);
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // validateCommand -- shell metacharacter detection
  // -----------------------------------------------------------------------

  describe('validateCommand - shell injection detection', () => {
    let allowlist: CommandAllowlist;

    beforeEach(() => {
      allowlist = new CommandAllowlist();
    });

    it('rejects pipe (|) in arguments', () => {
      const result = allowlist.validateCommand('git', ['log', '| cat /etc/passwd']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects semicolon (;) in arguments', () => {
      const result = allowlist.validateCommand('echo', ['hello; rm -rf /']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects && in arguments', () => {
      const result = allowlist.validateCommand('echo', ['hello && cat /etc/passwd']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects || in arguments', () => {
      const result = allowlist.validateCommand('echo', ['hello || malicious']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects $() command substitution', () => {
      const result = allowlist.validateCommand('echo', ['$(whoami)']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects backtick command substitution', () => {
      const result = allowlist.validateCommand('echo', ['`whoami`']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects output redirection (>)', () => {
      const result = allowlist.validateCommand('echo', ['data > /tmp/file']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects input redirection (<)', () => {
      const result = allowlist.validateCommand('cat', ['< /etc/passwd']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects ${} variable expansion', () => {
      const result = allowlist.validateCommand('echo', ['${PATH}']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects eval keyword in arguments', () => {
      const result = allowlist.validateCommand('node', ['eval "process.exit(1)"']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects source keyword in arguments', () => {
      const result = allowlist.validateCommand('echo', ['source ~/.bashrc']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('rejects exec keyword in arguments', () => {
      const result = allowlist.validateCommand('echo', ['exec /bin/sh']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('shell metacharacter');
    });

    it('allows safe arguments with no metacharacters', () => {
      const result = allowlist.validateCommand('git', ['commit', '-m', 'fix: resolve issue #123']);
      expect(result.allowed).toBe(true);
    });

    it('allows arguments with dashes and numbers', () => {
      const result = allowlist.validateCommand('npm', ['install', '--save-dev', 'vitest@1.0.0']);
      expect(result.allowed).toBe(true);
    });

    it('allows empty argument list', () => {
      const result = allowlist.validateCommand('git', []);
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Shell mode commands
  // -----------------------------------------------------------------------

  describe('shell mode commands', () => {
    it('allows metacharacters in args for shell-mode commands', () => {
      const allowlist = new CommandAllowlist({
        allowedCommands: ['bash', 'git'],
        shellModeCommands: ['bash'],
      });

      const result = allowlist.validateCommand('bash', ['-c', 'echo hello | grep hello']);
      expect(result.allowed).toBe(true);
    });

    it('still rejects metacharacters for non-shell-mode commands', () => {
      const allowlist = new CommandAllowlist({
        allowedCommands: ['bash', 'git'],
        shellModeCommands: ['bash'],
      });

      const result = allowlist.validateCommand('git', ['log | cat']);
      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles commands with multiple slashes in path', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('/a/b/c/d/git', ['status']);
      expect(result.allowed).toBe(true);
    });

    it('handles empty string command', () => {
      const allowlist = new CommandAllowlist();
      const result = allowlist.validateCommand('', []);
      expect(result.allowed).toBe(false);
    });

    it('is case-sensitive for command names', () => {
      const allowlist = new CommandAllowlist();
      // "Git" with capital G is not "git"
      expect(allowlist.isAllowed('Git')).toBe(false);
      expect(allowlist.isAllowed('GIT')).toBe(false);
    });

    it('detects injection in any argument position', () => {
      const allowlist = new CommandAllowlist();
      // Injection in the third argument
      const result = allowlist.validateCommand('git', ['commit', '-m', 'msg; rm -rf /']);
      expect(result.allowed).toBe(false);
    });
  });
});
