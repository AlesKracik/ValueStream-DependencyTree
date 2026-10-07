import { SOURCE_OWNED_FIELDS } from '@valuestream/shared-types';
import type { WorkItem, WorkItemOrigin, WorkItemSource, ExternalLink } from '@valuestream/shared-types';

/**
 * Client copy of the server's origin derivation (backend/src/utils/workItemOrigin.ts).
 * PATCH answers with `_version` only, so the client computes the same origin
 * and source-owned values the server stores to keep its local state in step.
 */

export const SOURCE_LABEL: Record<WorkItemSource, string> = { aha: 'Aha!' };

/** The work item's origin; absent reads as 'local'. */
export const workItemOrigin = (wi: Partial<WorkItem> | undefined): WorkItemOrigin => wi?.origin ?? 'local';

/** Whether `field` is owned by the work item's source (read-only locally). */
export const isOwnedField = (wi: Partial<WorkItem> | undefined, field: 'name' | 'description'): boolean => {
    const origin = workItemOrigin(wi);
    return origin !== 'local' && SOURCE_OWNED_FIELDS[origin].includes(field);
};

/** Product Value from Aha!. */
export const ahaScore = (wi: Partial<WorkItem> | undefined): number | undefined => wi?.links?.aha?.data?.score;

/** Convert source HTML (e.g. an Aha! description) to plain text. Mirrors the server. */
export const htmlToText = (html: string): string =>
    html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&amp;/g, '&')
        .split('\n').map(line => line.replace(/[ \t]+$/, '')).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

/**
 * Aha! record type for a typed reference number: Aha! numbers epics
 * PREFIX-E-N (e.g. DR-E-12), features PREFIX-N. Aha! terms only — unrelated
 * to the work item hierarchy or Jira's epic level.
 */
export const ahaRecordTypeForKey = (key: string): 'feature' | 'epic' => /-E-\d+$/i.test(key.trim()) ? 'epic' : 'feature';

/**
 * Whether Aha! owns the work item's parent: an Aha! feature that has an Aha!
 * epic. Mirrors the server's deriveAhaParent; epics, features without an epic
 * and local items keep a local parent.
 */
export const isParentOwned = (wi: Partial<WorkItem> | undefined): boolean => {
    const link = wi?.links?.aha;
    return workItemOrigin(wi) === 'aha' && link?.record_type !== 'epic' && !!link?.data?.epic_id;
};

/** The parent Aha! gives a feature with an epic: the work item linked to that epic, or none yet. */
const ahaParent = (link: ExternalLink | null | undefined, workItems: WorkItem[]): string | null => {
    const epicId = link?.data?.epic_id;
    return workItems.find(w => w.links?.aha?.record_type === 'epic' && w.links.aha.external_id === epicId)?.id ?? null;
};

/**
 * Merge a fresh link onto the stored one when both point at the same Aha!
 * feature: each data field the new payload lacks (undefined) keeps its stored
 * value; a present field always overwrites, even null, '' or 0. A sparse
 * payload (e.g. a list response) therefore never clears synced data.
 */
const mergeLink = (stored: ExternalLink | null | undefined, link: ExternalLink): ExternalLink => {
    if (!stored?.external_id || stored.external_id !== link.external_id) return link;
    const fresh = Object.fromEntries(Object.entries(link.data ?? {}).filter(([, v]) => v !== undefined));
    return { ...link, data: { ...stored.data, ...fresh } };
};

/**
 * The update that sets (or, with null, removes) the work item's Aha! link,
 * with the origin and Aha!-owned fields the server will derive from it. The
 * server derives from the merged data this sends, so both sides agree.
 * `workItems` resolves an Aha! feature's epic to its parent work item; without
 * it the parent is left to the server.
 */
export const withAhaLink = (wi: Partial<WorkItem> | undefined, next: ExternalLink | null, workItems?: WorkItem[]): Partial<WorkItem> => {
    const link = next ? mergeLink(wi?.links?.aha, next) : null;
    const origin: WorkItemOrigin = link?.external_id ? 'aha' : 'local';
    const updates: Partial<WorkItem> = { links: { ...wi?.links, aha: link }, origin };
    if (origin === 'aha') {
        const data = link?.data;
        if (typeof data?.name === 'string' && data.name !== '') updates.name = data.name;
        if (typeof data?.description === 'string') updates.description = htmlToText(data.description);
        if (workItems && isParentOwned(updates)) {
            updates.parent_id = ahaParent(link, workItems);
        } else if (workItems && wi?.parent_id && isParentOwned(wi) && wi.parent_id === ahaParent(wi.links?.aha, workItems)) {
            // Taken out of its epic in Aha!: leave the epic's work item.
            updates.parent_id = null;
        }
    }
    return updates;
};
