import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Issue } from '@valuestream/shared-types';
import { authorizedFetch } from "../../utils/api";
import { generateId } from '../../utils/security';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';
import { parseJiraIssue } from "../../utils/businessLogic";
import styles from '../List.module.css';
import type { SettingsTabWithDataProps } from './types';

export const JiraSettings: React.FC<SettingsTabWithDataProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
  settings,
  data,
  updateIssue,
  addIssue,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get("subtab") || "common";

  const [isTesting, setIsTesting] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [importSyncResult, setImportSyncResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [importJql, setImportJql] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");

  const setSubTab = (subtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subtab", subtab);
      return newParams;
    });
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
          jira: {
            base_url: jira.base_url,
            api_token: jira.api_token,
            api_version: jira.api_version,
          }
        }),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setJiraTestResult({ success: true, message: resData.message || "Connection successful!" });
      } else {
        setJiraTestResult({ success: false, message: resData.error || "Connection failed" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error occurred testing connection.";
      setJiraTestResult({ success: false, message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllFromJira = async () => {
    if (!data) return;
    const issuesWithKeys = (data.issues || []).filter(e => e.jira_key && e.jira_key !== "TBD");
    if (issuesWithKeys.length === 0) {
      setImportSyncResult({ success: true, message: "No issues with Jira keys found to sync." });
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

    // Batch via /api/jira/search with `key in (...)` — chunked at 50 keys per call
    // to stay well under JQL length limits and the server's maxResults: 100 cap.
    const CHUNK_SIZE = 50;
    const fetchedByKey = new Map<string, Record<string, unknown>>();
    const chunkCount = Math.ceil(issuesWithKeys.length / CHUNK_SIZE);

    for (let c = 0; c < chunkCount; c++) {
      const chunk = issuesWithKeys.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
      const keyList = chunk.map(e => e.jira_key).join(", ");
      setSyncProgress(`Fetching ${c * CHUNK_SIZE + 1}-${c * CHUNK_SIZE + chunk.length} of ${issuesWithKeys.length}…`);
      try {
        const response = await authorizedFetch("/api/jira/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jql: `key in (${keyList})`,
            jira: {
              base_url: jira.base_url,
              api_version: jira.api_version,
              api_token: jira.api_token,
            }
          }),
        });
        const resData = await response.json();
        if (!response.ok || !resData.success) throw new Error(resData.error || "Failed to fetch Jira data");
        const names = resData.data?.names || {};
        for (const issue of resData.data?.issues || []) {
          // Search response carries `names` at the top level; parseJiraIssue
          // expects it per-issue (matching the single-issue endpoint shape).
          fetchedByKey.set(issue.key, { ...issue, names });
        }
      } catch (err: unknown) {
        console.error(`Error fetching chunk ${c + 1}/${chunkCount}:`, err);
        // Whole chunk failed → mark each issue in chunk as failed
        failCount += chunk.length;
      }
    }

    for (let i = 0; i < issuesWithKeys.length; i++) {
      const issue = issuesWithKeys[i];
      const issueData = fetchedByKey.get(issue.jira_key);
      if (!issueData) continue; // already counted as failed above
      setSyncProgress(`Updating ${i + 1}/${issuesWithKeys.length}: ${issue.jira_key}`);
      try {
        const updates = parseJiraIssue(issueData, data.teams);
        await updateIssue(issue.id, updates, true);
        successCount++;
      } catch (err: unknown) {
        console.error(`Error updating ${issue.jira_key}:`, err);
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
      const finalJql = importJql.toLowerCase().includes("issuetype") ? importJql : `(${importJql}) AND issuetype = Issue`;
      setImportProgress("Fetching issues...");
      const response = await authorizedFetch("/api/jira/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: finalJql,
          jira: {
            base_url: jira.base_url,
            api_version: jira.api_version,
            api_token: jira.api_token,
          }
        }),
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) throw new Error(resData.error || "Failed to fetch Jira data");

      const issues = resData.data.issues || [];
      const names = resData.data.names || {};
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

        // Search response carries `names` at the top level; inject so parseJiraIssue
        // can resolve custom-field IDs (target_start, target_end, team).
        const updates = parseJiraIssue({ ...issue, names }, data.teams);

        const existingIssue = (data.issues || []).find((e) => e.jira_key === jiraKey);
        try {
          if (existingIssue) {
            await updateIssue(existingIssue.id, updates, true);
            updateCount++;
          } else if (addIssue) {
            const newId = generateId('e');
            const newIssue: Issue = {
              id: newId,
              jira_key: jiraKey,
              team_id: updates.team_id || (data.teams.length > 0 ? data.teams[0].id : ""),
              effort_md: updates.effort_md || 0,
              name: updates.name,
              target_start: updates.target_start,
              target_end: updates.target_end,
            };
            addIssue(newIssue);
            createCount++;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          successCount++;
        } catch (err: unknown) {
          console.error(`Error processing ${jiraKey}:`, err);
          failCount++;
        }
      }
      setImportSyncResult({ success: failCount === 0, message: `Import complete. Created ${createCount}, Updated ${updateCount}, Failed ${failCount}.` });
    } catch (err: unknown) {
      console.error("Import error:", err);
      const msg = err instanceof Error ? err.message : "Import failed.";
      setImportSyncResult({ success: false, message: msg });
    } finally {
      setIsImporting(false);
      setImportProgress("");
    }
  };

  return (
    <div className={styles.tabContainer}>
      <nav className={styles.tabHeader}>
        <button
          onClick={() => setSubTab("common")}
          className={`${styles.tabButton} ${activeSubTab === "common" ? styles.activeTab : ''}`}
        >
          General
        </button>
        <button
          onClick={() => setSubTab("work-items")}
          className={`${styles.tabButton} ${activeSubTab === "work-items" ? styles.activeTab : ''}`}
        >
          Work Items
        </button>
        <button
          onClick={() => setSubTab("customer")}
          className={`${styles.tabButton} ${activeSubTab === "customer" ? styles.activeTab : ''}`}
        >
          Customer
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeSubTab === "common" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Jira Base URL:
              <input
                type="url"
                placeholder="https://yourdomain.atlassian.net"
                value={localFormData.jira.base_url || ""}
                onChange={(e) => updateFormData('jira.base_url', e.target.value)}
                onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, base_url: localFormData.jira.base_url } })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
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

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              <span>Jira Personal Access Token (PAT):<ScopeIndicator path="jira.api_token" /></span>
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
                disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings?.jira?.base_url) && (!localFormData.jira.api_token && !settings?.jira?.api_token))}
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
                  backgroundColor: jiraTestResult.success ? "var(--status-success-bg)" : "var(--status-danger-bg)",
                  color: jiraTestResult.success ? "var(--status-success)" : "var(--status-danger-text)",
                  border: `1px solid ${jiraTestResult.success ? "var(--status-success)" : "var(--status-danger-border)"}`,
                  marginTop: "8px",
                }}
              >
                {jiraTestResult.message}
              </div>
            )}
          </div>
        )}

        {activeSubTab === "work-items" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Import JQL Query:
              <input
                type="text"
                placeholder="project = PROJ AND issuetype = Issue"
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
                disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings?.jira?.base_url) && (!localFormData.jira.api_token && !settings?.jira?.api_token)) || !importJql.trim()}
              >
                {isImporting ? importProgress : "Import from Jira"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSyncAllFromJira}
                style={{ alignSelf: "flex-start" }}
                disabled={isTesting || isSyncing || isImporting || ((!localFormData.jira.base_url && !settings?.jira?.base_url) && (!localFormData.jira.api_token && !settings?.jira?.api_token))}
              >
                {isSyncing ? syncProgress : "Sync Issues from Jira"}
              </button>
            </div>

            {importSyncResult && (
              <div
                style={{
                  padding: "10px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  backgroundColor: importSyncResult.success ? "var(--status-success-bg)" : "var(--status-danger-bg)",
                  color: importSyncResult.success ? "var(--status-success)" : "var(--status-danger-text)",
                  border: `1px solid ${importSyncResult.success ? "var(--status-success)" : "var(--status-danger-border)"}`,
                  marginTop: "8px",
                }}
              >
                {importSyncResult.message}
              </div>
            )}
          </div>
        )}

        {activeSubTab === "customer" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 8px 0" }}>
              Use <code>{"{{CUSTOMER_ID}}"}</code> as a placeholder for the customer ID.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              New / Untriaged JQL:
              <input
                type="text"
                placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'New'"
                value={localFormData.jira.customer?.jql_new || ""}
                onChange={(e) => updateFormData('jira.customer.jql_new', e.target.value)}
                onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer: { ...localFormData.jira.customer, jql_new: localFormData.jira.customer?.jql_new } } })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Active Work JQL:
              <input
                type="text"
                placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'In Progress'"
                value={localFormData.jira.customer?.jql_in_progress || ""}
                onChange={(e) => updateFormData('jira.customer.jql_in_progress', e.target.value)}
                onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer: { ...localFormData.jira.customer, jql_in_progress: localFormData.jira.customer?.jql_in_progress } } })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Blocked / Pending JQL (Customer or 3rd Party):
              <input
                type="text"
                placeholder="labels = '{{CUSTOMER_ID}}' AND status = 'Blocked'"
                value={localFormData.jira.customer?.jql_noop || ""}
                onChange={(e) => updateFormData('jira.customer.jql_noop', e.target.value)}
                onBlur={() => onUpdateSettings({ jira: { ...localFormData.jira, customer: { ...localFormData.jira.customer, jql_noop: localFormData.jira.customer?.jql_noop } } })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
