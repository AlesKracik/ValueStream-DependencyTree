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
  status: 'to do' | 'work in progress' | 'noop' | 'waiting for customer' | 'waiting for other party' | 'done';
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

export interface GeneralSettings {
  fiscal_year_start_month: number;
  sprint_duration_days: number;
  theme?: 'dark' | 'filips';
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

export type AuthMethod = 'local' | 'ldap' | 'aws-sso' | 'okta';

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

export interface AuthSettings {
  method: AuthMethod;
  session_expiry_hours: number;
  aws_sso?: AwsSsoAuthConfig;
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

export interface ValueStreamViewState {
  sprintOffset: number;
  customerFilter: string;
  workItemFilter: string;
  releasedFilter: 'all' | 'released' | 'unreleased';
  minTcvFilter: string;
  minScoreFilter: string;
  teamFilter: string;
  issueFilter: string;
  showDependencies: boolean;
  disableHoverHighlight: boolean;
  selectedNodeId?: string | null;
  isInitialOffsetSet: boolean;
  viewport?: { x: number; y: number; zoom: number };
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



