import { Type, Static } from '@sinclair/typebox';

// ── Entity ──────────────────────────────────────────────────────────────────
// Every mutation must carry the `_version` the client last observed (0 for a
// brand-new entity). The server uses it for optimistic concurrency control:
// matching version → update + bump; mismatch → 409 with current document.
// Legacy docs that never got a `_version` are matched as if it were 0.
export const EntityBody = Type.Object({
  id: Type.String(),
  _version: Type.Integer({ minimum: 0 })
}, { additionalProperties: true });
export type EntityBodyType = Static<typeof EntityBody>;

export const EntityOptionalIdBody = Type.Object({
  id: Type.Optional(Type.String()),
  _version: Type.Integer({ minimum: 0 })
}, { additionalProperties: true });
export type EntityOptionalIdBodyType = Static<typeof EntityOptionalIdBody>;

// PATCH /api/entity/:collection/:id — field-level update. `patch` is a sparse
// object containing only the keys the client wants to change. Server-owned
// keys (id, _version, calculated_*) are rejected if present in `patch`.
export const EntityPatchBody = Type.Object({
  _version: Type.Integer({ minimum: 0 }),
  patch: Type.Object({}, { additionalProperties: true })
}, { additionalProperties: false });
export type EntityPatchBodyType = Static<typeof EntityPatchBody>;

export const CollectionParams = Type.Object({
  collection: Type.String()
});
export type CollectionParamsType = Static<typeof CollectionParams>;

export const CollectionIdParams = Type.Object({
  collection: Type.String(),
  id: Type.String()
});
export type CollectionIdParamsType = Static<typeof CollectionIdParams>;

// ── Array element endpoints (Phase 3) ───────────────────────────────────────
// POST /api/entity/:collection/:id/items/:arrayPath — push a new element.
// If the item lacks `id`, the server fills one with a UUID.
export const ArrayItemAddBody = Type.Object({
  _version: Type.Integer({ minimum: 0 }),
  item: Type.Object({}, { additionalProperties: true })
}, { additionalProperties: false });
export type ArrayItemAddBodyType = Static<typeof ArrayItemAddBody>;

// PATCH /api/entity/:collection/:id/items/:arrayPath/:itemId — field-level
// update of one element. Same patch semantics as the entity PATCH.
export const ArrayItemPatchBody = Type.Object({
  _version: Type.Integer({ minimum: 0 }),
  patch: Type.Object({}, { additionalProperties: true })
}, { additionalProperties: false });
export type ArrayItemPatchBodyType = Static<typeof ArrayItemPatchBody>;

// DELETE doesn't carry a body — `_version` comes from the query string.
export const ArrayItemDeleteQuery = Type.Object({
  _version: Type.String()  // arrives as string; coerced to int in the handler
}, { additionalProperties: true });
export type ArrayItemDeleteQueryType = Static<typeof ArrayItemDeleteQuery>;

export const ArrayItemParams = Type.Object({
  collection: Type.String(),
  id: Type.String(),
  arrayPath: Type.String()
});
export type ArrayItemParamsType = Static<typeof ArrayItemParams>;

export const ArrayItemWithIdParams = Type.Object({
  collection: Type.String(),
  id: Type.String(),
  arrayPath: Type.String(),
  itemId: Type.String()
});
export type ArrayItemWithIdParamsType = Static<typeof ArrayItemWithIdParams>;

// ── Settings ────────────────────────────────────────────────────────────────
// Settings body is a deep, complex object — use passthrough schema for runtime
// validation (ensures it's an object) while TypeScript provides compile-time safety.
export const SettingsBody = Type.Object({}, { additionalProperties: true });

// ── Mongo ───────────────────────────────────────────────────────────────────
export const MongoConfigBody = Type.Object({
  connection_type: Type.Optional(Type.String())
}, { additionalProperties: true });
export type MongoConfigBodyType = Static<typeof MongoConfigBody>;

export const MongoQueryBody = Type.Object({
  connection_type: Type.Optional(Type.String()),
  query: Type.Unknown()
}, { additionalProperties: true });
export type MongoQueryBodyType = Static<typeof MongoQueryBody>;

export const MongoImportBody = Type.Object({
  data: Type.Record(Type.String(), Type.Array(Type.Unknown()))
});
export type MongoImportBodyType = Static<typeof MongoImportBody>;

// ── Jira ────────────────────────────────────────────────────────────────────
// Jira routes receive a settings-like config blob with optional jira_key/jql
export const JiraConfigBody = Type.Object({
  jira: Type.Optional(Type.Object({
    base_url: Type.Optional(Type.String()),
    api_version: Type.Optional(Type.String()),
    api_token: Type.Optional(Type.String())
  }, { additionalProperties: true }))
}, { additionalProperties: true });
export type JiraConfigBodyType = Static<typeof JiraConfigBody>;

export const JiraIssueBody = Type.Intersect([
  JiraConfigBody,
  Type.Object({ jira_key: Type.String() })
]);
export type JiraIssueBodyType = Static<typeof JiraIssueBody>;

export const JiraSearchBody = Type.Intersect([
  JiraConfigBody,
  Type.Object({
    jql: Type.String(),
    // When true, after the base JQL runs the backend fetches one level of
    // children (issues whose "Parent Link" points at a base-result key).
    include_children: Type.Optional(Type.Boolean())
  })
]);
export type JiraSearchBodyType = Static<typeof JiraSearchBody>;

// ── Aha ─────────────────────────────────────────────────────────────────────
export const AhaConfigBody = Type.Object({
  aha: Type.Optional(Type.Object({
    subdomain: Type.Optional(Type.String()),
    api_key: Type.Optional(Type.String())
  }, { additionalProperties: true }))
}, { additionalProperties: true });
export type AhaConfigBodyType = Static<typeof AhaConfigBody>;

export const AhaFeatureBody = Type.Intersect([
  AhaConfigBody,
  Type.Object({ reference_num: Type.String() })
]);
export type AhaFeatureBodyType = Static<typeof AhaFeatureBody>;

export const AhaFeaturesBody = Type.Intersect([
  AhaConfigBody,
  Type.Object({ workspace: Type.String() })
]);
export type AhaFeaturesBodyType = Static<typeof AhaFeaturesBody>;

// ── LDAP ────────────────────────────────────────────────────────────────────
export const LdapSyncBody = Type.Object({
  ldap_team_name: Type.String()
}, { additionalProperties: true });
export type LdapSyncBodyType = Static<typeof LdapSyncBody>;

// ── AWS SSO ─────────────────────────────────────────────────────────────────
export const AwsSsoLoginBody = Type.Object({
  role: Type.Optional(Type.String()),
  persistence: Type.Optional(Type.Object({}, { additionalProperties: true }))
}, { additionalProperties: true });
export type AwsSsoLoginBodyType = Static<typeof AwsSsoLoginBody>;

// ── Glean ───────────────────────────────────────────────────────────────────
export const GleanAuthInitBody = Type.Object({
  gleanUrl: Type.String()
});
export type GleanAuthInitBodyType = Static<typeof GleanAuthInitBody>;

export const GleanChatBody = Type.Object({
  gleanUrl: Type.String(),
  messages: Type.Array(Type.Unknown()),
  stream: Type.Optional(Type.Boolean())
});
export type GleanChatBodyType = Static<typeof GleanChatBody>;

// ── LLM ─────────────────────────────────────────────────────────────────────
export const LlmGenerateBody = Type.Object({
  prompt: Type.String(),
  config: Type.Optional(Type.Object({}, { additionalProperties: true }))
});
export type LlmGenerateBodyType = Static<typeof LlmGenerateBody>;

// ── Work Item list query ────────────────────────────────────────────────────
// Querystring schema for GET /api/data/workItems. All fields optional.
// Array params (status, releasedSprintIds) accept either a single string or
// repeated query params (?status=Backlog&status=Planning) — Fastify normalizes
// repeated params to arrays. Numbers arrive as strings and are coerced by the
// query builder.
export const WorkItemListQuery = Type.Object({
  // Free-text filter on name (case-insensitive substring)
  name: Type.Optional(Type.String()),

  // Range filters (strings so empty values pass; coerced numerically downstream)
  minScore: Type.Optional(Type.String()),
  maxScore: Type.Optional(Type.String()),
  minEffort: Type.Optional(Type.String()),
  maxEffort: Type.Optional(Type.String()),
  minTcv: Type.Optional(Type.String()),
  maxTcv: Type.Optional(Type.String()),

  // Priority range targets the field selected by priorityMetric (default: 'score' →
  // calculated_score). Lets the UI's prioritization toggle drive both filter + sort.
  minPriority: Type.Optional(Type.String()),
  maxPriority: Type.Optional(Type.String()),
  priorityMetric: Type.Optional(Type.Union([
    Type.Literal('score'),
    Type.Literal('aha_score'),
    Type.Literal('stackrank'),
  ])),

  // Multi-select filters: accept array OR single string (repeated query params)
  status: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()])),
  releasedSprintIds: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()])),

  // Sort
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),

  // Pagination (1-based page index). Both must be set to enable pagination;
  // when omitted, the legacy unpaginated behaviour (with the 500-item threshold)
  // is preserved for backward compatibility.
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),

  // Hierarchy filters. `rootsOnly` is mutually exclusive with parent/subtree
  // on the UI side; the backend simply ANDs whatever it receives.
  //   parentId   — direct children of any of these ids (parent_id ∈ ids)
  //   subtreeOf  — entire subtree below any of these ids: descendants only (roots excluded)
  //   rootsOnly  — top-level items (no parent_id)
  // Both `parentId` and `subtreeOf` accept either a single value or repeated
  // query params (?parentId=A&parentId=B) — Fastify normalizes repeated params
  // to arrays.
  parentId: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()])),
  subtreeOf: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()])),
  rootsOnly: Type.Optional(Type.String()),

  // Legacy params kept for backward compatibility with workspace endpoint callers
  releasedFilter: Type.Optional(Type.String()),
  minScoreFilter: Type.Optional(Type.String()),
  customerId: Type.Optional(Type.String()),
}, { additionalProperties: true });
export type WorkItemListQueryType = Static<typeof WorkItemListQuery>;

// ── Customer list query ─────────────────────────────────────────────────────
// Querystring schema for GET /api/data/customers. Mirrors WorkItemListQuery's
// shape: free-text name filter, per-attribute range filters, sort, and optional
// pagination. Numbers arrive as strings and are coerced by the query builder.
export const CustomerListQuery = Type.Object({
  // Free-text filter on name (case-insensitive substring, regex chars escaped)
  name: Type.Optional(Type.String()),

  // Per-attribute range filters on stored TCV fields
  minExistingTcv: Type.Optional(Type.String()),
  maxExistingTcv: Type.Optional(Type.String()),
  minPotentialTcv: Type.Optional(Type.String()),
  maxPotentialTcv: Type.Optional(Type.String()),
  // Total = existing + potential, computed via $expr at query time
  minTotalTcv: Type.Optional(Type.String()),
  maxTotalTcv: Type.Optional(Type.String()),

  // Sort
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),

  // Pagination (1-based page index). Both must be set to enable pagination;
  // when omitted, the legacy unpaginated behaviour (with the 500-item threshold)
  // is preserved.
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),

  // Legacy
  customerFilter: Type.Optional(Type.String()),
}, { additionalProperties: true });
export type CustomerListQueryType = Static<typeof CustomerListQuery>;
