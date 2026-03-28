import { SecretProvider } from './SecretProvider';

export class NoOpProvider implements SecretProvider {
  get(): string | undefined { return undefined; }
  getAll(): Record<string, string> { return {}; }
  set(): void { /* no-op */ }
  setAll(): void { /* no-op */ }
  delete(): void { /* no-op */ }
  hasSecrets(): boolean { return false; }
}
