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

export const AhaFeatureBody = Type.Object({
  reference_num: Type.String()
});
export type AhaFeatureBodyType = Static<typeof AhaFeatureBody>;

// ── LDAP ────────────────────────────────────────────────────────────────────
export const LdapSyncBody = Type.Object({
  ldap_team_name: Type.String()
});
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
