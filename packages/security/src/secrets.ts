/**
 * SecretStore -- Encrypted secrets management
 *
 * Secrets are encrypted at rest using AES-256-GCM. The encryption key is
 * derived from a machine-specific identifier (hostname + username) via
 * PBKDF2, so secrets are tied to the machine they were created on.
 *
 * Falls back to environment variables with the CH4P_ prefix when a secret
 * is not found in the store.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { hostname, userInfo } from 'node:os';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SecretStoreConfig {
  /**
   * Path to the encrypted secrets file.
   * Defaults to ~/.ch4p/secrets.enc
   */
  storePath?: string;

  /**
   * Custom salt for PBKDF2 key derivation. Leave undefined to use the
   * built-in default (hostname-based).
   */
  salt?: string;

  /**
   * Number of PBKDF2 iterations. Higher = slower but more secure.
   * Default: 100_000.
   */
  pbkdf2Iterations?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes (256 bits)
const IV_LENGTH = 16; // bytes (128 bits)
const AUTH_TAG_LENGTH = 16; // bytes
const DEFAULT_ITERATIONS = 100_000;
const ENV_PREFIX = 'CH4P_';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface EncryptedPayload {
  /** Hex-encoded IV */
  iv: string;
  /** Hex-encoded auth tag */
  tag: string;
  /** Hex-encoded ciphertext */
  data: string;
}

interface SecretsFile {
  version: 1;
  entries: Record<string, EncryptedPayload>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SecretStore {
  private readonly storePath: string;
  private readonly key: Buffer;

  constructor(config: SecretStoreConfig = {}) {
    const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/tmp';
    this.storePath = config.storePath ?? resolve(home, '.ch4p', 'secrets.enc');

    // Derive encryption key from machine identity.
    const machineId = `${hostname()}:${userInfo().username}`;
    const salt = config.salt ?? `ch4p-secrets-${machineId}`;
    const iterations = config.pbkdf2Iterations ?? DEFAULT_ITERATIONS;

    this.key = pbkdf2Sync(machineId, salt, iterations, KEY_LENGTH, 'sha512');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Retrieve a secret by key.
   * Falls back to environment variable CH4P_<KEY> (uppercased) if not in store.
   */
  get(key: string): string | undefined {
    const store = this.loadStore();
    const entry = store.entries[key];

    if (entry) {
      return this.decrypt(entry);
    }

    // Fallback: environment variable with CH4P_ prefix.
    const envKey = `${ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
    return process.env[envKey];
  }

  /** Store a secret (encrypted at rest). */
  set(key: string, value: string): void {
    const store = this.loadStore();
    store.entries[key] = this.encrypt(value);
    this.saveStore(store);
  }

  /** Delete a secret from the store. */
  delete(key: string): boolean {
    const store = this.loadStore();
    if (!(key in store.entries)) {
      return false;
    }
    delete store.entries[key];
    this.saveStore(store);
    return true;
  }

  /** List all secret keys in the store (values are NOT returned). */
  list(): string[] {
    const store = this.loadStore();
    return Object.keys(store.entries);
  }

  /** Check if a secret exists in the store or as an env var. */
  has(key: string): boolean {
    const store = this.loadStore();
    if (key in store.entries) {
      return true;
    }
    const envKey = `${ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
    return envKey in process.env;
  }

  /**
   * Mask a secret value for safe display.
   * Shows only the first and last character, with asterisks in between.
   * e.g. "my-secret-value" -> "m*************e"
   */
  static mask(value: string): string {
    if (value.length <= 2) {
      return '*'.repeat(value.length);
    }
    return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1]!;
  }

  // -----------------------------------------------------------------------
  // Encryption helpers
  // -----------------------------------------------------------------------

  private encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      data: encrypted.toString('hex'),
    };
  }

  private decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const data = Buffer.from(payload.data, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private loadStore(): SecretsFile {
    try {
      if (!existsSync(this.storePath)) {
        return { version: 1, entries: {} };
      }
      const raw = readFileSync(this.storePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        'entries' in parsed
      ) {
        return parsed as SecretsFile;
      }
      return { version: 1, entries: {} };
    } catch {
      return { version: 1, entries: {} };
    }
  }

  private saveStore(store: SecretsFile): void {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), {
      encoding: 'utf8',
      mode: 0o600, // Owner read/write only.
    });
  }
}
