import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSettingsPath, readSettingsFile, extractSecrets, stripSecrets, mergeSecrets } from '../utils/configHelpers';

// --- Provider Interface ---

export interface SecretProvider {
  /** Get a single secret by its dot-path key (e.g., "persistence.mongo.app.uri") */
  get(key: string): string | undefined;
  /** Get all secrets as a flat key-value map */
  getAll(): Record<string, string>;
  /** Store a single secret */
  set(key: string, value: string): void;
  /** Store multiple secrets at once (replaces all existing secrets) */
  setAll(secrets: Record<string, string>): void;
  /** Delete a secret */
  delete(key: string): void;
  /** Check if any secrets exist */
  hasSecrets(): boolean;
}

// --- Encrypted File Provider ---

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';

interface EncryptedFileFormat {
  version: 1;
  salt: string;    // base64
  iv: string;      // base64
  tag: string;     // base64 (GCM auth tag)
  ciphertext: string; // base64
}

export class EncryptedFileProvider implements SecretProvider {
  private filePath: string;
  private masterKey: string;
  private cache: Record<string, string> | null = null;

  constructor(filePath: string, masterKey: string) {
    this.filePath = filePath;
    this.masterKey = masterKey;
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(this.masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  }

  private encrypt(data: string): EncryptedFileFormat {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: encrypted.toString('base64')
    };
  }

  private decrypt(file: EncryptedFileFormat): string {
    const salt = Buffer.from(file.salt, 'base64');
    const key = this.deriveKey(salt);
    const iv = Buffer.from(file.iv, 'base64');
    const tag = Buffer.from(file.tag, 'base64');
    const ciphertext = Buffer.from(file.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf-8');
  }

  private readFile(): Record<string, string> {
    if (this.cache !== null) return this.cache;

    if (!fs.existsSync(this.filePath) ||
        fs.statSync(this.filePath).isDirectory()) {
      this.cache = {};
      return this.cache;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const file: EncryptedFileFormat = JSON.parse(raw);

      if (file.version !== 1) {
        throw new Error(`Unsupported secrets file version: ${file.version}`);
      }

      const decrypted = this.decrypt(file);
      this.cache = JSON.parse(decrypted);
      return this.cache!;
    } catch (e: any) {
      if (e.message?.includes('Unsupported secrets file version')) throw e;
      throw new Error(`Failed to decrypt secrets file. Is ADMIN_SECRET correct? (${e.message})`);
    }
  }

  private writeFile(secrets: Record<string, string>): void {
    const json = JSON.stringify(secrets);
    const encrypted = this.encrypt(json);

    // Atomic write: write to temp file then rename
    const tmpPath = this.filePath + '.tmp';
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Docker bind mounts create a directory when the host file doesn't exist.
    // Detect and remove the spurious directory so the write can proceed.
    if (fs.existsSync(this.filePath) && fs.statSync(this.filePath).isDirectory()) {
      fs.rmSync(this.filePath, { recursive: true });
    }

    fs.writeFileSync(tmpPath, JSON.stringify(encrypted, null, 2));
    fs.renameSync(tmpPath, this.filePath);

    this.cache = secrets;
  }

  get(key: string): string | undefined {
    return this.readFile()[key];
  }

  getAll(): Record<string, string> {
    return { ...this.readFile() };
  }

  set(key: string, value: string): void {
    const secrets = this.readFile();
    secrets[key] = value;
    this.writeFile(secrets);
  }

  setAll(secrets: Record<string, string>): void {
    this.writeFile({ ...secrets });
  }

  delete(key: string): void {
    const secrets = this.readFile();
    delete secrets[key];
    this.writeFile(secrets);
  }

  hasSecrets(): boolean {
    return Object.keys(this.readFile()).length > 0;
  }

  /** Invalidate in-memory cache (for testing or after external changes) */
  invalidateCache(): void {
    this.cache = null;
  }
}

// --- Environment Variable Provider (for K8s) ---

const ENV_PREFIX = 'VSDT_SECRET_';

export class EnvProvider implements SecretProvider {
  private prefix: string;

  constructor(prefix: string = ENV_PREFIX) {
    this.prefix = prefix;
  }

  /** Convert dot-path to env var name: "persistence.mongo.app.uri" -> "VSDT_SECRET_PERSISTENCE_MONGO_APP_URI" */
  private toEnvKey(dotPath: string): string {
    return this.prefix + dotPath.replace(/\./g, '_').toUpperCase();
  }

  /** Convert env var name to dot-path: "VSDT_SECRET_PERSISTENCE_MONGO_APP_URI" -> "persistence.mongo.app.uri" */
  private toDotPath(envKey: string): string {
    return envKey.slice(this.prefix.length).toLowerCase().replace(/_/g, '.');
  }

  get(key: string): string | undefined {
    return process.env[this.toEnvKey(key)] || undefined;
  }

  getAll(): Record<string, string> {
    const secrets: Record<string, string> = {};
    for (const [envKey, value] of Object.entries(process.env)) {
      if (envKey.startsWith(this.prefix) && value) {
        secrets[this.toDotPath(envKey)] = value;
      }
    }
    return secrets;
  }

  // Env vars are read-only — these are no-ops
  set(): void { /* no-op */ }
  setAll(): void { /* no-op */ }
  delete(): void { /* no-op */ }

  hasSecrets(): boolean {
    return Object.keys(this.getAll()).length > 0;
  }
}

// --- No-Op Provider (dev fallback when ADMIN_SECRET is not set) ---

export class NoOpProvider implements SecretProvider {
  get(): string | undefined { return undefined; }
  getAll(): Record<string, string> { return {}; }
  set(): void { /* no-op */ }
  setAll(): void { /* no-op */ }
  delete(): void { /* no-op */ }
  hasSecrets(): boolean { return false; }
}

// --- Singleton Factory ---

let instance: SecretProvider | null = null;

export function getSecretManager(): SecretProvider {
  if (!instance) {
    instance = createProvider();
  }
  return instance;
}

function createProvider(): SecretProvider {
  // Priority 1: If VSDT_SECRET_* env vars exist, use EnvProvider
  const hasEnvSecrets = Object.keys(process.env).some(k => k.startsWith(ENV_PREFIX));
  if (hasEnvSecrets) {
    console.log('[SecretManager] Using EnvProvider (VSDT_SECRET_* env vars detected)');
    return new EnvProvider();
  }

  // Priority 2: EncryptedFileProvider (default)
  const masterKey = process.env.ADMIN_SECRET;
  if (!masterKey) {
    console.warn('[SecretManager] ADMIN_SECRET not set — using NoOpProvider (secrets remain in settings.json)');
    return new NoOpProvider();
  }

  const settingsPath = getSettingsPath();
  const encPath = settingsPath.replace(/\.json$/, '.secrets.enc');
  console.log('[SecretManager] Using EncryptedFileProvider');
  return new EncryptedFileProvider(encPath, masterKey);
}

/** Reset singleton for testing */
export function resetSecretManager(): void {
  instance = null;
}

/** Override the singleton provider (for testing) */
export function setSecretManager(provider: SecretProvider): void {
  instance = provider;
}

// --- Full Settings Read/Write (config + secrets merged) ---

/**
 * Get complete settings (config from settings.json + secrets from SecretManager, merged).
 * In legacy mode (no SecretManager secrets yet), returns settings.json as-is.
 */
export function getFullSettings(): any {
  const config = readSettingsFile();
  const sm = getSecretManager();

  // Legacy fallback: if SecretManager has no secrets AND settings.json still has secrets,
  // return config as-is (pre-migration state)
  if (!sm.hasSecrets()) {
    const extracted = extractSecrets(config);
    if (Object.keys(extracted).length > 0) {
      return config;
    }
  }

  // Normal mode: merge secrets from SecretManager into config
  const secrets = sm.getAll();
  return mergeSecrets(config, secrets);
}

/**
 * Save complete settings by splitting secrets from config.
 * Secrets go to SecretManager, non-secrets go to settings.json.
 * Falls back to writing everything to settings.json when NoOpProvider is active.
 */
export function saveFullSettings(settings: any): void {
  const sm = getSecretManager();

  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // If NoOpProvider is active (no ADMIN_SECRET), keep legacy behavior:
  // write everything to settings.json so secrets are not lost
  if (sm instanceof NoOpProvider) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return;
  }

  const secrets = extractSecrets(settings);
  const configOnly = stripSecrets(settings);

  // Write non-secrets to settings.json
  fs.writeFileSync(settingsPath, JSON.stringify(configOnly, null, 2));

  // Write secrets to SecretManager
  if (Object.keys(secrets).length > 0) {
    sm.setAll(secrets);
  }
}

// --- Migration ---

/**
 * Migrate secrets from plain-text settings.json to the SecretManager.
 * Idempotent: no-op if settings.json contains no secrets.
 */
export function migrateSecretsFromSettingsFile(): { migrated: number } {
  const config = readSettingsFile();
  const secrets = extractSecrets(config);

  if (Object.keys(secrets).length === 0) {
    return { migrated: 0 };
  }

  const sm = getSecretManager();

  // If using NoOpProvider, we can't migrate — secrets stay in settings.json
  if (sm instanceof NoOpProvider) {
    console.warn('[SecretManager] Cannot migrate secrets: ADMIN_SECRET not set');
    return { migrated: 0 };
  }

  // If using EnvProvider, secrets are managed externally — don't strip from settings.json
  if (sm instanceof EnvProvider) {
    console.log('[SecretManager] EnvProvider active — skipping migration (secrets managed externally)');
    return { migrated: 0 };
  }

  // Write secrets to SecretManager
  sm.setAll(secrets);

  // Strip secrets from settings.json and rewrite
  const configOnly = stripSecrets(config);
  const settingsPath = getSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(configOnly, null, 2));

  console.log(`[SecretManager] Migrated ${Object.keys(secrets).length} secrets from settings.json to encrypted storage`);
  return { migrated: Object.keys(secrets).length };
}
