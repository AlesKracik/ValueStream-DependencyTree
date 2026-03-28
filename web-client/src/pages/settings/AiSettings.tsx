import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { gleanAuthStatus, gleanAuthLogin } from "../../utils/api";
import styles from '../List.module.css';
import type { SettingsTabProps } from './types';

export const AiSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get("subtab") || "general";
  const [isGleanAuthenticated, setIsGleanAuthenticated] = useState(false);

  const setSubTab = (subtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subtab", subtab);
      return newParams;
    });
  };

  useEffect(() => {
    const checkGleanStatus = async () => {
      if (localFormData.ai?.provider === 'glean' && localFormData.ai?.glean_url) {
        try {
          const status = await gleanAuthStatus(localFormData.ai.glean_url);
          setIsGleanAuthenticated(status);
        } catch (err) {
          console.error('Failed to check Glean status:', err);
        }
      }
    };

    if (searchParams.get('glean_auth') === 'success') {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('glean_auth');
        return newParams;
      });
    } else if (searchParams.get('glean_error')) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('glean_error');
        return newParams;
      });
    }

    checkGleanStatus();
  }, [localFormData.ai?.provider, localFormData.ai?.glean_url, searchParams, setSearchParams]);

  const handleGleanLogin = async () => {
    if (!localFormData.ai?.glean_url) return;
    try {
      await gleanAuthLogin(localFormData.ai.glean_url);
    } catch (err) {
      console.error('Glean login failed:', err);
    }
  };

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
          onClick={() => setSubTab("support")}
          className={`${styles.tabButton} ${activeSubTab === "support" ? styles.activeTab : ''}`}
        >
          Support
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeSubTab === "general" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              LLM Provider:
              <select
                value={localFormData.ai?.provider || 'openai'}
                onChange={(e) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const val = e.target.value as any;
                    updateFormData('ai.provider', val);
                    onUpdateSettings({ ai: { ...localFormData.ai, provider: val } });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic</option>
                <option value="augment">Augment CLI</option>
                <option value="glean">Glean</option>
              </select>
            </label>

            {localFormData.ai?.provider === 'glean' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Glean URL:
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Usually follows https://COMPANY-be.glean.com notation
                  </span>
                  <input
                    type="text"
                    placeholder="https://company-be.glean.com"
                    value={localFormData.ai?.glean_url || ""}
                    onChange={(e) => updateFormData('ai.glean_url', e.target.value)}
                    onBlur={() => onUpdateSettings({ ai: { ...localFormData.ai, glean_url: localFormData.ai.glean_url } })}
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleGleanLogin}
                    disabled={!localFormData.ai?.glean_url}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isGleanAuthenticated ? 'Reconnect Glean' : 'Connect Glean'}
                  </button>
                  {isGleanAuthenticated && (
                    <span style={{ color: 'var(--status-success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }}></span>
                      Connected to Glean
                    </span>
                  )}
                </div>
              </div>
            )}

            {localFormData.ai?.provider !== 'glean' && (
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                {localFormData.ai?.provider === 'augment' ? 'Augment Session Auth:' : 'LLM API Key:'}
                <input
                  type="password"
                  placeholder={localFormData.ai?.provider === 'augment' ? "Session token..." : "sk-..."}
                  value={localFormData.ai?.api_key || ""}
                  onChange={(e) => updateFormData('ai.api_key', e.target.value)}
                  onBlur={() => onUpdateSettings({ ai: { ...localFormData.ai, api_key: localFormData.ai.api_key } })}
                />
              </label>
            )}

            {localFormData.ai?.provider !== 'augment' && localFormData.ai?.provider !== 'glean' && (
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
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
          </div>
        )}

        {activeSubTab === "support" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "100%" }}>
              AI Support Discovery Prompt:
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                This prompt will be used to analyze Glean/Slack search results. It must return a JSON object matching the following schema. IMPORTANT: AI is instructed to NOT use ellipses (...) in the response.
              </span>
              <pre style={{
                fontSize: '11px',
                backgroundColor: 'rgba(0,0,0,0.2)',
                padding: '12px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '240px',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify({
                  "$schema": "https://json-schema.org/draft/2020-12/schema",
                  "title": "CustomerIssues",
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "customers": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "issues"],
                        "properties": {
                          "name": { "type": "string", "description": "Customer display name" },
                          "customerId": { "type": "string", "description": "Unique organization identifier" },
                          "issues": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["summary", "impact", "rootCause"],
                              "properties": {
                                "summary": { "type": "string", "description": "Short description of the issue" },
                                "impact": { "type": "string", "description": "Business/technical impact of the issue" },
                                "rootCause": { "type": "string", "description": "Root cause analysis" },
                                "jiraTickets": { "type": "array", "description": "Associated Jira ticket keys", "items": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]+-[0-9]+$" } }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "required": ["customers"]
                }, null, 2)}
              </pre>
              <textarea
                placeholder="Analyze the following Slack conversations and extract customer issues..."
                value={localFormData.ai?.support?.prompt || ""}
                onChange={(e) => updateFormData('ai.support.prompt', e.target.value)}
                onBlur={() => onUpdateSettings({ ai: { ...localFormData.ai, support: { ...localFormData.ai?.support, prompt: localFormData.ai?.support?.prompt || '' } } })}
                rows={15}
                style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
