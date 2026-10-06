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
 * The update that sets (or, with null, removes) the work item's Aha! link,
 * with the origin and Aha!-owned fields the server will derive from it.
 */
export const withAhaLink = (wi: Partial<WorkItem> | undefined, link: ExternalLink | null): Partial<WorkItem> => {
    const origin: WorkItemOrigin = link?.external_id ? 'aha' : 'local';
    const updates: Partial<WorkItem> = { links: { ...wi?.links, aha: link }, origin };
    if (origin === 'aha') {
        const data = link?.data;
        if (typeof data?.name === 'string' && data.name !== '') updates.name = data.name;
        if (typeof data?.description === 'string') updates.description = htmlToText(data.description);
    }
    return updates;
};
