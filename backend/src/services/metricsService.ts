import { Db } from 'mongodb';
import { calculateWorkItemScore, calculateWorkItemTcv, calculateWorkItemEffort } from '../utils/businessLogic';

export function enrichWorkItemsWithMetrics(workItems: any[], customers: any[], issues: any[]) {
    // Recompute all scores and TCVs based on weighted rules
    const enrichedWorkItems = workItems.map((wi: any) => ({
        ...wi,
        score: calculateWorkItemScore(wi, customers, workItems, issues),
        calculated_tcv: calculateWorkItemTcv(wi, customers, workItems),
        calculated_effort: calculateWorkItemEffort(wi, issues)
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

/**
 * Computes metrics from pre-computed score fields on workItems.
 * Used after scores have been persisted — no need to re-fetch customers/issues.
 */
export function computeMetricsFromPrecomputed(workItems: any[]): { maxScore: number; maxRoi: number } {
    const metrics = { maxScore: 1, maxRoi: 0.0001 };
    if (workItems.length > 0) {
        metrics.maxScore = Math.max(...workItems.map((wi: any) => wi.calculated_score || 0), 1);
        metrics.maxRoi = Math.max(...workItems.map((wi: any) => {
            const effort = Math.max(wi.calculated_effort || 0, 1);
            return (wi.calculated_tcv || 0) / effort;
        }), 0.0001);
    }
    return metrics;
}

/**
 * Re-computes calculated_tcv, calculated_effort, calculated_score for ALL workItems
 * and persists them via bulkWrite. Must fetch full dataset because Should-have TCV
 * depends on a global count across all workItems.
 *
 * Call this after any mutation to customers, workItems, or issues.
 */
export async function recomputeScoresForWorkItems(db: Db): Promise<void> {
    const [customers, workItems, issues] = await Promise.all([
        db.collection('customers').find({}).toArray(),
        db.collection('workItems').find({}).toArray(),
        db.collection('issues').find({}).toArray()
    ]);

    if (workItems.length === 0) return;

    const ops = workItems.map((wi: any) => {
        const calculated_tcv = calculateWorkItemTcv(wi, customers as any, workItems as any);
        const calculated_effort = calculateWorkItemEffort(wi, issues as any);
        const calculated_score = calculated_tcv / Math.max(calculated_effort, 1);

        return {
            updateOne: {
                filter: { id: wi.id },
                update: { $set: { calculated_tcv, calculated_effort, calculated_score } }
            }
        };
    });

    await db.collection('workItems').bulkWrite(ops);
}
