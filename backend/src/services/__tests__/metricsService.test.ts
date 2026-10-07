import { describe, it, expect, vi } from 'vitest';
import type { Db } from 'mongodb';
import { recomputeScoresForWorkItems } from '../metricsService';

const fakeDb = (docs: Record<string, unknown[]>) => {
  const bulkWrite = vi.fn().mockResolvedValue({});
  const db = {
    collection: (name: string) => ({
      find: () => ({ toArray: async () => docs[name] || [] }),
      bulkWrite,
    }),
  } as unknown as Db;
  return { db, bulkWrite };
};

describe('recomputeScoresForWorkItems', () => {
  it('sets the Jira-derived status, and leaves it alone when no linked issue has a Jira status', async () => {
    const { db, bulkWrite } = fakeDb({
      workItems: [
        { id: 'w1', status: 'Backlog', total_effort_mds: 0, customer_targets: [] },
        { id: 'w2', status: 'Planning', total_effort_mds: 0, customer_targets: [] },
      ],
      issues: [
        { id: 'i1', work_item_id: 'w1', jira_key: 'A-1', team_id: '', effort_md: 1, jira_status: 'In Progress' },
        { id: 'i2', work_item_id: 'w1', jira_key: 'A-2', team_id: '', effort_md: 1, jira_status: 'Done' },
        { id: 'i3', work_item_id: 'w2', jira_key: 'A-3', team_id: '', effort_md: 1 },
      ],
    });

    await recomputeScoresForWorkItems(db);

    const [ops] = bulkWrite.mock.calls[0];
    expect(ops[0].updateOne.update.$set.status).toBe('Development');
    expect(ops[1].updateOne.update.$set).not.toHaveProperty('status');
  });
});
