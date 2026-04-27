import type { Settings, ValueStreamData, Issue, Customer } from '@valuestream/shared-types';

/** Props shared by all settings sub-page components */
export interface SettingsTabProps {
  localFormData: Settings;
  updateFormData: (path: string, value: unknown) => void;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  settings: Settings;
}

/** Extended props for tabs that need workspace data (Jira) */
export interface SettingsTabWithDataProps extends SettingsTabProps {
  data: ValueStreamData | null;
  updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
  addIssue: (issue: Issue) => void;
  updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
}

export interface MongoTestResult {
  success: boolean;
  message: string;
  exists?: boolean;
}

export interface SSOMessage {
  success: boolean;
  message: string;
}
