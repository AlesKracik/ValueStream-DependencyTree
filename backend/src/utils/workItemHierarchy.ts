import type { Db } from 'mongodb';

/**
 * Walks ancestors of a candidate parent to determine whether assigning it to
 * `childId` would create a cycle. Returns `true` if the assignment is safe.
 *
 * Cycle rules:
 *  - A WorkItem cannot be its own parent (parent_id !== id).
 *  - The candidate parent (or any of its ancestors) cannot be `childId` itself,
 *    otherwise the resulting graph contains a cycle.
 *
 * The walk is bounded by `maxDepth` to defend against pre-existing corrupt cycles
 * in the database (which would otherwise loop forever).
 */
export async function wouldCreateCycle(
  db: Db,
  childId: string,
  candidateParentId: string,
  maxDepth: number = 256,
): Promise<boolean> {
  if (childId === candidateParentId) return true;

  let cursor: string | undefined = candidateParentId;
  const visited = new Set<string>();

  for (let i = 0; i < maxDepth && cursor; i++) {
    if (cursor === childId) return true;
    if (visited.has(cursor)) return true; // pre-existing cycle in DB
    visited.add(cursor);

    const parent: { parent_id?: string } | null = await db.collection('workItems').findOne<{ parent_id?: string }>(
      { id: cursor },
      { projection: { parent_id: 1, _id: 0 } },
    );
    cursor = parent?.parent_id;
  }

  return false;
}
