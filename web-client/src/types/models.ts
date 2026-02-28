export interface Customer {
  id: string;
  name: string;
  existing_tcv: number;
  potential_tcv: number;
}

export interface WorkItem {
  id: string;
  name: string;
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
  remaining_md: number;
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
}

export interface Settings {
  jira_base_url: string;
  jira_api_version: '2' | '3';
  jira_api_token?: string;
  mongo_uri?: string;
  mongo_db?: string;
}

export interface DashboardParameters {
  customerFilter: string;
  workItemFilter: string;
  releasedFilter: 'all' | 'released' | 'unreleased';
  minTcvFilter: string;
  minScoreFilter: string;
  teamFilter: string;
  epicFilter: string;
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
