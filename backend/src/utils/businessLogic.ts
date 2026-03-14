import { parseISO, differenceInDays, max, min, format } from 'date-fns';
import type { WorkItem, Epic, Customer, Sprint, Team } from '../types/models';
import { countBusinessDays } from './dateHelpers';

/**
 * Reusable business logic for metrics calculation.
 */

/**
 * Parses Jira issue data into a partial Epic object.
 */
export const parseJiraIssue = (issue: any, teams: Team[]): Partial<Epic> => {
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

    const updates: Partial<Epic> = {};
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
 * Calculates the proportional effort for an epic within a specific sprint
 * based on business days overlap.
 */
export const calculateProportionalEffort = (epic: Epic, sprint: Sprint, countryCode?: string): number => {
    if (!epic.target_start || !epic.target_end || !sprint.start_date || !sprint.end_date) return 0;

    const sStart = parseISO(sprint.start_date);
    const sEnd = parseISO(sprint.end_date);
    const eStart = parseISO(epic.target_start);
    const eEnd = parseISO(epic.target_end);

    const overlapStart = max([sStart, eStart]);
    const overlapEnd = min([sEnd, eEnd]);

    if (overlapStart <= overlapEnd) {
        const overlapDays = countBusinessDays(format(overlapStart, 'yyyy-MM-dd'), format(overlapEnd, 'yyyy-MM-dd'), countryCode);
        const totalEpicDays = countBusinessDays(epic.target_start, epic.target_end, countryCode);
        
        if (totalEpicDays === 0) return 0;

        const proportionalEffort = (epic.effort_md * (overlapDays / totalEpicDays));
        return Math.round(proportionalEffort * 10) / 10;
    }
    return 0;
};

/**
 * Calculates the total effort for a work item in man-days (MDs).
 * It is the maximum of the work item's own 'total_effort_mds' 
 * or the sum of all its related epics' effort.
 */
export const calculateWorkItemEffort = (workItem: WorkItem, epics: Epic[]): number => {
    const epicsForWorkItem = epics.filter(e => e.work_item_id === workItem.id);
    const epicMdsSum = epicsForWorkItem.reduce((sum, e) => sum + (e.effort_md || 0), 0);
    return epicMdsSum > 0 ? epicMdsSum : (workItem.total_effort_mds || 0);
};

/**
 * Calculates the total TCV impact for a work item based on its customer targets.
 * Must-have: 100% of Customer TCV
 * Should-have: Shared portion (Customer TCV / Count of all Should-have work items for that customer)
 * Nice-to-have: 0%
 */
export const calculateWorkItemTcv = (workItem: WorkItem, customers: Customer[], allWorkItems: WorkItem[]): number => {
    // Helper to get total number of Should-have targets for a specific customer
    const getShouldHaveCount = (customerId: string) => {
        return allWorkItems.reduce((count, w) => {
            const hasShouldHave = (w.customer_targets || []).some(t => t.customer_id === customerId && t.priority === 'Should-have');
            const globalShouldHave = w.all_customers_target?.priority === 'Should-have';
            return count + (hasShouldHave || globalShouldHave ? 1 : 0);
        }, 0);
    };

    if (workItem.all_customers_target) {
        const priority = workItem.all_customers_target.priority;
        if (priority === 'Nice-to-have') return 0;

        const type = workItem.all_customers_target.tcv_type;
        return customers.reduce((sum, c) => {
            const val = type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0);
            if (priority === 'Must-have') return sum + val;
            
            // Should-have: Shared portion
            const totalShouldHaves = getShouldHaveCount(c.id);
            return sum + (totalShouldHaves > 0 ? val / totalShouldHaves : 0);
        }, 0);
    }
    
    return (workItem.customer_targets || []).reduce((sum, target) => {
        if (target.priority === 'Nice-to-have') return sum;

        const customer = customers.find(c => c.id === target.customer_id);
        if (!customer) return sum;
        
        let customerTcv = 0;
        if (target.tcv_type === 'existing') {
            if (target.tcv_history_id && customer.tcv_history) {
                const historyEntry = customer.tcv_history.find(h => h.id === target.tcv_history_id);
                customerTcv = historyEntry ? historyEntry.value : customer.existing_tcv;
            } else {
                customerTcv = customer.existing_tcv;
            }
        } else {
            customerTcv = customer.potential_tcv;
        }

        if (target.priority === 'Must-have' || !target.priority) {
            return sum + (customerTcv || 0);
        } else if (target.priority === 'Should-have') {
            const totalShouldHaves = getShouldHaveCount(customer.id);
            return sum + (totalShouldHaves > 0 ? (customerTcv || 0) / totalShouldHaves : 0);
        }
        
        return sum;
    }, 0);
};

/**
 * Calculates the RICE/ROI Score for a work item.
 * Score = Total Impact / Effort (min 1 MD)
 */
export const calculateWorkItemScore = (workItem: WorkItem, customers: Customer[], allWorkItems: WorkItem[], epics: Epic[]): number => {
    const impact = calculateWorkItemTcv(workItem, customers, allWorkItems);
    const effort = Math.max(calculateWorkItemEffort(workItem, epics), 1);
    return impact / effort;
};

/**
 * Calculates how much effort from an Epic falls into each sprint.
 * Respects manual overrides and distributes the remaining effort proportionally.
 */
export const calculateEpicEffortPerSprint = (epic: Epic, allSprints: Sprint[]): Record<string, number> => {
    if (!epic.target_start || !epic.target_end) return {};

    const start = parseISO(epic.target_start);
    const end = parseISO(epic.target_end);
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
            const overrideValue = epic.sprint_effort_overrides?.[sprint.id];
            const isOverridden = overrideValue !== undefined;
            
            overlaps.push({ sprintId: sprint.id, days, isOverridden, overrideValue });
            
            if (isOverridden) {
                totalOverrideMd += overrideValue!;
                overrideDays += days;
            }
        }
    });

    const remainingDefaultMd = Math.max(0, (epic.effort_md || 0) - totalOverrideMd);
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
 * Calculates the intensity ratio for visual heat mapping.
 * 1.0 is neutral (uniform distribution).
 */
export const calculateEpicIntensityRatio = (actualEffort: number, baselineEffort: number): number => {
    if (baselineEffort > 0) {
        return actualEffort / baselineEffort;
    }
    return actualEffort > 0 ? 2 : 1;
};
