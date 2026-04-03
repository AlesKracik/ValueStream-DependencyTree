/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Settings, ValueStreamData, Issue } from '@valuestream/shared-types';
import styles from './List.module.css';
import { PageWrapper } from "../components/layout/PageWrapper";
import { deepMerge } from "../utils/businessLogic";
import {
  GeneralSettings,
  PersistenceSettings,
  JiraSettings,
  AhaSettings,
  AiSettings,
  LdapSettings,
  AuthSettings,
} from './settings';
import { ScopeIndicator } from '../components/common/ScopeIndicator';

interface SettingsPageProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  data: ValueStreamData | null;
  loading?: boolean;
  error?: Error | null;
  updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
  addIssue: (issue: Issue) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  general: { fiscal_year_start_month: 1, sprint_duration_days: 14, theme: 'dark' },
  persistence: {
    app_provider: 'mongo',
    customer_provider: 'mongo',
    mongo: {
      app: {
        uri: '', db: '', use_proxy: false, tunnel_name: 'app',
        auth: {
          method: 'scram',
          aws_auth_type: 'static',
          static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          oidc_token: ''
        }
      },
      customer: {
        uri: '', db: '', use_proxy: false, tunnel_name: 'customer', collection: 'Customers', custom_query: '',
        auth: {
          method: 'scram',
          aws_auth_type: 'static',
          static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '', aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          oidc_token: ''
        }
      }
    }
  },
  jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
  aha: { subdomain: '', api_key: '' },
  ai: { provider: 'openai', api_key: '', model: '', glean_url: '', support: { prompt: '' } },
  ldap: { url: '', bind_dn: '', bind_password: '', team: { base_dn: '', search_filter: '' } },
  auth: {
    method: 'local', session_expiry_hours: 24, default_role: 'viewer',
    aws_sso: { start_url: '', region: '', account_id: '', role_name: '' },
    okta: { issuer: '', client_id: '', client_secret: '' },
  }
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  data,
  loading,
  error,
  updateIssue,
  addIssue,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "general" | "persistence" | "jira" | "aha" | "ai" | "ldap" | "auth") || "general";

  // Track the settings prop that produced the current localFormData.
  // When settings changes externally, re-merge. Using setState-during-render
  // (the "adjust state based on prop" pattern from React docs) avoids useEffect.
  const [prevSettings, setPrevSettings] = useState(settings);
  const [localFormData, setFormData] = useState<Settings>(() => {
    const initSettings = settings || {};
    const initSso = (initSettings as any)?.persistence?.mongo?.app?.auth?.sso;
    console.debug('[SettingsPage] useState init:', { hasSettings: !!settings, ssoStartUrl: initSso?.aws_sso_start_url, ssoKeys: initSso ? Object.keys(initSso) : 'none' });
    return deepMerge(DEFAULT_SETTINGS, initSettings);
  });

  const initSso = (localFormData as any)?.persistence?.mongo?.app?.auth?.sso?.aws_sso_start_url;
  console.debug('[SettingsPage] render check:', { settingsRef: settings === prevSettings, initSsoStartUrl: initSso });
  if (settings && settings !== prevSettings) {
    setPrevSettings(settings);
    const merged = deepMerge(DEFAULT_SETTINGS, settings);
    const incomingSso = (settings as any)?.persistence?.mongo?.app?.auth?.sso;
    const mergedSso = (merged as any)?.persistence?.mongo?.app?.auth?.sso;
    console.debug('[SettingsPage] reconciliation:', {
      incomingAuthType: (settings as any)?.persistence?.mongo?.app?.auth?.aws_auth_type,
      incomingSsoKeys: incomingSso ? Object.keys(incomingSso) : 'none',
      incomingSsoStartUrl: incomingSso?.aws_sso_start_url,
      mergedSsoKeys: mergedSso ? Object.keys(mergedSso) : 'none',
      mergedSsoStartUrl: mergedSso?.aws_sso_start_url,
    });
    if (JSON.stringify(merged) !== JSON.stringify(localFormData)) {
      setFormData(merged);
    }
  }

  const updateFormData = (path: string, value: unknown) => {
    setFormData(prev => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newData = { ...prev } as Record<string, any>;
        const parts = path.split('.');
        let current = newData;
        for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = { ...current[parts[i]] };
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        return newData as Settings;
    });
  };

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const sharedProps = {
    localFormData,
    updateFormData,
    onUpdateSettings,
    settings,
  };

  return (
    <PageWrapper
      loading={loading}
      error={error}
      data={data}
      loadingMessage="Loading settings..."
    >
      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <h1>Settings</h1>
        </div>

        <div className={styles.tabContainer}>
          <nav className={styles.tabHeader}>
            <button
              onClick={() => setTab("general")}
              className={`${styles.tabButton} ${activeTab === "general" ? styles.activeTab : ''}`}
            >
              General Project<ScopeIndicator path="general" />
            </button>
            <button
              onClick={() => setTab("auth")}
              className={`${styles.tabButton} ${activeTab === "auth" ? styles.activeTab : ''}`}
            >
              Authentication<ScopeIndicator path="auth" />
            </button>
            <button
              onClick={() => setTab("persistence")}
              className={`${styles.tabButton} ${activeTab === "persistence" ? styles.activeTab : ''}`}
            >
              Persistence<ScopeIndicator path="persistence" />
            </button>
            <button
              onClick={() => setTab("jira")}
              className={`${styles.tabButton} ${activeTab === "jira" ? styles.activeTab : ''}`}
            >
              Jira Integration<ScopeIndicator path="jira" />
            </button>
            <button
              onClick={() => setTab("aha")}
              className={`${styles.tabButton} ${activeTab === "aha" ? styles.activeTab : ''}`}
            >
              Aha! Integration<ScopeIndicator path="aha" />
            </button>
            <button
              onClick={() => setTab("ai")}
              className={`${styles.tabButton} ${activeTab === "ai" ? styles.activeTab : ''}`}
            >
              AI & LLM<ScopeIndicator path="ai" />
            </button>
            <button
              onClick={() => setTab("ldap")}
              className={`${styles.tabButton} ${activeTab === "ldap" ? styles.activeTab : ''}`}
            >
              LDAP<ScopeIndicator path="ldap" />
            </button>
          </nav>

          <div className={styles.tabContent}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {activeTab === "general" && <GeneralSettings {...sharedProps} />}
              {activeTab === "persistence" && <PersistenceSettings {...sharedProps} />}
              {activeTab === "jira" && (
                <JiraSettings
                  {...sharedProps}
                  data={data}
                  updateIssue={updateIssue}
                  addIssue={addIssue}
                />
              )}
              {activeTab === "aha" && <AhaSettings {...sharedProps} />}
              {activeTab === "ai" && <AiSettings {...sharedProps} />}
              {activeTab === "ldap" && <LdapSettings {...sharedProps} />}
              {activeTab === "auth" && <AuthSettings {...sharedProps} />}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};
