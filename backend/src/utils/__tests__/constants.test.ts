import { describe, it, expect } from 'vitest';
import { ALLOWED_COLLECTIONS } from '../constants';

describe('ALLOWED_COLLECTIONS', () => {
  it('contains the expected collection names', () => {
    expect(ALLOWED_COLLECTIONS).toEqual([
      'customers', 'workItems', 'teams', 'issues', 'sprints', 'valueStreams'
    ]);
  });

  it('has no duplicates', () => {
    const unique = new Set(ALLOWED_COLLECTIONS);
    expect(unique.size).toBe(ALLOWED_COLLECTIONS.length);
  });
});
