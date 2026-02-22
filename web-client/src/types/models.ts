export interface Customer {
  id: string;
  name: string;
  existing_tcv: number;
  potential_tcv: number;
}

export interface Feature {
  id: string;
  name: string;
  total_effort_mds: number;
  customer_targets: {
    customer_id: string;
    tcv_type: 'existing' | 'potential';
  }[];
}

export interface Team {
  id: string;
  name: string;
  total_capacity_mds: number;
  jira_team_id?: string;
  sprint_capacity_overrides?: Record<string, number>;
}

export interface Epic {
  id: string;
  jira_key: string;
  feature_id: string;
  team_id: string;
  remaining_md: number;
  target_start: string;
  target_end: string;
  name?: string;
  sprint_effort_overrides?: Record<string, number>;
}

export interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface Settings {
  jira_base_url: string;
}

export interface DashboardData {
  settings: Settings;
  customers: Customer[];
  features: Feature[];
  teams: Team[];
  epics: Epic[];
  sprints: Sprint[];
}
