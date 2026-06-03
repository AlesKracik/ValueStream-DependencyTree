// Helpers for Jira JQL search: pagination and one-level "Parent Link" child
// expansion. Fetch is injected so the pure paging/dedupe/chunking logic is
// unit-testable without a live Jira instance.

/** Jira /search page size (Jira caps maxResults at 100 for most instances). */
export const PAGE_SIZE = 100;

/** How many parent keys to pack into a single `"Parent Link" in (...)` query. */
export const CHILD_CHUNK_SIZE = 50;

export interface JiraPage {
  issues: any[];
  names?: Record<string, string>;
  total?: number;
}

/** Fetches one page of a JQL query starting at `startAt`. */
export type JiraFetchPage = (jql: string, startAt: number) => Promise<JiraPage>;

/** Split an array into fixed-size chunks. */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Build a JQL clause matching issues whose "Parent Link" points at any of the
 * given keys. Keys are quoted so unusual project keys remain valid.
 */
export function buildParentLinkJql(keys: string[]): string {
  const quoted = keys.map((k) => `"${k}"`).join(', ');
  return `"Parent Link" in (${quoted})`;
}

/**
 * Run a JQL query to completion, following pagination until every issue is
 * fetched. `names` (custom-field id → label) is taken from the first page.
 */
export async function searchAllPages(
  fetchPage: JiraFetchPage,
  jql: string,
): Promise<{ issues: any[]; names: Record<string, string> }> {
  const issues: any[] = [];
  let names: Record<string, string> = {};
  let startAt = 0;

  for (;;) {
    const page = await fetchPage(jql, startAt);
    if (startAt === 0) names = page.names || {};
    const pageIssues = page.issues || [];
    issues.push(...pageIssues);

    const fetched = startAt + pageIssues.length;
    const total = page.total ?? fetched;
    if (pageIssues.length === 0 || fetched >= total) break;
    startAt = fetched;
  }

  return { issues, names };
}

/**
 * Fetch one level of children for `parentKeys` via the "Parent Link" field.
 * New issues (not already in `seen`) are added to `seen` and returned. Parent
 * keys are batched to keep each JQL clause short; a batch that fails is counted
 * and skipped (fail-soft) so a partial import still succeeds.
 */
export async function expandChildren(
  fetchPage: JiraFetchPage,
  parentKeys: string[],
  seen: Map<string, any>,
  options?: {
    chunkSize?: number;
    onChunkError?: (keys: string[], err: unknown) => void;
  },
): Promise<{ added: any[]; names: Record<string, string>; failedChunks: number }> {
  const chunkSize = options?.chunkSize ?? CHILD_CHUNK_SIZE;
  const added: any[] = [];
  let names: Record<string, string> = {};
  let failedChunks = 0;

  for (const keys of chunk(parentKeys, chunkSize)) {
    try {
      const res = await searchAllPages(fetchPage, buildParentLinkJql(keys));
      names = { ...res.names, ...names };
      for (const issue of res.issues) {
        if (!seen.has(issue.key)) {
          seen.set(issue.key, issue);
          added.push(issue);
        }
      }
    } catch (err) {
      failedChunks++;
      options?.onChunkError?.(keys, err);
    }
  }

  return { added, names, failedChunks };
}
