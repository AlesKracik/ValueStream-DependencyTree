import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Db } from 'mongodb';
import type { AppUser, UserRole, AuthMethod } from '@valuestream/shared-types';
import logger from '../utils/logger';

const USERS_COLLECTION = 'users';
const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
}

// ─── Password Hashing ──────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT ────────────────────────────────────────────────────────

function getJwtSecret(): string {
  // Use ADMIN_SECRET as JWT signing key; fall back to a generated one (not persistent across restarts)
  const secret = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  if (!secret) {
    logger.warn('[Auth] No ADMIN_SECRET set — JWT tokens will not survive server restarts');
    return 'vst-fallback-' + crypto.randomBytes(16).toString('hex');
  }
  return secret;
}

let cachedSecret: string | null = null;
function getSecret(): string {
  if (!cachedSecret) cachedSecret = getJwtSecret();
  return cachedSecret;
}

export function signToken(payload: JwtPayload, expiryHours: number = 24): string {
  return jwt.sign(payload, getSecret(), { expiresIn: `${expiryHours}h` });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

// ─── User CRUD ──────────────────────────────────────────────────

export async function findUserByUsername(db: Db, username: string): Promise<AppUser | null> {
  const doc = await db.collection(USERS_COLLECTION).findOne({ username });
  if (!doc) return null;
  const { _id, ...user } = doc;
  return user as unknown as AppUser;
}

export async function findUserById(db: Db, id: string): Promise<AppUser | null> {
  const doc = await db.collection(USERS_COLLECTION).findOne({ id });
  if (!doc) return null;
  const { _id, ...user } = doc;
  return user as unknown as AppUser;
}

export async function listUsers(db: Db): Promise<Omit<AppUser, 'password_hash'>[]> {
  const docs = await db.collection(USERS_COLLECTION).find({}).toArray();
  return docs.map(({ _id, password_hash, ...rest }) => rest) as unknown as Omit<AppUser, 'password_hash'>[];
}

export async function getUserCount(db: Db): Promise<number> {
  return db.collection(USERS_COLLECTION).countDocuments({});
}

export async function createUser(
  db: Db,
  username: string,
  displayName: string,
  role: UserRole,
  source: AuthMethod,
  password?: string
): Promise<AppUser> {
  const existing = await findUserByUsername(db, username);
  if (existing) throw new Error(`User '${username}' already exists`);

  const user: AppUser = {
    id: crypto.randomUUID(),
    username,
    display_name: displayName,
    role,
    source,
    created_at: new Date().toISOString(),
    ...(password ? { password_hash: await hashPassword(password) } : {}),
  };

  await db.collection(USERS_COLLECTION).insertOne({ ...user });
  logger.info(`[Auth] Created user '${username}' with role '${role}' (source: ${source})`);
  return user;
}

export async function upsertExternalUser(
  db: Db,
  username: string,
  displayName: string,
  source: AuthMethod,
  defaultRole: UserRole
): Promise<AppUser> {
  const existing = await findUserByUsername(db, username);
  if (existing) {
    // Update last_login and display_name but preserve role
    await db.collection(USERS_COLLECTION).updateOne(
      { username },
      { $set: { last_login: new Date().toISOString(), display_name: displayName } }
    );
    return { ...existing, last_login: new Date().toISOString(), display_name: displayName };
  }
  return createUser(db, username, displayName, defaultRole, source);
}

export async function updateUserRole(db: Db, id: string, role: UserRole): Promise<void> {
  const result = await db.collection(USERS_COLLECTION).updateOne({ id }, { $set: { role } });
  if (result.matchedCount === 0) throw new Error('User not found');
  logger.info(`[Auth] Updated user '${id}' role to '${role}'`);
}

export async function deleteUser(db: Db, id: string): Promise<void> {
  const result = await db.collection(USERS_COLLECTION).deleteOne({ id });
  if (result.deletedCount === 0) throw new Error('User not found');
  logger.info(`[Auth] Deleted user '${id}'`);
}

export async function updateLastLogin(db: Db, username: string): Promise<void> {
  await db.collection(USERS_COLLECTION).updateOne(
    { username },
    { $set: { last_login: new Date().toISOString() } }
  );
}
