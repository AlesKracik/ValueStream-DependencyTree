import type { DashboardData, WorkItem } from '../types/models';

/**
 * Calculates the RICE score for all work items in the provided data set.
 * Logic: Score = (Impact) / Effort
 * Impact: Sum of TCV from targeted customers, weighted by priority.
 * Effort: Max of (WorkItem effort, Sum of associated Epic remaining MDs).
 */
export function calculateWorkItemScores(data: DashboardData): WorkItem[] {
    return data.workItems.map(workItem => {
        const epicsForWorkItem = data.epics.filter(e => e.work_item_id === workItem.id);
        const epicMdsSum = epicsForWorkItem.reduce((sum, e) => sum + e.effort_md, 0);
        const displayEffort = Math.max(workItem.total_effort_mds || 0, epicMdsSum) || 1; // Prevent div by 0

        let impact = 0;

        if (workItem.all_customers_target) {
            const type = workItem.all_customers_target.tcv_type;
            const priority = workItem.all_customers_target.priority || 'Must-have';
            
            // Sum up relevant TCV for ALL customers
            let totalRelevantTcv = data.customers.reduce((sum, c) => {
                const val = type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0);
                return sum + val;
            }, 0);

            if (priority === 'Must-have') {
                impact = totalRelevantTcv;
            } else if (priority === 'Should-have') {
                // For global "Should-haves", we divide by global count of Should-haves
                let globalShouldCount = data.workItems.filter(wf => wf.all_customers_target?.priority === 'Should-have' && wf.all_customers_target?.tcv_type === type).length;
                impact = totalRelevantTcv / (globalShouldCount || 1);
            }
        } else {
            workItem.customer_targets.forEach(target => {
                const customer = data.customers.find(c => c.id === target.customer_id);
                if (!customer) return;

                const priority = target.priority || 'Must-have';
                const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;

                if (priority === 'Must-have') {
                    impact += targetTcv;
                } else if (priority === 'Should-have') {
                    // Find how many Should-haves this customer has across ALL workitems globally
                    let shouldHaveCount = 0;
                    data.workItems.forEach(globalF => {
                        const hasShould = globalF.customer_targets.find(ct =>
                            ct.customer_id === target.customer_id &&
                            ct.priority === 'Should-have' &&
                            ct.tcv_type === target.tcv_type
                        );
                        if (hasShould) shouldHaveCount++;
                    });
                    if (shouldHaveCount > 0) {
                        impact += (targetTcv / shouldHaveCount);
                    }
                }
            });
        }

        const score = impact / displayEffort;

        return {
            ...workItem,
            score
        };
    });
}
