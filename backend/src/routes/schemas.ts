import { Type, Static } from '@sinclair/typebox';

// ── Entity ──────────────────────────────────────────────────────────────────
export const EntityBody = Type.Object({
  id: Type.String()
}, { additionalProperties: true });
export type EntityBodyType = Static<typeof EntityBody>;

export const EntityOptionalIdBody = Type.Object({
  id: Type.Optional(Type.String())
}, { additionalProperties: true });
export type EntityOptionalIdBodyType = Static<typeof EntityOptionalIdBody>;

export const CollectionParams = Type.Object({
  collection: Type.String()
});
export type CollectionParamsType = Static<typeof CollectionParams>;

export const CollectionIdParams = Type.Object({
  collection: Type.String(),
  id: Type.String()
});
export type CollectionIdParamsType = Static<typeof CollectionIdParams>;

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
  Type.Object({ jql: Type.String() })
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

  // Legacy params kept for backward compatibility with workspace endpoint callers
  releasedFilter: Type.Optional(Type.String()),
  minScoreFilter: Type.Optional(Type.String()),
  customerId: Type.Optional(Type.String()),
}, { additionalProperties: true });
export type WorkItemListQueryType = Static<typeof WorkItemListQuery>;
