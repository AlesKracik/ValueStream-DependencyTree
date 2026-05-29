/**
 * Optimistic-concurrency conflict resolution helpers.
 *
 * The contract with the backend (see `backend/src/routes/entity.ts`):
 *  - Every entity carries `_version`.
 *  - PUT/POST mutations include the `_version` the client last observed.
 *  - On version mismatch the server returns 409 with the *current* document.
 *
 * On 409, the client deep-merges its pending field changes onto the current
 * server document — fields the client actually touched win, everything else
 * comes from the server — then retries once with the server's `_version`.
 *
 * This is field-level last-write-wins. It eliminates the "two users edit
 * different fields and one of them loses" failure mode that whole-document
 * replacement has. Edits that genuinely contested the same field still go
 * to last-write-wins; surface a notification at the call site if you want
 * users to be aware.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEntity = Record<string, any>;

/**
 * Merge the client's pending changes onto the server's current document.
 *
 * @param current      The server's latest version of the document (from the 409 response).
 * @param ourChanges   The fields the client wants to apply. Typically the `updates`
 *                     object that was passed into an `updateX(id, updates)` call.
 * @returns A new document with the server's content overlaid by the client's pending
 *          field values. `_version` is taken from `current` so the retry uses the
 *          freshest version the server expects.
 */
export function mergeForRetry(current: AnyEntity, ourChanges: AnyEntity): AnyEntity {
  // Drop `_version` from the client's changes — it must come from the server.
  // (The caller's `ourChanges` is just the partial diff, but be defensive.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _version: _ignored, ...clientPatch } = ourChanges;
  return { ...current, ...clientPatch, _version: current._version ?? 0 };
}

/**
 * Identify which top-level keys in `ourChanges` are also different on the
 * server compared to the baseline the client originally read. Those are the
 * keys where the two writers genuinely contested the same field.
 *
 * If `baseline` isn't available (e.g. the call site doesn't track it), this
 * returns an empty array — the merge still runs but the caller can't tell
 * whether anything was contested.
 */
export function findContestedKeys(
  current: AnyEntity,
  ourChanges: AnyEntity,
  baseline?: AnyEntity
): string[] {
  if (!baseline) return [];
  const contested: string[] = [];
  for (const key of Object.keys(ourChanges)) {
    if (key === '_version') continue;
    if (!shallowEqual(current[key], baseline[key])) {
      contested.push(key);
    }
  }
  return contested;
}

// Cheap equality good enough for change detection — for nested objects/arrays
// we treat any structural change as a contest, which errs on the side of
// notifying the user when they might care.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
