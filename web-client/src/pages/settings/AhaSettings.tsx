import { useState } from "react";
import { authorizedFetch } from "../../utils/api";
import type { SettingsTabProps } from './types';

export const AhaSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
  settings,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [ahaTestResult, setAhaTestResult] = useState<{ success: boolean; message: string; } | null>(null);

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

  return (
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
        Aha! API Key:
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
          disabled={isTesting || ((!localFormData.aha.subdomain && !settings?.aha?.subdomain) || (!localFormData.aha.api_key && !settings?.aha?.api_key))}
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
  );
};
