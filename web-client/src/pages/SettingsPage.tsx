import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Settings, DashboardData, Epic } from "../types/models";
import styles from './List.module.css';
import { authorizedFetch, syncJiraIssue } from "../utils/api";
import { generateId } from '../utils/security';
import { useDashboardContext } from "../contexts/DashboardContext";
import { PageWrapper } from "../components/layout/PageWrapper";
import { parseJiraIssue } from "../utils/businessLogic";

interface SettingsPageProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  data: DashboardData | null;
  loading?: boolean;
  error?: Error | null;
  updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
  addEpic: (epic: Epic) => void;
}

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

  const { showConfirm } = useDashboardContext();

  const [localFormData, setFormData] = useState<Partial<Settings>>({});
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        jira_base_url: settings.jira_base_url,
        jira_api_version: settings.jira_api_version || "3",
        jira_api_token: settings.jira_api_token || "",
        mongo_uri: settings.mongo_uri || "",
        mongo_db: settings.mongo_db || "",
        mongo_auth_method: settings.mongo_auth_method || "scram",
        mongo_aws_auth_type: settings.mongo_aws_auth_type || "static",
        mongo_aws_access_key: settings.mongo_aws_access_key || "",
        mongo_aws_secret_key: settings.mongo_aws_secret_key || "",
        mongo_aws_session_token: settings.mongo_aws_session_token || "",
        mongo_aws_role_arn: settings.mongo_aws_role_arn || "",
        mongo_aws_external_id: settings.mongo_aws_external_id || "",
        mongo_aws_role_session_name: settings.mongo_aws_role_session_name || "",
        mongo_oidc_token: settings.mongo_oidc_token || "",
        mongo_create_if_not_exists: settings.mongo_create_if_not_exists ?? false,
        mongo_use_ssh: settings.mongo_use_ssh ?? false,
        mongo_ssh_host: settings.mongo_ssh_host || "",
        mongo_ssh_port: settings.mongo_ssh_port || 22,
        mongo_ssh_user: settings.mongo_ssh_user || "",
        mongo_ssh_key: settings.mongo_ssh_key || "",
        customer_mongo_db: settings.customer_mongo_db || "",
        customer_mongo_auth_method: settings.customer_mongo_auth_method || "scram",
        customer_mongo_aws_auth_type: settings.customer_mongo_aws_auth_type || "static",
        customer_mongo_aws_access_key: settings.customer_mongo_aws_access_key || "",
        customer_mongo_aws_secret_key: settings.customer_mongo_aws_secret_key || "",
        customer_mongo_aws_session_token: settings.customer_mongo_aws_session_token || "",
        customer_mongo_aws_role_arn: settings.customer_mongo_aws_role_arn || "",
        customer_mongo_aws_external_id: settings.customer_mongo_aws_external_id || "",
        customer_mongo_aws_role_session_name: settings.customer_mongo_aws_role_session_name || "",
        customer_mongo_oidc_token: settings.customer_mongo_oidc_token || "",
        customer_mongo_use_ssh: settings.customer_mongo_use_ssh ?? false,
        customer_mongo_ssh_host: settings.customer_mongo_ssh_host || "",
        customer_mongo_ssh_port: settings.customer_mongo_ssh_port || 22,
        customer_mongo_ssh_user: settings.customer_mongo_ssh_user || "",
        customer_mongo_ssh_key: settings.customer_mongo_ssh_key || "",
        customer_mongo_custom_query: settings.customer_mongo_custom_query || "",
        customer_jql_new: settings.customer_jql_new || "",
        customer_jql_in_progress: settings.customer_jql_in_progress || "",
        customer_jql_noop: settings.customer_jql_noop || "",
        llm_provider: settings.llm_provider || "openai",
        llm_api_key: settings.llm_api_key || "",
        llm_model: settings.llm_model || "",
        fiscal_year_start_month: settings.fiscal_year_start_month || 1,
        sprint_duration_days: settings.sprint_duration_days || 14,
      });
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

  const handleTestConnection = async (type: 'application' | 'customer' = 'application') => {
    const isCustomer = type === 'customer';
    const uriField = isCustomer ? 'customer_mongo_uri' : 'mongo_uri';
    const dbField = isCustomer ? 'customer_mongo_db' : 'mongo_db';
    const authField = isCustomer ? 'customer_mongo_auth_method' : 'mongo_auth_method';
    const akField = isCustomer ? 'customer_mongo_aws_access_key' : 'mongo_aws_access_key';
    const skField = isCustomer ? 'customer_mongo_aws_secret_key' : 'mongo_aws_secret_key';
    const stField = isCustomer ? 'customer_mongo_aws_session_token' : 'mongo_aws_session_token';
    const otField = isCustomer ? 'customer_mongo_oidc_token' : 'mongo_oidc_token';
    const useSshField = isCustomer ? 'customer_mongo_use_ssh' : 'mongo_use_ssh';
    const sshHostField = isCustomer ? 'customer_mongo_ssh_host' : 'mongo_ssh_host';
    const sshPortField = isCustomer ? 'customer_mongo_ssh_port' : 'mongo_ssh_port';
    const sshUserField = isCustomer ? 'customer_mongo_ssh_user' : 'mongo_ssh_user';
    const sshKeyField = isCustomer ? 'customer_mongo_ssh_key' : 'mongo_ssh_key';

    const mongo_uri = localFormData[uriField] || settings[uriField];
    const mongo_db = localFormData[dbField] || settings[dbField];
    const mongo_auth_method = localFormData[authField] || settings[authField];
    const mongo_aws_access_key = localFormData[akField] || settings[akField];
    const mongo_aws_secret_key = localFormData[skField] || settings[skField];
    const mongo_aws_session_token = localFormData[stField] || settings[stField];
    const mongo_oidc_token = localFormData[otField] || settings[otField];
    const mongo_use_ssh = localFormData[useSshField] || settings[useSshField];
    const mongo_ssh_host = localFormData[sshHostField] || settings[sshHostField];
    const mongo_ssh_port = localFormData[sshPortField] || settings[sshPortField];
    const mongo_ssh_user = localFormData[sshUserField] || settings[sshUserField];
    const mongo_ssh_key = localFormData[sshKeyField] || settings[sshKeyField];

    if (!mongo_uri) {
      if (isCustomer) setCustomerMongoTestResult({ success: false, message: "MongoDB URI is required to test." });
      else setMongoTestResult({ success: false, message: "MongoDB URI is required to test." });
      return;
    }
    
    if (isCustomer) {
        setIsTestingCustomer(true);
        setCustomerMongoTestResult(null);
    } else {
        setIsTesting(true);
        setMongoTestResult(null);
    }

    try {
      // Fetch available databases
      const dbRes = await authorizedFetch("/api/mongo/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          mongo_uri, 
          mongo_auth_method,
          mongo_aws_access_key,
          mongo_aws_secret_key,
          mongo_aws_session_token,
          mongo_oidc_token,
          mongo_use_ssh,
          mongo_ssh_host,
          mongo_ssh_port,
          mongo_ssh_user,
          mongo_ssh_key
        }),
      });
      const dbData = await dbRes.json();
      if (dbRes.ok && dbData.success) {
        if (isCustomer) setAvailableCustomerDbs(dbData.databases || []);
        else setAvailableDbs(dbData.databases || []);
      }

      // Test specific database
      const response = await authorizedFetch("/api/mongo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          mongo_uri, 
          mongo_db, 
          mongo_auth_method,
          mongo_aws_access_key,
          mongo_aws_secret_key,
          mongo_aws_session_token,
          mongo_oidc_token,
          mongo_use_ssh,
          mongo_ssh_host,
          mongo_ssh_port,
          mongo_ssh_user,
          mongo_ssh_key,
          mongo_create_if_not_exists: isCustomer ? false : (localFormData.mongo_create_if_not_exists || settings.mongo_create_if_not_exists)
        }),
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
    const jira_base_url = localFormData.jira_base_url || settings.jira_base_url;
    const jira_api_token = localFormData.jira_api_token || settings.jira_api_token;
    const jira_api_version = localFormData.jira_api_version || settings.jira_api_version || "3";

    if (!jira_base_url || !jira_api_token) {
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
          jira_base_url,
          jira_api_token,
          jira_api_version,
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
    const jira_base_url = localFormData.jira_base_url || settings.jira_base_url;
    const jira_api_token = localFormData.jira_api_token || settings.jira_api_token;

    if (!jira_base_url || !jira_api_token) {
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
            jira_base_url,
            jira_api_version: localFormData.jira_api_version || settings.jira_api_version || "3",
            jira_api_token,
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
    const jira_base_url = localFormData.jira_base_url || settings.jira_base_url;
    const jira_api_token = localFormData.jira_api_token || settings.jira_api_token;

    if (!jira_base_url || !jira_api_token) {
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
          jira_base_url,
          jira_api_version: localFormData.jira_api_version || settings.jira_api_version || "3",
          jira_api_token,
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
                          value={localFormData.mongo_auth_method || "scram"}
                          onChange={(e) => {
                              const val = e.target.value as any;
                              setFormData({ ...localFormData, mongo_auth_method: val });
                              onUpdateSettings({ mongo_auth_method: val });
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
                          placeholder={localFormData.mongo_auth_method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
                          value={localFormData.mongo_uri || ""}
                          onChange={(e) => setFormData({ ...localFormData, mongo_uri: e.target.value })}
                          onBlur={() => onUpdateSettings({ mongo_uri: localFormData.mongo_uri })}
                        />
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        MongoDB Database Name:
                        <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="valueStream"
                              list="mongo-dbs"
                              value={localFormData.mongo_db || ""}
                              onChange={(e) => setFormData({ ...localFormData, mongo_db: e.target.value })}
                              onBlur={() => onUpdateSettings({ mongo_db: localFormData.mongo_db })}
                              style={{
                                borderColor: mongoTestResult?.success && !mongoTestResult.exists && !localFormData.mongo_create_if_not_exists ? '#f59e0b' : undefined
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

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db", cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localFormData.mongo_create_if_not_exists || false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setFormData({ ...localFormData, mongo_create_if_not_exists: val });
                            onUpdateSettings({ mongo_create_if_not_exists: val });
                          }}
                        />
                        Create database if it doesn't exist
                      </label>

                      {localFormData.mongo_auth_method === 'aws' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>AWS IAM Credentials</div>
                          
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            AWS Authentication Type:
                            <select
                              value={localFormData.mongo_aws_auth_type || "static"}
                              onChange={(e) => {
                                  const val = e.target.value as any;
                                  setFormData({ ...localFormData, mongo_aws_auth_type: val });
                                  onUpdateSettings({ mongo_aws_auth_type: val });
                              }}
                            >
                              <option value="static">Static Credentials</option>
                              <option value="role">Assume Role</option>
                            </select>
                          </label>

                          {localFormData.mongo_aws_auth_type === 'static' ? (
                            <>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Access Key ID:
                                <input
                                  type="text"
                                  value={localFormData.mongo_aws_access_key || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_access_key: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_access_key: localFormData.mongo_aws_access_key })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Secret Access Key:
                                <input
                                  type="password"
                                  value={localFormData.mongo_aws_secret_key || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_secret_key: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_secret_key: localFormData.mongo_aws_secret_key })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Session Token (Optional):
                                <input
                                  type="password"
                                  value={localFormData.mongo_aws_session_token || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_session_token: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_session_token: localFormData.mongo_aws_session_token })}
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
                                  value={localFormData.mongo_aws_role_arn || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_role_arn: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_role_arn: localFormData.mongo_aws_role_arn })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                External ID (Optional):
                                <input
                                  type="text"
                                  value={localFormData.mongo_aws_external_id || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_external_id: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_external_id: localFormData.mongo_aws_external_id })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role Session Name (Optional):
                                <input
                                  type="text"
                                  placeholder="ValueStreamSession"
                                  value={localFormData.mongo_aws_role_session_name || ""}
                                  onChange={(e) => setFormData({ ...localFormData, mongo_aws_role_session_name: e.target.value })}
                                  onBlur={() => onUpdateSettings({ mongo_aws_role_session_name: localFormData.mongo_aws_role_session_name })}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      {localFormData.mongo_auth_method === 'oidc' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration</div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            Access Token:
                            <input
                              type="password"
                              placeholder="eyJhbG..."
                              value={localFormData.mongo_oidc_token || ""}
                              onChange={(e) => setFormData({ ...localFormData, mongo_oidc_token: e.target.value })}
                              onBlur={() => onUpdateSettings({ mongo_oidc_token: localFormData.mongo_oidc_token })}
                            />
                          </label>
                        </div>
                      )}

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db", cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localFormData.mongo_use_ssh || false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setFormData({ ...localFormData, mongo_use_ssh: val });
                            onUpdateSettings({ mongo_use_ssh: val });
                          }}
                        />
                        SSH with Identity File
                      </label>

                      {localFormData.mongo_use_ssh && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>SSH Tunnel Configuration</div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", flex: 3 }}>
                              SSH Host:
                              <input
                                type="text"
                                placeholder="ssh.example.com"
                                value={localFormData.mongo_ssh_host || ""}
                                onChange={(e) => setFormData({ ...localFormData, mongo_ssh_host: e.target.value })}
                                onBlur={() => onUpdateSettings({ mongo_ssh_host: localFormData.mongo_ssh_host })}
                              />
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", flex: 1 }}>
                              SSH Port:
                              <input
                                type="number"
                                placeholder="22"
                                value={localFormData.mongo_ssh_port || 22}
                                onChange={(e) => setFormData({ ...localFormData, mongo_ssh_port: parseInt(e.target.value) })}
                                onBlur={() => onUpdateSettings({ mongo_ssh_port: localFormData.mongo_ssh_port })}
                              />
                            </label>
                          </div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            SSH User:
                            <input
                              type="text"
                              placeholder="username"
                              value={localFormData.mongo_ssh_user || ""}
                              onChange={(e) => setFormData({ ...localFormData, mongo_ssh_user: e.target.value })}
                              onBlur={() => onUpdateSettings({ mongo_ssh_user: localFormData.mongo_ssh_user })}
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            SSH Identity File (Private Key):
                            <textarea
                              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                              value={localFormData.mongo_ssh_key || ""}
                              onChange={(e) => setFormData({ ...localFormData, mongo_ssh_key: e.target.value })}
                              onBlur={() => onUpdateSettings({ mongo_ssh_key: localFormData.mongo_ssh_key })}
                              rows={5}
                              style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                          </label>
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleTestConnection('application')}
                        style={{ alignSelf: "flex-start", marginTop: "4px" }}
                        disabled={isTesting || (!localFormData.mongo_uri && !settings.mongo_uri)}
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
                          disabled={isTesting || (!localFormData.mongo_uri && !settings.mongo_uri)}
                        >
                          {isTesting ? "Exporting..." : "Export to JSON"}
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isTesting || (!localFormData.mongo_uri && !settings.mongo_uri)}
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
                          value={localFormData.customer_mongo_auth_method || "scram"}
                          onChange={(e) => {
                              const val = e.target.value as any;
                              setFormData({ ...localFormData, customer_mongo_auth_method: val });
                              onUpdateSettings({ customer_mongo_auth_method: val });
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
                          placeholder={localFormData.customer_mongo_auth_method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
                          value={localFormData.customer_mongo_uri || ""}
                          onChange={(e) => setFormData({ ...localFormData, customer_mongo_uri: e.target.value })}
                          onBlur={() => onUpdateSettings({ customer_mongo_uri: localFormData.customer_mongo_uri })}
                        />
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                        Customer MongoDB Database Name:
                        <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="valueStream"
                              list="customer-mongo-dbs"
                              value={localFormData.customer_mongo_db || ""}
                              onChange={(e) => setFormData({ ...localFormData, customer_mongo_db: e.target.value })}
                              onBlur={() => onUpdateSettings({ customer_mongo_db: localFormData.customer_mongo_db })}
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

                      {localFormData.customer_mongo_auth_method === 'aws' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>AWS IAM Credentials (Customer)</div>
                          
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            AWS Authentication Type:
                            <select
                              value={localFormData.customer_mongo_aws_auth_type || "static"}
                              onChange={(e) => {
                                  const val = e.target.value as any;
                                  setFormData({ ...localFormData, customer_mongo_aws_auth_type: val });
                                  onUpdateSettings({ customer_mongo_aws_auth_type: val });
                              }}
                            >
                              <option value="static">Static Credentials</option>
                              <option value="role">Assume Role</option>
                            </select>
                          </label>

                          {localFormData.customer_mongo_aws_auth_type === 'static' ? (
                            <>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Access Key ID:
                                <input
                                  type="text"
                                  value={localFormData.customer_mongo_aws_access_key || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_access_key: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_access_key: localFormData.customer_mongo_aws_access_key })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Secret Access Key:
                                <input
                                  type="password"
                                  value={localFormData.customer_mongo_aws_secret_key || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_secret_key: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_secret_key: localFormData.customer_mongo_aws_secret_key })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Session Token (Optional):
                                <input
                                  type="password"
                                  value={localFormData.customer_mongo_aws_session_token || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_session_token: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_session_token: localFormData.customer_mongo_aws_session_token })}
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
                                  value={localFormData.customer_mongo_aws_role_arn || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_role_arn: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_role_arn: localFormData.customer_mongo_aws_role_arn })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                External ID (Optional):
                                <input
                                  type="text"
                                  value={localFormData.customer_mongo_aws_external_id || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_external_id: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_external_id: localFormData.customer_mongo_aws_external_id })}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                                Role Session Name (Optional):
                                <input
                                  type="text"
                                  placeholder="ValueStreamSession"
                                  value={localFormData.customer_mongo_aws_role_session_name || ""}
                                  onChange={(e) => setFormData({ ...localFormData, customer_mongo_aws_role_session_name: e.target.value })}
                                  onBlur={() => onUpdateSettings({ customer_mongo_aws_role_session_name: localFormData.customer_mongo_aws_role_session_name })}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      {localFormData.customer_mongo_auth_method === 'oidc' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration (Customer)</div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            Access Token:
                            <input
                              type="password"
                              placeholder="eyJhbG..."
                              value={localFormData.customer_mongo_oidc_token || ""}
                              onChange={(e) => setFormData({ ...localFormData, customer_mongo_oidc_token: e.target.value })}
                              onBlur={() => onUpdateSettings({ customer_mongo_oidc_token: localFormData.customer_mongo_oidc_token })}
                            />
                          </label>
                        </div>
                      )}

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#d1d5db", cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localFormData.customer_mongo_use_ssh || false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setFormData({ ...localFormData, customer_mongo_use_ssh: val });   
                            onUpdateSettings({ customer_mongo_use_ssh: val });
                          }}
                        />
                        SSH with Identity File (Customer)
                      </label>

                      {localFormData.customer_mongo_use_ssh && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>SSH Tunnel Configuration (Customer)</div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", flex: 3 }}>
                              SSH Host:
                              <input
                                type="text"
                                placeholder="ssh.customer.com"
                                value={localFormData.customer_mongo_ssh_host || ""}
                                onChange={(e) => setFormData({ ...localFormData, customer_mongo_ssh_host: e.target.value })}
                                onBlur={() => onUpdateSettings({ customer_mongo_ssh_host: localFormData.customer_mongo_ssh_host })}
                              />
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", flex: 1 }}>
                              SSH Port:
                              <input
                                type="number"
                                placeholder="22"
                                value={localFormData.customer_mongo_ssh_port || 22}
                                onChange={(e) => setFormData({ ...localFormData, customer_mongo_ssh_port: parseInt(e.target.value) })}
                                onBlur={() => onUpdateSettings({ customer_mongo_ssh_port: localFormData.customer_mongo_ssh_port })}
                              />
                            </label>
                          </div>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            SSH User:
                            <input
                              type="text"
                              placeholder="username"
                              value={localFormData.customer_mongo_ssh_user || ""}
                              onChange={(e) => setFormData({ ...localFormData, customer_mongo_ssh_user: e.target.value })}
                              onBlur={() => onUpdateSettings({ customer_mongo_ssh_user: localFormData.customer_mongo_ssh_user })}
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                            SSH Identity File (Private Key):
                            <textarea
                              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                              value={localFormData.customer_mongo_ssh_key || ""}
                              onChange={(e) => setFormData({ ...localFormData, customer_mongo_ssh_key: e.target.value })}
                              onBlur={() => onUpdateSettings({ customer_mongo_ssh_key: localFormData.customer_mongo_ssh_key })}
                              rows={5}
                              style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                          </label>
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleTestConnection('customer')}
                        style={{ alignSelf: "flex-start", marginTop: "4px" }}
                        disabled={isTestingCustomer || (!localFormData.customer_mongo_uri && !settings.customer_mongo_uri)}
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
                          value={localFormData.customer_mongo_custom_query || ""}
                          onChange={(e) => setFormData({ ...localFormData, customer_mongo_custom_query: e.target.value })}
                          onBlur={() => onUpdateSettings({ customer_mongo_custom_query: localFormData.customer_mongo_custom_query })}
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
                      value={localFormData.jira_base_url || ""}
                      onChange={(e) => setFormData({ ...localFormData, jira_base_url: e.target.value })}
                      onBlur={() => onUpdateSettings({ jira_base_url: localFormData.jira_base_url })}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Jira API Version:
                    <select
                      value={localFormData.jira_api_version || "3"}
                      onChange={(e) => {
                          const val = e.target.value as "2" | "3";
                          setFormData({ ...localFormData, jira_api_version: val });
                          onUpdateSettings({ jira_api_version: val });
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
                      value={localFormData.jira_api_token || ""}
                      onChange={(e) => setFormData({ ...localFormData, jira_api_token: e.target.value })}
                      onBlur={() => onUpdateSettings({ jira_api_token: localFormData.jira_api_token })}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleJiraTestConnection}
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira_base_url && !settings.jira_base_url) && (!localFormData.jira_api_token && !settings.jira_api_token))}
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
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira_base_url && !settings.jira_base_url) && (!localFormData.jira_api_token && !settings.jira_api_token)) || !importJql.trim()}
                    >
                      {isImporting ? importProgress : "Import from Jira"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSyncAllFromJira}
                      style={{ alignSelf: "flex-start" }}
                      disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira_base_url && !settings.jira_base_url) && (!localFormData.jira_api_token && !settings.jira_api_token))}
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
                      value={localFormData.customer_jql_new || ""}
                      onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...localFormData, customer_jql_new: val });
                          onUpdateSettings({ customer_jql_new: val });
                      }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Active Work JQL:
                    <input
                      type="text"
                      placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'In Progress'"
                      value={localFormData.customer_jql_in_progress || ""}
                      onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...localFormData, customer_jql_in_progress: val });
                          onUpdateSettings({ customer_jql_in_progress: val });
                      }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                    Blocked / Pending JQL (Customer or 3rd Party):
                    <input
                      type="text"
                      placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'Blocked'"
                      value={localFormData.customer_jql_noop || ""}
                      onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...localFormData, customer_jql_noop: val });
                          onUpdateSettings({ customer_jql_noop: val });
                      }}
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
                  value={localFormData.fiscal_year_start_month || 1}
                  onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setFormData({ ...localFormData, fiscal_year_start_month: val });
                      onUpdateSettings({ fiscal_year_start_month: val });
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
                  value={localFormData.sprint_duration_days || 14}
                  onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setFormData({ ...localFormData, sprint_duration_days: val });
                      onUpdateSettings({ sprint_duration_days: val });
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
                  value={localFormData.llm_provider || "openai"}
                  onChange={(e) => {
                      const val = e.target.value as any;
                      setFormData({ ...localFormData, llm_provider: val });
                      onUpdateSettings({ llm_provider: val });
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="augment">Augment CLI</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                {localFormData.llm_provider === 'augment' ? 'Augment Session Auth:' : 'LLM API Key:'}
                <input
                  type="password"
                  placeholder={localFormData.llm_provider === 'augment' ? "Session token..." : "sk-..."}
                  value={localFormData.llm_api_key || ""}
                  onChange={(e) => setFormData({ ...localFormData, llm_api_key: e.target.value })}
                  onBlur={() => onUpdateSettings({ llm_api_key: localFormData.llm_api_key })}
                />
              </label>

              {localFormData.llm_provider !== 'augment' && (
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db", maxWidth: "32rem" }}>
                  LLM Model (Optional):
                  <input
                    type="text"
                    placeholder="gpt-4-turbo"
                    value={localFormData.llm_model || ""}
                    onChange={(e) => setFormData({ ...localFormData, llm_model: e.target.value })}
                    onBlur={() => onUpdateSettings({ llm_model: localFormData.llm_model })}
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
