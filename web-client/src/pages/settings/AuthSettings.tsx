import { useState, useEffect } from 'react';
import type { SettingsTabProps } from './types';
import type { AuthMethod, UserRole } from '@valuestream/shared-types';
import { FormSelectField, FormNumberField, FormTextField } from '../../components/common/FormFields';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';
import { authorizedFetch } from '../../utils/api';

const settingsFieldStyle = { display: "flex" as const, flexDirection: "column" as const, gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" };

interface AppUserDisplay {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  source: AuthMethod;
  last_login?: string;
}

export const AuthSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  const [users, setUsers] = useState<AppUserDisplay[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const authMethod = localFormData.auth?.method || 'local';

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await authorizedFetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch { /* ignore */ }
    setUsersLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const res = await authorizedFetch(`/api/auth/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    const res = await authorizedFetch(`/api/auth/users/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  return (
    <>
      <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
        Authentication Method<ScopeIndicator path="auth" />
      </h3>

      <FormSelectField
        label="Method:"
        value={authMethod}
        onChange={v => {
          const val = v as AuthMethod;
          updateFormData('auth.method', val);
          onUpdateSettings({ auth: { ...localFormData.auth, method: val } });
        }}
        options={[
          { value: 'local', label: 'Local accounts (username/password)' },
          { value: 'ldap', label: 'LDAP bind (uses LDAP settings)' },
          { value: 'aws-sso', label: 'AWS SSO (device authorization)' },
          { value: 'okta', label: 'Okta (OIDC / OAuth2)' },
        ]}
        style={settingsFieldStyle}
      />

      <FormSelectField
        label="Default role for new users:"
        value={localFormData.auth?.default_role || 'viewer'}
        onChange={v => {
          const val = v as UserRole;
          updateFormData('auth.default_role', val);
          onUpdateSettings({ auth: { ...localFormData.auth, default_role: val } });
        }}
        options={[
          { value: 'viewer', label: 'Viewer (read-only)' },
          { value: 'editor', label: 'Editor (can modify entities)' },
          { value: 'admin', label: 'Admin (full access)' },
        ]}
        style={settingsFieldStyle}
      />

      <FormNumberField
        label="Session expiry (hours):"
        value={localFormData.auth?.session_expiry_hours || 24}
        onChange={v => {
          const val = v ?? 24;
          updateFormData('auth.session_expiry_hours', val);
          onUpdateSettings({ auth: { ...localFormData.auth, session_expiry_hours: val } });
        }}
        min={1}
        max={720}
        style={settingsFieldStyle}
      />

      {authMethod === 'aws-sso' && (
        <>
          <h3 style={{ margin: "16px 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
            AWS SSO Configuration
          </h3>

          <FormTextField
            label="SSO Start URL:"
            value={localFormData.auth?.aws_sso?.start_url || ''}
            onChange={v => {
              updateFormData('auth.aws_sso.start_url', v);
              onUpdateSettings({ auth: { ...localFormData.auth, aws_sso: { ...localFormData.auth?.aws_sso, start_url: v } as any } });
            }}
            placeholder="https://my-company.awsapps.com/start"
            style={settingsFieldStyle}
          />

          <FormTextField
            label="AWS Region:"
            value={localFormData.auth?.aws_sso?.region || ''}
            onChange={v => {
              updateFormData('auth.aws_sso.region', v);
              onUpdateSettings({ auth: { ...localFormData.auth, aws_sso: { ...localFormData.auth?.aws_sso, region: v } as any } });
            }}
            placeholder="us-east-1"
            style={settingsFieldStyle}
          />

          <FormTextField
            label="Account ID:"
            value={localFormData.auth?.aws_sso?.account_id || ''}
            onChange={v => {
              updateFormData('auth.aws_sso.account_id', v);
              onUpdateSettings({ auth: { ...localFormData.auth, aws_sso: { ...localFormData.auth?.aws_sso, account_id: v } as any } });
            }}
            placeholder="123456789012"
            style={settingsFieldStyle}
          />

          <FormTextField
            label="Role Name:"
            value={localFormData.auth?.aws_sso?.role_name || ''}
            onChange={v => {
              updateFormData('auth.aws_sso.role_name', v);
              onUpdateSettings({ auth: { ...localFormData.auth, aws_sso: { ...localFormData.auth?.aws_sso, role_name: v } as any } });
            }}
            placeholder="ViewOnlyAccess"
            style={settingsFieldStyle}
          />
        </>
      )}

      {authMethod === 'ldap' && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '32rem' }}>
          LDAP authentication uses the connection settings from the LDAP tab (URL, Bind DN, Bind Password).
          Users authenticate by binding to LDAP with their own credentials.
        </p>
      )}

      {authMethod === 'okta' && (
        <>
          <h3 style={{ margin: "16px 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
            Okta Configuration
          </h3>

          <FormTextField
            label="Issuer URL:"
            value={localFormData.auth?.okta?.issuer || ''}
            onChange={v => {
              updateFormData('auth.okta.issuer', v);
              onUpdateSettings({ auth: { ...localFormData.auth, okta: { ...localFormData.auth?.okta, issuer: v } as any } });
            }}
            placeholder="https://yourcompany.okta.com"
            style={settingsFieldStyle}
          />

          <FormTextField
            label="Client ID:"
            value={localFormData.auth?.okta?.client_id || ''}
            onChange={v => {
              updateFormData('auth.okta.client_id', v);
              onUpdateSettings({ auth: { ...localFormData.auth, okta: { ...localFormData.auth?.okta, client_id: v } as any } });
            }}
            placeholder="0oa..."
            style={settingsFieldStyle}
          />

          <FormTextField
            label="Client Secret (optional, for confidential clients):"
            value={localFormData.auth?.okta?.client_secret || ''}
            onChange={v => {
              updateFormData('auth.okta.client_secret', v);
              onUpdateSettings({ auth: { ...localFormData.auth, okta: { ...localFormData.auth?.okta, client_secret: v } as any } });
            }}
            placeholder="Leave empty for PKCE-only (public client)"
            style={settingsFieldStyle}
          />

          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '32rem' }}>
            Requires an OIDC Web Application registered in Okta. Set the sign-in redirect URI to:
            <code style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {window.location.origin}/api/auth/okta/callback
            </code>
          </p>
        </>
      )}

      <h3 style={{ margin: "24px 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
        Users
      </h3>

      {usersLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading users...</p>
      ) : users.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          No users registered yet. First user can be created via the setup endpoint using ADMIN_SECRET.
        </p>
      ) : (
        <table style={{ width: '100%', maxWidth: '48rem', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Username</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Display Name</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Source</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Last Login</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}>
                <td style={{ padding: '6px 8px' }}>{user.username}</td>
                <td style={{ padding: '6px 8px' }}>{user.display_name}</td>
                <td style={{ padding: '6px 8px' }}>{user.source}</td>
                <td style={{ padding: '6px 8px' }}>
                  <select
                    value={user.role}
                    onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
                    style={{ fontSize: '12px', padding: '2px 4px' }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td style={{ padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {user.last_login ? new Date(user.last_login).toLocaleString() : '-'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    style={{ fontSize: '12px', color: 'var(--status-danger-text)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
};
