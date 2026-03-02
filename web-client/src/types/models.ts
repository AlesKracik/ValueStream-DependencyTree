export interface TcvHistoryEntry {
  id: string;
  value: number;
  valid_from: string; // ISO date
}

export interface Customer {
  id: string;
  name: string;
  existing_tcv: number;
  existing_tcv_valid_from?: string; // ISO date
  potential_tcv: number;
  tcv_history?: TcvHistoryEntry[];
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
  };
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
  sprint_effort_overrides?: Record<string, number>;
  dependencies?: EpicDependency[];
}

export interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  quarter?: string; // e.g. "FY2026 Q1"
}

export interface Settings {
  jira_base_url: string;
  jira_api_version: '2' | '3';
  jira_api_token?: string;
  mongo_uri?: string;
  mongo_db?: string;
  mongo_auth_method?: 'scram' | 'aws' | 'oidc';
  mongo_aws_access_key?: string;
  mongo_aws_secret_key?: string;
  mongo_aws_session_token?: string;
  mongo_oidc_token?: string;
  customer_jql_new?: string;
  customer_jql_in_progress?: string;
  customer_jql_noop?: string;
  fiscal_year_start_month?: number; // 1-12, default 1
  sprint_duration_days?: number; // default 14
  mongo_create_if_not_exists?: boolean;
}

export interface DashboardParameters {
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

export interface DashboardEntity {
  id: string;
  name: string;
  description: string;
  parameters: DashboardParameters;
}

export interface DashboardData {
  settings: Settings;
  customers: Customer[];
  workItems: WorkItem[];
  teams: Team[];
  epics: Epic[];
  sprints: Sprint[];
  dashboards: DashboardEntity[];
}

export interface DashboardViewState {
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
