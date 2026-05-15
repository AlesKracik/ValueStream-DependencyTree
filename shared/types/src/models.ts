export interface TcvHistoryEntry {
  id: string;
  value: number;
  valid_from: string; // ISO date
  duration_months?: number;
}

export interface SupportIssue {
  id: string;
  description: string;
  related_jiras?: string[];
  status: 'to do' | 'work in progress' | 'noop' | 'waiting for customer' | 'waiting for other party' | 'waiting for release' | 'done';
  expiration_date?: string; // ISO date
  created_at?: string; // ISO datetime
  updated_at?: string; // ISO datetime
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  url: string;
  last_updated: string; // ISO datetime
  category?: 'new' | 'in_progress' | 'noop';
}

export interface Customer {
  id: string;
  name: string;
  customer_id?: string;
  existing_tcv: number;
  existing_tcv_valid_from?: string; // ISO date
  existing_tcv_duration_months?: number;
  potential_tcv: number;
  potential_tcv_valid_from?: string; // ISO date
  potential_tcv_duration_months?: number;
  tcv_history?: TcvHistoryEntry[];
  support_issues?: SupportIssue[];
  jira_support_issues?: JiraIssue[];
}

export interface WorkItem {
  id: string;
  name: string;
  description?: string;
  status: 'Backlog' | 'Planning' | 'Development' | 'Done';
  total_effort_mds: number;
  released_in_sprint_id?: string;
  score: number;
  stackrank?: number;
  /**
   * Parent work item in the hierarchy. Optional; absent for root-level items.
   * Children are *derived* by querying `workItems` where `parent_id === this.id` —
   * the relationship is stored only on the child to keep the data single-sourced.
   */
  parent_id?: string;
  all_customers_target?: {
    tcv_type: 'existing' | 'potential';
    priority?: 'Must-have' | 'Should-have' | 'Nice-to-have';
  } | null;
  customer_targets: {
    customer_id: string;
    tcv_type: 'existing' | 'potential';
    priority?: 'Must-have' | 'Should-have' | 'Nice-to-have';
    tcv_history_id?: string; // Reference to a historical Existing TCV value
  }[];
  calculated_tcv?: number;     // Pre-computed TCV impact (set on save by recomputeScores)
  calculated_effort?: number;  // Pre-computed effort in MDs (set on save by recomputeScores)
  calculated_score?: number;   // Pre-computed RICE score = tcv / effort (set on save by recomputeScores)
  aha_reference?: {
    id: string;
    reference_num: string;
    url: string;
  } | null;
  aha_requirements?: string;
  aha_synced_data?: {
    name?: string;
    description?: string;
    total_effort_mds?: number;
    score?: number;
    requirements?: {
      id: string;
      reference_num: string;
      name: string;
      description?: string;
      url?: string;
    }[];
  };
}

export interface TeamMember {
  name: string;
  username: string;
  capacity_percentage: number;
}

export interface Team {
  id: string;
  name: string;
  total_capacity_mds: number;
  country?: string;
  jira_team_id?: string;
  sprint_capacity_overrides?: Record<string, number>;
  ldap_team_name?: string;
  members?: TeamMember[];
}

export interface IssueDependency {
  issue_id: string;
  dependency_type: 'FS' | 'FF';
}

export interface Issue {
  id: string;
  jira_key: string;
  work_item_id?: string;
  team_id: string;
  effort_md: number;
  target_start?: string;
  target_end?: string;
  name?: string;
  external_url?: string;
  sprint_effort_overrides?: Record<string, number>;
  dependencies?: IssueDependency[];
}

export interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  quarter?: string; // e.g. "FY2026 Q1"
  is_archived?: boolean;
}

/** IDs of the built-in CSS themes shipped with the app (defined in web-client/src/index.css). */
export type BuiltinThemeId = 'dark' | 'filips';

/**
 * A theme entry editable in Settings. Built-in themes (`dark`, `filips`) may have a sparse
 * `colors` map that overrides specific CSS variables on top of the values in `index.css`.
 * Custom themes specify a `base` built-in theme to use as their CSS foundation, then layer
 * their own `colors` on top.
 */
export interface ThemeDefinition {
  /** Stable identifier — used as the `data-theme` attribute and as the `general.theme` value. */
  id: string;
  /** Display name shown in the theme dropdown. */
  label: string;
  /** Whether this is one of the built-in themes (`dark`/`filips`). */
  builtin: boolean;
  /** For custom themes: which built-in theme's CSS palette to start from. Required when `builtin === false`. */
  base?: BuiltinThemeId;
  /** Sparse map of CSS variable name (e.g. `--bg-page`) to value. Empty entries fall through to defaults. */
  colors: Record<string, string>;
}

export interface GeneralSettings {
  fiscal_year_start_month: number;
  sprint_duration_days: number;
  /**
   * The active theme ID. May be a built-in (`'dark'`, `'filips'`) or the ID of any
   * custom theme defined in `theme_definitions`.
   */
  theme?: string;
  /** Per-user page size for paginated list views. */
  items_per_page?: number;
  /**
   * Server-scope: customisations of built-in themes plus any user-defined custom themes.
   * Built-in themes only need entries here if they have overrides; their absence means
   * "use CSS defaults from index.css".
   */
  theme_definitions?: ThemeDefinition[];
}

export interface JiraSettings {
  base_url: string;
  api_version: '2' | '3';
  api_token?: string;
  customer?: {
    jql_new?: string;
    jql_in_progress?: string;
    jql_noop?: string;
  };
}

export interface AhaSettings {
  subdomain: string;
  api_key?: string;
  workspace?: string;
}

export interface LdapSettings {
  url: string;
  bind_dn: string;
  bind_password?: string;
  team: {
    base_dn: string;
    search_filter: string;
  };
}

export interface AwsStaticAuth {
  aws_access_key: string;
  aws_secret_key: string;
  aws_session_token?: string;
}

export interface AwsRoleAuth {
  aws_role_arn: string;
  aws_external_id?: string;
  aws_role_session_name?: string;
  /** Optional explicit credentials; if omitted, ambient credentials (IRSA/Pod Identity) are used */
  aws_access_key?: string;
  aws_secret_key?: string;
  aws_session_token?: string;
}

export interface AwsSsoAuth {
  aws_sso_start_url: string;
  aws_sso_region: string;
  aws_sso_account_id: string;
  aws_sso_role_name: string;
  /** Temporary credentials obtained from the SSO device flow */
  aws_access_key?: string;
  aws_secret_key?: string;
  aws_session_token?: string;
}

export interface MongoAuthSettings {
  method: 'scram' | 'aws' | 'oidc';
  aws_auth_type?: 'static' | 'role' | 'sso' | 'ambient';
  static?: AwsStaticAuth;
  role?: AwsRoleAuth;
  sso?: AwsSsoAuth;
  oidc_token?: string;
}

export interface MongoConfig {
  uri: string;
  db: string;
  auth: MongoAuthSettings;
  use_proxy: boolean;
  tunnel_name?: string;
  collection?: string; // only for customer
  custom_query?: string; // only for customer
}

export type AppDbProvider = 'mongo';
export type CustomerDbProvider = 'mongo';

export interface PersistenceSettings {
  app_provider: AppDbProvider;
  customer_provider: CustomerDbProvider;
  mongo: {
    app: MongoConfig;
    customer: MongoConfig;
  };
}

export interface AISettings {
  provider: 'openai' | 'gemini' | 'anthropic' | 'augment' | 'glean';
  api_key?: string;
  model?: string;
  support?: {
    prompt: string;
  };
  glean_url?: string;
  glean_state?: {
    tokens?: Record<string, {
      access_token: string;
      refresh_token?: string;
      expires_at: number;
      client_id: string;
      client_secret: string;
      token_endpoint: string;
    }>;
    clients?: Record<string, {
      client_id: string;
      client_secret: string;
      registration_client_uri?: string;
      registration_access_token?: string;
      registration_endpoint: string;
      token_endpoint: string;
      authorization_endpoint: string;
    }>;
  };
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export type AuthMethod = 'local' | 'ldap' | 'aws-sso' | 'okta' | 'aws-sts';

export interface AwsSsoAuthConfig {
  start_url: string;
  region: string;
  account_id: string;
  role_name: string;
}

export interface OktaAuthConfig {
  issuer: string;        // e.g. https://yourcompany.okta.com
  client_id: string;
  client_secret?: string; // optional if using PKCE-only
}

/**
 * AWS STS pre-signed caller-identity auth config.
 * The user signs a GetCallerIdentity request on their own machine using their
 * local AWS credentials; the backend forwards the signed request to STS and
 * checks the returned ARN against the configured role.
 */
export interface AwsStsAuthConfig {
  region: string;                  // must match the STS endpoint host
  account_id: string;              // allowed AWS account
  role_name: string;               // allowed role (extracted from assumed-role ARN)
  default_profile?: string;        // baked into the downloadable helper script
  max_request_age_seconds?: number; // defaults to 300 (5 minutes)
}

export interface AuthSettings {
  method: AuthMethod;
  session_expiry_hours: number;
  aws_sso?: AwsSsoAuthConfig;
  aws_sts?: AwsStsAuthConfig;
  okta?: OktaAuthConfig;
  default_role: UserRole;
}

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  password_hash?: string;
  source: AuthMethod;
  created_at: string;
  last_login?: string;
  /** Per-user client-scoped settings (e.g. theme), stored in user profile */
  client_settings?: Partial<Settings>;
}

export interface Settings {
  general: GeneralSettings;
  persistence: PersistenceSettings;
  jira: JiraSettings;
  aha: AhaSettings;
  ai: AISettings;
  ldap: LdapSettings;
  auth: AuthSettings;
}

export type AppSettings = Settings;

/** Indicates whether a settings field is stored/managed on the server or client */
export type SettingsScope = 'server' | 'client';

/**
 * Dot-path scope map for every settings field.
 * A path acts as a default for all its children unless a more specific path overrides it.
 * E.g. 'persistence' covers everything under persistence; 'general.theme' overrides the
 * scope for theme while leaving the rest of 'general' at its parent scope.
 *
 * For now all values are kept on the server; change individual entries
 * to 'client' when moving them to frontend-only storage.
 */
export const SETTINGS_SCOPE: Record<string, SettingsScope> = {
  // general
  'general': 'server',
  'general.fiscal_year_start_month': 'server',
  'general.sprint_duration_days': 'server',
  'general.theme': 'client',
  'general.items_per_page': 'client',
  // Theme color customisations + custom themes are shared by the whole instance.
  'general.theme_definitions': 'server',
  // persistence
  'persistence': 'server',
  // persistence — SSO config is per-user (client), credentials are shared (server)
  'persistence.mongo.app.auth.sso': 'client',
  'persistence.mongo.app.auth.sso.aws_access_key': 'server',
  'persistence.mongo.app.auth.sso.aws_secret_key': 'server',
  'persistence.mongo.app.auth.sso.aws_session_token': 'server',
  'persistence.mongo.customer.auth.sso': 'client',
  'persistence.mongo.customer.auth.sso.aws_access_key': 'server',
  'persistence.mongo.customer.auth.sso.aws_secret_key': 'server',
  'persistence.mongo.customer.auth.sso.aws_session_token': 'server',
  // jira
  'jira': 'server',
  'jira.api_token': 'client',
  // aha
  'aha': 'server',
  'aha.api_key': 'client',
  // ai
  'ai': 'server',
  // ldap
  'ldap': 'server',
  'ldap.bind_dn': 'client',
  'ldap.bind_password': 'client',
  // auth
  'auth': 'server',
};

/** Resolve the scope for a dot-path by finding the most specific matching entry */
export function resolveScope(dotPath: string): SettingsScope {
  // Try exact match first, then walk up to parent paths
  let path = dotPath;
  while (path) {
    if (path in SETTINGS_SCOPE) return SETTINGS_SCOPE[path];
    const lastDot = path.lastIndexOf('.');
    path = lastDot === -1 ? '' : path.substring(0, lastDot);
  }
  return 'server'; // default
}

/**
 * Partition a settings object into server and client portions.
 * Walks the tree recursively; at each leaf (or sub-object), checks the scope
 * via dot-path resolution. If a parent path has a uniform scope, the entire
 * sub-tree goes to that side without further recursion.
 */
export function partitionSettings(settings: Partial<Settings>): {
  server: Partial<Settings>;
  client: Partial<Settings>;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(obj: any, prefix: string): { server: any; client: any } {
    // If this exact path or a parent has a scope and no children override it, take the shortcut
    const thisScope = prefix in SETTINGS_SCOPE ? SETTINGS_SCOPE[prefix] : undefined;
    const hasChildOverrides = Object.keys(SETTINGS_SCOPE).some(
      k => k.startsWith(prefix + '.') && SETTINGS_SCOPE[k] !== thisScope
    );

    if (thisScope && !hasChildOverrides) {
      // Entire sub-tree belongs to one side
      return thisScope === 'client'
        ? { server: undefined, client: obj }
        : { server: obj, client: undefined };
    }

    // Mixed scope within this sub-tree — recurse into each key
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverPart: any = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientPart: any = {};
      let hasServer = false;
      let hasClient = false;

      for (const key of Object.keys(obj)) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        const childScope = resolveScope(childPath);

        // Check if this child itself has mixed children
        const childHasOverrides = Object.keys(SETTINGS_SCOPE).some(
          k => k.startsWith(childPath + '.') && SETTINGS_SCOPE[k] !== childScope
        );

        if (childHasOverrides && typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          const result = walk(obj[key], childPath);
          if (result.server !== undefined) { serverPart[key] = result.server; hasServer = true; }
          if (result.client !== undefined) { clientPart[key] = result.client; hasClient = true; }
        } else if (childScope === 'client') {
          clientPart[key] = obj[key];
          hasClient = true;
        } else {
          serverPart[key] = obj[key];
          hasServer = true;
        }
      }

      return {
        server: hasServer ? serverPart : undefined,
        client: hasClient ? clientPart : undefined,
      };
    }

    // Primitive at a mixed level — resolve by path
    const scope = resolveScope(prefix);
    return scope === 'client'
      ? { server: undefined, client: obj }
      : { server: obj, client: undefined };
  }

  const result = walk(settings, '');
  return {
    server: result.server || {},
    client: result.client || {},
  };
}

/* ------------------------------------------------------------------ */
/*  Theme variable catalog                                            */
/* ------------------------------------------------------------------ */

/** Logical grouping shown in the Theme Definition editor. */
export type ThemeVariableGroup =
  | 'Backgrounds'
  | 'Text'
  | 'Nodes'
  | 'Sprint Nodes'
  | 'Borders & Edges'
  | 'Accents'
  | 'Status'
  | 'Misc';

/** Whether the variable accepts a free-form CSS value (e.g. a `filter`) instead of a color. */
export type ThemeVariableKind = 'color' | 'css';

export interface ThemeVariableDef {
  /** CSS custom property name including the `--` prefix. */
  name: string;
  /** Human-readable label for the editor row. */
  label: string;
  group: ThemeVariableGroup;
  kind: ThemeVariableKind;
  /** Default value for each built-in theme — kept in sync with `web-client/src/index.css`. */
  defaults: Record<BuiltinThemeId, string>;
}

/**
 * Canonical list of CSS variables editable per theme. Mirrors the canonical block
 * defined for `:root` (dark) and `[data-theme='filips']` in `web-client/src/index.css`.
 *
 * Many CSS variables are *aliases* derived from these canonicals via `var()` /
 * `color-mix()` and are intentionally not listed here — they update automatically
 * when the user edits the canonical they derive from.
 *
 * If you add a canonical CSS variable in `index.css`, add it here in lockstep so
 * the settings UI stays accurate and `applyThemeOverrides` continues to round-trip.
 */
export const THEME_VARIABLES: ThemeVariableDef[] = [
  // Backgrounds (3)
  { name: '--bg-primary', label: 'Background — primary (panels)', group: 'Backgrounds', kind: 'color', defaults: { dark: '#0f172a', filips: '#f3f4f6' } },
  { name: '--bg-secondary', label: 'Background — secondary', group: 'Backgrounds', kind: 'color', defaults: { dark: '#1e293b', filips: '#e5e7eb' } },
  { name: '--bg-page', label: 'Page background', group: 'Backgrounds', kind: 'color', defaults: { dark: '#242424', filips: '#f9fafb' } },

  // Text (2)
  { name: '--text-primary', label: 'Text — primary', group: 'Text', kind: 'color', defaults: { dark: '#f1f5f9', filips: '#0f172a' } },
  { name: '--text-muted', label: 'Text — muted', group: 'Text', kind: 'color', defaults: { dark: '#94a3b8', filips: '#1e293b' } },

  // Nodes (3) — customer node derives from --accent-primary
  { name: '--node-workitem-bg', label: 'Work Item node', group: 'Nodes', kind: 'color', defaults: { dark: '#8b5cf6', filips: '#d8b4fe' } },
  { name: '--node-team-bg', label: 'Team node', group: 'Nodes', kind: 'color', defaults: { dark: '#4b5563', filips: '#94a3b8' } },
  { name: '--node-score', label: 'Score badge', group: 'Nodes', kind: 'color', defaults: { dark: '#fcd34d', filips: '#92400e' } },

  // Sprint Nodes (3) — borders/text derive from border/text/status canonicals
  { name: '--node-sprint-bg', label: 'Sprint — default', group: 'Sprint Nodes', kind: 'color', defaults: { dark: '#1f2937', filips: '#e2e8f0' } },
  { name: '--node-sprint-over-bg', label: 'Sprint — over-allocated', group: 'Sprint Nodes', kind: 'color', defaults: { dark: '#7f1d1d', filips: '#fca5a5' } },
  { name: '--node-sprint-allocated-bg', label: 'Sprint — allocated', group: 'Sprint Nodes', kind: 'color', defaults: { dark: '#14532d', filips: '#86efac' } },

  // Borders (1)
  { name: '--border-primary', label: 'Border', group: 'Borders & Edges', kind: 'color', defaults: { dark: '#334155', filips: '#cbd5e1' } },

  // Accents (1) — link, accent-text, customer node, accent-bg all derive from this
  { name: '--accent-primary', label: 'Accent', group: 'Accents', kind: 'color', defaults: { dark: '#3b82f6', filips: '#2563eb' } },

  // Status (4) — backgrounds and danger-text/border derive from these
  { name: '--status-info', label: 'Status — info', group: 'Status', kind: 'color', defaults: { dark: '#6b7280', filips: '#6b7280' } },
  { name: '--status-success', label: 'Status — success', group: 'Status', kind: 'color', defaults: { dark: '#10b981', filips: '#16a34a' } },
  { name: '--status-warning', label: 'Status — warning', group: 'Status', kind: 'color', defaults: { dark: '#f59e0b', filips: '#d97706' } },
  { name: '--status-danger', label: 'Status — danger', group: 'Status', kind: 'color', defaults: { dark: '#ef4444', filips: '#dc2626' } },
];

/**
 * Look up the default value for a CSS variable in a given built-in theme.
 * Returns `undefined` if the variable is unknown.
 */
export function getThemeVariableDefault(varName: string, theme: BuiltinThemeId): string | undefined {
  const def = THEME_VARIABLES.find(v => v.name === varName);
  return def?.defaults[theme];
}

export interface ValueStreamParameters {
  customerFilter: string;
  workItemFilter: string;
  releasedFilter: 'all' | 'released' | 'unreleased';
  minTcvFilter: string;
  minScoreFilter: string;
  teamFilter: string;
  issueFilter: string;
  startSprintId?: string;
  endSprintId?: string;
  /**
   * Hierarchy filters. `rootsOnly` is mutually exclusive with the parent/subtree
   * selection on the UI; the backend simply ANDs whatever it receives.
   *  - parentIds: limit to direct children of any of these work items.
   *  - subtreeOfIds: limit to every descendant of any of these work items (roots excluded).
   *  - rootsOnly: limit to top-level work items (no parent).
   *
   * `parentId` and `subtreeOf` (singular strings) are kept as legacy fields so
   * existing saved ValueStream documents continue to work without a migration.
   * Reading code should prefer the plural arrays; when only the singular is set
   * it should be treated as a one-element array.
   */
  parentIds?: string[];
  subtreeOfIds?: string[];
  /** @deprecated Use {@link parentIds}. Retained for back-compat reads of saved ValueStreams. */
  parentId?: string;
  /** @deprecated Use {@link subtreeOfIds}. Retained for back-compat reads of saved ValueStreams. */
  subtreeOf?: string;
  rootsOnly?: boolean;
}

export interface ValueStreamEntity {
  id: string;
  name: string;
  description: string;
  parameters: ValueStreamParameters;
}

export interface ValueStreamData {
  settings: AppSettings;
  customers: Customer[];
  workItems: WorkItem[];
  teams: Team[];
  issues: Issue[];
  sprints: Sprint[];
  valueStreams: ValueStreamEntity[];
  metrics: {
    maxScore: number;
    maxRoi: number;
  };
}

/**
 * Which metric drives work item ordering and node sizing across the
 * WorkItemList page and the ValueStream dashboard.
 *  - 'score'      → calculated_score (RICE/ROI)
 *  - 'aha_score'  → aha_synced_data.score (Product Value pulled from Aha!)
 *  - 'stackrank'  → manual stackrank (higher value = higher priority)
 */
export type WorkItemPriorityMetric = 'score' | 'aha_score' | 'stackrank';

export interface ValueStreamViewState {
  sprintOffset: number;
  customerFilter: string;
  workItemFilter: string;
  /** Legacy single-select. Kept on the type so existing callers / saved view-state
   *  shapes still parse. The dashboard UI now drives `releasedSprintIds` instead. */
  releasedFilter: 'all' | 'released' | 'unreleased';
  /** Multi-select of sprint IDs the work item was released in. The literal
   *  'unreleased' is a sentinel that matches work items with no
   *  `released_in_sprint_id`. Mirrors the WorkItems list page contract. */
  releasedSprintIds?: string[];
  /** Customer combined-TCV range (existing + potential). */
  minTcvFilter: string;
  maxTcvFilter?: string;
  /** Legacy lower bound on work-item `calculated_score`. Kept on the type so
   *  saved value-stream baseParams still apply this constraint. The dashboard
   *  filter UI exposes the metric-aware Priority range instead. */
  minScoreFilter: string;
  /** Range against the field selected by `prioritizationMetric`
   *  (calculated_score / aha_synced_data.score / stackrank). */
  minPriorityFilter?: string;
  maxPriorityFilter?: string;
  /** Work-item `calculated_effort` range. */
  minEffortFilter?: string;
  maxEffortFilter?: string;
  /** Work-item status multi-select. Selecting "Backlog" also matches docs with
   *  missing/empty status (matches the WorkItems list page Backlog semantics). */
  statusFilter?: string[];
  teamFilter: string;
  issueFilter: string;
  showDependencies: boolean;
  disableHoverHighlight: boolean;
  prioritizationMetric: WorkItemPriorityMetric;
  selectedNodeId?: string | null;
  isInitialOffsetSet: boolean;
  viewport?: { x: number; y: number; zoom: number };
  /** When true, the filters/visualization bar in the Value Stream view is hidden to
   *  give the diagram more vertical room. The current filter values are preserved. */
  filtersCollapsed: boolean;
  /**
   * Live (non-persisted) hierarchy filters. `rootsOnly` is mutually exclusive
   * with the parent/subtree selection on the UI; mirrors the WorkItems list
   * page contract. These narrow the already-loaded data on the client (the
   * saved value-stream parameters drive server-side filtering separately).
   */
  parentIds?: string[];
  subtreeOfIds?: string[];
  rootsOnly?: boolean;
}

export interface ValueStreamDataState {
  data: ValueStreamData | null;
  loading: boolean;
  error: Error | null;
  refreshData: () => void;
  addCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
  addWorkItem: (workItem: WorkItem) => void;
  deleteWorkItem: (id: string) => void;
  updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
  addIssue: (issue: Issue) => void;
  deleteIssue: (id: string) => void;
  updateTeam: (id: string, updates: Partial<Team>, immediate?: boolean) => Promise<void>;
  addTeam: (team: Team) => void;
  deleteTeam: (id: string) => void;
  updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
  addSprint: (sprint: Sprint) => void;
  updateSprint: (id: string, updates: Partial<Sprint>, immediate?: boolean) => Promise<void>;
  deleteSprint: (id: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  addValueStream: (valueStream: ValueStreamEntity) => void;
  updateValueStream: (id: string, updates: Partial<ValueStreamEntity>, immediate?: boolean) => Promise<void>;
  deleteValueStream: (id: string) => void;
}



