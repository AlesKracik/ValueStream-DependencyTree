import React, { useState, useEffect } from "react";
import type { Settings, DashboardData, Epic } from "../../types/models";

interface SettingsModalProps {
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  data: DashboardData;
  updateEpic: (id: string, updates: Partial<Epic>) => void;
  addEpic?: (epic: Epic) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  settings,
  onUpdateSettings,
  data,
  updateEpic,
  addEpic,
}) => {
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [mongoTestResult, setMongoTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [importSyncResult, setImportSyncResult] = useState<{ success: boolean; message: string; } | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");

  const [importJql, setImportJql] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"general" | "mongo" | "jira">("general");

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
        customer_jql_new: settings.customer_jql_new || "",
        customer_jql_in_progress: settings.customer_jql_in_progress || "",
        customer_jql_noop: settings.customer_jql_noop || "",
        fiscal_year_start_month: settings.fiscal_year_start_month || 1,
        sprint_duration_days: settings.sprint_duration_days || 14,
      });
    }
  }, [settings]);

  const handleTestConnection = async () => {
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setJiraTestResult({
        success: false,
        message: "Base URL and PAT are required to test.",
      });
      return;
    }

    setIsTesting(true);
    setJiraTestResult(null);

    try {
      const response = await fetch("/api/jira/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jira_base_url: formData.jira_base_url,
          jira_api_token: formData.jira_api_token,
          jira_api_version: formData.jira_api_version || "3",
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setJiraTestResult({
          success: true,
          message: data.message || "Connection successful!",
        });
      } else {
        setJiraTestResult({
          success: false,
          message: data.error || "Connection failed",
        });
      }
    } catch (e: any) {
      setJiraTestResult({
        success: false,
        message: e.message || "Network error occurred testing connection.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllFromJira = async () => {
    const epicsWithKeys = data.epics.filter(
      (e) => e.jira_key && e.jira_key !== "TBD",
    );

    if (epicsWithKeys.length === 0) {
      setImportSyncResult({
        success: true,
        message: "No epics with Jira keys found to sync.",
      });
      return;
    }
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setImportSyncResult({
        success: false,
        message: "Base URL and PAT are required to sync.",
      });
      return;
    }

    setIsSyncing(true);
    setImportSyncResult(null);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < epicsWithKeys.length; i++) {
      const epic = epicsWithKeys[i];
      setSyncProgress(
        `Syncing ${i + 1}/${epicsWithKeys.length}: ${epic.jira_key}`,
      );

      try {
        const response = await fetch("/api/jira/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jira_key: epic.jira_key,
            jira_base_url: formData.jira_base_url,
            jira_api_version: formData.jira_api_version || "3",
            jira_api_token: formData.jira_api_token,
          }),
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Failed to fetch Jira data");
        }

        const issue = resData.data;
        const fields = issue.fields;
        const names = issue.names;

        let targetStartKey = "";
        let targetEndKey = "";
        let teamKey = "";

        Object.entries(names as Record<string, string>).forEach(
          ([key, name]) => {
            if (name === "Target start") targetStartKey = key;
            if (name === "Target end") targetEndKey = key;
            if (name === "Team") teamKey = key;
          },
        );

        const updates: Partial<Epic> = {};
        if (fields.summary) updates.name = fields.summary;
        if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
          updates.effort_md = Math.round(fields.timeestimate / 28800);
        }

        if (targetStartKey && fields[targetStartKey])
          updates.target_start = fields[targetStartKey];
        if (targetEndKey && fields[targetEndKey])
          updates.target_end = fields[targetEndKey];

        if (teamKey && fields[teamKey]) {
          const teamField = fields[teamKey];
          const jiraTeamId = (
            teamField.id ||
            teamField.value ||
            teamField.toString()
          ).toString();
          const jiraTeamName = teamField.name || "";

          const matchedTeam = data.teams.find(
            (t) =>
              (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
              t.name === jiraTeamId ||
              (jiraTeamName && t.name === jiraTeamName),
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
    setImportSyncResult({
      success: failCount === 0,
      message: `Sync complete. ${successCount} succeeded, ${failCount} failed.`,
    });
  };

  const handleImportFromJira = async () => {
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setTestResult({
        success: false,
        message: "Base URL and PAT are required to import.",
      });
      return;
    }
    if (!importJql.trim()) {
      setTestResult({
        success: false,
        message: "JQL query is required to import.",
      });
      return;
    }

    setIsImporting(true);
    setTestResult(null);
    let successCount = 0;
    let failCount = 0;
    let createCount = 0;
    let updateCount = 0;

    try {
      const finalJql = importJql.toLowerCase().includes("issuetype")
        ? importJql
        : `(${importJql}) AND issuetype = Epic`;

      setImportProgress("Fetching issues...");
      const response = await fetch("/api/jira/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: finalJql,
          jira_base_url: formData.jira_base_url,
          jira_api_version: formData.jira_api_version || "3",
          jira_api_token: formData.jira_api_token,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Failed to fetch Jira data");
      }

      const issues = resData.data.issues || [];
      if (issues.length === 0) {
        setImportSyncResult({
          success: true,
          message: "No issues found for the provided JQL.",
        });
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

        Object.entries(names as Record<string, string>).forEach(
          ([key, name]) => {
            if (name === "Target start") targetStartKey = key;
            if (name === "Target end") targetEndKey = key;
            if (name === "Team") teamKey = key;
          },
        );

        const updates: Partial<Epic> = {};
        if (fields.summary) updates.name = fields.summary;
        if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
          updates.effort_md = Math.round(fields.timeestimate / 28800);
        }

        if (targetStartKey && fields[targetStartKey])
          updates.target_start = fields[targetStartKey];
        if (targetEndKey && fields[targetEndKey])
          updates.target_end = fields[targetEndKey];

        if (teamKey && fields[teamKey]) {
          const teamField = fields[teamKey];
          const jiraTeamId = (
            teamField.id ||
            teamField.value ||
            teamField.toString()
          ).toString();
          const jiraTeamName = teamField.name || "";

          const matchedTeam = data.teams.find(
            (t) =>
              (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
              t.name === jiraTeamId ||
              (jiraTeamName && t.name === jiraTeamName),
          );
          if (matchedTeam) updates.team_id = matchedTeam.id;
        }

        const existingEpic = data.epics.find((e) => e.jira_key === jiraKey);

        try {
          if (existingEpic) {
            updateEpic(existingEpic.id, updates);
            updateCount++;
          } else if (addEpic) {
            const newId = `e${Date.now()}_${i}`;
            const newEpic: Epic = {
              id: newId,
              jira_key: jiraKey,
              team_id:
                updates.team_id ||
                (data.teams.length > 0 ? data.teams[0].id : ""),
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

      setImportSyncResult({
        success: failCount === 0,
        message: `Import complete. Created ${createCount}, Updated ${updateCount}, Failed ${failCount}.`,
      });
    } catch (err: any) {
      console.error("Import error:", err);
      setImportSyncResult({
        success: false,
        message: err.message || "Import failed.",
      });
    } finally {
      setIsImporting(false);
      setImportProgress("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      jira_base_url: formData.jira_base_url,
      jira_api_version: formData.jira_api_version as "2" | "3",
      jira_api_token: formData.jira_api_token,
      mongo_uri: formData.mongo_uri,
      mongo_db: formData.mongo_db,
      mongo_auth_method: formData.mongo_auth_method,
      mongo_aws_access_key: formData.mongo_aws_access_key,
      mongo_aws_secret_key: formData.mongo_aws_secret_key,
      mongo_aws_session_token: formData.mongo_aws_session_token,
      mongo_oidc_token: formData.mongo_oidc_token,
      customer_jql_new: formData.customer_jql_new,
      customer_jql_in_progress: formData.customer_jql_in_progress,
      customer_jql_noop: formData.customer_jql_noop,
      fiscal_year_start_month: formData.fiscal_year_start_month,
      sprint_duration_days: formData.sprint_duration_days,
    });
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={styles.formContainer}>
          <h2 style={styles.title}>Global Settings</h2>

          <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #374151', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => { setActiveTab("general"); setMongoTestResult(null); setJiraTestResult(null); setImportSyncResult(null); }}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 12px',
                color: activeTab === "general" ? '#60a5fa' : '#9ca3af',
                borderBottom: activeTab === "general" ? '2px solid #60a5fa' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === "general" ? 'bold' : 'normal',
              }}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("mongo"); setMongoTestResult(null); setJiraTestResult(null); setImportSyncResult(null); }}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 12px',
                color: activeTab === "mongo" ? '#60a5fa' : '#9ca3af',
                borderBottom: activeTab === "mongo" ? '2px solid #60a5fa' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === "mongo" ? 'bold' : 'normal',
              }}
            >
              Mongo
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("jira"); setMongoTestResult(null); setJiraTestResult(null); setImportSyncResult(null); }}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 12px',
                color: activeTab === "jira" ? '#60a5fa' : '#9ca3af',
                borderBottom: activeTab === "jira" ? '2px solid #60a5fa' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === "jira" ? 'bold' : 'normal',
              }}
            >
              Jira
            </button>
          </div>

          {activeTab === "jira" && (
            <>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb", borderBottom: "1px solid #374151", paddingBottom: "4px" }}>
                Jira Integration
              </h3>
              <label style={styles.label}>
                Jira Base URL:
            <input
              
              type="url"
              placeholder="https://yourdomain.atlassian.net"
              value={formData.jira_base_url || ""}
              onChange={(e) =>
                setFormData({ ...formData, jira_base_url: e.target.value })
              }
              required
            />
          </label>

          <label style={styles.label}>
            Jira API Version:
            <select
              
              value={formData.jira_api_version || "3"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  jira_api_version: e.target.value as "2" | "3",
                })
              }
            >
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>

          <label style={styles.label}>
            Jira Personal Access Token (PAT):
            <input
              
              type="password"
              placeholder="Your Jira PAT"
              value={formData.jira_api_token || ""}
              onChange={(e) =>
                setFormData({ ...formData, jira_api_token: e.target.value })
              }
            />
          </label>

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleTestConnection}
              disabled={
                isTesting ||
                isSyncing ||
                isImporting ||
                (!formData.jira_base_url && !formData.jira_api_token)
              }
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
                backgroundColor: jiraTestResult.success
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
                color: jiraTestResult.success ? "#34d399" : "#f87171",
                border: `1px solid ${jiraTestResult.success ? "#059669" : "#b91c1c"}`,
                marginTop: "8px",
              }}
            >
              {jiraTestResult.message}
            </div>
          )}

          <hr
            style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }}
          />
          <h3
            style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}
          >
            Import & Sync Epics
          </h3>
          <label style={styles.label}>
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
              style={{
                alignSelf: "flex-start",
              }}
              disabled={
                isTesting ||
                isSyncing ||
                isImporting ||
                (!formData.jira_base_url && !formData.jira_api_token) ||
                !importJql.trim()
              }
            >
              {isImporting ? importProgress : "Import from Jira"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSyncAllFromJira}
              style={{
                alignSelf: "flex-start",
              }}
              disabled={
                isTesting ||
                isSyncing ||
                isImporting ||
                (!formData.jira_base_url && !formData.jira_api_token)
              }
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
                backgroundColor: importSyncResult.success
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
                color: importSyncResult.success ? "#34d399" : "#f87171",
                border: `1px solid ${importSyncResult.success ? "#059669" : "#b91c1c"}`,
                marginTop: "8px",
              }}
            >
              {importSyncResult.message}
            </div>
          )}

          <hr
            style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }}
          />
          <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
            Customer Issue Tracking
          </h3>
          <label style={styles.label}>
            New JQL:
            <input
              
              type="text"
              placeholder="status = 'New'"
              value={formData.customer_jql_new || ""}
              onChange={(e) =>
                setFormData({ ...formData, customer_jql_new: e.target.value })
              }
            />
          </label>
          <label style={styles.label}>
            In-Progress JQL:
            <input
              
              type="text"
              placeholder="status = 'In Progress'"
              value={formData.customer_jql_in_progress || ""}
              onChange={(e) =>
                setFormData({ ...formData, customer_jql_in_progress: e.target.value })
              }
            />
          </label>
          <label style={styles.label}>
            Noop JQL:
            <input
              
              type="text"
              placeholder="status = 'Closed'"
              value={formData.customer_jql_noop || ""}
              onChange={(e) =>
                setFormData({ ...formData, customer_jql_noop: e.target.value })
              }
            />
          </label>
          </>
          )}

          {activeTab === "general" && (
            <>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb", borderBottom: "1px solid #374151", paddingBottom: "4px" }}>
                Time
              </h3>
              <label style={styles.label}>
                Fiscal Year Start Month:
                <select
                  value={formData.fiscal_year_start_month || 1}
                  onChange={(e) =>
                    setFormData({ ...formData, fiscal_year_start_month: parseInt(e.target.value) })
                  }
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

              <label style={styles.label}>
                Sprint Duration (Days):
                <span style={{ fontSize: "12px", color: "#9ca3af", marginTop: "-2px", marginBottom: "4px" }}>
                  Defines the default end date when creating new sprints. Does not affect existing sprints.
                </span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.sprint_duration_days || 14}
                  onChange={(e) =>
                    setFormData({ ...formData, sprint_duration_days: parseInt(e.target.value) })
                  }
                />
              </label>
            </>
          )}

          {activeTab === "mongo" && (
            <>
          <h3 style={{ margin: "24px 0 4px 0", fontSize: "15px", color: "#e5e7eb", borderBottom: "1px solid #374151", paddingBottom: "4px" }}>
            MongoDB Persistence
          </h3>
          <label style={styles.label}>
            Authentication Method:
            <select
              value={formData.mongo_auth_method || "scram"}
              onChange={(e) => setFormData({ ...formData, mongo_auth_method: e.target.value as any })}
            >
              <option value="scram">SCRAM (URI-based)</option>
              <option value="aws">AWS IAM</option>
              <option value="oidc">OIDC (Azure/Okta)</option>
            </select>
          </label>
          <label style={styles.label}>
            MongoDB URI:
            <input
              type="text"
              placeholder={formData.mongo_auth_method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
              value={formData.mongo_uri || ""}
              onChange={(e) =>
                setFormData({ ...formData, mongo_uri: e.target.value })
              }
            />
          </label>

          <label style={styles.label}>
            MongoDB Database Name:
            <input
              type="text"
              placeholder="valuestream"
              value={formData.mongo_db || ""}
              onChange={(e) =>
                setFormData({ ...formData, mongo_db: e.target.value })
              }
            />
          </label>

          {formData.mongo_auth_method === 'aws' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', marginTop: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>AWS IAM Credentials</div>
              <label style={styles.label}>
                Access Key ID:
                <input
                  type="text"
                  value={formData.mongo_aws_access_key || ""}
                  onChange={(e) => setFormData({ ...formData, mongo_aws_access_key: e.target.value })}
                />
              </label>
              <label style={styles.label}>
                Secret Access Key:
                <input
                  type="password"
                  value={formData.mongo_aws_secret_key || ""}
                  onChange={(e) => setFormData({ ...formData, mongo_aws_secret_key: e.target.value })}
                />
              </label>
              <label style={styles.label}>
                Session Token (Optional):
                <input
                  type="password"
                  value={formData.mongo_aws_session_token || ""}
                  onChange={(e) => setFormData({ ...formData, mongo_aws_session_token: e.target.value })}
                />
              </label>
            </div>
          )}

          {formData.mongo_auth_method === 'oidc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid #374151', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', marginTop: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' }}>OIDC Configuration</div>
              <label style={styles.label}>
                Access Token:
                <input
                  type="password"
                  placeholder="eyJhbG..."
                  value={formData.mongo_oidc_token || ""}
                  onChange={(e) => setFormData({ ...formData, mongo_oidc_token: e.target.value })}
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
                if (!formData.mongo_uri) {
                    setMongoTestResult({
                        success: false,
                        message: "MongoDB URI is required to test.",
                    });
                    return;
                }
                setIsTesting(true);
                setMongoTestResult(null);
                try {
                    const response = await fetch("/api/mongo/test", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            mongo_uri: formData.mongo_uri,
                            mongo_db: formData.mongo_db,
                            mongo_auth_method: formData.mongo_auth_method,
                            mongo_aws_access_key: formData.mongo_aws_access_key,
                            mongo_aws_secret_key: formData.mongo_aws_secret_key,
                            mongo_aws_session_token: formData.mongo_aws_session_token,
                            mongo_oidc_token: formData.mongo_oidc_token
                        }),
                    });
                    const data = await response.json();
                    if (response.ok && data.success) {
                        setMongoTestResult({
                            success: true,
                            message: data.message || "MongoDB connection successful!",
                        });
                    } else {
                        setMongoTestResult({
                            success: false,
                            message: data.error || "MongoDB connection failed",
                        });
                    }
                } catch (e: any) {
                    setMongoTestResult({
                        success: false,
                        message: e.message || "Network error occurred testing MongoDB connection.",
                    });
                } finally {
                    setIsTesting(false);
                }
            }}
            className="btn-primary"
            style={{
                alignSelf: "flex-start",
                marginTop: "12px"
            }}
            disabled={isTesting || !formData.mongo_uri}
          >
            {isTesting ? "Testing Mongo..." : "Test Mongo Connection"}
          </button>

          {mongoTestResult && (
            <div
              style={{
                padding: "10px",
                borderRadius: "4px",
                fontSize: "14px",
                backgroundColor: mongoTestResult.success
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
                color: mongoTestResult.success ? "#34d399" : "#f87171",
                border: `1px solid ${mongoTestResult.success ? "#059669" : "#b91c1c"}`,
                marginTop: "8px",
              }}
            >
              {mongoTestResult.message}
            </div>
          )}
          </>
          )}

          <div
            style={{
              ...styles.mainActionsGroup,
              marginTop: "8px",
              paddingTop: "16px",
              borderTop: "1px solid #374151",
            }}
          >
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
    padding: "24px",
    width: "400px",
    maxWidth: "90%",
    color: "#f9fafb",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  title: {
    marginTop: 0,
    marginBottom: "20px",
    fontSize: "18px",
    borderBottom: "1px solid #374151",
    paddingBottom: "10px",
  },
  formContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "14px",
    color: "#d1d5db",
  },
  mainActionsGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "24px",
    borderTop: "1px solid #374151",
    paddingTop: "16px",
  },
  mainActionsGroup: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
  },
};
