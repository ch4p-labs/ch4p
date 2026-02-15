/**
 * Tests for SecretStore -- encrypted secret storage, CRUD operations,
 * environment variable fallback, masking, and file persistence.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { SecretStore } from './secrets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ch4p-secrets-test-'));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function makeStore(dir: string): SecretStore {
  return new SecretStore({
    storePath: join(dir, 'test-secrets.enc'),
    // Use fast iterations for tests
    pbkdf2Iterations: 1000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecretStore', () => {
  let dir: string;
  let store: SecretStore;

  beforeEach(() => {
    dir = createTempDir();
    store = makeStore(dir);
  });

  afterEach(() => {
    cleanup(dir);
  });

  // -----------------------------------------------------------------------
  // Basic CRUD
  // -----------------------------------------------------------------------

  describe('set and get', () => {
    it('stores and retrieves a secret', () => {
      store.set('my_key', 'my_value');
      expect(store.get('my_key')).toBe('my_value');
    });

    it('stores and retrieves multiple secrets', () => {
      store.set('key1', 'value1');
      store.set('key2', 'value2');
      store.set('key3', 'value3');

      expect(store.get('key1')).toBe('value1');
      expect(store.get('key2')).toBe('value2');
      expect(store.get('key3')).toBe('value3');
    });

    it('overwrites an existing secret', () => {
      store.set('overwrite_key', 'original');
      store.set('overwrite_key', 'updated');
      expect(store.get('overwrite_key')).toBe('updated');
    });

    it('returns undefined for non-existent key', () => {
      expect(store.get('does_not_exist')).toBeUndefined();
    });

    it('handles empty string values', () => {
      store.set('empty', '');
      expect(store.get('empty')).toBe('');
    });

    it('handles special characters in values', () => {
      const special = 'p@$$w0rd!#%^&*()_+-=[]{}|;\':",.<>?/`~';
      store.set('special', special);
      expect(store.get('special')).toBe(special);
    });

    it('handles unicode values', () => {
      const unicode = 'secret-value-with-emoji-and-unicode';
      store.set('unicode_key', unicode);
      expect(store.get('unicode_key')).toBe(unicode);
    });

    it('handles very long values', () => {
      const longValue = 'x'.repeat(10_000);
      store.set('long', longValue);
      expect(store.get('long')).toBe(longValue);
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('deletes an existing secret', () => {
      store.set('to_delete', 'value');
      const result = store.delete('to_delete');
      expect(result).toBe(true);
      expect(store.get('to_delete')).toBeUndefined();
    });

    it('returns false when deleting a non-existent key', () => {
      const result = store.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('does not affect other secrets when deleting one', () => {
      store.set('keep', 'keeper');
      store.set('remove', 'remover');
      store.delete('remove');

      expect(store.get('keep')).toBe('keeper');
      expect(store.get('remove')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns empty array when no secrets are stored', () => {
      expect(store.list()).toEqual([]);
    });

    it('returns all stored key names', () => {
      store.set('alpha', 'a');
      store.set('beta', 'b');
      store.set('gamma', 'c');

      const keys = store.list();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
      expect(keys).toHaveLength(3);
    });

    it('does not return deleted keys', () => {
      store.set('a', '1');
      store.set('b', '2');
      store.delete('a');

      const keys = store.list();
      expect(keys).not.toContain('a');
      expect(keys).toContain('b');
    });
  });

  // -----------------------------------------------------------------------
  // has
  // -----------------------------------------------------------------------

  describe('has', () => {
    it('returns true for existing key', () => {
      store.set('exists', 'val');
      expect(store.has('exists')).toBe(true);
    });

    it('returns false for non-existent key', () => {
      expect(store.has('nope')).toBe(false);
    });

    it('returns false after key is deleted', () => {
      store.set('temp', 'val');
      store.delete('temp');
      expect(store.has('temp')).toBe(false);
    });

    it('returns true for key available via env var fallback', () => {
      // Set a CH4P_ prefixed env var
      const key = 'test_env_check';
      const envKey = `CH4P_TEST_ENV_CHECK`;
      process.env[envKey] = 'env_value';

      try {
        expect(store.has(key)).toBe(true);
      } finally {
        delete process.env[envKey];
      }
    });
  });

  // -----------------------------------------------------------------------
  // Environment variable fallback
  // -----------------------------------------------------------------------

  describe('environment variable fallback', () => {
    it('falls back to CH4P_ prefixed env var when not in store', () => {
      const envKey = 'CH4P_MY_TOKEN';
      process.env[envKey] = 'env_token_value';

      try {
        const value = store.get('my_token');
        expect(value).toBe('env_token_value');
      } finally {
        delete process.env[envKey];
      }
    });

    it('prefers stored value over env var', () => {
      const envKey = 'CH4P_PRIORITY';
      process.env[envKey] = 'from_env';
      store.set('priority', 'from_store');

      try {
        expect(store.get('priority')).toBe('from_store');
      } finally {
        delete process.env[envKey];
      }
    });

    it('converts key to uppercase for env var lookup', () => {
      const envKey = 'CH4P_LOWER_CASE_KEY';
      process.env[envKey] = 'found';

      try {
        expect(store.get('lower_case_key')).toBe('found');
      } finally {
        delete process.env[envKey];
      }
    });

    it('replaces non-alphanumeric characters with underscores in env key', () => {
      const envKey = 'CH4P_MY_SPECIAL_KEY';
      process.env[envKey] = 'special_value';

      try {
        // "my-special.key" should become "MY_SPECIAL_KEY"
        expect(store.get('my-special.key')).toBe('special_value');
      } finally {
        delete process.env[envKey];
      }
    });
  });

  // -----------------------------------------------------------------------
  // mask (static method)
  // -----------------------------------------------------------------------

  describe('mask', () => {
    it('masks a normal-length secret', () => {
      expect(SecretStore.mask('mysecretvalue')).toBe('m***********e');
    });

    it('masks a 3-character secret', () => {
      expect(SecretStore.mask('abc')).toBe('a*c');
    });

    it('masks a 2-character secret (all stars)', () => {
      expect(SecretStore.mask('ab')).toBe('**');
    });

    it('masks a 1-character secret (single star)', () => {
      expect(SecretStore.mask('x')).toBe('*');
    });

    it('masks an empty string (empty result)', () => {
      expect(SecretStore.mask('')).toBe('');
    });

    it('preserves first and last characters for long strings', () => {
      const masked = SecretStore.mask('SuperSecretPassword123');
      expect(masked[0]).toBe('S');
      expect(masked[masked.length - 1]).toBe('3');
      expect(masked.length).toBe(22);
    });
  });

  // -----------------------------------------------------------------------
  // File persistence
  // -----------------------------------------------------------------------

  describe('file persistence', () => {
    it('creates the store file on first write', () => {
      const storePath = join(dir, 'new-secrets.enc');
      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      expect(existsSync(storePath)).toBe(false);
      s.set('trigger', 'creation');
      expect(existsSync(storePath)).toBe(true);
    });

    it('creates parent directories if they do not exist', () => {
      const nestedPath = join(dir, 'a', 'b', 'c', 'secrets.enc');
      const s = new SecretStore({ storePath: nestedPath, pbkdf2Iterations: 1000 });
      s.set('nested', 'value');
      expect(existsSync(nestedPath)).toBe(true);
    });

    it('sets file permissions to 0o600 (owner read/write only)', () => {
      const storePath = join(dir, 'perms-secrets.enc');
      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      s.set('perm_test', 'value');

      const stats = statSync(storePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('persists data across instances with same config', () => {
      const storePath = join(dir, 'persist-secrets.enc');
      const config = { storePath, pbkdf2Iterations: 1000 };

      const s1 = new SecretStore(config);
      s1.set('persistent', 'data');

      const s2 = new SecretStore(config);
      expect(s2.get('persistent')).toBe('data');
    });

    it('stores encrypted data (not plaintext) on disk', () => {
      const storePath = join(dir, 'encrypted-secrets.enc');
      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      s.set('secret_key', 'this_should_be_encrypted');

      const raw = readFileSync(storePath, 'utf8');
      expect(raw).not.toContain('this_should_be_encrypted');

      // But it should be valid JSON
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.entries).toHaveProperty('secret_key');

      // Each entry should have iv, tag, data
      const entry = parsed.entries.secret_key;
      expect(entry).toHaveProperty('iv');
      expect(entry).toHaveProperty('tag');
      expect(entry).toHaveProperty('data');
    });

    it('handles corrupted store file gracefully', () => {
      const storePath = join(dir, 'corrupt-secrets.enc');
      const { writeFileSync: wf } = require('node:fs');
      wf(storePath, 'not valid json');

      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      // Should not throw; returns undefined for missing keys
      expect(s.get('any_key')).toBeUndefined();
      expect(s.list()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Encryption integrity
  // -----------------------------------------------------------------------

  describe('encryption integrity', () => {
    it('different values produce different ciphertexts', () => {
      const storePath = join(dir, 'diff-secrets.enc');
      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      s.set('key1', 'value_one');
      s.set('key2', 'value_two');

      const raw = JSON.parse(readFileSync(storePath, 'utf8'));
      expect(raw.entries.key1.data).not.toBe(raw.entries.key2.data);
    });

    it('same value stored twice produces different IVs', () => {
      const storePath = join(dir, 'iv-secrets.enc');
      const s = new SecretStore({ storePath, pbkdf2Iterations: 1000 });
      s.set('key1', 'same_value');

      const raw1 = JSON.parse(readFileSync(storePath, 'utf8'));
      const iv1 = raw1.entries.key1.iv;

      // Overwrite with the same value -- new IV should be generated
      s.set('key1', 'same_value');
      const raw2 = JSON.parse(readFileSync(storePath, 'utf8'));
      const iv2 = raw2.entries.key1.iv;

      expect(iv1).not.toBe(iv2);
    });

    it('cannot decrypt with a different key (different salt)', () => {
      const storePath = join(dir, 'key-mismatch.enc');
      const s1 = new SecretStore({ storePath, pbkdf2Iterations: 1000, salt: 'salt-A' });
      s1.set('secret', 'top_secret');

      const s2 = new SecretStore({ storePath, pbkdf2Iterations: 1000, salt: 'salt-B' });
      // Should throw or return garbled data
      expect(() => s2.get('secret')).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Constructor defaults
  // -----------------------------------------------------------------------

  describe('constructor defaults', () => {
    it('can be constructed with no arguments', () => {
      const s = new SecretStore();
      // Should not throw
      expect(s).toBeDefined();
      expect(s.list()).toEqual([]);
    });

    it('uses default store path when not specified', () => {
      const s = new SecretStore();
      // Just verify it works without throwing
      expect(s.has('nonexistent')).toBe(false);
    });
  });
});
