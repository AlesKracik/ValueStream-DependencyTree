import { Db } from 'mongodb';
import { EFFORT_SIZE_MDS } from './constants';

/**
 * Work item baseline effort as a T-shirt size. `effort_size` is what clients
 * set; `total_effort_mds` is derived from it on every write so effort and
 * score computation keep working on a number. Linked Jira issues still
 * override the baseline once their efforts add up to more than 0.
 */

const SIZES = Object.keys(EFFORT_SIZE_MDS);

/**
 * The size closest to `mds` on a log scale (sizes grow roughly geometrically,
 * so the boundary between two sizes is their geometric mean). 0, negative or
 * not a number means not estimated: null.
 */
export function sizeForMds(mds: unknown): string | null {
  const n = Number(mds);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (let i = 0; i < SIZES.length - 1; i++) {
    const boundary = Math.sqrt(EFFORT_SIZE_MDS[SIZES[i]] * EFFORT_SIZE_MDS[SIZES[i + 1]]);
    if (n < boundary) return SIZES[i];
  }
  return SIZES[SIZES.length - 1];
}

/**
 * Stamp `total_effort_mds` from `effort_size` on a work item body or patch.
 * A write that sets only `total_effort_mds` (an older client) is converted to
 * the nearest size. A write touching neither is left alone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deriveEffort(data: Record<string, any>): void {
  if ('effort_size' in data) {
    const size = data.effort_size;
    data.total_effort_mds = size ? EFFORT_SIZE_MDS[size] : 0;
  } else if ('total_effort_mds' in data) {
    const size = sizeForMds(data.total_effort_mds);
    data.effort_size = size;
    data.total_effort_mds = size ? EFFORT_SIZE_MDS[size] : 0;
  }
}

// ── Legacy migration ──────────────────────────────────────────────────────
// TODO(remove): delete this block (and its caller in routes/data.ts) once
// every record is migrated. Check with:
//   db.workItems.countDocuments({ effort_size: { $exists: false }, total_effort_mds: { $gt: 0 } })
// It returns 0 when nothing is left to migrate.

/** Work items with a numeric baseline but no size yet. 0 / missing stays not estimated. */
export const LEGACY_EFFORT_FILTER = { effort_size: { $exists: false }, total_effort_mds: { $gt: 0 } };

/**
 * Convert every legacy numeric baseline to the nearest size, rewriting
 * `total_effort_mds` to that size's MDs. Each write is version-guarded and
 * bumps `_version`; `updated_at` is left alone. Returns the modified count —
 * the caller recomputes scores when it is above 0.
 */
export async function migrateLegacyEffort(db: Db): Promise<number> {
  const coll = db.collection('workItems');
  const docs = await coll.find(LEGACY_EFFORT_FILTER).toArray();
  let modified = 0;
  for (const doc of docs) {
    const size = sizeForMds(doc.total_effort_mds);
    if (!size) continue;
    const version = typeof doc._version === 'number' ? doc._version : undefined;
    const result = await coll.updateOne(
      { id: doc.id, _version: version !== undefined ? version : { $exists: false } },
      { $set: { effort_size: size, total_effort_mds: EFFORT_SIZE_MDS[size], _version: (version ?? 0) + 1 } }
    );
    modified += result.modifiedCount;
  }
  return modified;
}
