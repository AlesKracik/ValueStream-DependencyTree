import { Db } from 'mongodb';
import { calculateWorkItemTcv, calculateWorkItemEffort } from '../utils/businessLogic';

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
// REQ-027, REQ-031, REQ-032
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
