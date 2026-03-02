import type { WorkItem, Epic, Customer } from '../types/models';

/**
 * Calculates the total effort for a work item in man-days (MDs).
 * It is the maximum of the work item's own 'total_effort_mds' 
 * or the sum of all its related epics' effort.
 */
export const calculateWorkItemEffort = (workItem: WorkItem, epics: Epic[]): number => {
    const epicsForWorkItem = epics.filter(e => e.work_item_id === workItem.id);
    const epicMdsSum = epicsForWorkItem.reduce((sum, e) => sum + (e.effort_md || 0), 0);
    return Math.max(workItem.total_effort_mds || 0, epicMdsSum);
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
