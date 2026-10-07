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

export interface TreeLevelPlan {
  /** Ids of the requested level (top level, or the children of `parentId`). */
  levelIds: string[];
  /** Visible children per work item id, for the expand chevrons. */
  childCounts: Map<string, number>;
  /** Shown only as an ancestor of a match (not a match itself). */
  contextIds: Set<string>;
}

/**
 * Plans one level of the work-items tree view. Visible = items matching the
 * filters plus every ancestor of a match, so a matching child is never hidden
 * behind a parent that does not match. An item's tree parent is its
 * parent_id when that parent is visible; otherwise it sits at the top level.
 * Pure: `links` is every work item's id + parent_id.
 */
export function planWorkItemTreeLevel(
  links: { id: string; parent_id?: string | null }[],
  matchedIds: Iterable<string>,
  parentId?: string,
): TreeLevelPlan {
  const parentOf = new Map(links.map(l => [l.id, l.parent_id || undefined]));
  const matched = new Set(matchedIds);
  const visible = new Set(matched);
  for (const id of matched) {
    const seen = new Set([id]);
    let p = parentOf.get(id);
    // A visible ancestor's own ancestors are already in (or will be walked).
    while (p && parentOf.has(p) && !seen.has(p) && !visible.has(p)) {
      visible.add(p);
      seen.add(p);
      p = parentOf.get(p);
    }
  }

  const treeParent = (id: string): string | undefined => {
    const p = parentOf.get(id);
    return p && p !== id && visible.has(p) ? p : undefined;
  };

  const levelIds: string[] = [];
  const childCounts = new Map<string, number>();
  for (const id of visible) {
    const p = treeParent(id);
    if (p) childCounts.set(p, (childCounts.get(p) ?? 0) + 1);
    if (p === parentId) levelIds.push(id);
  }
  const contextIds = new Set([...visible].filter(id => !matched.has(id)));
  return { levelIds, childCounts, contextIds };
}
