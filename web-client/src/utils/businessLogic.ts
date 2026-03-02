import type { WorkItem, Epic, Customer, Sprint } from '../types/models';
import { countBusinessDays } from './dateHelpers';
import { parseISO, min, max, format } from 'date-fns';

/**
 * Reusable business logic for metrics calculation.
 */

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
 */
export const calculateWorkItemTcv = (workItem: WorkItem, customers: Customer[]): number => {
    if (workItem.all_customers_target) {
        const type = workItem.all_customers_target.tcv_type;
        return customers.reduce((sum, c) => {
            const val = type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0);
            return sum + val;
        }, 0);
    }
    
    return (workItem.customer_targets || []).reduce((sum, target) => {
        const customer = customers.find(c => c.id === target.customer_id);
        if (!customer) return sum;
        
        let targetTcv = 0;
        if (target.tcv_type === 'existing') {
            if (target.tcv_history_id && customer.tcv_history) {
                const historyEntry = customer.tcv_history.find(h => h.id === target.tcv_history_id);
                targetTcv = historyEntry ? historyEntry.value : customer.existing_tcv;
            } else {
                targetTcv = customer.existing_tcv;
            }
        } else {
            targetTcv = customer.potential_tcv;
        }
        return sum + (targetTcv || 0);
    }, 0);
};
