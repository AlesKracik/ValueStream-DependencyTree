import { SecretProvider } from './SecretProvider';

export const ENV_PREFIX = 'VSDT_SECRET_';

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
