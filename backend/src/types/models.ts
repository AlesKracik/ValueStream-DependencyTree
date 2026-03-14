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
}

export interface Team {
  id: string;
  name: string;
  total_capacity_mds: number;
  country?: string;
  jira_team_id?: string;
  sprint_capacity_overrides?: Record<string, number>;
}

export interface EpicDependency {
  epic_id: string;
  dependency_type: 'FS' | 'FF';
}

export interface Epic {
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
  dependencies?: EpicDependency[];
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
  customer_jql_new?: string;
  customer_jql_in_progress?: string;
  customer_jql_noop?: string;
}

export interface MongoAuthSettings {
  method: 'scram' | 'aws' | 'oidc';
  aws_auth_type?: 'static' | 'role';
  aws_access_key?: string;
  aws_secret_key?: string;
  aws_session_token?: string;
  aws_role_arn?: string;
  aws_external_id?: string;
  aws_role_session_name?: string;
  aws_profile?: string;
  aws_sso_start_url?: string;
  aws_sso_region?: string;
  aws_sso_account_id?: string;
  aws_sso_role_name?: string;
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

export interface PersistenceSettings {
  mongo: {
    app: MongoConfig;
    customer: MongoConfig;
  };
}

export interface AISettings {
  provider: 'openai' | 'gemini' | 'anthropic' | 'augment';
  api_key?: string;
  model?: string;
}

export interface Settings {
  general: GeneralSettings;
  persistence: PersistenceSettings;
  jira: JiraSettings;
  ai: AISettings;
}

export type AppSettings = Settings;

export interface ValueStreamParameters {
  customerFilter: string;
  workItemFilter: string;
  releasedFilter: 'all' | 'released' | 'unreleased';
  minTcvFilter: string;
  minScoreFilter: string;
  teamFilter: string;
  epicFilter: string;
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
  epics: Epic[];
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
  epicFilter: string;
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
  addEpic: (epic: Epic) => void;
  deleteEpic: (id: string) => void;
  updateTeam: (id: string, updates: Partial<Team>, immediate?: boolean) => Promise<void>;
  addTeam: (team: Team) => void;
  deleteTeam: (id: string) => void;
  updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
  addSprint: (sprint: Sprint) => void;
  updateSprint: (id: string, updates: Partial<Sprint>, immediate?: boolean) => Promise<void>;
  deleteSprint: (id: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  addValueStream: (valueStream: ValueStreamEntity) => void;
  updateValueStream: (id: string, updates: Partial<ValueStreamEntity>, immediate?: boolean) => Promise<void>;
  deleteValueStream: (id: string) => void;
}



