/** Collection names that are allowed for CRUD and query operations. */
export const ALLOWED_COLLECTIONS: string[] = ['customers', 'workItems', 'teams', 'issues', 'sprints', 'valueStreams'];

/** Closed set of WorkItem.status values (mirrors the shared-types union). */
export const WORK_ITEM_STATUSES: readonly string[] = ['Backlog', 'Planning', 'Development', 'Done'];

/** Closed set of SupportIssue.status values (mirrors the shared-types union). */
export const SUPPORT_ISSUE_STATUSES: readonly string[] = [
  'to do', 'work in progress', 'noop', 'waiting for customer',
  'waiting for other party', 'waiting for release', 'done',
];

/**
 * Work item fields owned by each external source when the item's origin is
 * that source (mirrors SOURCE_OWNED_FIELDS in shared-types; the backend builds
 * to CommonJS and can't load runtime values from the ESM shared package).
 */
export const SOURCE_OWNED_FIELDS: Record<'aha', readonly ('name' | 'description')[]> = {
  aha: ['name', 'description'],
};
