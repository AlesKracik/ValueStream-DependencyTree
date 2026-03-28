import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SecretProvider } from './SecretProvider';

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

    const content = JSON.stringify(encrypted, null, 2);
    fs.writeFileSync(tmpPath, content);
    try {
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Docker bind mounts on macOS don't support atomic rename over the mount.
      // Fall back to direct write + cleanup.
      fs.writeFileSync(this.filePath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    }

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
