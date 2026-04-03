import { useSearchParams } from "react-router-dom";
import styles from '../List.module.css';
import type { SettingsTabProps } from './types';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';

export const LdapSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get("subtab") || "general";

  const setSubTab = (subtab: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("subtab", subtab);
      return newParams;
    });
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
          onClick={() => setSubTab("team")}
          className={`${styles.tabButton} ${activeSubTab === "team" ? styles.activeTab : ''}`}
        >
          Team
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeSubTab === "general" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              LDAP URL:
              <input
                type="url"
                placeholder="ldap://localhost:389"
                value={localFormData.ldap?.url || ""}
                onChange={(e) => updateFormData('ldap.url', e.target.value)}
                onBlur={() => onUpdateSettings({ ldap: { ...localFormData.ldap, url: localFormData.ldap?.url } })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              <span>Bind DN:<ScopeIndicator path="ldap.bind_dn" /></span>
              <input
                type="text"
                placeholder="cn=admin,dc=example,dc=com"
                value={localFormData.ldap?.bind_dn || ""}
                onChange={(e) => updateFormData('ldap.bind_dn', e.target.value)}
                onBlur={() => onUpdateSettings({ ldap: { ...localFormData.ldap, bind_dn: localFormData.ldap?.bind_dn } })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              <span>Bind Password:<ScopeIndicator path="ldap.bind_password" /></span>
              <input
                type="password"
                placeholder="Bind password"
                value={localFormData.ldap?.bind_password || ""}
                onChange={(e) => updateFormData('ldap.bind_password', e.target.value)}
                onBlur={() => onUpdateSettings({ ldap: { ...localFormData.ldap, bind_password: localFormData.ldap?.bind_password } })}
              />
            </label>
          </div>
        )}

        {activeSubTab === "team" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Base DN:
              <input
                type="text"
                placeholder="ou=teams,dc=example,dc=com"
                value={localFormData.ldap?.team?.base_dn || ""}
                onChange={(e) => updateFormData('ldap.team.base_dn', e.target.value)}
                onBlur={() => onUpdateSettings({ ldap: { ...localFormData.ldap, team: { ...localFormData.ldap?.team, base_dn: localFormData.ldap?.team?.base_dn } } })}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
              Search Filter:
              <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0" }}>
                Use <code>{"{{LDAP_TEAM_NAME}}"}</code> as a placeholder for the team name.
              </p>
              <input
                type="text"
                placeholder="(&(objectClass=group)(cn={{LDAP_TEAM_NAME}}))"
                value={localFormData.ldap?.team?.search_filter || ""}
                onChange={(e) => updateFormData('ldap.team.search_filter', e.target.value)}
                onBlur={() => onUpdateSettings({ ldap: { ...localFormData.ldap, team: { ...localFormData.ldap?.team, search_filter: localFormData.ldap?.team?.search_filter } } })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
