import type { Issue, Settings, WorkItem } from '@valuestream/shared-types';

/**
 * Jira ↔ Aha! cross links kept by Aha!'s Jira integration. Aha! stores the
 * link on both sides: as `jira` integration fields on the Aha! record
 * (`name: 'key'` holds the Jira key) and as the `aha` entity property on the
 * Jira issue (`{ <integration id>: { record_type, reference_num } }`).
 */

/** Jira issue property written by Aha!'s Jira integration. */
export const AHA_JIRA_PROPERTY = 'aha';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Jira keys an Aha! record (feature or epic) is linked to through its integration fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ahaJiraKeys = (record: any): string[] => {
    const fields = Array.isArray(record?.integration_fields) ? record.integration_fields : [];
    const keys = fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((f: any) => f?.service_name === 'jira' && f?.name === 'key' && typeof f.value === 'string' && f.value)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => f.value as string);
    return [...new Set(keys)] as string[];
};

/** Aha! reference numbers a Jira search result is linked to through its `aha` issue property. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const jiraAhaRefs = (issue: any): string[] => {
    const value = issue?.properties?.[AHA_JIRA_PROPERTY];
    if (!value || typeof value !== 'object') return [];
    const refs = Object.values(value)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((v: any) => v?.reference_num)
        .filter((r): r is string => typeof r === 'string' && r !== '');
    return [...new Set(refs)];
};

/**
 * True when both Jira and Aha! are configured, so the cross-link switch is
 * offered. Each value is taken from the form, else from the saved settings.
 */
export const crossLinksAvailable = (form: Partial<Settings>, saved?: Partial<Settings>): boolean => {
    const has = (get: (s: Partial<Settings>) => string | undefined) => !!get(form) || (!!saved && !!get(saved));
    return has(s => s.jira?.base_url) && has(s => s.jira?.api_token)
        && has(s => s.aha?.subdomain) && has(s => s.aha?.api_key);
};

/** True when the switch is offered and turned on. */
export const crossLinksEnabled = (form: Partial<Settings>, saved?: Partial<Settings>): boolean =>
    crossLinksAvailable(form, saved) && form.aha?.use_jira_cross_links === true;

/**
 * Work items an issue is cross linked to: the ones whose Aha! record lists the
 * issue's key, plus the ones linked to an Aha! record named in the issue's
 * `aha` property.
 */
export const crossLinkedWorkItems = (jiraKey: string, ahaRefs: string[], workItems: WorkItem[]): WorkItem[] =>
    workItems.filter(w => {
        const link = w.links?.aha;
        if (!link) return false;
        if ((link.data?.jira_keys || []).some(k => same(k, jiraKey))) return true;
        return !!link.key && ahaRefs.some(r => same(r, link.key));
    });

export type CrossLinkResolution =
    | { kind: 'none' }
    /** Already assigned to the cross-linked work item. */
    | { kind: 'linked'; workItemId: string }
    | { kind: 'assign'; workItemId: string }
    /** Assigned to another work item: the local assignment is kept. */
    | { kind: 'kept'; workItemId: string }
    /** Cross linked to several work items: left untouched. */
    | { kind: 'ambiguous'; workItemIds: string[] };

/**
 * What the cross links say about one issue. They only fill an unassigned
 * issue; an existing assignment always wins.
 */
export const resolveCrossLink = (
    issue: Pick<Issue, 'jira_key' | 'work_item_id'>,
    ahaRefs: string[],
    workItems: WorkItem[],
): CrossLinkResolution => {
    if (!issue.jira_key || issue.jira_key === 'TBD') return { kind: 'none' };
    const linked = crossLinkedWorkItems(issue.jira_key, ahaRefs, workItems);
    if (linked.length === 0) return { kind: 'none' };
    if (linked.length > 1) return { kind: 'ambiguous', workItemIds: linked.map(w => w.id) };
    const workItemId = linked[0].id;
    if (issue.work_item_id === workItemId) return { kind: 'linked', workItemId };
    if (issue.work_item_id) return { kind: 'kept', workItemId };
    return { kind: 'assign', workItemId };
};

export interface CrossLinkCounts {
    assigned: number;
    kept: number;
    ambiguous: string[];
}

export const emptyCrossLinkCounts = (): CrossLinkCounts => ({ assigned: 0, kept: 0, ambiguous: [] });

/** Adds a resolution to the counts (`assigned` once the caller applied it). */
export const countCrossLink = (counts: CrossLinkCounts, jiraKey: string, r: CrossLinkResolution): void => {
    if (r.kind === 'assign') counts.assigned++;
    else if (r.kind === 'kept') counts.kept++;
    else if (r.kind === 'ambiguous') counts.ambiguous.push(jiraKey);
};

/** Short result-message suffix; empty when the cross links changed nothing. */
export const crossLinkNote = (c: CrossLinkCounts): string => {
    if (c.assigned === 0 && c.kept === 0 && c.ambiguous.length === 0) return '';
    const max = 5;
    const amb = c.ambiguous.length <= max
        ? c.ambiguous.join(', ')
        : `${c.ambiguous.slice(0, max).join(', ')} +${c.ambiguous.length - max} more`;
    return ` Cross links: ${c.assigned} assigned`
        + (c.kept > 0 ? `, ${c.kept} kept their existing work item` : '')
        + (c.ambiguous.length > 0 ? `, ${c.ambiguous.length} linked to several work items (${amb})` : '')
        + '.';
};

/** Assignments the cross links imply for already-imported issues. */
export const planCrossLinks = (
    issues: Issue[],
    workItems: WorkItem[],
    ahaRefsByJiraKey: Map<string, string[]> = new Map(),
): { assign: { issueId: string; workItemId: string }[]; counts: CrossLinkCounts } => {
    const counts = emptyCrossLinkCounts();
    const assign: { issueId: string; workItemId: string }[] = [];
    for (const issue of issues) {
        const r = resolveCrossLink(issue, ahaRefsByJiraKey.get(issue.jira_key) || [], workItems);
        if (r.kind === 'assign') assign.push({ issueId: issue.id, workItemId: r.workItemId });
        countCrossLink(counts, issue.jira_key, r);
    }
    return { assign, counts };
};
