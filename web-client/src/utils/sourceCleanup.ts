import type { Issue, WorkItem } from '@valuestream/shared-types';

/** A record imported from an external source that cleanup may delete. */
export interface CleanupCandidate {
    id: string;
    label: string;
    /** Last update in the source (ISO datetime); absent until imported/synced with it. */
    sourceUpdatedAt?: string | null;
    /** Why the record still matters locally (e.g. "has customer targets"); absent when nothing links to it. */
    linkedReason?: string;
}

export interface CleanupPlan {
    /** Stale records to delete, in the candidates' order. */
    toDelete: CleanupCandidate[];
    /** Stale records skipped because something links to them. */
    linked: CleanupCandidate[];
    /** Records with no source date yet — skipped until a sync stores one. */
    undated: CleanupCandidate[];
}

/**
 * Splits candidates into what a cleanup deletes and what it skips. A record
 * is stale when the source last updated it more than `olderThanDays` days
 * before `now`. Linked stale records are deleted only with `includeLinked`.
 */
export const planSourceCleanup = (
    candidates: CleanupCandidate[],
    olderThanDays: number,
    includeLinked: boolean,
    now: Date = new Date(),
): CleanupPlan => {
    const plan: CleanupPlan = { toDelete: [], linked: [], undated: [] };
    if (!Number.isFinite(olderThanDays) || olderThanDays < 0) return plan;
    const cutoff = now.getTime() - olderThanDays * 24 * 60 * 60 * 1000;

    for (const c of candidates) {
        const updated = c.sourceUpdatedAt ? Date.parse(c.sourceUpdatedAt) : NaN;
        if (Number.isNaN(updated)) {
            plan.undated.push(c);
        } else if (updated < cutoff) {
            if (c.linkedReason && !includeLinked) plan.linked.push(c);
            else plan.toDelete.push(c);
        }
    }
    return plan;
};

/**
 * Work items imported from Aha!, deepest first: deleting a work item detaches
 * its children (bumping their version), so children go before their parents
 * and no delete in the batch runs against a version an earlier one changed.
 */
export const ahaCleanupCandidates = (workItems: WorkItem[], issues: Issue[]): CleanupCandidate[] => {
    const byId = new Map(workItems.map(w => [w.id, w]));
    const depth = (w: WorkItem): number => {
        let d = 0;
        const seen = new Set<string>([w.id]);
        for (let p = w.parent_id ? byId.get(w.parent_id) : undefined; p && !seen.has(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined) {
            seen.add(p.id);
            d++;
        }
        return d;
    };
    const parentIds = new Set(workItems.map(w => w.parent_id).filter(Boolean));
    const linkedWorkItemIds = new Set(issues.map(i => i.work_item_id).filter(Boolean));

    return workItems
        .filter(w => w.links?.aha?.external_id)
        .map(w => {
            const reasons: string[] = [];
            if (w.all_customers_target || (w.customer_targets || []).length > 0) reasons.push('customer targets');
            if (linkedWorkItemIds.has(w.id)) reasons.push('Jira issues');
            if (parentIds.has(w.id)) reasons.push('child work items');
            return {
                candidate: {
                    id: w.id,
                    label: `${w.links!.aha!.key} ${w.name}`,
                    sourceUpdatedAt: w.links!.aha!.source_updated_at,
                    linkedReason: reasons.length > 0 ? `has ${reasons.join(', ')}` : undefined,
                },
                depth: depth(w),
            };
        })
        .sort((a, b) => b.depth - a.depth)
        .map(x => x.candidate);
};

/** Issues imported from Jira. */
export const jiraCleanupCandidates = (issues: Issue[]): CleanupCandidate[] => {
    const dependedOn = new Set(issues.flatMap(i => (i.dependencies || []).map(d => d.issue_id)));
    return issues
        .filter(i => i.jira_key && i.jira_key !== 'TBD')
        .map(i => {
            const reasons: string[] = [];
            if (i.work_item_id && i.work_item_id !== 'UNASSIGNED') reasons.push('assigned to a work item');
            if (dependedOn.has(i.id)) reasons.push('other issues depend on it');
            return {
                id: i.id,
                label: i.name ? `${i.jira_key} ${i.name}` : i.jira_key,
                sourceUpdatedAt: i.jira_updated_at,
                linkedReason: reasons.length > 0 ? reasons.join(', ') : undefined,
            };
        });
};
