import { calculateWorkItemScore } from '../utils/businessLogic';

export function enrichWorkItemsWithMetrics(workItems: any[], customers: any[], issues: any[]) {
    // Recompute all scores and TCVs based on weighted rules
    const enrichedWorkItems = workItems.map((wi: any) => ({
        ...wi,
        score: calculateWorkItemScore(wi, customers, workItems, issues)
    }));

    const metrics = { maxScore: 1, maxRoi: 1 };

    // Calculate global metrics for scaling
    if (enrichedWorkItems.length > 0) {
        metrics.maxScore = Math.max(...enrichedWorkItems.map((wi: any) => wi.score || 0), 1);
        
        metrics.maxRoi = Math.max(...enrichedWorkItems.map((wi: any) => {
            const effort = Math.max(wi.total_effort_mds || 0, 1);
            const targets = wi.customer_targets || [];
            if (targets.length === 0 && !wi.all_customers_target) return 0;
            
            if (wi.all_customers_target) {
                return Math.max(...customers.map((c: any) => (c.existing_tcv || 0) / effort), 0);
            }
            
            return Math.max(...targets.map((t: any) => {
                const cust = customers.find((c: any) => c.id === t.customer_id);
                if (!cust) return 0;
                const tcv = t.tcv_type === 'existing' ? (cust.existing_tcv || 0) : (cust.potential_tcv || 0);
                return tcv / effort;
            }), 0);
        }), 0.0001);
    }

    return { workItems: enrichedWorkItems, metrics };
}
