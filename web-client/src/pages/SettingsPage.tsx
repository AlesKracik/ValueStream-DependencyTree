import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Settings, ValueStreamData, Epic } from "../types/models";
import styles from './List.module.css';
import { authorizedFetch, syncJiraIssue } from "../utils/api";
import { generateId } from '../utils/security';
import { useValueStreamContext } from "../contexts/ValueStreamContext";
import { PageWrapper } from "../components/layout/PageWrapper";
import { parseJiraIssue } from "../utils/businessLogic";

interface SettingsPageProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  data: ValueStreamData | null;
  loading?: boolean;
  error?: Error | null;
  updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
  addEpic: (epic: Epic) => void;
}

const DEFAULT_SETTINGS: Settings = {
  general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
  persistence: {
    mongo: {
      app: { uri: '', db: '', use_proxy: false, tunnel_name: 'app', auth: { method: 'scram' } },
      customer: { uri: '', db: '', use_proxy: false, tunnel_name: 'customer', collection: 'Customers', custom_query: '', auth: { method: 'scram' } }
    }
  },
  jira: { base_url: '', api_version: '3' },
  ai: { provider: 'openai' }
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  data,
  loading,
  error,
  updateEpic,
  addEpic,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "general" | "persistence" | "jira" | "ai") || "general";
  const activeSubTab = searchParams.get("subtab") || (activeTab === "persistence" ? "mongo" : activeTab === "jira" ? "common" : "");
  const activeSubSubTab = searchParams.get("subsubtab") || (activeTab === "persistence" && activeSubTab === "mongo" ? "application" : "");

  const { showConfirm } = useValueStreamContext();

  const [localFormData, setFormData] = useState<Settings>(settings || DEFAULT_SETTINGS);
  const [isTesting, setIsTesting] = useState(false);
  const [availableDbs, setAvailableDbs] = useState<string[]>([]);
  const [mongoTestResult, setMongoTestResult] = useState<{ success: boolean; message: string; exists?: boolean } | null>(null);
  const [isTestingCustomer, setIsTestingCustomer] = useState(false);
  const [availableCustomerDbs, setAvailableCustomerDbs] = useState<string[]>([]);
  const [customerMongoTestResult, setCustomerMongoTestResult] = useState<{ success: boolean; message: string; exists?: boolean } | null>(null);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [importSyncResult, setImportSyncResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [importJql, setImportJql] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");
  const [isSSOLoginLoading, setIsSSOLoginLoading] = useState(false);
  const [ssoMessage, setSSOMessage] = useState<{ success: boolean; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deep merge helper to ensure we don't lose structure
  const deepMerge = (target: any, source: any) => {
    if (!source) return target;
    const result = { ...target };
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    });
    return result;
  };

  const updateFormData = (path: string, value: any) => {
    setFormData(prev => {
        const newData = { ...prev };
        const parts = path.split('.');
        let current: any = newData;
        for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = { ...current[parts[i]] };
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        return newData;
    });
  };

  const handleAWSSSOLOGIN = async (role: 'app' | 'customer') => {
    const mongo = localFormData.persistence.mongo[role];
    const { auth } = mongo;
    setIsSSOLoginLoading(true);
    setSSOMessage(null);
    try {
        const res = await authorizedFetch('/api/aws/sso/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role,
                persistence: {
                    mongo: {
                        [role]: {
                            auth: {
                                aws_profile: auth.aws_profile,
                                aws_sso_start_url: auth.aws_sso_start_url,
                                aws_sso_region: auth.aws_sso_region,
                                aws_sso_account_id: auth.aws_sso_account_id,
                                aws_sso_role_name: auth.aws_sso_role_name
                            }
                        }
                    }
                }
            })
        });
        const data = await res.json();
        setSSOMessage({ success: data.success, message: data.message || data.error });
    } catch (e: any) {
        setSSOMessage({ success: false, message: e.message || 'Failed to initiate SSO login' });
    } finally {
        setIsSSOLoginLoading(false);
    }
  };

  const handleFetchSSOCredentials = async (role: 'app' | 'customer') => {
    const mongo = localFormData.persistence.mongo[role];
    const { auth } = mongo;
    setIsSSOLoginLoading(true);
    setSSOMessage(null);
    try {
        const res = await authorizedFetch('/api/aws/sso/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role,
                persistence: {
                    mongo: {
                        [role]: {
                            auth: {
                                aws_profile: auth.aws_profile,
                                aws_sso_start_url: auth.aws_sso_start_url,
                                aws_sso_region: auth.aws_sso_region,
                                aws_sso_account_id: auth.aws_sso_account_id,
                                aws_sso_role_name: auth.aws_sso_role_name
                            }
                        }
                    }
                }
            })
        });
        const data = await res.json();
        if (data.success) {
            const authUpdates = {
                ...auth,
                aws_access_key: data.accessKey,
                aws_secret_key: data.secretKey,
                aws_session_token: data.sessionToken
            };
            
            setFormData(prev => {
                const newData = { ...prev };
                newData.persistence.mongo[role] = {
                    ...newData.persistence.mongo[role],
                    auth: authUpdates
                };
                return newData;
            });

            onUpdateSettings({
                persistence: {
                    ...localFormData.persistence,
                    mongo: {
                        ...localFormData.persistence.mongo,
                        [role]: {
                            ...localFormData.persistence.mongo[role],
                            auth: authUpdates
                        }
                    }
                }
            });
            setSSOMessage({ success: true, message: 'Temporary credentials fetched and applied!' });
        } else {
            setSSOMessage({ success: false, message: data.error });
        }
    } catch (e: any) {
        setSSOMessage({ success: false, message: e.message || 'Failed to fetch credentials' });
    } finally {
        setIsSSOLoginLoading(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setFormData(prev => deepMerge(prev, settings));
    }
  }, [settings]);

  const setTab = (tab: string) => {
    setSearchParams({ tab });
    setMongoTestResult(null);
    setCustomerMongoTestResult(null);
    setJiraTestResult(null);
    setImportSyncResult(null);
  };

  const setSubTab = (subtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subtab", subtab);
      newParams.delete("subsubtab");
      return newParams;
    });
  };

  const setSubSubTab = (subsubtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subsubtab", subsubtab);
      return newParams;
    });
  };

  const handleTestConnection = async (role: 'app' | 'customer' = 'app') => {
    const mongo = localFormData.persistence.mongo[role];
    const isCustomer = role === 'customer';
    
    const body: any = { 
        persistence: {
            mongo: {
                [role]: mongo
            }
        },
        connection_type: role
    };

    if (isCustomer) {
        setIsTestingCustomer(true);
        setCustomerMongoTestResult(null);
    } else {
        setIsTesting(true);
        setMongoTestResult(null);
    }

    try {
      const dbRes = await authorizedFetch("/api/mongo/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const dbData = await dbRes.json();
      if (dbRes.ok && dbData.success) {
        if (isCustomer) setAvailableCustomerDbs(dbData.databases || []);
        else setAvailableDbs(dbData.databases || []);
      }

      const response = await authorizedFetch("/api/mongo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        const result = { 
          success: true, 
          exists: resData.exists,
          message: resData.message || "MongoDB connection successful!" 
        };
        if (isCustomer) setCustomerMongoTestResult(result);
        else setMongoTestResult(result);
      } else {
        const result = { success: false, message: resData.error || "MongoDB connection failed" };
        if (isCustomer) setCustomerMongoTestResult(result);
        else setMongoTestResult(result);
      }
    } catch (e: any) {
      const result = { success: false, message: e.message || "Network error occurred testing MongoDB connection." };
      if (isCustomer) setCustomerMongoTestResult(result);
      else setMongoTestResult(result);
    } finally {
      if (isCustomer) setIsTestingCustomer(false);
      else setIsTesting(false);
    }
  };

  const handleJiraTestConnection = async () => {
    const { jira } = localFormData;

    if (!jira.base_url || !jira.api_token) {
      setJiraTestResult({ success: false, message: "Base URL and PAT are required to test." });
      return;
    }
    setIsTesting(true);
    setJiraTestResult(null);
    try {
      const response = await authorizedFetch("/api/jira/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jira_base_url: jira.base_url,
          jira_api_token: jira.api_token,
          jira_api_version: jira.api_version,
        }),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setJiraTestResult({ success: true, message: resData.message || "Connection successful!" });
      } else {
        setJiraTestResult({ success: false, message: resData.error || "Connection failed" });
      }
    } catch (e: any) {
      setJiraTestResult({ success: false, message: e.message || "Network error occurred testing connection." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportMongo = async () => {
    setIsTesting(true);
    setMongoTestResult(null);
    try {
      const response = await authorizedFetch("/api/mongo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        const blob = new Blob([JSON.stringify(resData.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'staticImport.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setMongoTestResult({ success: true, message: "Export successful! staticImport.json download started." });
      } else {
        setMongoTestResult({ success: false, message: resData.error || "Export failed" });
      }
    } catch (e: any) {
      setMongoTestResult({ success: false, message: e.message || "Network error occurred during export." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportMongo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmed = await showConfirm(
        "Warning: Irreversible Action",
        "Importing data will DELETE all existing collections in the current database and replace them with the data from this file. Do you want to proceed?"
    );
    if (!confirmed) {
      event.target.value = "";
      return;
    }

    setIsTesting(true);
    setMongoTestResult(null);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      const response = await authorizedFetch("/api/mongo/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: importData }),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setMongoTestResult({ success: true, message: "Import successful! Data has been restored. Please refresh the page to see changes." });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMongoTestResult({ success: false, message: resData.error || "Import failed" });
      }
    } catch (e: any) {
      setMongoTestResult({ success: false, message: e.message || "Error during import. Ensure the file is a valid JSON export." });
    } finally {
      setIsTesting(false);
      event.target.value = "";
    }
  };

  const handleSyncAllFromJira = async () => {
    if (!data) return;
    const epicsWithKeys = data.epics.filter(e => e.jira_key && e.jira_key !== "TBD");
    if (epicsWithKeys.length === 0) {
      setImportSyncResult({ success: true, message: "No epics with Jira keys found to sync." });
      return;
    }
    const { jira } = localFormData;

    if (!jira.base_url || !jira.api_token) {
      setImportSyncResult({ success: false, message: "Base URL and PAT are required to sync." });
      return;
    }
    setIsSyncing(true);
    setImportSyncResult(null);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < epicsWithKeys.length; i++) {
      const epic = epicsWithKeys[i];
      setSyncProgress(`Syncing ${i + 1}/${epicsWithKeys.length}: ${epic.jira_key}`);
      try {
        const issueData = await syncJiraIssue(epic.jira_key, {
            jira_base_url: jira.base_url,
            jira_api_version: jira.api_version,
            jira_api_token: jira.api_token,
        });
        
        const updates = parseJiraIssue(issueData, data.teams);
        await updateEpic(epic.id, updates, true);
        successCount++;
      } catch (err: any) {
        console.error(`Error syncing ${epic.jira_key}:`, err);
        failCount++;
      }
    }
    setIsSyncing(false);
    setSyncProgress("");
    setImportSyncResult({ success: failCount === 0, message: `Sync complete. ${successCount} succeeded, ${failCount} failed.` });
  };

  const handleImportFromJira = async () => {
    if (!data) return;
    const { jira } = localFormData;

    if (!jira.base_url || !jira.api_token) {
      setImportSyncResult({ success: false, message: "Base URL and PAT are required to import." });
      return;
    }
    if (!importJql.trim()) {
      setImportSyncResult({ success: false, message: "JQL query is required to import." });
      return;
    }

    setIsImporting(true);
    setImportSyncResult(null);
    let successCount = 0;
    let failCount = 0;
    let createCount = 0;
    let updateCount = 0;

    try {
      const finalJql = importJql.toLowerCase().includes("issuetype") ? importJql : `(${importJql}) AND issuetype = Epic`;
      setImportProgress("Fetching issues...");
      const response = await authorizedFetch("/api/jira/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: finalJql,
          jira_base_url: jira.base_url,
          jira_api_version: jira.api_version,
          jira_api_token: jira.api_token,
        }),
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) throw new Error(resData.error || "Failed to fetch Jira data");

      const issues = resData.data.issues || [];
      if (issues.length === 0) {
        setImportSyncResult({ success: true, message: "No issues found for the provided JQL." });
        setIsImporting(false);
        setImportProgress("");
        return;
      }

      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const jiraKey = issue.key;
        setImportProgress(`Processing ${i + 1}/${issues.length}: ${jiraKey}`);
        
        const updates = parseJiraIssue(issue, data.teams);

        const existingEpic = data.epics.find((e) => e.jira_key === jiraKey);
        try {
          if (existingEpic) {
            await updateEpic(existingEpic.id, updates, true);
            updateCount++;
          } else if (addEpic) {
            const newId = generateId('e');
            const newEpic: Epic = {
              id: newId,
              jira_key: jiraKey,
              team_id: updates.team_id || (data.teams.length > 0 ? data.teams[0].id : ""),
              effort_md: updates.effort_md || 0,
              name: updates.name,
              target_start: updates.target_start,
              target_end: updates.target_end,
            };
            addEpic(newEpic);
            createCount++;
          }
          successCount++;
        } catch (err: any) {
          console.error(`Error processing ${jiraKey}:`, err);
          failCount++;
        }
      }
      setImportSyncResult({ success: failCount === 0, message: `Import complete. Created ${createCount}, Updated ${updateCount}, Failed ${failCount}.` });
    } catch (err: any) {
      console.error("Import error:", err);
      setImportSyncResult({ success: false, message: err.message || "Import failed." });
    } finally {
      setIsImporting(false);
      setImportProgress("");
    }
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

        <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #374151', marginBottom: '24px' }}>
          <button
            onClick={() => setTab("general")}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              color: activeTab === "general" ? '#60a5fa' : '#9ca3af',
              borderBottom: activeTab === "general" ? '2px solid #60a5fa' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === "general" ? 'bold' : 'normal',
            }}
          >
            General Project
          </button>
          <button
            onClick={() => setTab("persistence")}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              color: activeTab === "persistence" ? '#60a5fa' : '#9ca3af',
              borderBottom: activeTab === "persistence" ? '2px solid #60a5fa' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === "persistence" ? 'bold' : 'normal',
            }}
          >
            Persistence
          </button>
          <button
            onClick={() => setTab("jira")}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              color: activeTab === "jira" ? '#60a5fa' : '#9ca3af',
              borderBottom: activeTab === "jira" ? '2px solid #60a5fa' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === "jira" ? 'bold' : 'normal',
            }}
          >
            Jira Integration
          </button>
          <button
            onClick={() => setTab("ai")}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              color: activeTab === "ai" ? '#60a5fa' : '#9ca3af',
              borderBottom: activeTab === "ai" ? '2px solid #60a5fa' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === "ai" ? 'bold' : 'normal',
            }}
          >
            AI & LLM
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activeTab === "persistence" && (
            <>
              <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #374151', marginBottom: '20px' }}>
                <button
                  onClick={() => setSubTab("mongo")}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    color: activeSubTab === "mongo" ? '#60a5fa' : '#9ca3af',
                    borderBottom: activeSubTab === "mongo" ? '2px solid #60a5fa' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: activeSubTab === "mongo" ? 'bold' : 'normal',
                  }}
                >
                  Mongo
                </button>
                <button
                  onClick={() => setSubTab("file")}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    color: activeSubTab === "file" ? '#60a5fa' : '#9ca3af',
                    borderBottom: activeSubTab === "file" ? '2px solid #60a5fa' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: activeSubTab === "file" ? 'bold' : 'normal',
                  }}
                >
                  File
                </button>
              </div>

              {activeSubTab === "mongo" && (
                <>
                  <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #1f2937', marginBottom: '20px' }}>
                    <button
                      onClick={() => setSubSubTab("application")}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '6px 12px',
                        color: activeSubSubTab === "application" ? '#60a5fa' : '#9ca3af',
                        borderBottom: activeSubSubTab === "application" ? '2px solid #60a5fa' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: activeSubSubTab === "application" ? 'bold' : 'normal',
                      }}
                    >
                      Application
                    </button>
                    <button
                      onClick={() => setSubSubTab("customer")}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '6px 12px',
                        color: activeSubSubTab === "customer" ? '#60a5fa' : '#9ca3af',
                        borderBottom: activeSubSubTab === "customer" ? '2px solid #60a5fa' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: activeSubSubTab === "customer" ? 'bold' : 'normal',
                      }}
                    >
                      Customer
                    </button>
                  </div>

                  {activeSubSubTab === "application" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Authentication Method:
                        <select
                          value={localFormData.persistence.mongo.app.auth.method}
                          onChange={(e) => {
                              const val = e.target.value as any;
                              updateFormData('persistence.mongo.app.auth.method', val);
                              const newApp = { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, method: val } };
                              onUpdateSettings({ 
                                persistence: { 
                                    ...localFormData.persistence, 
                                    mongo: { 
                                        ...localFormData.persistence.mongo, 
                                        app: newApp
                                    } 
                                } 
                              });
                          }}
                        >
                          <option value="scram">SCRAM (URI-based)</option>
                          <option value="aws">AWS IAM</option>
                          <option value="oidc">OIDC (Azure/Okta)</option>
                        </select>
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        MongoDB URI:
                        <input
                          type="text"
                          placeholder={localFormData.persistence.mongo.app.auth.method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
                          value={localFormData.persistence.mongo.app.uri || ""}
                          onChange={(e) => updateFormData('persistence.mongo.app.uri', e.target.value)}
                          onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, uri: localFormData.persistence.mongo.app.uri } } } })}
                        />
                      </label>

                      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db", cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={localFormData.persistence.mongo.app.use_proxy || false}
                            onChange={(e) => {
                              const val = e.target.checked;
                              updateFormData('persistence.mongo.app.use_proxy', val);
                              const newApp = { ...localFormData.persistence.mongo.app, use_proxy: val };
                              onUpdateSettings({ 
                                persistence: { 
                                    ...localFormData.persistence, 
                                    mongo: { 
                                        ...localFormData.persistence.mongo, 
                                        app: newApp
                                    } 
                                } 
                              });
                            }}
                          />
                          Use SOCKS Proxy (from .env)
                        </label>

                        {localFormData.persistence.mongo.app.use_proxy && (
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db" }}>
                            Tunnel Name:
                            <input
                              type="text"
                              placeholder="app"
                              value={localFormData.persistence.mongo.app.tunnel_name || ""}
                              onChange={(e) => updateFormData('persistence.mongo.app.tunnel_name', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, tunnel_name: localFormData.persistence.mongo.app.tunnel_name } } } })}
                              style={{ width: '120px', padding: '4px 8px' }}
                            />
                          </label>
                        )}
                      </div>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        MongoDB Database Name:
                        <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="Value Stream"
                              list="mongo-dbs"
                              value={localFormData.persistence.mongo.app.db || ""}
                              onChange={(e) => updateFormData('persistence.mongo.app.db', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, db: localFormData.persistence.mongo.app.db } } } })}
                              style={{
                                borderColor: mongoTestResult?.success && !mongoTestResult.exists ? '#f59e0b' : undefined
                              }}
                            />
                            <datalist id="mongo-dbs">
                              {availableDbs.map(db => <option key={db} value={db} />)}
                            </datalist>
                          </div>
                          {mongoTestResult?.success && (
                            <span style={{ 
                              fontSize: '11px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              backgroundColor: mongoTestResult.exists ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: mongoTestResult.exists ? '#10b981' : '#f59e0b',
                              border: `1px solid ${mongoTestResult.exists ? '#10b981' : '#f59e0b'}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {mongoTestResult.exists ? 'Exists' : 'New'}
                            </span>
                          )}
                        </div>
                      </label>

                      {localFormData.persistence.mongo.app.auth.method === 'aws' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>AWS IAM Credentials</div>
                          
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            AWS Authentication Type:
                            <select
                              value={localFormData.persistence.mongo.app.auth.aws_auth_type || "static"}
                              onChange={(e) => {
                                  const val = e.target.value as any;
                                  updateFormData('persistence.mongo.app.auth.aws_auth_type', val);
                                  const newAuth = { ...localFormData.persistence.mongo.app.auth, aws_auth_type: val };
                                  const newApp = { ...localFormData.persistence.mongo.app, auth: newAuth };
                                  onUpdateSettings({ 
                                    persistence: { 
                                        ...localFormData.persistence, 
                                        mongo: { 
                                            ...localFormData.persistence.mongo, 
                                            app: newApp
                                        } 
                                    } 
                                  });
                              }}
                            >
                              <option value="static">Static Credentials</option>
                              <option value="role">Assume Role</option>
                            </select>
                          </label>

                          {localFormData.persistence.mongo.app.auth.aws_auth_type === 'static' ? (
                            <>
                              <div style={{ padding: '12px', border: '1px solid #1f2937', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem", marginBottom: '8px' }}>
                                    AWS Profile (Optional for SSO):
                                    <input
                                        type="text"
                                        placeholder="default"
                                        value={localFormData.persistence.mongo.app.auth.aws_profile || ""}
                                        onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_profile', e.target.value)}
                                        onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_profile: localFormData.persistence.mongo.app.auth.aws_profile } } } } })}
                                    />
                                </label>

                                {!localFormData.persistence.mongo.app.auth.aws_profile && (
                                    <div style={{ marginBottom: '16px', padding: '12px', border: '1px dashed #374151', borderRadius: '4px' }}>
                                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Manual SSO Configuration (No Profile):</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Start URL:
                                                <input
                                                    type="text"
                                                    placeholder="https://..."
                                                    value={localFormData.persistence.mongo.app.auth.aws_sso_start_url || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_sso_start_url', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_sso_start_url: localFormData.persistence.mongo.app.auth.aws_sso_start_url } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Region:
                                                <input
                                                    type="text"
                                                    placeholder="us-east-1"
                                                    value={localFormData.persistence.mongo.app.auth.aws_sso_region || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_sso_region', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_sso_region: localFormData.persistence.mongo.app.auth.aws_sso_region } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Account ID:
                                                <input
                                                    type="text"
                                                    placeholder="123456789012"
                                                    value={localFormData.persistence.mongo.app.auth.aws_sso_account_id || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_sso_account_id', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_sso_account_id: localFormData.persistence.mongo.app.auth.aws_sso_account_id } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Role Name:
                                                <input
                                                    type="text"
                                                    placeholder="AWSReadOnlyAccess"
                                                    value={localFormData.persistence.mongo.app.auth.aws_sso_role_name || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_sso_role_name', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_sso_role_name: localFormData.persistence.mongo.app.auth.aws_sso_role_name } } } } })}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => handleAWSSSOLOGIN('app')}
                                        disabled={isSSOLoginLoading}
                                        style={{ fontSize: '12px', padding: '6px 10px' }}
                                    >
                                        Login via AWS SSO
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => handleFetchSSOCredentials('app')}
                                        disabled={isSSOLoginLoading}
                                        style={{ fontSize: '12px', padding: '6px 10px' }}
                                    >
                                        Fetch SSO Credentials
                                    </button>
                                </div>
                                {ssoMessage && (
                                    <div style={{ 
                                        fontSize: '12px', 
                                        marginTop: '8px', 
                                        color: ssoMessage.success ? '#34d399' : '#f87171',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        backgroundColor: 'rgba(0,0,0,0.2)',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        border: `1px solid ${ssoMessage.success ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`
                                    }}>
                                        {(() => {
                                            const codeMatch = ssoMessage.message.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
                                            const code = codeMatch ? codeMatch[1] : null;
                                            
                                            // Split message by URLs to linkify them
                                            const parts = ssoMessage.message.split(/(https?:\/\/[^\s]+)/g);
                                            
                                            return parts.map((part, i) => {
                                                if (part.startsWith('http')) {
                                                    let url = part.replace(/[.,]$/, '');
                                                    // Handle appending user_code, inserting it before any fragment (#) if present
                                                    let finalUrl = url;
                                                    if (code && url.includes('device.sso') && !url.includes('user_code=')) {
                                                        const [baseUrl, fragment] = url.split('#');
                                                        const separator = baseUrl.includes('?') ? '&' : '?';
                                                        finalUrl = `${baseUrl}${separator}user_code=${code}${fragment ? '#' + fragment : ''}`;
                                                    }
                                                        
                                                    return (
                                                        <div key={i} style={{ margin: '8px 0' }}>
                                                            <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Authorization URL:</div>
                                                            <a href={finalUrl} target="_blank" rel="noopener noreferrer" style={{ 
                                                                color: '#60a5fa', 
                                                                textDecoration: 'underline', 
                                                                fontWeight: 'bold',
                                                                display: 'block',
                                                                padding: '8px',
                                                                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(96, 165, 250, 0.2)'
                                                            }}>
                                                                {finalUrl}
                                                            </a>
                                                        </div>
                                                    );
                                                }
                                                
                                                // If we found the code in this text part, highlight it but don't repeat the whole "Then enter the code" if it's already in the URL
                                                if (code && part.includes(code)) {
                                                    const subParts = part.split(code);
                                                    return (
                                                        <React.Fragment key={i}>
                                                            {subParts[0]}
                                                            <span style={{ color: '#f59e0b', fontWeight: 'bold', padding: '0 4px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '2px' }}>{code}</span>
                                                            {subParts[1]}
                                                        </React.Fragment>
                                                    );
                                                }
                                                return part;
                                            });
                                        })()}
                                    </div>
                                )}
                              </div>

                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Access Key ID:
                                <input
                                  type="text"
                                  value={localFormData.persistence.mongo.app.auth.aws_access_key || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_access_key', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_access_key: localFormData.persistence.mongo.app.auth.aws_access_key } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Secret Access Key:
                                <input
                                  type="password"
                                  value={localFormData.persistence.mongo.app.auth.aws_secret_key || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_secret_key', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_secret_key: localFormData.persistence.mongo.app.auth.aws_secret_key } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Session Token (Optional):
                                <input
                                  type="password"
                                  value={localFormData.persistence.mongo.app.auth.aws_session_token || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_session_token', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_session_token: localFormData.persistence.mongo.app.auth.aws_session_token } } } } })}
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role ARN:
                                <input
                                  type="text"
                                  placeholder="arn:aws:iam::123456789012:role/MyRole"
                                  value={localFormData.persistence.mongo.app.auth.aws_role_arn || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_role_arn', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_role_arn: localFormData.persistence.mongo.app.auth.aws_role_arn } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                External ID (Optional):
                                <input
                                  type="text"
                                  value={localFormData.persistence.mongo.app.auth.aws_external_id || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_external_id', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_external_id: localFormData.persistence.mongo.app.auth.aws_external_id } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role Session Name (Optional):
                                <input
                                  type="text"
                                  placeholder="ValueStreamSession"
                                  value={localFormData.persistence.mongo.app.auth.aws_role_session_name || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.app.auth.aws_role_session_name', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, aws_role_session_name: localFormData.persistence.mongo.app.auth.aws_role_session_name } } } } })}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      {localFormData.persistence.mongo.app.auth.method === 'oidc' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration</div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            Access Token:
                            <input
                              type="password"
                              placeholder="eyJhbG..."
                              value={localFormData.persistence.mongo.app.auth.oidc_token || ""}
                              onChange={(e) => updateFormData('persistence.mongo.app.auth.oidc_token', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, app: { ...localFormData.persistence.mongo.app, auth: { ...localFormData.persistence.mongo.app.auth, oidc_token: localFormData.persistence.mongo.app.auth.oidc_token } } } } })}
                            />
                          </label>
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleTestConnection('app')}
                        style={{ alignSelf: "flex-start", marginTop: "4px" }}
                        disabled={isTesting || (!localFormData.persistence.mongo.app.uri && !settings.persistence.mongo.app.uri)}
                      >
                        {isTesting ? "Testing Mongo..." : "Test Mongo Connection"}
                      </button>

                      {mongoTestResult && (
                        <div
                          style={{
                            padding: "10px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            backgroundColor: mongoTestResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                            color: mongoTestResult.success ? "#34d399" : "#f87171",
                            border: `1px solid ${mongoTestResult.success ? "#059669" : "#b91c1c"}`,
                            marginTop: "8px",
                          }}
                        >
                          {mongoTestResult.message}
                        </div>
                      )}

                      <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />
                      
                      <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
                        Export & Import Data
                      </h3>
                      <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 0 8px 0" }}>
                        Manage your database content via staticImport.json files.
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleExportMongo}
                          disabled={isTesting || (!localFormData.persistence.mongo.app.uri && !settings.persistence.mongo.app.uri)}
                        >
                          {isTesting ? "Exporting..." : "Export to JSON"}
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isTesting || (!localFormData.persistence.mongo.app.uri && !settings.persistence.mongo.app.uri)}
                        >
                          {isTesting ? "Importing..." : "Import from JSON"}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".json"
                          onChange={handleImportMongo}
                          style={{ display: 'none' }}
                        />
                      </div>
                    </div>
                  )}

                  {activeSubSubTab === "customer" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Authentication Method:
                        <select
                          value={localFormData.persistence.mongo.customer.auth.method}
                          onChange={(e) => {
                              const val = e.target.value as any;
                              updateFormData('persistence.mongo.customer.auth.method', val);
                              const newCustomer = { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, method: val } };
                              onUpdateSettings({ 
                                persistence: { 
                                    ...localFormData.persistence, 
                                    mongo: { 
                                        ...localFormData.persistence.mongo, 
                                        customer: newCustomer
                                    } 
                                } 
                              });
                          }}
                        >
                          <option value="scram">SCRAM (URI-based)</option>
                          <option value="aws">AWS IAM</option>
                          <option value="oidc">OIDC (Azure/Okta)</option>
                        </select>
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Customer MongoDB URI:
                        <input
                          type="text"
                          placeholder={localFormData.persistence.mongo.customer.auth.method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
                          value={localFormData.persistence.mongo.customer.uri || ""}
                          onChange={(e) => updateFormData('persistence.mongo.customer.uri', e.target.value)}
                          onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, uri: localFormData.persistence.mongo.customer.uri } } } })}
                        />
                      </label>

                      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db", cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={localFormData.persistence.mongo.customer.use_proxy || false}
                            onChange={(e) => {
                              const val = e.target.checked;
                              updateFormData('persistence.mongo.customer.use_proxy', val);
                              const newCustomer = { ...localFormData.persistence.mongo.customer, use_proxy: val };
                              onUpdateSettings({ 
                                persistence: { 
                                    ...localFormData.persistence, 
                                    mongo: { 
                                        ...localFormData.persistence.mongo, 
                                        customer: newCustomer
                                    } 
                                } 
                              });
                            }}
                          />
                          Use SOCKS Proxy (from .env)
                        </label>

                        {localFormData.persistence.mongo.customer.use_proxy && (
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db" }}>
                            Tunnel Name:
                            <input
                              type="text"
                              placeholder="customer"
                              value={localFormData.persistence.mongo.customer.tunnel_name || ""}
                              onChange={(e) => updateFormData('persistence.mongo.customer.tunnel_name', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, tunnel_name: localFormData.persistence.mongo.customer.tunnel_name } } } })}
                              style={{ width: '120px', padding: '4px 8px' }}
                            />
                          </label>
                        )}
                      </div>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Customer MongoDB Database Name:
                        <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="Value Stream"
                              list="customer-mongo-dbs"
                              value={localFormData.persistence.mongo.customer.db || ""}
                              onChange={(e) => updateFormData('persistence.mongo.customer.db', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, db: localFormData.persistence.mongo.customer.db } } } })}
                            />
                            <datalist id="customer-mongo-dbs">
                              {availableCustomerDbs.map(db => <option key={db} value={db} />)}
                            </datalist>
                          </div>
                          {customerMongoTestResult?.success && (
                            <span style={{ 
                              fontSize: '11px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              backgroundColor: customerMongoTestResult.exists ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: customerMongoTestResult.exists ? '#10b981' : '#f59e0b',
                              border: `1px solid ${customerMongoTestResult.exists ? '#10b981' : '#f59e0b'}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {customerMongoTestResult.exists ? 'Exists' : 'New'}
                            </span>
                          )}
                        </div>
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Customer MongoDB Collection:
                        <input
                          type="text"
                          placeholder="Customers"
                          value={localFormData.persistence.mongo.customer.collection || ""}
                          onChange={(e) => updateFormData('persistence.mongo.customer.collection', e.target.value)}
                          onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, collection: localFormData.persistence.mongo.customer.collection } } } })}
                        />
                      </label>

                      {localFormData.persistence.mongo.customer.auth.method === 'aws' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>AWS IAM Credentials (Customer)</div>
                          
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            AWS Authentication Type:
                            <select
                              value={localFormData.persistence.mongo.customer.auth.aws_auth_type || "static"}
                              onChange={(e) => {
                                  const val = e.target.value as any;
                                  updateFormData('persistence.mongo.customer.auth.aws_auth_type', val);
                                  const newAuth = { ...localFormData.persistence.mongo.customer.auth, aws_auth_type: val };
                                  const newCustomer = { ...localFormData.persistence.mongo.customer, auth: newAuth };
                                  onUpdateSettings({ 
                                    persistence: { 
                                        ...localFormData.persistence, 
                                        mongo: { 
                                            ...localFormData.persistence.mongo, 
                                            customer: newCustomer
                                        } 
                                    } 
                                  });
                              }}
                            >
                              <option value="static">Static Credentials</option>
                              <option value="role">Assume Role</option>
                            </select>
                          </label>

                          {localFormData.persistence.mongo.customer.auth.aws_auth_type === 'static' ? (
                            <>
                              <div style={{ padding: '12px', border: '1px solid #1f2937', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem", marginBottom: '8px' }}>
                                    AWS Profile (Optional for SSO):
                                    <input
                                        type="text"
                                        placeholder="default"
                                        value={localFormData.persistence.mongo.customer.auth.aws_profile || ""}
                                        onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_profile', e.target.value)}
                                        onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_profile: localFormData.persistence.mongo.customer.auth.aws_profile } } } } })}
                                    />
                                </label>

                                {!localFormData.persistence.mongo.customer.auth.aws_profile && (
                                    <div style={{ marginBottom: '16px', padding: '12px', border: '1px dashed #374151', borderRadius: '4px' }}>
                                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Manual SSO Configuration (No Profile):</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Start URL:
                                                <input
                                                    type="text"
                                                    placeholder="https://..."
                                                    value={localFormData.persistence.mongo.customer.auth.aws_sso_start_url || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_sso_start_url', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_sso_start_url: localFormData.persistence.mongo.customer.auth.aws_sso_start_url } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Region:
                                                <input
                                                    type="text"
                                                    placeholder="us-east-1"
                                                    value={localFormData.persistence.mongo.customer.auth.aws_sso_region || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_sso_region', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_sso_region: localFormData.persistence.mongo.customer.auth.aws_sso_region } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Account ID:
                                                <input
                                                    type="text"
                                                    placeholder="123456789012"
                                                    value={localFormData.persistence.mongo.customer.auth.aws_sso_account_id || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_sso_account_id', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_sso_account_id: localFormData.persistence.mongo.customer.auth.aws_sso_account_id } } } } })}
                                                />
                                            </label>
                                            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                                                SSO Role Name:
                                                <input
                                                    type="text"
                                                    placeholder="AWSReadOnlyAccess"
                                                    value={localFormData.persistence.mongo.customer.auth.aws_sso_role_name || ""}
                                                    onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_sso_role_name', e.target.value)}
                                                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_sso_role_name: localFormData.persistence.mongo.customer.auth.aws_sso_role_name } } } } })}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => handleAWSSSOLOGIN('customer')}
                                        disabled={isSSOLoginLoading}
                                        style={{ fontSize: '12px', padding: '6px 10px' }}
                                    >
                                        Login via AWS SSO
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => handleFetchSSOCredentials('customer')}
                                        disabled={isSSOLoginLoading}
                                        style={{ fontSize: '12px', padding: '6px 10px' }}
                                    >
                                        Fetch SSO Credentials
                                    </button>
                                </div>
                                {ssoMessage && (
                                    <div style={{ 
                                        fontSize: '12px', 
                                        marginTop: '8px', 
                                        color: ssoMessage.success ? '#34d399' : '#f87171',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        backgroundColor: 'rgba(0,0,0,0.2)',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        border: `1px solid ${ssoMessage.success ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`
                                    }}>
                                        {(() => {
                                            const codeMatch = ssoMessage.message.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
                                            const code = codeMatch ? codeMatch[1] : null;
                                            
                                            // Split message by URLs to linkify them
                                            const parts = ssoMessage.message.split(/(https?:\/\/[^\s]+)/g);
                                            
                                            return parts.map((part, i) => {
                                                if (part.startsWith('http')) {
                                                    let url = part.replace(/[.,]$/, '');
                                                    // Handle appending user_code, inserting it before any fragment (#) if present
                                                    let finalUrl = url;
                                                    if (code && url.includes('device.sso') && !url.includes('user_code=')) {
                                                        const [baseUrl, fragment] = url.split('#');
                                                        const separator = baseUrl.includes('?') ? '&' : '?';
                                                        finalUrl = `${baseUrl}${separator}user_code=${code}${fragment ? '#' + fragment : ''}`;
                                                    }
                                                        
                                                    return (
                                                        <div key={i} style={{ margin: '8px 0' }}>
                                                            <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Authorization URL:</div>
                                                            <a href={finalUrl} target="_blank" rel="noopener noreferrer" style={{ 
                                                                color: '#60a5fa', 
                                                                textDecoration: 'underline', 
                                                                fontWeight: 'bold',
                                                                display: 'block',
                                                                padding: '8px',
                                                                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(96, 165, 250, 0.2)'
                                                            }}>
                                                                {finalUrl}
                                                            </a>
                                                        </div>
                                                    );
                                                }
                                                
                                                // If we found the code in this text part, highlight it but don't repeat the whole "Then enter the code" if it's already in the URL
                                                if (code && part.includes(code)) {
                                                    const subParts = part.split(code);
                                                    return (
                                                        <React.Fragment key={i}>
                                                            {subParts[0]}
                                                            <span style={{ color: '#f59e0b', fontWeight: 'bold', padding: '0 4px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '2px' }}>{code}</span>
                                                            {subParts[1]}
                                                        </React.Fragment>
                                                    );
                                                }
                                                return part;
                                            });
                                        })()}
                                    </div>
                                )}
                              </div>

                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Access Key ID:
                                <input
                                  type="text"
                                  value={localFormData.persistence.mongo.customer.auth.aws_access_key || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_access_key', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_access_key: localFormData.persistence.mongo.customer.auth.aws_access_key } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Secret Access Key:
                                <input
                                  type="password"
                                  value={localFormData.persistence.mongo.customer.auth.aws_secret_key || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_secret_key', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_secret_key: localFormData.persistence.mongo.customer.auth.aws_secret_key } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Session Token (Optional):
                                <input
                                  type="password"
                                  value={localFormData.persistence.mongo.customer.auth.aws_session_token || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_session_token', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_session_token: localFormData.persistence.mongo.customer.auth.aws_session_token } } } } })}
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role ARN:
                                <input
                                  type="text"
                                  placeholder="arn:aws:iam::123456789012:role/MyRole"
                                  value={localFormData.persistence.mongo.customer.auth.aws_role_arn || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_role_arn', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_role_arn: localFormData.persistence.mongo.customer.auth.aws_role_arn } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                External ID (Optional):
                                <input
                                  type="text"
                                  value={localFormData.persistence.mongo.customer.auth.aws_external_id || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_external_id', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_external_id: localFormData.persistence.mongo.customer.auth.aws_external_id } } } } })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role Session Name (Optional):
                                <input
                                  type="text"
                                  placeholder="ValueStreamSession"
                                  value={localFormData.persistence.mongo.customer.auth.aws_role_session_name || ""}
                                  onChange={(e) => updateFormData('persistence.mongo.customer.auth.aws_role_session_name', e.target.value)}
                                  onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, aws_role_session_name: localFormData.persistence.mongo.customer.auth.aws_role_session_name } } } } })}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      {localFormData.persistence.mongo.customer.auth.method === 'oidc' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration (Customer)</div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            Access Token:
                            <input
                              type="password"
                              placeholder="eyJhbG..."
                              value={localFormData.persistence.mongo.customer.auth.oidc_token || ""}
                              onChange={(e) => updateFormData('persistence.mongo.customer.auth.oidc_token', e.target.value)}
                              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, auth: { ...localFormData.persistence.mongo.customer.auth, oidc_token: localFormData.persistence.mongo.customer.auth.oidc_token } } } } })}
                            />
                          </label>
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleTestConnection('customer')}
                        style={{ alignSelf: "flex-start", marginTop: "4px" }}
                        disabled={isTestingCustomer || (!localFormData.persistence.mongo.customer.uri && !settings.persistence.mongo.customer.uri)}
                      >
                        {isTestingCustomer ? "Testing Customer Mongo..." : "Test Customer Mongo Connection"}
                      </button>

                      {customerMongoTestResult && (
                        <div
                          style={{
                            padding: "10px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            backgroundColor: customerMongoTestResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                            color: customerMongoTestResult.success ? "#34d399" : "#f87171",
                            border: `1px solid ${customerMongoTestResult.success ? "#059669" : "#b91c1c"}`,
                            marginTop: "8px",
                          }}
                        >
                          {customerMongoTestResult.message}
                        </div>
                      )}

                      <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "100%" }}>
                        Custom MongoDB Query (JSON/Aggregation):
                        <span style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                          Enter a JSON-formatted query or aggregation pipeline to fetch custom fields or nested collections. 
                          Use <code>{"{{CUSTOMER_ID}}"}</code> as a placeholder. It will be replaced with a single ID (e.g. <code>"CUST-123"</code>) on detail pages, 
                          or a match object (e.g. <code>{"{\"$in\": [\"CUST-1\",\"CUST-2\"]}"}</code>) on the list page.
                          <br /><br />
                          <strong>Note:</strong> If you use an aggregation pipeline, ensure you include <code>"customer_id": 1</code> in your final <code>$project</code> stage 
                          so the application can correctly map the results back to individual customers on the list page.
                        </span>
                        <textarea
                          placeholder='[{"$match": {"customer_id": "{{CUSTOMER_ID}}"}}, {"$lookup": {"from": "Clusters", "localField": "customer_id", "foreignField": "customer_id", "as": "clusters"}}, {"$project": {"customer_id": 1, "status": 1, "clusters": 1}}]'
                          value={localFormData.persistence.mongo.customer.custom_query || ""}
                          onChange={(e) => updateFormData('persistence.mongo.customer.custom_query', e.target.value)}
                          onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, custom_query: localFormData.persistence.mongo.customer.custom_query } } } })}
                          rows={12}
                          style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}

              {activeSubTab === "file" && (
                <div style={{ color: "#9ca3af", fontSize: "14px" }}>
                  File-based persistence configuration will be available here.
                </div>
              )}
            </>
          )}

          {activeTab === "jira" && (
            <>
              <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #374151', marginBottom: '20px' }}>
                <button
                  onClick={() => setSubTab("common")}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    color: activeSubTab === "common" ? '#60a5fa' : '#9ca3af',
                    borderBottom: activeSubTab === "common" ? '2px solid #60a5fa' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: activeSubTab === "common" ? 'bold' : 'normal',
                  }}
                >
                  Common
                </button>
                <button
                  onClick={() => setSubTab("epics")}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    color: activeSubTab === "epics" ? '#60a5fa' : '#9ca3af',
                    borderBottom: activeSubTab === "epics" ? '2px solid #60a5fa' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: activeSubTab === "epics" ? 'bold' : 'normal',
                  }}
                >
                  Epics
                </button>
                <button
                  onClick={() => setSubTab("customer")}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    color: activeSubTab === "customer" ? '#60a5fa' : '#9ca3af',
                    borderBottom: activeSubTab === "customer" ? '2px solid #60a5fa' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: activeSubTab === "customer" ? 'bold' : 'normal',
                  }}
                >
                  Customer
                </button>
              </div>

              {activeSubTab === "common" && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Jira Base URL:
                    <input
                      type="url"
                      placeholder="https://yourdomain.atlassian.net"
                      value={localFormData.jira.base_url || ""}
                      onChange={(e) => updateFormData('jira.base_url', e.target.value)}
                      onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, base_url: localFormData.jira.base_url } })}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Jira API Version:
                    <select
                      value={localFormData.jira.api_version}
                      onChange={(e) => {
                          const val = e.target.value as "2" | "3";
                          updateFormData('jira.api_version', val);
                          onUpdateSettings({ jira: { ...localFormData.jira, api_version: val } });
                      }}
                    >
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Jira Personal Access Token (PAT):
                    <input
                      type="password"
                      placeholder="Your Jira PAT"
                      value={localFormData.jira.api_token || ""}
                      onChange={(e) => updateFormData('jira.api_token', e.target.value)}
                      onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, api_token: localFormData.jira.api_token } })}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleJiraTestConnection}
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings.jira.base_url) && (!localFormData.jira.api_token && !settings.jira.api_token))}
                    >
                      {isTesting ? "Testing..." : "Test Connection"}
                    </button>
                  </div>

                  {jiraTestResult && (
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "4px",
                        fontSize: "14px",
                        backgroundColor: jiraTestResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: jiraTestResult.success ? "#34d399" : "#f87171",
                        border: `1px solid ${jiraTestResult.success ? "#059669" : "#b91c1c"}`,
                        marginTop: "8px",
                      }}
                    >
                      {jiraTestResult.message}
                    </div>
                  )}
                </>
              )}

              {activeSubTab === "epics" && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Import JQL Query:
                    <input
                      type="text"
                      placeholder="project = PROJ AND issuetype = Epic"
                      value={importJql}
                      onChange={(e) => setImportJql(e.target.value)}
                    />
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleImportFromJira}
                      style={{ alignSelf: "flex-start" }}
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings.jira.base_url) && (!localFormData.jira.api_token && !settings.jira.api_token)) || !importJql.trim()}
                    >
                      {isImporting ? importProgress : "Import from Jira"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSyncAllFromJira}
                      style={{ alignSelf: "flex-start" }}
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings.jira.base_url) && (!localFormData.jira.api_token && !settings.jira.api_token))}
                    >
                      {isSyncing ? syncProgress : "Sync Epics from Jira"}
                    </button>
                  </div>

                  {importSyncResult && (
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "4px",
                        fontSize: "14px",
                        backgroundColor: importSyncResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: importSyncResult.success ? "#34d399" : "#f87171",
                        border: `1px solid ${importSyncResult.success ? "#059669" : "#b91c1c"}`,
                        marginTop: "8px",
                      }}
                    >
                      {importSyncResult.message}
                    </div>
                  )}
                </>
              )}

              {activeSubTab === "customer" && (
                <>
                  <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 0 8px 0" }}>
                    Use <code>{"{{CUSTOMER_ID}}"}</code> as a placeholder for the customer ID.
                  </p>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    New / Untriaged JQL:
                    <input
                      type="text"
                      placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'New'"
                      value={localFormData.jira.customer_jql_new || ""}
                      onChange={(e) => updateFormData('jira.customer_jql_new', e.target.value)}
                      onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer_jql_new: localFormData.jira.customer_jql_new } })}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Active Work JQL:
                    <input
                      type="text"
                      placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'In Progress'"
                      value={localFormData.jira.customer_jql_in_progress || ""}
                      onChange={(e) => updateFormData('jira.customer_jql_in_progress', e.target.value)}
                      onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer_jql_in_progress: localFormData.jira.customer_jql_in_progress } })}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Blocked / Pending JQL (Customer or 3rd Party):
                    <input
                      type="text"
                      placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'Blocked'"
                      value={localFormData.jira.customer_jql_noop || ""}
                      onChange={(e) => updateFormData('jira.customer_jql_noop', e.target.value)}
                      onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer_jql_noop: localFormData.jira.customer_jql_noop } })}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {activeTab === "general" && (
            <>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb", borderBottom: "1px solid #374151", paddingBottom: "4px" }}>
                Time
              </h3>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                Fiscal Year Start Month:
                <select
                  value={localFormData.general?.fiscal_year_start_month || 1}
                  onChange={(e) => {
                      const val = parseInt(e.target.value);
                      updateFormData('general.fiscal_year_start_month', val);
                      onUpdateSettings({ general: { ...localFormData.general, fiscal_year_start_month: val } });
                  }}
                >
                  <option value={1}>January (Calendar Year)</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                Sprint Duration (Days):
                <span style={{ fontSize: "12px", color: "#9ca3af", marginTop: "-2px", marginBottom: "4px" }}>
                  Defines the default end date when creating new sprints. Does not affect existing sprints.
                </span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={localFormData.general?.sprint_duration_days || 14}
                  onChange={(e) => {
                      const val = parseInt(e.target.value);
                      updateFormData('general.sprint_duration_days', val);
                      onUpdateSettings({ general: { ...localFormData.general, sprint_duration_days: val } });
                  }}
                />
              </label>
            </>
          )}

          {activeTab === "ai" && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                LLM Provider:
                <select
                  value={localFormData.ai?.provider || 'openai'}
                  onChange={(e) => {
                      const val = e.target.value as any;
                      updateFormData('ai.provider', val);
                      onUpdateSettings({ ai: { ...localFormData.ai, provider: val } });
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="augment">Augment CLI</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                {localFormData.ai?.provider === 'augment' ? 'Augment Session Auth:' : 'LLM API Key:'}
                <input
                  type="password"
                  placeholder={localFormData.ai?.provider === 'augment' ? "Session token..." : "sk-..."}
                  value={localFormData.ai?.api_key || ""}
                  onChange={(e) => updateFormData('ai.api_key', e.target.value)}
                  onBlur={() => onUpdateSettings({ ai: { ...localFormData.ai, api_key: localFormData.ai.api_key } })}
                />
              </label>

              {localFormData.ai?.provider !== 'augment' && (
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                  LLM Model (Optional):
                  <input
                    type="text"
                    placeholder="gpt-4-turbo"
                    value={localFormData.ai?.model || ""}
                    onChange={(e) => updateFormData('ai.model', e.target.value)}
                    onBlur={() => onUpdateSettings({ ai: { ...localFormData.ai, model: localFormData.ai.model } })}
                  />
                </label>
              )}
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
