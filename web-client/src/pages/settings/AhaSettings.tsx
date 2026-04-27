import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { WorkItem } from '@valuestream/shared-types';
import { authorizedFetch, importAhaFeatures, syncAhaFeature } from "../../utils/api";
import { generateId } from '../../utils/security';
import { parseAhaFeature } from '../../utils/businessLogic';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';
import styles from '../List.module.css';
import type { SettingsTabWithDataProps } from './types';

export const AhaSettings: React.FC<SettingsTabWithDataProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
  settings,
  data,
  updateWorkItem,
  addWorkItem,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get("subtab") || "general";

  const [isTesting, setIsTesting] = useState(false);
  const [ahaTestResult, setAhaTestResult] = useState<{ success: boolean; message: string; } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [importSyncResult, setImportSyncResult] = useState<{ success: boolean; message: string; } | null>(null);

  const setSubTab = (subtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subtab", subtab);
      return newParams;
    });
  };

  const handleAhaTestConnection = async () => {
    const { aha } = localFormData;

    if (!aha.subdomain || !aha.api_key) {
      setAhaTestResult({ success: false, message: "Subdomain and API Key are required to test." });
      return;
    }
    setIsTesting(true);
    setAhaTestResult(null);
    try {
      const response = await authorizedFetch("/api/aha/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aha: {
            subdomain: aha.subdomain,
            api_key: aha.api_key,
          }
        }),
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setAhaTestResult({ success: true, message: resData.message || "Connection successful!" });
      } else {
        setAhaTestResult({ success: false, message: resData.error || "Connection failed" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error occurred testing connection.";
      setAhaTestResult({ success: false, message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportFromAha = async () => {
    if (!data) return;
    const { aha } = localFormData;
    const workspace = (aha.workspace || "").trim();

    if (!aha.subdomain || !aha.api_key) {
      setImportSyncResult({ success: false, message: "Subdomain and API Key are required to import." });
      return;
    }
    if (!workspace) {
      setImportSyncResult({ success: false, message: "Workspace is required to import." });
      return;
    }

    setIsImporting(true);
    setImportSyncResult(null);
    setImportProgress("Fetching features from Aha!…");
    try {
      const features = await importAhaFeatures(workspace, { subdomain: aha.subdomain, api_key: aha.api_key });
      if (features.length === 0) {
        setImportSyncResult({ success: true, message: `No features found in workspace "${workspace}".` });
        return;
      }

      let createCount = 0;
      let updateCount = 0;
      let failCount = 0;

      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        setImportProgress(`Processing ${i + 1}/${features.length}: ${feature.reference_num}`);
        try {
          const parsed = parseAhaFeature(feature);
          const existing = (data.workItems || []).find(w => w.aha_reference?.reference_num === parsed.aha_reference.reference_num);
          if (existing) {
            await updateWorkItem(existing.id, {
              aha_reference: parsed.aha_reference,
              aha_synced_data: parsed.aha_synced_data,
            }, true);
            updateCount++;
          } else {
            const newWorkItem: WorkItem = {
              id: generateId('w'),
              name: parsed.aha_synced_data.name || feature.reference_num,
              status: 'Backlog',
              total_effort_mds: parsed.aha_synced_data.total_effort_mds || 0,
              score: parsed.aha_synced_data.score || 0,
              customer_targets: [],
              aha_reference: parsed.aha_reference,
              aha_synced_data: parsed.aha_synced_data,
            };
            addWorkItem(newWorkItem);
            createCount++;
          }
        } catch (err: unknown) {
          console.error(`Error processing ${feature.reference_num}:`, err);
          failCount++;
        }
      }

      setImportSyncResult({ success: failCount === 0, message: `Import complete. Created ${createCount}, updated ${updateCount}, failed ${failCount}.` });
    } catch (err: unknown) {
      console.error("Aha! import error:", err);
      const msg = err instanceof Error ? err.message : "Import failed.";
      setImportSyncResult({ success: false, message: msg });
    } finally {
      setIsImporting(false);
      setImportProgress("");
    }
  };

  const handleSyncAllFromAha = async () => {
    if (!data) return;
    const { aha } = localFormData;

    if (!aha.subdomain || !aha.api_key) {
      setImportSyncResult({ success: false, message: "Subdomain and API Key are required to sync." });
      return;
    }

    const workItemsWithRef = (data.workItems || []).filter(w => w.aha_reference?.reference_num);
    if (workItemsWithRef.length === 0) {
      setImportSyncResult({ success: true, message: "No work items with Aha! references found to sync." });
      return;
    }

    setIsSyncing(true);
    setImportSyncResult(null);
    let successCount = 0;
    let failCount = 0;

    // Sequential (concurrency 1) — simplest, well within Aha!'s rate limit.
    for (let i = 0; i < workItemsWithRef.length; i++) {
      const w = workItemsWithRef[i];
      const refNum = w.aha_reference!.reference_num;
      setSyncProgress(`Syncing ${i + 1}/${workItemsWithRef.length}: ${refNum}`);
      try {
        const feature = await syncAhaFeature(refNum, { subdomain: aha.subdomain, api_key: aha.api_key });
        const parsed = parseAhaFeature(feature);
        await updateWorkItem(w.id, {
          aha_synced_data: parsed.aha_synced_data,
          aha_reference: {
            ...w.aha_reference!,
            ...parsed.aha_reference,
            // Preserve the user-typed reference_num verbatim.
            reference_num: refNum,
          },
        }, true);
        successCount++;
      } catch (err: unknown) {
        console.error(`Error syncing ${refNum}:`, err);
        failCount++;
      }
    }

    setIsSyncing(false);
    setSyncProgress("");
    setImportSyncResult({ success: failCount === 0, message: `Sync complete. ${successCount} succeeded, ${failCount} failed.` });
  };

  const isBusy = isTesting || isImporting || isSyncing;
  const credentialsMissing = (!localFormData.aha.subdomain && !settings?.aha?.subdomain) || (!localFormData.aha.api_key && !settings?.aha?.api_key);

  return (
    <div className={styles.tabContainer}>
      <nav className={styles.tabHeader}>
        <button
          onClick={() => setSubTab("general")}
          className={`${styles.tabButton} ${activeSubTab === "general" ? styles.activeTab : ''}`}
        >
          General
        </button>
        <button
          onClick={() => setSubTab("work-items")}
          className={`${styles.tabButton} ${activeSubTab === "work-items" ? styles.activeTab : ''}`}
        >
          Work Items
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeSubTab === "general" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Aha! Subdomain:
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="your-company"
                  value={localFormData.aha.subdomain || ""}
                  onChange={(e) => updateFormData('aha.subdomain', e.target.value)}
                  onBlur={() => onUpdateSettings({ aha: { ...localFormData.aha, subdomain: localFormData.aha.subdomain } })}
                />
                <span style={{ color: 'var(--text-muted)' }}>.aha.io</span>
              </div>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              <span>Aha! API Key:<ScopeIndicator path="aha.api_key" /></span>
              <input
                type="password"
                placeholder="Your Aha! API Key"
                value={localFormData.aha.api_key || ""}
                onChange={(e) => updateFormData('aha.api_key', e.target.value)}
                onBlur={() => onUpdateSettings({ aha: { ...localFormData.aha, api_key: localFormData.aha.api_key } })}
              />
            </label>

            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleAhaTestConnection}
                disabled={isBusy || credentialsMissing}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </button>
            </div>

            {ahaTestResult && (
              <div
                style={{
                  padding: "10px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  backgroundColor: ahaTestResult.success ? "var(--status-success-bg)" : "var(--status-danger-bg)",
                  color: ahaTestResult.success ? "var(--status-success)" : "var(--status-danger-text)",
                  border: `1px solid ${ahaTestResult.success ? "var(--status-success)" : "var(--status-danger-border)"}`,
                  marginTop: "8px",
                }}
              >
                {ahaTestResult.message}
              </div>
            )}
          </div>
        )}

        {activeSubTab === "work-items" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 8px 0" }}>
              Workspace is the prefix part of your feature reference numbers (e.g. <code>PROD</code> in <code>PROD-123</code>). What Aha! calls a &ldquo;Workspace&rdquo; in their UI is a &ldquo;Product&rdquo; in their REST API.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Aha! Workspace:
              <input
                type="text"
                placeholder="PROD"
                value={localFormData.aha.workspace || ""}
                onChange={(e) => updateFormData('aha.workspace', e.target.value)}
                onBlur={() => onUpdateSettings({ aha: { ...localFormData.aha, workspace: localFormData.aha.workspace } })}
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleImportFromAha}
                style={{ alignSelf: "flex-start" }}
                disabled={isBusy || credentialsMissing || !(localFormData.aha.workspace || "").trim()}
              >
                {isImporting ? importProgress : "Import from Aha!"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSyncAllFromAha}
                style={{ alignSelf: "flex-start" }}
                disabled={isBusy || credentialsMissing}
              >
                {isSyncing ? syncProgress : "Sync Work Items from Aha!"}
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
      </div>
    </div>
  );
};
