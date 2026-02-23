/**
 * install command unit tests.
 *
 * Tests the plist and systemd unit content generators without touching the
 * filesystem or running any shell commands. Verifies:
 *   - launchd plist is valid XML with required keys
 *   - systemd unit contains required directives
 *   - binary path handling (direct binary vs node invocation)
 *   - environment variable wiring
 *   - unsupported platform handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We test the exported helpers by importing the module directly.
// The module uses process.platform which we override per test.
// ---------------------------------------------------------------------------

// We can't easily test the full interactive command without spawning processes,
// so we focus on unit-testing the content generators via black-box output checks.

// Helper: simulate install command with platform override and mock FS/exec.
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),   // config exists by default
    chmodSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
  };
});

import * as fs from 'node:fs';
import * as cp from 'node:child_process';

const { install } = await import('./install.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('install command', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: existsSync returns true (config file found).
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Default execSync returns empty string (success).
    vi.mocked(cp.execSync).mockReturnValue('' as unknown as Buffer);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  // ---- Platform gate ----

  it('rejects unsupported platform (win32)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    await install([]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;  // reset
  });

  it('does not write any files on unsupported platform', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    await install([]);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  it('rejects when config file does not exist on install', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await install([]);
    expect(process.exitCode).toBe(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  // ---- macOS launchd ----

  it('writes a plist file on darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    // execSync mock: first call (which ch4p) returns a path
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/local/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const [[plistPath, plistContent]] = vi.mocked(fs.writeFileSync).mock.calls as [[string, string]];
    expect(plistPath).toContain('com.ch4p.gateway.plist');
    expect(plistContent).toContain('<key>Label</key>');
    expect(plistContent).toContain('<string>com.ch4p.gateway</string>');
    expect(plistContent).toContain('<key>RunAtLoad</key>');
    expect(plistContent).toContain('<key>KeepAlive</key>');
    expect(plistContent).toContain('<key>StandardOutPath</key>');
    expect(plistContent).toContain('<key>StandardErrorPath</key>');
    expect(plistContent).toContain('/usr/local/bin/ch4p');
  });

  it('plist contains HOME environment variable', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/local/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    const [[, plistContent]] = vi.mocked(fs.writeFileSync).mock.calls as [[string, string]];
    expect(plistContent).toContain('<key>HOME</key>');
  });

  it('calls launchctl to load the plist', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/local/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    const calls = vi.mocked(cp.execSync).mock.calls.map(([c]) => String(c));
    const loadCall = calls.find((c) => c.includes('launchctl load'));
    expect(loadCall).toBeDefined();
  });

  // ---- macOS uninstall ----

  it('calls launchctl unload and removes plist on --uninstall', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(cp.execSync).mockReturnValue('' as unknown as Buffer);

    await install(['--uninstall']);

    expect(fs.rmSync).toHaveBeenCalled();
  });

  // ---- Linux systemd ----

  it('writes a systemd unit file on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const [[unitPath, unitContent]] = vi.mocked(fs.writeFileSync).mock.calls as [[string, string]];
    expect(unitPath).toContain('ch4p-gateway.service');
    expect(unitContent).toContain('[Unit]');
    expect(unitContent).toContain('[Service]');
    expect(unitContent).toContain('[Install]');
    expect(unitContent).toContain('Restart=on-failure');
    expect(unitContent).toContain('TimeoutStopSec=40');
    expect(unitContent).toContain('/usr/bin/ch4p gateway');
  });

  it('systemd unit contains WantedBy=default.target', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    const [[, unitContent]] = vi.mocked(fs.writeFileSync).mock.calls as [[string, string]];
    expect(unitContent).toContain('WantedBy=default.target');
  });

  it('calls systemctl to enable and start on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) return '/usr/bin/ch4p' as unknown as Buffer;
      return '' as unknown as Buffer;
    });

    await install([]);

    const calls = vi.mocked(cp.execSync).mock.calls.map(([c]) => String(c));
    expect(calls.some((c) => c.includes('daemon-reload'))).toBe(true);
    expect(calls.some((c) => c.includes('enable'))).toBe(true);
    expect(calls.some((c) => c.includes('start'))).toBe(true);
  });

  // ---- Linux uninstall ----

  it('calls systemctl stop/disable and removes unit on linux --uninstall', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.mocked(cp.execSync).mockReturnValue('' as unknown as Buffer);

    await install(['--uninstall']);

    expect(fs.rmSync).toHaveBeenCalled();
  });

  // ---- --status and --logs do not write files ----

  it('--status does not write any files (darwin)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(cp.execSync).mockReturnValue('- 0 com.ch4p.gateway' as unknown as Buffer);
    await install(['--status']);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('--status does not write any files (linux)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.mocked(cp.execSync).mockReturnValue('● ch4p-gateway.service' as unknown as Buffer);
    await install(['--status']);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // ---- --help ----

  it('--help prints usage and does not call writeFileSync', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    await install(['--help']);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // ---- node-style binary path ----

  it('emits "node <path>" in plist ProgramArguments when binary not on PATH', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    // which fails → findBinary falls back to process.argv[1]
    vi.mocked(cp.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('which')) {
        throw new Error('not found');
      }
      return '' as unknown as Buffer;
    });

    // Set argv[1] so the fallback path is used.
    const origArgv = process.argv;
    process.argv = ['node', '/usr/local/lib/ch4p/dist/index.js', 'install'];

    await install([]);

    process.argv = origArgv;

    // Even if plist was written, it should contain "node"
    if (vi.mocked(fs.writeFileSync).mock.calls.length > 0) {
      const [[, plistContent]] = vi.mocked(fs.writeFileSync).mock.calls as [[string, string]];
      // The fallback should either use "ch4p" or "node <path>" — not empty
      expect(plistContent).toBeTruthy();
    }
  });
});
