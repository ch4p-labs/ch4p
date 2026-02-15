/**
 * Tests for the CLI configuration module.
 *
 * Covers: getDefaultConfig, loadConfig, saveConfig, ensureConfigDir,
 * configExists, getCh4pDir, getConfigPath, getLogsDir, env var resolution,
 * deep merge, validation, and ConfigLoadError.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Ch4pConfig } from '@ch4p/core';

// We need to mock homedir() before importing config functions, but vitest
// hoists vi.mock calls. We use a dynamic import approach instead.

// ---------------------------------------------------------------------------
// Mock homedir to use a temp directory
// ---------------------------------------------------------------------------

const TEST_HOME = join(tmpdir(), `ch4p-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

// Now import the config functions — they will use our mocked homedir.
import {
  getCh4pDir,
  getConfigPath,
  getLogsDir,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  ensureConfigDir,
  configExists,
  ConfigLoadError,
} from './config.js';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Create a clean temp home directory for each test.
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  // Clean up temp directory after each test.
  try {
    rmSync(TEST_HOME, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on Windows.
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTestConfig(config: Record<string, unknown>): void {
  const ch4pDir = join(TEST_HOME, '.ch4p');
  mkdirSync(ch4pDir, { recursive: true });
  writeFileSync(join(ch4pDir, 'config.json'), JSON.stringify(config));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Config paths', () => {
  it('getCh4pDir returns ~/.ch4p', () => {
    expect(getCh4pDir()).toBe(resolve(TEST_HOME, '.ch4p'));
  });

  it('getConfigPath returns ~/.ch4p/config.json', () => {
    expect(getConfigPath()).toBe(join(resolve(TEST_HOME, '.ch4p'), 'config.json'));
  });

  it('getLogsDir returns ~/.ch4p/logs', () => {
    expect(getLogsDir()).toBe(join(resolve(TEST_HOME, '.ch4p'), 'logs'));
  });
});

describe('getDefaultConfig', () => {
  it('returns a valid default configuration', () => {
    const config = getDefaultConfig();

    expect(config.agent.model).toBe('claude-sonnet-4-20250514');
    expect(config.agent.provider).toBe('anthropic');
    expect(config.agent.thinkingLevel).toBe('medium');
  });

  it('has correct gateway defaults', () => {
    const config = getDefaultConfig();

    expect(config.gateway.port).toBe(18789);
    expect(config.gateway.requirePairing).toBe(true);
    expect(config.gateway.allowPublicBind).toBe(false);
  });

  it('has correct memory defaults', () => {
    const config = getDefaultConfig();

    expect(config.memory.backend).toBe('sqlite');
    expect(config.memory.autoSave).toBe(true);
    expect(config.memory.vectorWeight).toBe(0.7);
    expect(config.memory.keywordWeight).toBe(0.3);
  });

  it('has correct autonomy defaults', () => {
    const config = getDefaultConfig();

    expect(config.autonomy.level).toBe('supervised');
    expect(config.autonomy.allowedCommands).toContain('git');
    expect(config.autonomy.allowedCommands).toContain('node');
    expect(config.autonomy.allowedCommands.length).toBeGreaterThan(5);
  });

  it('has correct security defaults', () => {
    const config = getDefaultConfig();

    expect(config.security.workspaceOnly).toBe(true);
    expect(config.security.blockedPaths).toEqual([]);
  });

  it('has correct observability defaults', () => {
    const config = getDefaultConfig();

    expect(config.observability.observers).toEqual(['console']);
    expect(config.observability.logLevel).toBe('info');
  });

  it('defaults to encrypted secrets', () => {
    const config = getDefaultConfig();

    expect(config.secrets.encrypt).toBe(true);
  });

  it('defaults to no tunnel', () => {
    const config = getDefaultConfig();

    expect(config.tunnel.provider).toBe('none');
  });

  it('defaults to native engine', () => {
    const config = getDefaultConfig();

    expect(config.engines.default).toBe('native');
    expect(config.engines.available['native']).toBeDefined();
  });

  it('includes env var references for API keys', () => {
    const config = getDefaultConfig();

    const anthropic = config.providers['anthropic'] as Record<string, unknown>;
    expect(anthropic?.apiKey).toBe('${ANTHROPIC_API_KEY}');

    const openai = config.providers['openai'] as Record<string, unknown>;
    expect(openai?.apiKey).toBe('${OPENAI_API_KEY}');
  });
});

describe('ensureConfigDir', () => {
  it('creates ~/.ch4p and ~/.ch4p/logs directories', () => {
    const ch4pDir = getCh4pDir();
    const logsDir = getLogsDir();

    expect(existsSync(ch4pDir)).toBe(false);
    expect(existsSync(logsDir)).toBe(false);

    ensureConfigDir();

    expect(existsSync(ch4pDir)).toBe(true);
    expect(existsSync(logsDir)).toBe(true);
  });

  it('is idempotent — calling twice does not throw', () => {
    ensureConfigDir();
    expect(() => ensureConfigDir()).not.toThrow();
  });
});

describe('configExists', () => {
  it('returns false when no config file exists', () => {
    expect(configExists()).toBe(false);
  });

  it('returns true when config file exists', () => {
    writeTestConfig({ agent: { model: 'test', provider: 'test' } });
    expect(configExists()).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    // loadConfig should work even without a user config file —
    // but the defaults include ${VAR} references that resolve to empty strings
    // if the env vars are not set. The Anthropic key resolves to '' which
    // means the config is still valid (model and provider are present).
    const config = loadConfig();

    expect(config.agent.model).toBe('claude-sonnet-4-20250514');
    expect(config.agent.provider).toBe('anthropic');
    expect(config.gateway.port).toBe(18789);
  });

  it('deep-merges user config over defaults', () => {
    writeTestConfig({
      agent: {
        model: 'gpt-4',
      },
      gateway: {
        port: 9999,
      },
    });

    const config = loadConfig();

    // Overridden values.
    expect(config.agent.model).toBe('gpt-4');
    expect(config.gateway.port).toBe(9999);

    // Non-overridden values should still have defaults.
    expect(config.agent.provider).toBe('anthropic');
    expect(config.gateway.requirePairing).toBe(true);
    expect(config.memory.backend).toBe('sqlite');
  });

  it('resolves environment variables in string values', () => {
    const savedEnv = process.env['MY_TEST_VAR'];
    process.env['MY_TEST_VAR'] = 'resolved-value';

    try {
      writeTestConfig({
        providers: {
          custom: {
            apiKey: '${MY_TEST_VAR}',
          },
        },
      });

      const config = loadConfig();
      const custom = config.providers['custom'] as Record<string, unknown>;
      expect(custom?.apiKey).toBe('resolved-value');
    } finally {
      if (savedEnv === undefined) {
        delete process.env['MY_TEST_VAR'];
      } else {
        process.env['MY_TEST_VAR'] = savedEnv;
      }
    }
  });

  it('resolves missing env vars to empty string', () => {
    // Default config has ${ANTHROPIC_API_KEY} — if env var is not set, resolves to ''
    delete process.env['ANTHROPIC_API_KEY'];

    const config = loadConfig();
    const anthropic = config.providers['anthropic'] as Record<string, unknown>;
    expect(anthropic?.apiKey).toBe('');
  });

  it('replaces arrays during merge (no concatenation)', () => {
    writeTestConfig({
      autonomy: {
        allowedCommands: ['docker', 'kubectl'],
      },
    });

    const config = loadConfig();

    // Array should be replaced, not merged with defaults.
    expect(config.autonomy.allowedCommands).toEqual(['docker', 'kubectl']);
    expect(config.autonomy.allowedCommands).not.toContain('git');
  });

  it('throws ConfigLoadError for invalid JSON', () => {
    const ch4pDir = join(TEST_HOME, '.ch4p');
    mkdirSync(ch4pDir, { recursive: true });
    writeFileSync(join(ch4pDir, 'config.json'), 'not valid json{{{');

    expect(() => loadConfig()).toThrow(ConfigLoadError);
  });

  it('throws ConfigLoadError when agent.model is missing', () => {
    writeTestConfig({
      agent: {
        model: '',
        provider: 'anthropic',
      },
    });

    expect(() => loadConfig()).toThrow(ConfigLoadError);
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('agent.model');
    }
  });

  it('throws ConfigLoadError when agent.provider is missing', () => {
    writeTestConfig({
      agent: {
        model: 'gpt-4',
        provider: '',
      },
    });

    expect(() => loadConfig()).toThrow(ConfigLoadError);
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('agent.provider');
    }
  });

  it('throws ConfigLoadError for invalid port', () => {
    writeTestConfig({
      gateway: {
        port: 99999,
      },
    });

    expect(() => loadConfig()).toThrow(ConfigLoadError);
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('gateway.port');
    }
  });

  it('throws ConfigLoadError for invalid autonomy level', () => {
    writeTestConfig({
      autonomy: {
        level: 'yolo',
      },
    });

    expect(() => loadConfig()).toThrow(ConfigLoadError);
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('autonomy.level');
    }
  });

  it('throws ConfigLoadError for invalid log level', () => {
    writeTestConfig({
      observability: {
        logLevel: 'verbose',
      },
    });

    expect(() => loadConfig()).toThrow(ConfigLoadError);
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('observability.logLevel');
    }
  });

  it('accepts valid autonomy levels', () => {
    for (const level of ['readonly', 'supervised', 'full']) {
      writeTestConfig({
        autonomy: { level },
      });
      const config = loadConfig();
      expect(config.autonomy.level).toBe(level);
    }
  });

  it('accepts valid log levels', () => {
    for (const logLevel of ['debug', 'info', 'warn', 'error']) {
      writeTestConfig({
        observability: { logLevel },
      });
      const config = loadConfig();
      expect(config.observability.logLevel).toBe(logLevel);
    }
  });
});

describe('saveConfig', () => {
  it('saves config to disk and can be loaded back', () => {
    const config = getDefaultConfig();
    config.agent.model = 'saved-model';
    config.gateway.port = 12345;

    saveConfig(config);

    // The file should exist.
    expect(configExists()).toBe(true);

    // Load it back and verify.
    const loaded = loadConfig();
    expect(loaded.agent.model).toBe('saved-model');
    expect(loaded.gateway.port).toBe(12345);
  });

  it('creates config directory if it does not exist', () => {
    const ch4pDir = getCh4pDir();
    expect(existsSync(ch4pDir)).toBe(false);

    saveConfig(getDefaultConfig());

    expect(existsSync(ch4pDir)).toBe(true);
  });
});

describe('ConfigLoadError', () => {
  it('has the correct error name', () => {
    const err = new ConfigLoadError('test message');

    expect(err.name).toBe('ConfigLoadError');
    expect(err.message).toBe('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConfigLoadError);
  });
});
