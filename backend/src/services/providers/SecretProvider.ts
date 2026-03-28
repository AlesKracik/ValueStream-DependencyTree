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
