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

/**
 * Man-days per work item effort size (mirrors EFFORT_SIZE_MDS in shared-types;
 * copied for the same CommonJS reason as SOURCE_OWNED_FIELDS). Key order is
 * smallest first.
 */
export const EFFORT_SIZE_MDS: Record<string, number> = { XS: 1, S: 10, M: 40, L: 120, XL: 360 };
