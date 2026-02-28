import React, { useState, useEffect } from "react";
import type { Settings, DashboardData, Epic } from "../types/models";
import styles from './List.module.css';

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
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [importJql, setImportJql] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"mongo" | "jira">("mongo");

  useEffect(() => {
    if (settings) {
      setFormData({
        jira_base_url: settings.jira_base_url,
        jira_api_version: settings.jira_api_version || "3",
        jira_api_token: settings.jira_api_token || "",
        mongo_uri: settings.mongo_uri || "",
        mongo_db: settings.mongo_db || "",
      });
    }
  }, [settings]);

  const handleTestConnection = async () => {
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setTestResult({ success: false, message: "Base URL and PAT are required to test." });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
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
      const resData = await response.json();
      if (response.ok && resData.success) {
        setTestResult({ success: true, message: resData.message || "Connection successful!" });
      } else {
        setTestResult({ success: false, message: resData.error || "Connection failed" });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Network error occurred testing connection." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportMongo = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/mongo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        // Trigger browser download
        const blob = new Blob([JSON.stringify(resData.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mockData.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setTestResult({ success: true, message: "Export successful! mockData.json download started." });
      } else {
        setTestResult({ success: false, message: resData.error || "Export failed" });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Network error occurred during export." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllFromJira = async () => {
    if (!data) return;
    const epicsWithKeys = data.epics.filter(e => e.jira_key && e.jira_key !== "TBD");
    if (epicsWithKeys.length === 0) {
      setTestResult({ success: true, message: "No epics with Jira keys found to sync." });
      return;
    }
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setTestResult({ success: false, message: "Base URL and PAT are required to sync." });
      return;
    }
    setIsSyncing(true);
    setTestResult(null);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < epicsWithKeys.length; i++) {
      const epic = epicsWithKeys[i];
      setSyncProgress(`Syncing ${i + 1}/${epicsWithKeys.length}: ${epic.jira_key}`);
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
          updates.remaining_md = Math.round(fields.timeestimate / 28800);
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
    setTestResult({ success: failCount === 0, message: `Sync complete. ${successCount} succeeded, ${failCount} failed.` });
  };

  const handleImportFromJira = async () => {
    if (!data) return;
    if (!formData.jira_base_url || !formData.jira_api_token) {
      setTestResult({ success: false, message: "Base URL and PAT are required to import." });
      return;
    }
    if (!importJql.trim()) {
      setTestResult({ success: false, message: "JQL query is required to import." });
      return;
    }

    setIsImporting(true);
    setTestResult(null);
    let successCount = 0;
    let failCount = 0;
    let createCount = 0;
    let updateCount = 0;

    try {
      const finalJql = importJql.toLowerCase().includes("issuetype") ? importJql : `(${importJql}) AND issuetype = Epic`;
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
      if (!response.ok || !resData.success) throw new Error(resData.error || "Failed to fetch Jira data");

      const issues = resData.data.issues || [];
      if (issues.length === 0) {
        setTestResult({ success: true, message: "No issues found for the provided JQL." });
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
          updates.remaining_md = Math.round(fields.timeestimate / 28800);
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
            const newId = `e${Date.now()}_${i}`;
            const newEpic: Epic = {
              id: newId,
              jira_key: jiraKey,
              team_id: updates.team_id || (data.teams.length > 0 ? data.teams[0].id : ""),
              remaining_md: updates.remaining_md || 0,
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
      setTestResult({ success: failCount === 0, message: `Import complete. Created ${createCount}, Updated ${updateCount}, Failed ${failCount}.` });
    } catch (err: any) {
      console.error("Import error:", err);
      setTestResult({ success: false, message: err.message || "Import failed." });
    } finally {
      setIsImporting(false);
      setImportProgress("");
    }
  };

  const handleSave = () => {
    onUpdateSettings({
      jira_base_url: formData.jira_base_url,
      jira_api_version: formData.jira_api_version as "2" | "3",
      jira_api_token: formData.jira_api_token,
      mongo_uri: formData.mongo_uri,
      mongo_db: formData.mongo_db,
    });
    // Visual feedback could be added here
  };

  if (!data) return <div className={styles.pageContainer}>Loading...</div>;

  return (
    <div className={styles.pageContainer} style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className={styles.header}>
        <h1>Settings</h1>
      </div>

      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #374151', marginBottom: '24px' }}>
        <button
          onClick={() => { setActiveTab("mongo"); setTestResult(null); }}
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
          onClick={() => { setActiveTab("jira"); setTestResult(null); }}
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
              MongoDB URI (Local SCRAM):
              <input
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                type="text"
                placeholder="mongodb://username:password@localhost:27017"
                value={formData.mongo_uri || ""}
                onChange={(e) => setFormData({ ...formData, mongo_uri: e.target.value })}
                onBlur={handleSave}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              MongoDB Database Name:
              <input
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                type="text"
                placeholder="valuestream"
                value={formData.mongo_db || ""}
                onChange={(e) => setFormData({ ...formData, mongo_db: e.target.value })}
                onBlur={handleSave}
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                  if (!formData.mongo_uri) {
                      setTestResult({ success: false, message: "MongoDB URI is required to test." });
                      return;
                  }
                  setIsTesting(true);
                  setTestResult(null);
                  try {
                      const response = await fetch("/api/mongo/test", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mongo_uri: formData.mongo_uri, mongo_db: formData.mongo_db }),
                      });
                      const resData = await response.json();
                      if (response.ok && resData.success) {
                          setTestResult({ success: true, message: resData.message || "MongoDB connection successful!" });
                      } else {
                          setTestResult({ success: false, message: resData.error || "MongoDB connection failed" });
                      }
                  } catch (e: any) {
                      setTestResult({ success: false, message: e.message || "Network error occurred testing MongoDB connection." });
                  } finally {
                      setIsTesting(false);
                  }
              }}
              style={{ padding: "8px 16px", backgroundColor: "#374151", border: "1px solid #4b5563", color: "#f9fafb", borderRadius: "4px", cursor: "pointer", fontWeight: 500, alignSelf: "flex-start", marginTop: "4px" }}
              disabled={isTesting || !formData.mongo_uri}
            >
              {isTesting ? "Testing Mongo..." : "Test Mongo Connection"}
            </button>

            <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />
            
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
              Export Data
            </h3>
            <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 0 8px 0" }}>
              Downloads current MongoDB content as mockData.json for local backup or sharing.
            </p>
            <button
              type="button"
              onClick={handleExportMongo}
              style={{ padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", border: "1px solid #2563eb", borderRadius: "4px", cursor: "pointer", fontWeight: 500, alignSelf: "flex-start" }}
              disabled={isTesting || !formData.mongo_uri}
            >
              {isTesting ? "Exporting..." : "Export to mockData.json"}
            </button>
          </>
        )}

        {activeTab === "jira" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              Jira Base URL:
              <input
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                type="url"
                placeholder="https://yourdomain.atlassian.net"
                value={formData.jira_base_url || ""}
                onChange={(e) => setFormData({ ...formData, jira_base_url: e.target.value })}
                onBlur={handleSave}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              Jira API Version:
              <select
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                value={formData.jira_api_version || "3"}
                onChange={(e) => {
                    setFormData({ ...formData, jira_api_version: e.target.value as "2" | "3" });
                }}
                onBlur={handleSave}
              >
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              Jira Personal Access Token (PAT):
              <input
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                type="password"
                placeholder="Your Jira PAT"
                value={formData.jira_api_token || ""}
                onChange={(e) => setFormData({ ...formData, jira_api_token: e.target.value })}
                onBlur={handleSave}
              />
            </label>

            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={handleTestConnection}
                style={{ padding: "8px 16px", backgroundColor: "#374151", border: "1px solid #4b5563", color: "#f9fafb", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}
                disabled={isTesting || isSyncing || isImporting || (!formData.jira_base_url && !formData.jira_api_token)}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={handleSyncAllFromJira}
                style={{ padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", border: "1px solid #2563eb", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}
                disabled={isTesting || isSyncing || isImporting || (!formData.jira_base_url && !formData.jira_api_token)}
              >
                {isSyncing ? syncProgress : "Sync Epics from Jira"}
              </button>
            </div>

            <hr style={{ borderColor: "#374151", width: "100%", margin: "16px 0 8px 0" }} />
            
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "#e5e7eb" }}>
              Import Epics via JQL
            </h3>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#d1d5db" }}>
              JQL Query:
              <input
                style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #4b5563", backgroundColor: "#111827", color: "#f9fafb", fontSize: "14px" }}
                type="text"
                placeholder="project = PROJ AND issuetype = Epic"
                value={importJql}
                onChange={(e) => setImportJql(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={handleImportFromJira}
              style={{ padding: "8px 16px", backgroundColor: "#10b981", color: "#fff", border: "1px solid #059669", borderRadius: "4px", cursor: "pointer", fontWeight: 500, alignSelf: "flex-start", marginTop: "4px" }}
              disabled={isTesting || isSyncing || isImporting || (!formData.jira_base_url && !formData.jira_api_token) || !importJql.trim()}
            >
              {isImporting ? importProgress : "Import from Jira"}
            </button>
          </>
        )}

        {testResult && (
          <div
            style={{
              padding: "10px",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: testResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
              color: testResult.success ? "#34d399" : "#f87171",
              border: `1px solid ${testResult.success ? "#059669" : "#b91c1c"}`,
              marginTop: "16px",
            }}
          >
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};
