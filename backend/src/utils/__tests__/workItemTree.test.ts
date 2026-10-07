import { describe, it, expect } from 'vitest';
import { planWorkItemTreeLevel } from '../workItemHierarchy';

// R ─┬─ A ── A1
//    └─ B
// S (root), D → missing parent
const links = [
  { id: 'R' }, { id: 'A', parent_id: 'R' }, { id: 'A1', parent_id: 'A' },
  { id: 'B', parent_id: 'R' }, { id: 'S', parent_id: null }, { id: 'D', parent_id: 'gone' },
];
const all = links.map(l => l.id);

describe('planWorkItemTreeLevel', () => {
  it('unfiltered: top level is the roots, children counted per parent', () => {
    const plan = planWorkItemTreeLevel(links, all);
    expect(plan.levelIds.sort()).toEqual(['D', 'R', 'S']);
    expect(Object.fromEntries(plan.childCounts)).toEqual({ R: 2, A: 1 });
    expect(plan.contextIds.size).toBe(0);
    expect(planWorkItemTreeLevel(links, all, 'R').levelIds.sort()).toEqual(['A', 'B']);
  });

  it('a matching grandchild brings its ancestors in as context', () => {
    const plan = planWorkItemTreeLevel(links, ['A1']);
    expect(plan.levelIds).toEqual(['R']);
    expect([...plan.contextIds].sort()).toEqual(['A', 'R']);
    expect(Object.fromEntries(plan.childCounts)).toEqual({ R: 1, A: 1 });
    expect(planWorkItemTreeLevel(links, ['A1'], 'R').levelIds).toEqual(['A']);
    expect(planWorkItemTreeLevel(links, ['A1'], 'A').levelIds).toEqual(['A1']);
  });

  it('non-matching siblings stay hidden; a matching parent is not context', () => {
    const plan = planWorkItemTreeLevel(links, ['R', 'A1']);
    expect(planWorkItemTreeLevel(links, ['R', 'A1'], 'R').levelIds).toEqual(['A']);
    expect([...plan.contextIds]).toEqual(['A']);
  });

  it('terminates on a parent cycle', () => {
    const cyc = [{ id: 'X', parent_id: 'Y' }, { id: 'Y', parent_id: 'X' }];
    expect(planWorkItemTreeLevel(cyc, ['X']).childCounts.size).toBe(2);
  });
});
