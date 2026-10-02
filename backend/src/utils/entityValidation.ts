import type { Db } from 'mongodb';
import { AppError } from './errors';
import { WORK_ITEM_STATUSES, SUPPORT_ISSUE_STATUSES } from './constants';

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
 * written to `collection`: work-item `status`, and every customer
 * `support_issues[].status`.
 */
// REQ-039
export function assertDocumentStatuses(collection: string, doc: Record<string, unknown>): void {
  if (collection === 'workItems' && 'status' in doc) {
    assertStatus(doc.status, WORK_ITEM_STATUSES, 'status');
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
