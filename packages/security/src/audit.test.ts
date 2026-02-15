/**
 * Tests for SecurityAuditor -- configuration audit checks including
 * workspace validation, autonomy level warnings, blocked paths,
 * command allowlist, secrets file, and dangerous command detection.
 */

import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { SecurityAuditor } from './audit.js';
import type { SecurityAuditorConfig } from './audit.js';
import type { AutonomyLevel } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ch4p-audit-test-'));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function makeConfig(overrides: Partial<SecurityAuditorConfig> = {}): SecurityAuditorConfig {
  return {
    workspace: overrides.workspace ?? createTempDir(),
    autonomyLevel: overrides.autonomyLevel ?? 'supervised',
    allowedCommands: overrides.allowedCommands ?? new Set(['git', 'npm', 'node', 'ls', 'cat', 'grep']),
    blockedPaths: overrides.blockedPaths ?? new Set(['/etc', '/root', '/proc', '/sys', '/dev', '/boot']),
    secretsStorePath: overrides.secretsStorePath ?? '/nonexistent/secrets.enc',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecurityAuditor', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      cleanup(dir);
    }
    tempDirs.length = 0;
  });

  // -----------------------------------------------------------------------
  // General structure
  // -----------------------------------------------------------------------

  describe('audit result structure', () => {
    it('returns an array of AuditResult objects', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('severity');
        expect(result).toHaveProperty('message');
        expect(typeof result.id).toBe('number');
        expect(typeof result.name).toBe('string');
        expect(['pass', 'warn', 'fail']).toContain(result.severity);
        expect(typeof result.message).toBe('string');
      }
    });

    it('assigns sequential IDs starting from 1', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      for (let i = 0; i < results.length; i++) {
        expect(results[i]!.id).toBe(i + 1);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Workspace exists check
  // -----------------------------------------------------------------------

  describe('workspace exists check', () => {
    it('passes when workspace directory exists', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'workspace_exists');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    it('fails when workspace does not exist', () => {
      const config = makeConfig({ workspace: '/nonexistent/workspace/path' });
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'workspace_exists');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('fail');
      expect(check!.message).toContain('does not exist');
    });

    it('fails when workspace path is a file, not a directory', () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const filePath = join(dir, 'not-a-dir');
      writeFileSync(filePath, 'just a file');

      const config = makeConfig({ workspace: filePath });
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'workspace_exists');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('fail');
      expect(check!.message).toContain('not a directory');
    });
  });

  // -----------------------------------------------------------------------
  // Workspace not system directory check
  // -----------------------------------------------------------------------

  describe('workspace safe location check', () => {
    it('passes for normal workspace directory', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'workspace_safe_location');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    const dangerousDirs = ['/', '/etc', '/root', '/usr', '/var', '/tmp', '/sys', '/proc', '/dev'];

    for (const dir of dangerousDirs) {
      it(`fails when workspace is "${dir}"`, () => {
        const config = makeConfig({ workspace: dir });
        const auditor = new SecurityAuditor(config);
        const results = auditor.audit();

        const check = results.find(r => r.name === 'workspace_safe_location');
        expect(check).toBeDefined();
        expect(check!.severity).toBe('fail');
        expect(check!.message).toContain('system directory');
      });
    }
  });

  // -----------------------------------------------------------------------
  // Autonomy level check
  // -----------------------------------------------------------------------

  describe('autonomy level check', () => {
    it('passes for "readonly" level', () => {
      const config = makeConfig({ autonomyLevel: 'readonly' });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'autonomy_level');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
      expect(check!.message).toContain('readonly');
    });

    it('passes for "supervised" level', () => {
      const config = makeConfig({ autonomyLevel: 'supervised' });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'autonomy_level');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    it('warns for "full" autonomy level', () => {
      const config = makeConfig({ autonomyLevel: 'full' });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'autonomy_level');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('full');
    });
  });

  // -----------------------------------------------------------------------
  // Blocked paths check
  // -----------------------------------------------------------------------

  describe('blocked paths check', () => {
    it('passes with 5+ blocked paths', () => {
      const config = makeConfig({
        blockedPaths: new Set(['/etc', '/root', '/proc', '/sys', '/dev']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'blocked_paths');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    it('warns with fewer than 5 blocked paths', () => {
      const config = makeConfig({
        blockedPaths: new Set(['/etc', '/root']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'blocked_paths');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('Only 2');
    });

    it('fails with zero blocked paths', () => {
      const config = makeConfig({ blockedPaths: new Set() });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'blocked_paths');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('fail');
      expect(check!.message).toContain('No blocked paths');
    });
  });

  // -----------------------------------------------------------------------
  // Command allowlist check
  // -----------------------------------------------------------------------

  describe('command allowlist check', () => {
    it('passes with reasonable number of commands', () => {
      const config = makeConfig({
        allowedCommands: new Set(['git', 'npm', 'node']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'command_allowlist');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    it('warns with empty command allowlist', () => {
      const config = makeConfig({ allowedCommands: new Set() });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'command_allowlist');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('empty');
    });

    it('warns with more than 50 commands', () => {
      const cmds = new Set<string>();
      for (let i = 0; i < 51; i++) {
        cmds.add(`cmd${i}`);
      }
      const config = makeConfig({ allowedCommands: cmds });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'command_allowlist');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('51');
    });
  });

  // -----------------------------------------------------------------------
  // Secrets file check
  // -----------------------------------------------------------------------

  describe('secrets file check', () => {
    it('passes when secrets file does not exist (first use)', () => {
      const config = makeConfig({
        secretsStorePath: '/nonexistent/path/secrets.enc',
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'secrets_file');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
      expect(check!.message).toContain('does not exist yet');
    });

    it('passes when secrets file has correct permissions (0o600)', () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const secretsPath = join(dir, 'secrets.enc');
      writeFileSync(secretsPath, '{}', { mode: 0o600 });

      const config = makeConfig({ secretsStorePath: secretsPath });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'secrets_file');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
      expect(check!.message).toContain('correct permissions');
    });

    it('fails when secrets file has overly permissive permissions', () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const secretsPath = join(dir, 'secrets.enc');
      writeFileSync(secretsPath, '{}', { mode: 0o644 });

      const config = makeConfig({ secretsStorePath: secretsPath });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'secrets_file');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('fail');
      expect(check!.message).toContain('permissive permissions');
    });
  });

  // -----------------------------------------------------------------------
  // Dangerous commands check
  // -----------------------------------------------------------------------

  describe('dangerous commands check', () => {
    it('passes when no dangerous commands are in allowlist', () => {
      const config = makeConfig({
        allowedCommands: new Set(['git', 'npm', 'node']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'dangerous_commands');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('pass');
    });

    it('warns when "rm" is in allowlist', () => {
      const config = makeConfig({
        allowedCommands: new Set(['git', 'npm', 'rm']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'dangerous_commands');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('rm');
    });

    it('warns when "sudo" is in allowlist', () => {
      const config = makeConfig({
        allowedCommands: new Set(['git', 'sudo']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'dangerous_commands');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('sudo');
    });

    it('warns with multiple dangerous commands listed', () => {
      const config = makeConfig({
        allowedCommands: new Set(['git', 'rm', 'chmod', 'kill']),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'dangerous_commands');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      expect(check!.message).toContain('rm');
      expect(check!.message).toContain('chmod');
      expect(check!.message).toContain('kill');
    });

    it('detects all known dangerous commands', () => {
      const dangerous = ['rm', 'chmod', 'chown', 'kill', 'sudo', 'su', 'dd', 'mkfs', 'fdisk', 'reboot', 'shutdown'];
      const config = makeConfig({
        allowedCommands: new Set(dangerous),
      });
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const check = results.find(r => r.name === 'dangerous_commands');
      expect(check).toBeDefined();
      expect(check!.severity).toBe('warn');
      for (const cmd of dangerous) {
        expect(check!.message).toContain(cmd);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Full audit run
  // -----------------------------------------------------------------------

  describe('full audit', () => {
    it('runs all 7 checks in a healthy configuration', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const names = results.map(r => r.name);
      expect(names).toContain('workspace_exists');
      expect(names).toContain('workspace_safe_location');
      expect(names).toContain('autonomy_level');
      expect(names).toContain('blocked_paths');
      expect(names).toContain('command_allowlist');
      expect(names).toContain('secrets_file');
      expect(names).toContain('dangerous_commands');
    });

    it('all checks pass for a well-configured system', () => {
      const config = makeConfig();
      tempDirs.push(config.workspace);
      const auditor = new SecurityAuditor(config);
      const results = auditor.audit();

      const failures = results.filter(r => r.severity === 'fail');
      expect(failures).toHaveLength(0);
    });
  });
});
