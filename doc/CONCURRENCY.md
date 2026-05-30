# Concurrency & conflict resolution

ValueStream-DependencyTree uses **optimistic concurrency control** (OCC) at three granularities so that multiple users editing the same data don't silently overwrite each other's work. This document is the canonical description of the contract — both ends of the wire, the merge semantics, and what to expect when conflicts actually happen.

## TL;DR

| Granularity | Endpoint | What it solves |
|---|---|---|
| Whole document | `POST /api/entity/:collection[/:id]` | Concurrent creates of the same `id`; replaces the whole entity |
| Field-level (PATCH) | `PATCH /api/entity/:collection/:id` | Two users editing **different fields** of the same entity |
| Array element | `POST/PATCH/DELETE /api/entity/:collection/:id/items/:arrayPath[/:itemId]` | Two users editing **different elements** of the same nested array |

All three carry `_version` and follow the same OCC contract: stale version → 409 + current document → client merges and retries.

## The `_version` field

Every persisted entity in the six tracked collections (`customers`, `workItems`, `issues`, `teams`, `sprints`, `valueStreams`) has a `_version: number` field — defined in `shared/types/src/models.ts` and declared optional on the TypeScript interface only because freshly-constructed in-memory entities don't have one until the first server round-trip.

- Server **inserts** new entities with `_version: 0`.
- Every successful mutation **bumps** `_version` by exactly 1 atomically (`$inc` inside the same `findOneAndUpdate` that does the write).
- Successful responses include the new `_version` so the client can update its local copy.

### Legacy documents (no `_version`)

Documents predating the OCC rollout don't have a `_version` field. The server treats these as `_version: 0`:

```js
// Match filter when client sends _version: 0
{ id, $or: [{ _version: 0 }, { _version: { $exists: false } }] }
```

So legacy docs auto-upgrade transparently on first mutation — no migration step required.

## Layer 1 — Whole-document OCC (`POST`)

```
POST /api/entity/:collection           — body: { id, _version, …entity }
POST /api/entity/:collection/:id       — body: { id?, _version, …entity }
```

Wire contract:

- `_version` is **required** in the body. Missing → 400.
- The endpoint is upsert-style: if the document with `id` doesn't exist, the server inserts it with `_version: 0` (client's sent version is ignored on insert, matching legacy `replaceOne({ upsert: true })` semantics).
- If the document exists and `_version` matches, the server replaces it and bumps the version.
- If the document exists and `_version` doesn't match, the server returns 409 with the body:

```json
{
  "success": false,
  "conflict": true,
  "error": "Version conflict — the entity was modified by someone else.",
  "current": { "id": "...", "_version": 7, "...": "..." }
}
```

The frontend's `persistEntity` helper (in `web-client/src/hooks/useValueStreamData.ts`) handles 409 by:

1. Building a patch from `changedKeys` (the fields the caller actually edited).
2. Deep-merging that patch onto `current` — server preserves its values on every field the client didn't touch; client wins on the fields it did touch.
3. Retrying once with `current._version`.
4. Showing a "concurrent edit" alert only if `findContestedKeys` reports overlap — i.e. the same field was changed on both sides.

If the retry itself fails for any reason, the user sees an error alert and the original local edit is left intact (no rollback) so they can decide what to do.

## Layer 2 — Field-level PATCH

```
PATCH /api/entity/:collection/:id      — body: { _version, patch: { …subset of fields } }
```

This is the contract you should reach for whenever the client knows which fields it actually edited (which is true for nearly every mutation in this app).

- The server `$set`s exactly the keys in `patch`, leaving all other fields on the document untouched.
- Server-owned keys (`id`, `_version`, anything matching `calculated_*`) are rejected if they appear in `patch` (400).
- Returns 404 if the document doesn't exist (PATCH never creates).
- Returns 409 with `current` on `_version` mismatch.

Concurrent edits naturally compose: A patches `status` while B patches `description`, the second PATCH fires a 409, retries against the freshly-bumped `_version`, both edits land.

The cycle guard on `workItems.parent_id` is only invoked when the patch actually touches `parent_id`.

The `createEntityCRUD.update` and `updateSprint` paths in the hook automatically build a patch from the partial `updates` object you pass to them — call sites don't need to change.

## Layer 3 — Array element operations

For nested arrays whose elements have stable identifiers, three endpoints let you mutate one element atomically without rewriting the whole array.

```
POST   /api/entity/:collection/:id/items/:arrayPath               — body: { _version, item }
PATCH  /api/entity/:collection/:id/items/:arrayPath/:itemId       — body: { _version, patch }
DELETE /api/entity/:collection/:id/items/:arrayPath/:itemId?_version=N
```

The DELETE endpoint takes `_version` from the query string because DELETE bodies are awkward across clients.

Whitelist (defined in `backend/src/routes/entity.ts` as `ARRAY_ELEMENT_WHITELIST`):

| Collection | Array path | Key field |
|---|---|---|
| `customers` | `support_issues` | `id` |
| `customers` | `tcv_history` | `id` |

Any other array path returns 400. Arrays whose elements don't have a stable id (`workItems.customer_targets`, `teams.members`) are deliberately not listed — they still flow through the whole-array PATCH path until they grow proper element ids.

**POST `/items`** uses `$push` and stamps a `randomUUID()` into the key field if the caller didn't supply one. Returns `{ success, _version, item }` with the canonical item.

**PATCH `/items/:itemId`** uses `$set` with `arrayFilters: [{ "elem.id": itemId }]` to update only the targeted element's fields. Refuses patches that try to rename the element's key field. If the element doesn't exist in the array, the parent's `_version` bump is rolled back and the endpoint returns 404.

**DELETE `/items/:itemId`** uses `$pull` to remove the element.

All three:

- Match on the parent's `_version` (with the legacy-tolerant `$or` for `_version: 0`).
- Bump the parent's `_version` in the same atomic `findOneAndUpdate`.
- Return 409 with the parent document on conflict.
- Return 404 if the parent entity is missing.
- Trigger score recompute when the parent is in `SCORE_AFFECTING_COLLECTIONS`.

The frontend hook exposes three methods on `ValueStreamDataState`:

```ts
addCustomerArrayItem(customerId, arrayPath, item) → Promise<item | undefined>
patchCustomerArrayItem(customerId, arrayPath, itemId, patch) → Promise<boolean>
deleteCustomerArrayItem(customerId, arrayPath, itemId) → Promise<boolean>
```

These apply the change optimistically to local state, call the corresponding endpoint, and back-write the bumped parent `_version` on success. `SupportPage`'s inline description and status edits route through `patchCustomerArrayItem` (via the optional `patchSupportIssue` prop wired in `App.tsx`).

## What this design does NOT solve

- **Real-time text co-editing**. Two users actively typing into the same description field simultaneously will still last-write-wins on the *final* save. Concurrent edits to *different* fields or *different* support_issues coexist; truly simultaneous keystrokes into the same field don't merge character-by-character. If that ever becomes a routine workflow, the next step is Yjs/Automerge on specific text fields — orthogonal to everything above (see [the original design discussion in this file's git history](.) for the tradeoff write-up).
- **Presence indicators**. There is no "Bob is editing this row" UX. Adding it requires a websocket channel; the persistence layer doesn't need to change for it.
- **Cross-entity transactions**. Each entity update is atomic individually, but a flow that touches multiple entities (e.g. moving an issue between work items) is not transactional. Cascade deletes (handled server-side in the DELETE endpoint) are the only multi-entity operation and they use Mongo's `updateMany` without OCC — operations on multiple unrelated documents, not a single logical transaction.

## Implementation reference

- Backend OCC plumbing: `backend/src/routes/entity.ts` (`upsertWithOcc`, `versionMatch`, the three array-element handlers).
- Backend schemas: `backend/src/routes/schemas.ts` (`EntityBody`, `EntityPatchBody`, `ArrayItemAddBody`, etc.).
- Frontend merge utility: `web-client/src/utils/entityMerge.ts` (`mergeForRetry`, `findContestedKeys`).
- Frontend persistence: `web-client/src/hooks/useValueStreamData.ts` (`persistEntity`, `patchEntity`, `addArrayItem`/`patchArrayItem`/`deleteArrayItem`, hook-level helpers).
- Tests: `backend/src/routes/__tests__/entity.test.ts`, `web-client/src/hooks/__tests__/useValueStreamData.persistence.test.tsx`, `web-client/src/utils/__tests__/entityMerge.test.ts`.
