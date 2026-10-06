import { parseISO, differenceInDays, max, min, format } from 'date-fns';
import type { WorkItem, Issue, Customer, Sprint, Team, SupportIssue, ExternalLink } from '@valuestream/shared-types';
import { countBusinessDays } from './dateHelpers';

/**
 * Reusable business logic for metrics calculation.
 */

/**
 * When a support issue is marked Done it is auto-expired after this many calendar days
 * unless the user has set their own expiration date. SupportPage's expired-issue cleanup
 * sweeps these out once the date passes.
 */
export const SUPPORT_DONE_RETENTION_DAYS = 1;

/**
 * Fraction of a team's gross member-MDs that survives once we reserve headroom for PTO
 * and sickness. 0.8 = "leave 20% for time off". Used by the Members-tab "Estimate from
 * Members" action to seed Team.total_capacity_mds.
 */
export const TEAM_CAPACITY_PTO_FACTOR = 0.8;

/**
 * Working-days-per-calendar-day ratio used when deriving working days from the configured
 * `general.sprint_duration_days` setting. A standard week is 5 working / 7 calendar days,
 * so a 14-day sprint resolves to 10 working days. Country-specific holidays are NOT
 * subtracted here — that adjustment lives in the Capacity Overrides tab where actual
 * sprint dates are known.
 */
const WORKING_DAYS_RATIO = 5 / 7;

/**
 * Estimate a team's total per-sprint capacity in man-days from its members' allocations
 * and the configured sprint length. Result is rounded to one decimal.
 *
 *   workingDays = sprint_duration_days * 5/7
 *   gross       = sum(workingDays * (capacity_percentage / 100)) over members
 *   net         = gross * TEAM_CAPACITY_PTO_FACTOR
 *
 * Returns 0 if there are no members or the sprint length is non-positive.
 */
export function estimateTeamCapacityMds(
    members: { capacity_percentage: number }[],
    sprintDurationDays: number
): number {
    if (!members.length || sprintDurationDays <= 0) return 0;
    const workingDays = sprintDurationDays * WORKING_DAYS_RATIO;
    const grossMds = members.reduce(
        (sum, m) => sum + workingDays * ((m.capacity_percentage || 0) / 100),
        0
    );
    const netMds = grossMds * TEAM_CAPACITY_PTO_FACTOR;
    return Math.round(netMds * 10) / 10;
}

/**
 * Build the patch to apply to a SupportIssue when its status changes. Centralizes the
 * "moving to Done schedules an auto-cleanup expiration" rule so the inline list editor
 * and the customer detail page stay consistent.
 *
 * - Always sets the new status.
 * - If transitioning to 'done' AND no explicit expiration_date is set, schedules cleanup
 *   for today + SUPPORT_DONE_RETENTION_DAYS (ISO yyyy-MM-dd).
 * - Never overwrites an expiration_date the user already chose.
 */
export function buildSupportStatusPatch(
    issue: Pick<SupportIssue, 'expiration_date'>,
    newStatus: SupportIssue['status']
): Partial<SupportIssue> {
    const patch: Partial<SupportIssue> = { status: newStatus };
    if (newStatus === 'done' && !issue.expiration_date) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + SUPPORT_DONE_RETENTION_DAYS);
        patch.expiration_date = expiry.toISOString().split('T')[0];
    }
    return patch;
}

/**
 * The TCV figure that drives a customer's money-bag fill on the Support page.
 * Prefers realised contract value (`existing_tcv`); when a customer has none,
 * falls back to potential (pipeline) TCV so brand-new prospects still surface a
 * bag instead of showing empty.
 */
export const customerMoneyBagTcv = (
    customer: Pick<Customer, 'existing_tcv' | 'potential_tcv'>
): number => {
    const existing = customer.existing_tcv || 0;
    return existing > 0 ? existing : (customer.potential_tcv || 0);
};

/**
 * Sqrt-scaled money-bag fill of a customer's TCV relative to the reference
 * `maxTcv` (the largest existing TCV — see SupportPage). Sqrt sits between
 * linear (which crushes small customers near 0) and log (which crushes everyone
 * near the whale), giving a usable spread across the three bag slots even with
 * wide TCV ranges. Usually ∈ [0, 1], but may exceed 1 when `tcv` (e.g. a
 * prospect's potential) is larger than `maxTcv`; the caller's three-slot render
 * clamps each slot, so the visible bags cap at 3. Returns 0 when there is no
 * positive reference (`maxTcv`) or the customer's TCV is 0.
 */
export const moneyBagFillRatio = (tcv: number, maxTcv: number): number => {
    if (maxTcv <= 0 || tcv <= 0) return 0;
    return Math.sqrt(tcv / maxTcv);
};

/**
 * Maps an Aha! feature payload to the work item's Aha! link (synced now).
 * A field the payload lacks stays undefined (it is not a cleared value), so a
 * sparse payload never wipes stored data when merged by withAhaLink.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseAhaFeature = (feature: any): ExternalLink => {
    const data: NonNullable<ExternalLink['data']> = {
        name: feature.name,
        description: 'description' in feature ? (feature.description?.body ?? '') : undefined,
        score: feature.score,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requirements: 'requirements' in feature ? (feature.requirements || []).map((r: any) => ({
            id: r.id,
            reference_num: r.reference_num,
            name: r.name,
            description: r.description?.body || '',
            url: r.url,
        })) : undefined,
    };
    if ('original_estimate' in feature) {
        // Aha! original_estimate is in minutes; 480 minutes = 1 person-day.
        data.estimate_mds = feature.original_estimate ? Math.round(feature.original_estimate / 480) : null;
    }

    return {
        external_id: String(feature.id),
        key: feature.reference_num,
        url: feature.url,
        synced_at: new Date().toISOString(),
        data,
    };
};

/**
 * Parses Jira issue data into a partial Issue object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseJiraIssue = (issue: any, teams: Team[]): Partial<Issue> => {
    const fields = issue.fields;
    const names = issue.names || {};
    let targetStartKey = "";
    let targetEndKey = "";
    let teamKey = "";
    
    Object.entries(names as Record<string, string>).forEach(([key, name]) => {
        if (name === "Target start") targetStartKey = key;
        if (name === "Target end") targetEndKey = key;
        if (name === "Team") teamKey = key;
    });

    const updates: Partial<Issue> = {};
    if (fields.summary) updates.name = fields.summary;
    
    // Effort: Jira is source of truth (even if 0)
    if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
        updates.effort_md = Math.round(fields.timeestimate / 28800);
    } else if (fields.aggregatetimeestimate !== undefined && fields.aggregatetimeestimate !== null) {
        updates.effort_md = Math.round(fields.aggregatetimeestimate / 28800);
    }

    // Dates: Jira is source of truth (even if null)
    if (targetStartKey) {
        updates.target_start = fields[targetStartKey] || undefined;
    }
    if (targetEndKey) {
        updates.target_end = fields[targetEndKey] || undefined;
    }

    if (teamKey && fields[teamKey]) {
        const teamField = fields[teamKey];
        const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
        const jiraTeamName = teamField.name || "";
        const matchedTeam = teams.find(t =>
            (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
            t.name === jiraTeamId ||
            (jiraTeamName && t.name === jiraTeamName)
        );
        if (matchedTeam) updates.team_id = matchedTeam.id;
    }
    return updates;
};

/**
 * Calculates the proportional effort for an issue within a specific sprint
 * based on business days overlap.
 */
export const calculateProportionalEffort = (issue: Issue, sprint: Sprint, countryCode?: string): number => {
    if (!issue.target_start || !issue.target_end || !sprint.start_date || !sprint.end_date) return 0;

    const sStart = parseISO(sprint.start_date);
    const sEnd = parseISO(sprint.end_date);
    const eStart = parseISO(issue.target_start);
    const eEnd = parseISO(issue.target_end);

    const overlapStart = max([sStart, eStart]);
    const overlapEnd = min([sEnd, eEnd]);

    if (overlapStart <= overlapEnd) {
        const overlapDays = countBusinessDays(format(overlapStart, 'yyyy-MM-dd'), format(overlapEnd, 'yyyy-MM-dd'), countryCode);
        const totalIssueDays = countBusinessDays(issue.target_start, issue.target_end, countryCode);
        
        if (totalIssueDays === 0) return 0;

        const proportionalEffort = (issue.effort_md * (overlapDays / totalIssueDays));
        return Math.round(proportionalEffort * 10) / 10;
    }
    return 0;
};

/**
 * Whether a work item should display the "missing estimate" warning icon. True
 * when either the work item has no effort at all (own field is 0 AND no linked
 * issue contributes effort) OR at least one linked issue itself lacks an
 * estimate (effort_md = 0). Shared by the value stream dashboard
 * (`useGraphBuilder`) and the Work Items list so the icon stays consistent.
 * Both callers pass the full workspace issues set: the warning reflects the
 * real estimation state of the underlying jiras, not the current view filters.
 */
export const hasUnestimatedWorkItemEffort = (workItem: WorkItem, issues: Issue[] = []): boolean => {
    const issuesForWorkItem = (issues || []).filter(e => e.work_item_id === workItem.id);
    const totalEffort = workItem.calculated_effort ?? 0;
    return totalEffort === 0 || issuesForWorkItem.some(e => (e.effort_md || 0) === 0);
};

/**
 * Calculates how much effort from an Issue falls into each sprint.
 * Respects manual overrides and distributes the remaining effort proportionally.
 */
export const calculateIssueEffortPerSprint = (issue: Issue, allSprints: Sprint[]): Record<string, number> => {
    if (!issue.target_start || !issue.target_end) return {};

    const start = parseISO(issue.target_start);
    const end = parseISO(issue.target_end);
    const duration = Math.max(1, differenceInDays(end, start) + 1);

    let totalOverrideMd = 0;
    let overrideDays = 0;

    const overlaps: { sprintId: string, days: number, isOverridden: boolean, overrideValue?: number }[] = [];

    allSprints.forEach(sprint => {
        const spStart = parseISO(sprint.start_date);
        const spEnd = parseISO(sprint.end_date);
        const oStart = max([start, spStart]);
        const oEnd = min([end, spEnd]);
        
        if (oStart <= oEnd) {
            const days = differenceInDays(oEnd, oStart) + 1;
            const overrideValue = issue.sprint_effort_overrides?.[sprint.id];
            const isOverridden = overrideValue !== undefined;
            
            overlaps.push({ sprintId: sprint.id, days, isOverridden, overrideValue });
            
            if (isOverridden) {
                totalOverrideMd += overrideValue!;
                overrideDays += days;
            }
        }
    });

    const remainingDefaultMd = Math.max(0, (issue.effort_md || 0) - totalOverrideMd);
    const remainingDefaultDays = Math.max(0, duration - overrideDays);

    const result: Record<string, number> = {};
    overlaps.forEach(o => {
        if (o.isOverridden) {
            result[o.sprintId] = o.overrideValue!;
        } else {
            const proportion = remainingDefaultDays > 0 ? (o.days / remainingDefaultDays) : 0;
            result[o.sprintId] = remainingDefaultMd * proportion;
        }
    });

    return result;
};
/**
 * Deeply merges two objects, preferring source values but preserving target keys and structure.
 * Only merges keys that exist in the target (template-based merge).
 */
export function deepMerge<T extends object>(target: T, source: Record<string, unknown> | unknown): T {
  if (!source || typeof source !== 'object') return target;

  // Create a new object to avoid mutating the target
  const result = { ...target } as Record<string, unknown>;

  Object.keys(source as Record<string, unknown>).forEach(key => {
    const sourceValue = (source as Record<string, unknown>)[key];
    const targetValue = result[key];

    if (sourceValue !== undefined && sourceValue !== null) {
      if (typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
          targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        // Recursively merge if both are objects
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        // Only keep keys that are defined in the target (e.g. DEFAULT_SETTINGS)
        if (key in target) {
          result[key] = sourceValue;
        }
      }
    }
  });

  return result as T;
}

/**
 * Calculates the intensity ratio for visual heat mapping.
...
 * 1.0 is neutral (uniform distribution).
 */
export const calculateIssueIntensityRatio = (actualEffort: number, baselineEffort: number): number => {
    if (baselineEffort > 0) {
        return actualEffort / baselineEffort;
    }
    return actualEffort > 0 ? 2 : 1;
};

/**
 * Extracts the first valid JSON object from a string by balancing braces.
 * This is more robust than regex for "messy" LLM output that might include
 * conversational filler or trailing characters.
 */
export const extractFirstJSONObject = (str: string): string => {
    const firstOpen = str.indexOf('{');
    if (firstOpen === -1) return str;

    let balance = 0;
    let inString = false;
    let escape = false;

    for (let i = firstOpen; i < str.length; i++) {
        const char = str[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') balance++;
            else if (char === '}') {
                balance--;
                if (balance === 0) {
                    // Found the closing brace for the first open brace
                    return str.substring(firstOpen, i + 1);
                }
            }
        }
    }

    // Fallback if not balanced properly, try to find the last }
    const lastClose = str.lastIndexOf('}');
    if (lastClose > firstOpen) {
        return str.substring(firstOpen, lastClose + 1);
    }

    return str;
};

/* ------------------------------------------------------------------ */
/*  Jira Parent Link → WorkItem hierarchy alignment                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve a Jira custom-field id from the `names` map (field id → display
 * label) returned by /search. Returns the first id whose label matches
 * `label`, or undefined if absent.
 */
export const resolveFieldId = (
    names: Record<string, string> | undefined,
    label: string,
): string | undefined => {
    if (!names) return undefined;
    for (const [id, name] of Object.entries(names)) {
        if (name === label) return id;
    }
    return undefined;
};

/**
 * The Advanced-Roadmaps "Parent Link" custom field can come back as a plain
 * issue-key string ("ABC-123") or as an object carrying the key. Normalise to
 * the key string, or undefined when there is no usable value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const extractParentLinkKey = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || undefined;
    }
    if (typeof value === 'object') {
        const key = value.key || value.data?.key || value.value;
        return typeof key === 'string' && key.trim() ? key.trim() : undefined;
    }
    return undefined;
};

export interface HierarchyAlignmentInput {
    /** Successfully-fetched Jira issues this sync, keyed by issue key. Each
     *  value is a raw Jira issue augmented with a top-level `names` map. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchedByKey: Map<string, any>;
    /** All system issues (used to map any jira_key → its WorkItem). */
    issues: Issue[];
    /** All work items (for existence + cycle checks). */
    workItems: WorkItem[];
    /**
     * Jira deployment. Cloud models every hierarchy level with the system
     * `parent` field (Parent Link / Epic Link were retired); Data Center uses
     * the Advanced Roadmaps "Parent Link" custom field. Defaults to
     * 'datacenter' for backward compatibility.
     */
    deployment?: 'cloud' | 'datacenter';
}

export interface HierarchyAlignmentPlan {
    /** Work items whose parent_id should change, in apply order. */
    updates: { workItemId: string; parentId: string }[];
    /**
     * Work items skipped because their child jiras disagree on the parent.
     * `parentIds` lists the distinct candidate parent work items that clashed,
     * so the caller can report exactly which parents were in dispute.
     */
    conflicts: { workItemId: string; parentIds: string[] }[];
    /** Work-item ids skipped because the change would create a cycle. */
    cycles: string[];
    /** True when no hierarchy field is available ("Parent Link" on Data Center) — nothing can align. */
    parentFieldMissing: boolean;
}

/**
 * Build a plan to align WorkItem.parent_id to the Jira "Parent Link" hierarchy,
 * treating Jira as the source of truth but only for issues/work items already
 * present in the system. Pure — performs no I/O; the caller applies `updates`.
 *
 * Rules (see plan): a child jira whose Parent Link points at an in-system
 * parent jira makes the child jira's work item a child of the parent jira's
 * work item. Skips when either side is Unassigned, when both jiras share a work
 * item, on a work item whose child jiras disagree (conflict), and when the edge
 * would form a cycle. Never clears an existing parent_id.
 */
export const planHierarchyAlignment = (
    { fetchedByKey, issues, workItems, deployment = 'datacenter' }: HierarchyAlignmentInput,
): HierarchyAlignmentPlan => {
    const plan: HierarchyAlignmentPlan = {
        updates: [], conflicts: [], cycles: [], parentFieldMissing: false,
    };

    // Resolve the Parent Link field id from any fetched issue's names map
    // (the id is instance-global, so the first one that has it wins).
    let parentLinkFieldId: string | undefined;
    for (const issue of fetchedByKey.values()) {
        parentLinkFieldId = resolveFieldId(issue?.names, 'Parent Link');
        if (parentLinkFieldId) break;
    }
    const isCloud = deployment === 'cloud';
    // Cloud always has the system `parent` field, so it never "misses" one.
    if (!parentLinkFieldId && !isCloud) {
        plan.parentFieldMissing = true;
        return plan;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentKeyOf = (issueData: any): string | undefined => {
        const fields = issueData?.fields;
        if (isCloud) {
            // Prefer the system parent; fall back to a lingering Parent Link value.
            return extractParentLinkKey(fields?.parent)
                ?? (parentLinkFieldId ? extractParentLinkKey(fields?.[parentLinkFieldId]) : undefined);
        }
        return extractParentLinkKey(fields?.[parentLinkFieldId as string]);
    };

    const issueByKey = new Map<string, Issue>();
    for (const issue of issues) {
        if (issue.jira_key && !issueByKey.has(issue.jira_key)) {
            issueByKey.set(issue.jira_key, issue);
        }
    }
    const workItemById = new Map(workItems.map(w => [w.id, w]));

    // Gather proposed parent work items per child work item.
    const proposals = new Map<string, Set<string>>();
    for (const [childKey, issueData] of fetchedByKey.entries()) {
        const childIssue = issueByKey.get(childKey);
        if (!childIssue) continue;

        const parentKey = parentKeyOf(issueData);
        if (!parentKey) continue;                       // no parent

        const parentIssue = issueByKey.get(parentKey);
        if (!parentIssue) continue;                     // parent jira not in system

        const childWI = childIssue.work_item_id;
        const parentWI = parentIssue.work_item_id;
        if (!childWI || !parentWI) continue;            // either side Unassigned
        if (childWI === parentWI) continue;             // same work item
        if (!workItemById.has(childWI) || !workItemById.has(parentWI)) continue; // stale ref

        let set = proposals.get(childWI);
        if (!set) { set = new Set(); proposals.set(childWI, set); }
        set.add(parentWI);
    }

    // Resolve proposals → updates, honouring conflicts, no-ops and cycles.
    // `pendingParent` tracks parent_ids as we apply, so the cycle check sees
    // the resulting graph within this run.
    const pendingParent = new Map<string, string | undefined>(
        workItems.map(w => [w.id, w.parent_id]),
    );

    const wouldCycle = (childWI: string, parentWI: string): boolean => {
        let cursor: string | undefined = parentWI;
        const seen = new Set<string>();
        while (cursor) {
            if (cursor === childWI) return true;
            if (seen.has(cursor)) break;                // pre-existing cycle guard
            seen.add(cursor);
            cursor = pendingParent.get(cursor);
        }
        return false;
    };

    for (const [childWI, parentSet] of proposals.entries()) {
        if (parentSet.size > 1) {
            plan.conflicts.push({ workItemId: childWI, parentIds: [...parentSet] });
            continue;
        }
        const parentWI = [...parentSet][0];
        if (pendingParent.get(childWI) === parentWI) continue;   // already correct
        if (wouldCycle(childWI, parentWI)) { plan.cycles.push(childWI); continue; }
        plan.updates.push({ workItemId: childWI, parentId: parentWI });
        pendingParent.set(childWI, parentWI);
    }

    return plan;
};
