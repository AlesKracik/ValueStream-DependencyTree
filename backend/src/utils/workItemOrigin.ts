import { Db } from 'mongodb';
import { SOURCE_OWNED_FIELDS } from './constants';
import { AppError } from './errors';

/**
 * Work item origin and source-owned fields.
 *
 * A work item linked (synced) to an item in an external source has that
 * source as its origin, and the source owns some of its fields (Aha! owns
 * `name` and `description`). The server derives `origin` and the owned values
 * from `links` on every write; client-sent values are ignored or rejected.
 */

type Source = keyof typeof SOURCE_OWNED_FIELDS;
type OwnedField = 'name' | 'description';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Links = Record<string, any> | null | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

const SOURCE_LABELS: Record<Source, string> = { aha: 'Aha!' };

/** First source whose link has an `external_id` (i.e. was synced), otherwise 'local'. */
export function deriveOrigin(links: Links): 'local' | Source {
  for (const source of Object.keys(SOURCE_OWNED_FIELDS) as Source[]) {
    const id = links?.[source]?.external_id;
    if (typeof id === 'string' && id !== '') return source;
  }
  return 'local';
}

/** Convert source HTML (e.g. an Aha! description) to plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .split('\n').map(line => line.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Values of the owned fields as the origin's synced data has them. Missing values are left out. */
function ownedValues(origin: 'local' | Source, links: Links): Partial<Record<OwnedField, string>> {
  if (origin === 'local') return {};
  const data = links?.[origin]?.data;
  const out: Partial<Record<OwnedField, string>> = {};
  for (const field of SOURCE_OWNED_FIELDS[origin]) {
    const value = data?.[field];
    if (field === 'name' && typeof value === 'string' && value !== '') out.name = value;
    if (field === 'description' && typeof value === 'string') out.description = htmlToText(value);
  }
  return out;
}

/** Server-owned values for a whole work item document (create / upsert). */
export function deriveForDocument(doc: { links?: Links }): Doc {
  const origin = deriveOrigin(doc.links);
  return { origin, ...ownedValues(origin, doc.links) };
}

/**
 * Server-owned values for a PATCH, computed on the links after the patch.
 * Rejects a patch that edits an owned field to a value other than the
 * source's. When the patch also sets links, the source's value wins.
 */
export function deriveForPatch(existing: Doc | null, patch: Doc): Doc {
  const touchesLinks = 'links' in patch;
  const links = touchesLinks ? patch.links : existing?.links;
  const origin = deriveOrigin(links);
  const owned = ownedValues(origin, links);

  if (!touchesLinks && origin !== 'local') {
    for (const field of SOURCE_OWNED_FIELDS[origin]) {
      if (field in patch && owned[field] !== undefined && patch[field] !== owned[field]) {
        throw new AppError(`"${field}" is owned by ${SOURCE_LABELS[origin]} for this work item; change it in ${SOURCE_LABELS[origin]}.`, 400);
      }
    }
  }

  if (touchesLinks || (existing?.origin ?? 'local') !== origin) {
    return { origin, ...owned };
  }
  return {};
}

// ── Legacy migration ──────────────────────────────────────────────────────
// TODO(remove): delete this block (and its callers in routes/data.ts) once
// every record is migrated. Check with:
//   db.workItems.countDocuments({ $or: [
//     { aha_reference: { $exists: true } },
//     { aha_synced_data: { $exists: true } },
//     { aha_requirements: { $exists: true } } ] })
// It returns 0 when nothing is left to migrate.

/** Work items still carrying the legacy Aha! fields (also matches null values). */
export const LEGACY_AHA_FILTER = {
  $or: [
    { aha_reference: { $exists: true } },
    { aha_synced_data: { $exists: true } },
    { aha_requirements: { $exists: true } },
  ],
};

/** Map the legacy `aha_reference` / `aha_synced_data` fields onto an Aha! link. */
export function legacyAhaLink(doc: Doc): Doc | null {
  const ref = doc.aha_reference;
  const id = typeof ref?.id === 'string' ? ref.id : ref?.id != null ? String(ref.id) : '';
  const key = typeof ref?.reference_num === 'string' ? ref.reference_num : '';
  if (!key && !id) return null;

  const link: Doc = { key };
  if (id) link.external_id = id;
  if (ref?.url) link.url = ref.url;

  const synced = doc.aha_synced_data;
  if (synced && typeof synced === 'object') {
    const { total_effort_mds, ...rest } = synced;
    const data: Doc = { ...rest };
    if (total_effort_mds !== undefined) data.estimate_mds = total_effort_mds;
    link.data = data;
  }
  return link;
}

/**
 * Move legacy Aha! fields of every work item onto `links.aha` and derive the
 * origin. Each write is version-guarded and bumps `_version`; `updated_at` is
 * left alone. Returns the number of documents modified.
 */
export async function migrateLegacyAhaFields(db: Db): Promise<number> {
  const coll = db.collection('workItems');
  const docs = await coll.find(LEGACY_AHA_FILTER).toArray();
  let modified = 0;
  for (const doc of docs) {
    const legacy = legacyAhaLink(doc);
    const links = { ...(legacy ? { aha: legacy } : {}), ...(doc.links ?? {}) };
    const version = typeof doc._version === 'number' ? doc._version : undefined;
    const result = await coll.updateOne(
      { id: doc.id, _version: version !== undefined ? version : { $exists: false } },
      {
        $set: { links, ...deriveForDocument({ links }), _version: (version ?? 0) + 1 },
        $unset: { aha_reference: '', aha_synced_data: '', aha_requirements: '' },
      }
    );
    modified += result.modifiedCount;
  }
  return modified;
}
