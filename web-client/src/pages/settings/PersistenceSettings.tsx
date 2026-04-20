import * as React from "react";
import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { authorizedFetch } from "../../utils/api";
import { useNotificationContext } from "../../contexts/NotificationContext";
import styles from '../List.module.css';
import type { SettingsTabProps, MongoTestResult, SSOMessage } from './types';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';

export const PersistenceSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
  settings,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get("subtab") || "mongo";
  const activeSubSubTab = searchParams.get("subsubtab") || (activeSubTab === "mongo" ? "application" : "");

  const { showConfirm } = useNotificationContext();

  const [isTesting, setIsTesting] = useState(false);
  const [availableDbs, setAvailableDbs] = useState<string[]>([]);
  const [mongoTestResult, setMongoTestResult] = useState<MongoTestResult | null>(null);
  const [isTestingCustomer, setIsTestingCustomer] = useState(false);
  const [availableCustomerDbs, setAvailableCustomerDbs] = useState<string[]>([]);
  const [customerMongoTestResult, setCustomerMongoTestResult] = useState<MongoTestResult | null>(null);
  const [isSSOLoginLoading, setIsSSOLoginLoading] = useState<Record<string, boolean>>({ app: false, customer: false });
  const [ssoMessage, setSSOMessage] = useState<Record<string, SSOMessage | null>>({ app: null, customer: null });
  const [ssoPolling, setSsoPolling] = useState<Record<string, string | null>>({ app: null, customer: null }); // session_id or null

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAWSSSOLOGIN = async (role: 'app' | 'customer') => {
    const mongo = localFormData.persistence.mongo[role];
    const { auth } = mongo;
    setIsSSOLoginLoading(prev => ({ ...prev, [role]: true }));
    setSSOMessage(prev => ({ ...prev, [role]: null }));
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
                                sso: auth.sso
                            }
                        }
                    }
                }
            })
        });
        const data = await res.json();
        if (data.success && data.session_id) {
            setSSOMessage(prev => ({ ...prev, [role]: { success: true, message: data.message || 'Waiting for authorization...' } }));
            setSsoPolling(prev => ({ ...prev, [role]: data.session_id }));
            // Open verification URL
            if (data.verification_url) {
                window.open(data.verification_url, '_blank');
            }
            // Start polling
            pollSsoCredentials(role, data.session_id);
        } else {
            setSSOMessage(prev => ({ ...prev, [role]: { success: false, message: data.error || 'Failed to start SSO' } }));
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to initiate SSO login';
        setSSOMessage(prev => ({ ...prev, [role]: { success: false, message: msg } }));
    } finally {
        setIsSSOLoginLoading(prev => ({ ...prev, [role]: false }));
    }
  };

  const pollSsoCredentials = async (role: 'app' | 'customer', sessionId: string) => {
    let inFlight = false;
    const interval = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
            const res = await authorizedFetch('/api/aws/sso/poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await res.json();

            if (data.success && data.credentials) {
                clearInterval(interval);
                setSsoPolling(prev => ({ ...prev, [role]: null }));

                // Auto-populate credential fields into sso sub-object
                const { access_key, secret_key, session_token } = data.credentials;
                updateFormData(`persistence.mongo.${role}.auth.sso.aws_access_key`, access_key);
                updateFormData(`persistence.mongo.${role}.auth.sso.aws_secret_key`, secret_key);
                updateFormData(`persistence.mongo.${role}.auth.sso.aws_session_token`, session_token);

                // Save to client settings (UI state + user profile)
                const mongo = localFormData.persistence.mongo[role];
                onUpdateSettings({
                    persistence: {
                        ...localFormData.persistence,
                        mongo: {
                            ...localFormData.persistence.mongo,
                            [role]: {
                                ...mongo,
                                auth: {
                                    ...mongo.auth,
                                    sso: {
                                        ...mongo.auth.sso,
                                        aws_access_key: access_key,
                                        aws_secret_key: secret_key,
                                        aws_session_token: session_token,
                                    }
                                }
                            }
                        }
                    }
                });

                setSSOMessage(prev => ({ ...prev, [role]: { success: true, message: 'SSO credentials obtained and saved.' } }));
            } else if (!data.pending) {
                clearInterval(interval);
                setSsoPolling(prev => ({ ...prev, [role]: null }));
                setSSOMessage(prev => ({ ...prev, [role]: { success: false, message: data.error || 'SSO failed' } }));
            }
        } catch {
            clearInterval(interval);
            setSsoPolling(prev => ({ ...prev, [role]: null }));
            setSSOMessage(prev => ({ ...prev, [role]: { success: false, message: 'Connection lost during SSO' } }));
        } finally {
            inFlight = false;
        }
    }, 5000);
  };

  const handleTestConnection = async (role: 'app' | 'customer' = 'app') => {
    const mongo = localFormData.persistence.mongo[role];
    const isCustomer = role === 'customer';

    const body = {
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
        const result: MongoTestResult = {
          success: true,
          exists: resData.exists,
          message: resData.message || "MongoDB connection successful!"
        };
        if (isCustomer) setCustomerMongoTestResult(result);
        else setMongoTestResult(result);
      } else {
        const result: MongoTestResult = { success: false, message: resData.error || "MongoDB connection failed" };
        if (isCustomer) setCustomerMongoTestResult(result);
        else setMongoTestResult(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error occurred testing MongoDB connection.";
      const result: MongoTestResult = { success: false, message: msg };
      if (isCustomer) setCustomerMongoTestResult(result);
      else setMongoTestResult(result);
    } finally {
      if (isCustomer) setIsTestingCustomer(false);
      else setIsTesting(false);
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
        link.download = 'valuestream_export.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setMongoTestResult({ success: true, message: "Export successful! valuestream_export.json download started." });
      } else {
        setMongoTestResult({ success: false, message: resData.error || "Export failed" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error occurred during export.";
      setMongoTestResult({ success: false, message: msg });
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error during import. Ensure the file is a valid JSON export.";
      setMongoTestResult({ success: false, message: msg });
    } finally {
      setIsTesting(false);
      event.target.value = "";
    }
  };

  const renderSSOMessage = (role: 'app' | 'customer') => {
    const msg = ssoMessage[role];
    if (!msg) return null;

    return (
      <div style={{
        fontSize: '12px',
        marginTop: '8px',
        color: msg.success ? 'var(--status-success)' : 'var(--status-danger-text)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: '8px',
        borderRadius: '4px',
        border: `1px solid ${msg.success ? 'var(--status-success-bg)' : 'var(--status-danger-bg)'}`
      }}>
        {(() => {
          const codeMatch = msg.message.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
          const code = codeMatch ? codeMatch[1] : null;
          const parts = msg.message.split(/(https?:\/\/[^\s]+)/g);
          return parts.map((part, i) => {
            if (part.startsWith('http')) {
              const url = part.replace(/[.,]$/, '');
              let finalUrl = url;
              const isAWSSSOUrl = url.includes('device.sso') || url.includes('awsapps.com/start') || url.includes('.app.aws');
              if (code && isAWSSSOUrl && !url.includes('user_code=')) {
                const separator = url.includes('?') ? '&' : '?';
                finalUrl = `${url}${separator}user_code=${code}`;
              }
              return (
                <div key={i} style={{ margin: '8px 0' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Authorization URL:</div>
                  <a href={finalUrl} target="_blank" rel="noopener noreferrer" style={{
                    color: 'var(--accent-text)', textDecoration: 'underline', fontWeight: 'bold',
                    display: 'block', padding: '8px', backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    borderRadius: '4px', border: '1px solid rgba(96, 165, 250, 0.2)'
                  }}>{finalUrl}</a>
                </div>
              );
            }
            if (code && part.includes(code)) {
              const subParts = part.split(code);
              return (
                <React.Fragment key={i}>
                  {subParts[0]}
                  <span style={{ color: 'var(--status-warning)', fontWeight: 'bold', padding: '0 4px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '2px' }}>{code}</span>
                  {subParts[1]}
                </React.Fragment>
              );
            }
            return part;
          });
        })()}
      </div>
    );
  };

  const renderMongoConnectionForm = (role: 'app' | 'customer') => {
    const isCustomer = role === 'customer';
    const providerKey = isCustomer ? 'customer_provider' : 'app_provider';
    const currentProvider = localFormData.persistence[providerKey] || 'mongo';
    const mongo = localFormData.persistence.mongo[role];
    const testResult = isCustomer ? customerMongoTestResult : mongoTestResult;
    const testing = isCustomer ? isTestingCustomer : isTesting;
    const dbs = isCustomer ? availableCustomerDbs : availableDbs;
    const datalistId = isCustomer ? "customer-mongo-dbs" : "mongo-dbs";
    const label = isCustomer ? "Customer " : "";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
          Database Provider:
          <select
            value={currentProvider}
            onChange={(e) => {
              updateFormData(`persistence.${providerKey}`, e.target.value);
              onUpdateSettings({ persistence: { ...localFormData.persistence, [providerKey]: e.target.value } });
            }}
          >
            <option value="mongo">MongoDB</option>
          </select>
        </label>

        {currentProvider !== 'mongo' ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Configuration for this provider is not yet available.
          </div>
        ) : (
        <>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
          Authentication Method:
          <select
            value={mongo.auth.method}
            onChange={(e) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const val = e.target.value as any;
                updateFormData(`persistence.mongo.${role}.auth.method`, val);
                const newMongo = { ...mongo, auth: { ...mongo.auth, method: val } };
                onUpdateSettings({
                  persistence: {
                      ...localFormData.persistence,
                      mongo: {
                          ...localFormData.persistence.mongo,
                          [role]: newMongo
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

        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
          {label}MongoDB URI:
          <input
            type="text"
            placeholder={mongo.auth.method === 'scram' ? "mongodb://username:password@localhost:27017" : "mongodb://localhost:27017"}
            value={mongo.uri || ""}
            onChange={(e) => updateFormData(`persistence.mongo.${role}.uri`, e.target.value)}
            onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, uri: mongo.uri } } } })}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)", cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={mongo.use_proxy || false}
              onChange={(e) => {
                const val = e.target.checked;
                updateFormData(`persistence.mongo.${role}.use_proxy`, val);
                const newMongo = { ...mongo, use_proxy: val };
                onUpdateSettings({
                  persistence: {
                      ...localFormData.persistence,
                      mongo: {
                          ...localFormData.persistence.mongo,
                          [role]: newMongo
                      }
                  }
                });
              }}
            />
            Use SOCKS Proxy (from .env)
          </label>

          {mongo.use_proxy && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
              Tunnel Name:
              <input
                type="text"
                placeholder={role}
                value={mongo.tunnel_name || ""}
                onChange={(e) => updateFormData(`persistence.mongo.${role}.tunnel_name`, e.target.value)}
                onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, tunnel_name: mongo.tunnel_name } } } })}
                style={{ width: '120px', padding: '4px 8px' }}
              />
            </label>
          )}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
          {label}MongoDB Database Name:
          <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Value Stream"
                list={datalistId}
                value={mongo.db || ""}
                onChange={(e) => updateFormData(`persistence.mongo.${role}.db`, e.target.value)}
                onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, db: mongo.db } } } })}
                style={{
                  borderColor: testResult?.success && !testResult.exists ? 'var(--status-warning)' : undefined
                }}
              />
              <datalist id={datalistId}>
                {dbs.map(db => <option key={db} value={db} />)}
              </datalist>
            </div>
            {testResult?.success && (
              <span style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: testResult.exists ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                color: testResult.exists ? 'var(--status-success)' : 'var(--status-warning)',
                border: `1px solid ${testResult.exists ? 'var(--status-success)' : 'var(--status-warning)'}`,
                whiteSpace: 'nowrap'
              }}>
                {testResult.exists ? 'Exists' : 'New'}
              </span>
            )}
          </div>
        </label>

        {isCustomer && (
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
            Customer MongoDB Collection:
            <input
              type="text"
              placeholder="Customers"
              value={(mongo as typeof localFormData.persistence.mongo.customer).collection || ""}
              onChange={(e) => updateFormData('persistence.mongo.customer.collection', e.target.value)}
              onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, customer: { ...localFormData.persistence.mongo.customer, collection: localFormData.persistence.mongo.customer.collection } } } })}
            />
          </label>
        )}

        {mongo.auth.method === 'aws' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid var(--border-secondary)', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-text)' }}>AWS IAM Credentials{isCustomer ? ' (Customer)' : ''}</div>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              AWS Authentication Type:
              <select
                value={mongo.auth.aws_auth_type || "static"}
                onChange={(e) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const val = e.target.value as any;
                    updateFormData(`persistence.mongo.${role}.auth.aws_auth_type`, val);
                    const newAuth = { ...mongo.auth, aws_auth_type: val };
                    const newMongo = { ...mongo, auth: newAuth };
                    onUpdateSettings({
                      persistence: {
                          ...localFormData.persistence,
                          mongo: {
                              ...localFormData.persistence.mongo,
                              [role]: newMongo
                          }
                      }
                    });
                }}
              >
                <option value="static">Static Credentials</option>
                <option value="sso">SSO (Auto-refresh)</option>
                <option value="role">Assume Role</option>
                <option value="ambient">Instance Role / IRSA (ambient credentials)</option>
              </select>
            </label>

            {mongo.auth.aws_auth_type === 'ambient' ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                No credentials required — the service will authenticate using the AWS identity
                already attached to its runtime (IRSA, Pod Identity, EC2 instance profile, or ECS
                task role). Ensure that identity has permissions on the target MongoDB cluster.
              </div>
            ) : mongo.auth.aws_auth_type === 'sso' ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-text)' }}>
                  SSO Configuration<ScopeIndicator path={`persistence.mongo.${role}.auth.sso`} />
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  SSO Start URL:
                  <input
                    type="text"
                    placeholder="https://my-company.awsapps.com/start"
                    value={(mongo.auth.sso?.aws_sso_start_url || "").trim()}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.sso.aws_sso_start_url`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, sso: { ...mongo.auth.sso, aws_sso_start_url: mongo.auth.sso?.aws_sso_start_url } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  SSO Region:
                  <input
                    type="text"
                    placeholder="us-east-1"
                    value={mongo.auth.sso?.aws_sso_region || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.sso.aws_sso_region`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, sso: { ...mongo.auth.sso, aws_sso_region: mongo.auth.sso?.aws_sso_region } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  SSO Account ID:
                  <input
                    type="text"
                    placeholder="123456789012"
                    value={mongo.auth.sso?.aws_sso_account_id || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.sso.aws_sso_account_id`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, sso: { ...mongo.auth.sso, aws_sso_account_id: mongo.auth.sso?.aws_sso_account_id } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  SSO Role Name:
                  <input
                    type="text"
                    placeholder="AWSReadOnlyAccess"
                    value={mongo.auth.sso?.aws_sso_role_name || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.sso.aws_sso_role_name`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, sso: { ...mongo.auth.sso, aws_sso_role_name: mongo.auth.sso?.aws_sso_role_name } } } } } })}
                  />
                </label>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleAWSSSOLOGIN(role)}
                    disabled={isSSOLoginLoading[role] || !!ssoPolling[role] || !mongo.auth.sso?.aws_sso_start_url?.trim()}
                    style={{ alignSelf: "flex-start" }}
                >
                    {ssoPolling[role] ? 'Waiting for authorization...' : isSSOLoginLoading[role] ? 'Starting...' : 'Login via AWS SSO'}
                </button>
                {renderSSOMessage(role)}
              </>
            ) : mongo.auth.aws_auth_type === 'static' || !mongo.auth.aws_auth_type ? (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Access Key ID:
                  <input
                    type="text"
                    value={mongo.auth.static?.aws_access_key || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.static.aws_access_key`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, static: { ...mongo.auth.static, aws_access_key: mongo.auth.static?.aws_access_key } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Secret Access Key:
                  <input
                    type="password"
                    value={mongo.auth.static?.aws_secret_key || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.static.aws_secret_key`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, static: { ...mongo.auth.static, aws_secret_key: mongo.auth.static?.aws_secret_key } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Session Token (Optional):
                  <input
                    type="password"
                    value={mongo.auth.static?.aws_session_token || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.static.aws_session_token`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, static: { ...mongo.auth.static, aws_session_token: mongo.auth.static?.aws_session_token } } } } } })}
                  />
                </label>
              </>
            ) : (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Role ARN:
                  <input
                    type="text"
                    placeholder="arn:aws:iam::123456789012:role/MyRole"
                    value={mongo.auth.role?.aws_role_arn || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.role.aws_role_arn`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, role: { ...mongo.auth.role, aws_role_arn: mongo.auth.role?.aws_role_arn } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  External ID (Optional):
                  <input
                    type="text"
                    value={mongo.auth.role?.aws_external_id || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.role.aws_external_id`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, role: { ...mongo.auth.role, aws_external_id: mongo.auth.role?.aws_external_id } } } } } })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
                  Role Session Name (Optional):
                  <input
                    type="text"
                    placeholder="ValueStreamSession"
                    value={mongo.auth.role?.aws_role_session_name || ""}
                    onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.role.aws_role_session_name`, e.target.value)}
                    onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, role: { ...mongo.auth.role, aws_role_session_name: mongo.auth.role?.aws_role_session_name } } } } } })}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {mongo.auth.method === 'oidc' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px', border: '1px solid var(--border-secondary)', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-text)' }}>OIDC Configuration{isCustomer ? ' (Customer)' : ''}</div>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Access Token:
              <input
                type="password"
                placeholder="eyJhbG..."
                value={mongo.auth.oidc_token || ""}
                onChange={(e) => updateFormData(`persistence.mongo.${role}.auth.oidc_token`, e.target.value)}
                onBlur={() => onUpdateSettings({ persistence: { ...localFormData.persistence, mongo: { ...localFormData.persistence.mongo, [role]: { ...mongo, auth: { ...mongo.auth, oidc_token: mongo.auth.oidc_token } } } } })}
              />
            </label>
          </div>
        )}

        <button
          type="button"
          className="btn-primary"
          onClick={() => handleTestConnection(role)}
          style={{ alignSelf: "flex-start", marginTop: "4px" }}
          disabled={testing || (!mongo.uri && !settings?.persistence?.mongo?.[role]?.uri)}
        >
          {testing ? `Testing ${label}Mongo...` : `Test ${label}Mongo Connection`}
        </button>

        {testResult && (
          <div
            style={{
              padding: "10px",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: testResult.success ? "var(--status-success-bg)" : "var(--status-danger-bg)",
              color: testResult.success ? "var(--status-success)" : "var(--status-danger-text)",
              border: `1px solid ${testResult.success ? "var(--status-success)" : "var(--status-danger-border)"}`,
              marginTop: "8px",
            }}
          >
            {testResult.message}
          </div>
        )}

        {!isCustomer && (
          <>
            <hr style={{ borderColor: "var(--border-secondary)", width: "100%", margin: "16px 0 8px 0" }} />

            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-primary)" }}>
              Export & Import Data
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 8px 0" }}>
              Manage your database content via JSON backup files.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExportMongo}
                disabled={isTesting || (!localFormData.persistence.mongo.app.uri && !settings?.persistence?.mongo?.app?.uri)}
              >
                {isTesting ? "Exporting..." : "Export to JSON"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTesting || (!localFormData.persistence.mongo.app.uri && !settings?.persistence?.mongo?.app?.uri)}
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

        {isCustomer && (
          <>
            <hr style={{ borderColor: "var(--border-secondary)", width: "100%", margin: "16px 0 8px 0" }} />

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "100%" }}>
              Custom MongoDB Query (JSON/Aggregation):
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
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
          </>
        )}
        </>
        )}
      </div>
    );
  };

  return (
    <div className={styles.tabContainer}>
      <nav className={styles.tabHeader}>
        <button
          onClick={() => setSubTab("mongo")}
          className={`${styles.tabButton} ${activeSubTab === "mongo" ? styles.activeTab : ''}`}
        >
          DB
        </button>
        <button
          onClick={() => setSubTab("file")}
          className={`${styles.tabButton} ${activeSubTab === "file" ? styles.activeTab : ''}`}
        >
          File
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeSubTab === "mongo" && (
          <div className={styles.tabContainer}>
            <nav className={styles.tabHeader}>
              <button
                onClick={() => setSubSubTab("application")}
                className={`${styles.tabButton} ${activeSubSubTab === "application" ? styles.activeTab : ''}`}
              >
                Application
              </button>
              <button
                onClick={() => setSubSubTab("customer")}
                className={`${styles.tabButton} ${activeSubSubTab === "customer" ? styles.activeTab : ''}`}
              >
                Customer
              </button>
            </nav>

            <div className={styles.tabContent}>
              {activeSubSubTab === "application" && renderMongoConnectionForm('app')}
              {activeSubSubTab === "customer" && renderMongoConnectionForm('customer')}
            </div>
          </div>
        )}

        {activeSubTab === "file" && (
          <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            File-based persistence configuration will be available here.
          </div>
        )}
      </div>
    </div>
  );
};
