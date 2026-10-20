import { crossLinksAvailable } from '../../utils/crossLinks';
import type { SettingsTabProps } from './types';

/**
 * Switch for the Jira ↔ Aha! cross links kept by Aha!'s Jira integration.
 * Shown on both the Jira and the Aha! tab, only while both are configured.
 */
export const CrossLinksToggle: React.FC<SettingsTabProps & { disabled?: boolean }> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
  settings,
  disabled,
}) => {
  if (!crossLinksAvailable(localFormData, settings)) return null;
  const checked = localFormData.aha?.use_jira_cross_links === true;

  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.checked;
          updateFormData('aha.use_jira_cross_links', val);
          onUpdateSettings({ aha: { ...localFormData.aha, use_jira_cross_links: val } });
        }}
        style={{ width: "auto", marginTop: "3px" }}
      />
      <span>
        Use Jira ↔ Aha! cross links
        <span style={{ display: "block", color: "var(--text-muted)", fontSize: "12px" }}>
          When Aha!&apos;s Jira integration links an Aha! record to a Jira issue, import and sync assign
          that issue to the record&apos;s work item. Only unassigned issues are assigned.
        </span>
      </span>
    </label>
  );
};
