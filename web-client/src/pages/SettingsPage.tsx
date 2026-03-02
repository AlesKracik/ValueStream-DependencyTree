import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Settings, DashboardData, Epic } from "../types/models";
import styles from './List.module.css';
import { authorizedFetch } from "../utils/api";
import { generateId } from '../utils/security';
import { useDashboardContext } from "../contexts/DashboardContext";

interface SettingsPageProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  data: DashboardData | null;
  updateEpic: (id: string, updates: Partial<Epic>) => void;
  addEpic: (epic: Epic) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  data,
  updateEpic,
  addEpic,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "general" | "mongo" | "jira") || "general";
  const { showAlert, showConfirm } = useDashboardContext();

  const [localFormData, setFormData] = useState<Partial<Settings>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [availableDbs, setAvailableDbs] = useState<string[]>([]);
  const [mongoTestResult, setMongoTestResult] = useState<{ success: boolean; message: string; exists?: boolean } | null>(null);
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
        mongo_aws_access_key: settings.mongo_aws_access_key || "",
        mongo_aws_secret_key: settings.mongo_aws_secret_key || "",
        mongo_aws_session_token: settings.mongo_aws_session_token || "",
        mongo_oidc_token: settings.mongo_oidc_token || "",
        mongo_create_if_not_exists: settings.mongo_create_if_not_exists ?? false,
        customer_jql_new: settings.customer_jql_new || "",
        customer_jql_in_progress: settings.customer_jql_in_progress || "",
        customer_jql_noop: settings.customer_jql_noop || "",
        fiscal_year_start_month: settings.fiscal_year_start_month || 1,
        sprint_duration_days: settings.sprint_duration_days || 14,
      });
    }
  }, [settings]);

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
    setMongoTestResult(null);
    setJiraTestResult(null);
    setImportSyncResult(null);
  };

  const handleTestConnection = async () => {
    const mongo_uri = localFormData.mongo_uri || settings.mongo_uri;
    const mongo_db = localFormData.mongo_db || settings.mongo_db;
    const mongo_auth_method = localFormData.mongo_auth_method || settings.mongo_auth_method;
    const mongo_aws_access_key = localFormData.mongo_aws_access_key || settings.mongo_aws_access_key;
    const mongo_aws_secret_key = localFormData.mongo_aws_secret_key || settings.mongo_aws_secret_key;
    const mongo_aws_session_token = localFormData.mongo_aws_session_token || settings.mongo_aws_session_token;
    const mongo_oidc_token = localFormData.mongo_oidc_token || settings.mongo_oidc_token;

    if (!mongo_uri) {
      setMongoTestResult({ success: false, message: "MongoDB URI is required to test." });
      return;
    }
    setIsTesting(true);
    setMongoTestResult(null);
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
          mongo_oidc_token
        }),
      });
      const dbData = await dbRes.json();
      if (dbRes.ok && dbData.success) {
        setAvailableDbs(dbData.databases || []);
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
          mongo_create_if_not_exists: localFormData.mongo_create_if_not_exists || settings.mongo_create_if_not_exists
        }),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setMongoTestResult({ 
          success: true, 
          exists: resData.exists,
          message: resData.message || "MongoDB connection successful!" 
        });
      } else {
        setMongoTestResult({ success: false, message: resData.error || "MongoDB connection failed" });
      }
    } catch (e: any) {
      setMongoTestResult({ success: false, message: e.message || "Network error occurred testing MongoDB connection." });
    } finally {
      setIsTesting(false);
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
        // Optionally reload the page after a short delay
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
        const response = await authorizedFetch("/api/jira/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jira_key: epic.jira_key,
            jira_base_url,
            jira_api_version: localFormData.jira_api_version || settings.jira_api_version || "3",
            jira_api_token,
          }),
        });
        const resData = await response.json();
        if (!response.ok || !resData.success) throw new Error(resData.error || "Failed to fetch Jira data");
        const issue = resData.data;
        const fields = issue.fields;
        const names = issue.names;
        let targetStartKey = "";
        let targetEndKey = "";
        let teamKey = "";
        Object.entries(names as Record<string, string>).forEach(([key, name]) => {
          if (name === "Target start") targetStartKey = key;
          if (name === "Target end") targetEndKey = key;
          if (name === "Team") teamKey = key;
        });

        const updates: Partial<Epic> = {};
        if (fields.summary) updates.name = fields.summary;
        if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
          updates.effort_md = Math.round(fields.timeestimate / 28800);
        }
        if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
        if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

        if (teamKey && fields[teamKey]) {
          const teamField = fields[teamKey];
          const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
          const jiraTeamName = teamField.name || "";
          const matchedTeam = data.teams.find(t =>
              (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
              t.name === jiraTeamId ||
              (jiraTeamName && t.name === jiraTeamName)
          );
          if (matchedTeam) updates.team_id = matchedTeam.id;
        }
        updateEpic(epic.id, updates);
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
        const fields = issue.fields;
        const names = resData.data.names || {};
        let targetStartKey = "";
        let targetEndKey = "";
        let teamKey = "";

        Object.entries(names as Record<string, string>).forEach(([key, name]) => {
          if (name === "Target start") targetStartKey = key;
          if (name === "Target end") targetEndKey = key;
          if (name === "Team") teamKey = key;
        });

        const updates: Partial<Epic> = {};
        if (fields.summary) updates.name = fields.summary;
        if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
          updates.effort_md = Math.round(fields.timeestimate / 28800);
        }
        if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
        if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

        if (teamKey && fields[teamKey]) {
          const teamField = fields[teamKey];
          const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
          const jiraTeamName = teamField.name || "";
          const matchedTeam = data.teams.find(t =>
              (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
              t.name === jiraTeamId ||
              (jiraTeamName && t.name === jiraTeamName)
          );
          if (matchedTeam) updates.team_id = matchedTeam.id;
        }

        const existingEpic = data.epics.find((e) => e.jira_key === jiraKey);
        try {
          if (existingEpic) {
            updateEpic(existingEpic.id, updates);
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

  if (!data) return <div className={styles.pageContainer}>Loading...</div>;

  return (
    <div className={styles.pageContainer} style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className={styles.header}>
        <h1>Settings</h1>
      </div>

      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #374151', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab("general")}
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
          onClick={() => setActiveTab("mongo")}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            color: activeTab === "mongo" ? '#60a5fa' : '#9ca3af',
            borderBottom: activeTab === "mongo" ? '2px solid #60a5fa' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: activeTab === "mongo" ? 'bold' : 'normal',
          }}
        >
          MongoDB Persistence
        </button>
        <button
          onClick={() => setActiveTab("jira")}
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {activeTab === "mongo" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              MongoDB URI:
              <input
                type="text"
                placeholder={localFormData.mongo_auth_method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
                value={localFormData.mongo_uri || ""}
                onChange={(e) => setFormData({ ...localFormData, mongo_uri: e.target.value })}
                onBlur={() => onUpdateSettings({ mongo_uri: localFormData.mongo_uri })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
                  Access Key ID:
                  <input
                    type="text"
                    value={localFormData.mongo_aws_access_key || ""}
                    onChange={(e) => setFormData({ ...localFormData, mongo_aws_access_key: e.target.value })}
                    onBlur={() => onUpdateSettings({ mongo_aws_access_key: localFormData.mongo_aws_access_key })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
                  Secret Access Key:
                  <input
                    type="password"
                    value={localFormData.mongo_aws_secret_key || ""}
                    onChange={(e) => setFormData({ ...localFormData, mongo_aws_secret_key: e.target.value })}
                    onBlur={() => onUpdateSettings({ mongo_aws_secret_key: localFormData.mongo_aws_secret_key })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
                  Session Token (Optional):
                  <input
                    type="password"
                    value={localFormData.mongo_aws_session_token || ""}
                    onChange={(e) => setFormData({ ...localFormData, mongo_aws_session_token: e.target.value })}
                    onBlur={() => onUpdateSettings({ mongo_aws_session_token: localFormData.mongo_aws_session_token })}
                  />
                </label>
              </div>
            )}

            {localFormData.mongo_auth_method === 'oidc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration</div>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <button
              type="button"
              className="btn-primary"
              onClick={handleTestConnection}
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
          </>
        )}

        {activeTab === "jira" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              Jira Base URL:
              <input
                type="url"
                placeholder="https://yourdomain.atlassian.net"
                value={localFormData.jira_base_url || ""}
                onChange={(e) => setFormData({ ...localFormData, jira_base_url: e.target.value })}
                onBlur={() => onUpdateSettings({ jira_base_url: localFormData.jira_base_url })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />
            
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
              Import & Sync Epics
            </h3>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />
            
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
              Customer Issue Tracking
            </h3>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              New JQL:
              <input
                type="text"
                placeholder="status = 'New'"
                value={localFormData.customer_jql_new || ""}
                onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...localFormData, customer_jql_new: val });
                    onUpdateSettings({ customer_jql_new: val });
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              In-Progress JQL:
              <input
                type="text"
                placeholder="status = 'In Progress'"
                value={localFormData.customer_jql_in_progress || ""}
                onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...localFormData, customer_jql_in_progress: val });
                    onUpdateSettings({ customer_jql_in_progress: val });
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              Noop JQL:
              <input
                type="text"
                placeholder="status = 'Closed'"
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

        {activeTab === "general" && (
          <>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb", borderBottom: "1px solid #374151", paddingBottom: "4px" }}>
              Time
            </h3>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
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
      </div>
    </div>
  );
};
