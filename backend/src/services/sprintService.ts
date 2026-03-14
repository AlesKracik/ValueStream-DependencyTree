import { calculateQuarter, logQuery } from '../utils/configHelpers';

export async function assignMissingQuarters(sprints: any[], db: any, fiscalYearStartMonth: number) {
    const sprintsToUpdate = sprints.filter((s: any) => !s.quarter);
    if (sprintsToUpdate.length > 0) {
        for (const sprint of sprintsToUpdate) {
            const quarter = calculateQuarter(sprint.end_date, fiscalYearStartMonth);
            await logQuery('UpdateSprintQuarter', 'sprints', 'updateOne', db.collection('sprints').updateOne({ id: sprint.id }, { $set: { quarter } }));
            sprint.quarter = quarter;
        }
    }
    return sprints;
}
