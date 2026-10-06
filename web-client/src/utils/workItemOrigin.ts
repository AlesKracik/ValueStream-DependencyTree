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
 */
export const withAhaLink = (wi: Partial<WorkItem> | undefined, next: ExternalLink | null): Partial<WorkItem> => {
    const link = next ? mergeLink(wi?.links?.aha, next) : null;
    const origin: WorkItemOrigin = link?.external_id ? 'aha' : 'local';
    const updates: Partial<WorkItem> = { links: { ...wi?.links, aha: link }, origin };
    if (origin === 'aha') {
        const data = link?.data;
        if (typeof data?.name === 'string' && data.name !== '') updates.name = data.name;
        if (typeof data?.description === 'string') updates.description = htmlToText(data.description);
    }
    return updates;
};
