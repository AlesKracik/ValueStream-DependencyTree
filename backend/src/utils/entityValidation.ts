import type { Db } from 'mongodb';
import { AppError } from './errors';
import { WORK_ITEM_STATUSES, SUPPORT_ISSUE_STATUSES, EFFORT_SIZE_MDS } from './constants';

/**
 * Rejects a status outside its closed set. A missing (undefined/null) status
 * is allowed; anything else not in `allowed` is a 400 naming the field.
 */
function assertStatus(value: unknown, allowed: readonly string[], field: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new AppError(`Invalid ${field}: ${JSON.stringify(value)}. Allowed: ${allowed.join(', ')}`, 400);
  }
}

export function assertSupportIssueStatus(item: unknown): void {
  if (item && typeof item === 'object') {
    assertStatus((item as { status?: unknown }).status, SUPPORT_ISSUE_STATUSES, 'support_issues.status');
  }
}

/**
 * Validates the closed status sets carried by a document (or patch) being
 * written to `collection`: work-item `status` and `effort_size`, and every customer
 * `support_issues[].status`.
 */
// REQ-039
export function assertDocumentStatuses(collection: string, doc: Record<string, unknown>): void {
  if (collection === 'workItems' && 'status' in doc) {
    assertStatus(doc.status, WORK_ITEM_STATUSES, 'status');
  }
  if (collection === 'workItems' && 'effort_size' in doc) {
    assertStatus(doc.effort_size, Object.keys(EFFORT_SIZE_MDS), 'effort_size');
  }
  if (collection === 'customers' && Array.isArray(doc.support_issues)) {
    for (const item of doc.support_issues) assertSupportIssueStatus(item);
  }
}

/** True when `parentId` is set (non-empty) — i.e. the write names a parent. */
export function namesParent(parentId: unknown): parentId is string {
  return typeof parentId === 'string' && parentId !== '';
}

/** Rejects a `parent_id` that names no existing work item. */
// REQ-038; INV-008 guard
export async function assertParentExists(db: Db, parentId: string): Promise<void> {
  const parent = await db.collection('workItems').findOne({ id: parentId }, { projection: { _id: 1 } });
  if (!parent) {
    throw new AppError(`parent_id "${parentId}" does not name an existing work item`, 400);
  }
}

/** True when `ref` is a non-empty string — i.e. the write names a document. */
function namesDoc(ref: unknown): ref is string {
  return typeof ref === 'string' && ref !== '';
}

async function assertExists(db: Db, collection: string, id: string, field: string, what: string): Promise<void> {
  const doc = await db.collection(collection).findOne({ id }, { projection: { _id: 1 } });
  if (!doc) {
    throw new AppError(`${field} "${id}" does not name an existing ${what}`, 400);
  }
}

/** Rejects a customer target naming no existing customer. */
// REQ-046; INV-010 guard
export async function assertCustomerTargetExists(db: Db, target: unknown): Promise<void> {
  const customerId = (target as { customer_id?: unknown } | null)?.customer_id;
  if (namesDoc(customerId)) {
    await assertExists(db, 'customers', customerId, 'customer_targets.customer_id', 'customer');
  }
}

/**
 * Rejects references a document (or patch) carries that name nothing: an
 * issue's work_item_id and team_id, a work item's customer_targets. An empty
 * reference is allowed. parent_id has its own guard (assertParentExists).
 */
// REQ-045, REQ-046; INV-010 guard
export async function assertReferencesExist(db: Db, collection: string, doc: Record<string, unknown>): Promise<void> {
  if (collection === 'issues') {
    if (namesDoc(doc.work_item_id)) await assertExists(db, 'workItems', doc.work_item_id, 'work_item_id', 'work item');
    if (namesDoc(doc.team_id)) await assertExists(db, 'teams', doc.team_id, 'team_id', 'team');
  }
  if (collection === 'workItems' && Array.isArray(doc.customer_targets)) {
    for (const target of doc.customer_targets) await assertCustomerTargetExists(db, target);
  }
}

/** A Jira key compared the way users type it: trimmed, any case. */
function normalizeJiraKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const k = key.trim();
  // Blank and the 'TBD' placeholder name no Jira issue; many issues may carry them.
  return k === '' || k.toUpperCase() === 'TBD' ? null : k;
}

/**
 * Rejects an issue write whose jira_key another issue already holds, so one
 * Jira issue is never tracked twice. Compared trimmed and case-insensitively;
 * blank and 'TBD' keys are exempt. `selfId` is the issue being written (absent
 * on a server-id create).
 */
export async function assertJiraKeyUnique(
  db: Db,
  collection: string,
  doc: Record<string, unknown>,
  selfId?: string
): Promise<void> {
  if (collection !== 'issues') return;
  const key = normalizeJiraKey(doc.jira_key);
  if (!key) return;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const holder = await db.collection('issues').findOne(
    {
      jira_key: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' },
      ...(selfId ? { id: { $ne: selfId } } : {}),
    },
    { projection: { _id: 0, id: 1 } }
  );
  if (holder) {
    throw new AppError(`jira_key "${key}" is already used by issue "${String(holder.id)}"`, 400);
  }
}
