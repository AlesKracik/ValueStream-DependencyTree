import type { Db } from 'mongodb';

/**
 * Resolves every descendant of `rootId` (children, grandchildren, …) via a single
 * MongoDB `$graphLookup` aggregation. The root itself is NOT included — callers
 * that want a "subtree including the root" should add `rootId` themselves.
 *
 * Relies on an index on `parent_id` for fast traversal; if it does not exist the
 * caller should ensure one is created (see `ensureHierarchyIndex`).
 */
export async function getDescendantIds(db: Db, rootId: string): Promise<string[]> {
  const result = await db.collection('workItems').aggregate<{ descendants: { id: string }[] }>([
    { $match: { id: rootId } },
    {
      $graphLookup: {
        from: 'workItems',
        startWith: '$id',
        connectFromField: 'id',
        connectToField: 'parent_id',
        as: 'descendants',
      },
    },
    { $project: { _id: 0, descendants: { id: 1 } } },
  ]).toArray();

  if (result.length === 0) return [];
  return result[0].descendants.map(d => d.id);
}

/**
 * Like {@link getDescendantIds} but takes multiple roots and returns the union
 * of all their descendants. Resolved in a single aggregation by starting with
 * `{ id: { $in: rootIds } }` and unwinding each root's $graphLookup output.
 * Returns an empty array when `rootIds` is empty.
 */
export async function getDescendantIdsForRoots(db: Db, rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const result = await db.collection('workItems').aggregate<{ descendants: { id: string }[] }>([
    { $match: { id: { $in: rootIds } } },
    {
      $graphLookup: {
        from: 'workItems',
        startWith: '$id',
        connectFromField: 'id',
        connectToField: 'parent_id',
        as: 'descendants',
      },
    },
    { $project: { _id: 0, descendants: { id: 1 } } },
  ]).toArray();

  const out = new Set<string>();
  for (const row of result) {
    for (const d of row.descendants) out.add(d.id);
  }
  return Array.from(out);
}

/** Creates the `parent_id` index if missing. Idempotent — Mongo no-ops if it exists. */
export async function ensureHierarchyIndex(db: Db): Promise<void> {
  await db.collection('workItems').createIndex({ parent_id: 1 });
}

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
