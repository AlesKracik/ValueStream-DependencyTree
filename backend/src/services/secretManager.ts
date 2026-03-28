import fs from 'fs';
import path from 'path';
import { getSettingsPath, readSettingsFile, readSettingsFileAsync, extractSecrets, stripSecrets, mergeSecrets } from '../utils/configHelpers';
import { SecretProvider, EncryptedFileProvider, EnvProvider, ENV_PREFIX, NoOpProvider } from './providers';

// Re-export provider types so existing imports from '../secretManager' continue to work
export type { SecretProvider };
export { EncryptedFileProvider, EnvProvider, NoOpProvider };

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
  let sm = getSecretManager();

  // Self-heal: if NoOpProvider was created because ADMIN_SECRET wasn't available
  // at singleton creation time, but is now available, re-create the provider.
  if (sm instanceof NoOpProvider && process.env.ADMIN_SECRET) {
    console.warn('[SecretManager] NoOpProvider was active but ADMIN_SECRET is now available — re-creating provider');
    resetSecretManager();
    sm = getSecretManager();
  }

  // Legacy fallback: if SecretManager has no secrets AND settings.json still has secrets,
  // return config as-is (pre-migration state)
  if (!sm.hasSecrets()) {
    const extracted = extractSecrets(config);
    if (Object.keys(extracted).length > 0) {
      return config;
    }
    console.warn('[Settings] No secrets found in SecretManager or settings.json — returning config without secrets');
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

  const newSecrets = extractSecrets(settings);
  const configOnly = stripSecrets(settings);

  // Write non-secrets to settings.json
  fs.writeFileSync(settingsPath, JSON.stringify(configOnly, null, 2));

  // Merge new secrets with existing ones to prevent data loss.
  // If the caller sends empty/missing sensitive fields (e.g., FE loaded without
  // secrets and sent empty strings), existing secrets are preserved.
  // extractSecrets only returns non-empty, non-mask values, so an empty field
  // simply won't appear in newSecrets — the existing value stays.
  const existingSecrets = sm.getAll();
  const mergedSecrets = { ...existingSecrets, ...newSecrets };

  if (Object.keys(mergedSecrets).length > 0) {
    sm.setAll(mergedSecrets);
  }
}

// --- Async Full Settings with Caching ---

let settingsCache: any = null;

/**
 * Async version of getFullSettings — reads config with fs.promises and caches the result.
 * Cache is invalidated by saveFullSettingsAsync().
 */
export async function getFullSettingsAsync(): Promise<any> {
  if (settingsCache !== null) return settingsCache;

  const config = await readSettingsFileAsync();
  let sm = getSecretManager();

  // Self-heal: if NoOpProvider was created because ADMIN_SECRET wasn't available
  // at singleton creation time (e.g., dotenv file briefly locked on Windows),
  // but ADMIN_SECRET is now available, re-create the provider.
  if (sm instanceof NoOpProvider && process.env.ADMIN_SECRET) {
    console.warn('[SecretManager] NoOpProvider was active but ADMIN_SECRET is now available — re-creating provider');
    resetSecretManager();
    sm = getSecretManager();
  }

  // Legacy fallback: if SecretManager has no secrets AND settings.json still has secrets,
  // return config as-is (pre-migration state)
  if (!sm.hasSecrets()) {
    const extracted = extractSecrets(config);
    if (Object.keys(extracted).length > 0) {
      settingsCache = config;
      return settingsCache;
    }
    // No secrets in either store — do NOT cache so the next request retries
    // (secrets may become available after migration or file unlock)
    console.warn('[Settings] No secrets found in SecretManager or settings.json — returning config without secrets (not caching)');
    return mergeSecrets(config, {});
  }

  // Normal mode: merge secrets from SecretManager into config
  const secrets = sm.getAll();
  settingsCache = mergeSecrets(config, secrets);
  return settingsCache;
}

/**
 * Async version of saveFullSettings — writes with fs.promises and invalidates the cache.
 */
export async function saveFullSettingsAsync(settings: any): Promise<void> {
  const sm = getSecretManager();
  const fsPromises = await import('fs/promises');

  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);
  try {
    await fsPromises.access(dir);
  } catch {
    await fsPromises.mkdir(dir, { recursive: true });
  }

  // If NoOpProvider is active (no ADMIN_SECRET), keep legacy behavior
  if (sm instanceof NoOpProvider) {
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    settingsCache = null;
    return;
  }

  const newSecrets = extractSecrets(settings);
  const configOnly = stripSecrets(settings);

  await fsPromises.writeFile(settingsPath, JSON.stringify(configOnly, null, 2));

  // Merge new secrets with existing ones to prevent data loss.
  // If the caller sends empty/missing sensitive fields (e.g., FE loaded without
  // secrets and sent empty strings), existing secrets are preserved.
  const existingSecrets = sm.getAll();
  const mergedSecrets = { ...existingSecrets, ...newSecrets };

  if (Object.keys(mergedSecrets).length > 0) {
    sm.setAll(mergedSecrets);
  }

  settingsCache = null;
}

/** Invalidate the settings cache (e.g., after external changes) */
export function invalidateSettingsCache(): void {
  settingsCache = null;
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
