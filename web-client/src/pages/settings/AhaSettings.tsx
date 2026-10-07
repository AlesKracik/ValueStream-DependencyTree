import type { WorkItem, ExternalLink } from '@valuestream/shared-types';
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authorizedFetch, importAhaFeatures, importAhaEpics, syncAhaFeature, syncAhaEpic } from "../../utils/api";
import { parseAhaFeature, parseAhaEpic } from '../../utils/businessLogic';
import { withAhaLink, ahaRecordTypeForKey } from '../../utils/workItemOrigin';
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
      const ahaCreds = { subdomain: aha.subdomain, api_key: aha.api_key };
      // Aha! epics ("feature sets") first: features then find their epic's
      // work item, which becomes their parent.
      const epics = await importAhaEpics(workspace, ahaCreds);
      const features = await importAhaFeatures(workspace, ahaCreds);
      if (epics.length === 0 && features.length === 0) {
        setImportSyncResult({ success: true, message: `No epics or features found in workspace "${workspace}".` });
        return;
      }

      // Work items known so far, including the ones this import creates.
      const known: WorkItem[] = [...(data.workItems || [])];
      const counts = { epics: { created: 0, updated: 0, failed: 0 }, features: { created: 0, updated: 0, failed: 0 } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const records: { record: any; link: ExternalLink; kind: 'epics' | 'features' }[] = [
        ...epics.map(e => ({ record: e, link: parseAhaEpic(e), kind: 'epics' as const })),
        ...features.map(f => ({ record: f, link: parseAhaFeature(f), kind: 'features' as const })),
      ];

      for (let i = 0; i < records.length; i++) {
        const { record, link, kind } = records[i];
        const c = counts[kind];
        setImportProgress(`Processing ${i + 1}/${records.length}: ${record.reference_num}`);
        try {
          // Match by the stable Aha! id first, then by a typed-but-unsynced key.
          const existing =
            known.find(w => w.links?.aha?.external_id === link.external_id) ??
            known.find(w => !w.links?.aha?.external_id && w.links?.aha?.key?.toLowerCase() === link.key.toLowerCase());
          if (existing) {
            const updates = withAhaLink(existing, link, known);
            await updateWorkItem(existing.id, updates, true);
            known[known.indexOf(existing)] = { ...existing, ...updates };
            c.updated++;
          } else {
            const fields = {
              name: record.reference_num,
              status: 'Backlog' as const,
              total_effort_mds: 0,
              score: 0,
              customer_targets: [],
              ...withAhaLink(undefined, link, known),
            };
            const created = await addWorkItem(fields);
            if (created) {
              known.push({ ...fields, ...created });
              c.created++;
            } else c.failed++;
          }
        } catch (err: unknown) {
          console.error(`Error processing ${record.reference_num}:`, err);
          c.failed++;
        }
      }

      const total = (k: 'created' | 'updated' | 'failed') => counts.epics[k] + counts.features[k];
      const part = (k: 'epics' | 'features') => `${k}: ${counts[k].created} created, ${counts[k].updated} updated, ${counts[k].failed} failed`;
      setImportSyncResult({
        success: total('failed') === 0,
        message: `Import complete. Created ${total('created')}, updated ${total('updated')}, failed ${total('failed')} (${part('epics')}; ${part('features')}).`,
      });
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

    const isEpicLink = (w: WorkItem) => (w.links?.aha?.record_type ?? ahaRecordTypeForKey(w.links?.aha?.key || '')) === 'epic';
    // Epics first, so a feature that moved to another epic finds its new parent.
    const workItemsWithRef = (data.workItems || []).filter(w => w.links?.aha?.key)
      .sort((a, b) => Number(isEpicLink(b)) - Number(isEpicLink(a)));
    const known: WorkItem[] = [...(data.workItems || [])];
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
      const refNum = w.links!.aha!.key;
      setSyncProgress(`Syncing ${i + 1}/${workItemsWithRef.length}: ${refNum}`);
      try {
        const creds = { subdomain: aha.subdomain, api_key: aha.api_key };
        const link = isEpicLink(w)
          ? parseAhaEpic(await syncAhaEpic(refNum, creds))
          : parseAhaFeature(await syncAhaFeature(refNum, creds));
        // Preserve the user-typed key verbatim.
        const updates = withAhaLink(w, { ...link, key: refNum }, known);
        await updateWorkItem(w.id, updates, true);
        known[known.findIndex(k => k.id === w.id)] = { ...w, ...updates };
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
