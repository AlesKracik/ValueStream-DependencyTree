import type { SettingsTabProps } from './types';

export const GeneralSettings: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  return (
    <>
      <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
        Theme
      </h3>
      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem", marginBottom: "20px" }}>
        Color Palette:
        <select
          value={localFormData.general?.theme || 'dark'}
          onChange={(e) => {
              const val = e.target.value as 'dark' | 'filips';
              updateFormData('general.theme', val);
              onUpdateSettings({ general: { ...localFormData.general, theme: val } });
          }}
        >
          <option value="dark">Dark mode</option>
          <option value="filips">Filips mode</option>
        </select>
      </label>

      <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
        Time
      </h3>
      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
        Fiscal Year Start Month:
        <select
          value={localFormData.general?.fiscal_year_start_month || 1}
          onChange={(e) => {
              const val = parseInt(e.target.value);
              updateFormData('general.fiscal_year_start_month', val);
              onUpdateSettings({ general: { ...localFormData.general, fiscal_year_start_month: val } });
          }}
        >
          <option value={1}>January (Calendar Year)</option>
          <option value={2}>February</option>
          <option value={3}>March</option>
          <option value={4}>April</option>
          <option value={5}>May</option>
          <option value={6}>June</option>
          <option value={7}>July</option>
          <option value={8}>August</option>
          <option value={9}>September</option>
          <option value={10}>October</option>
          <option value={11}>November</option>
          <option value={12}>December</option>
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
        Sprint Duration (Days):
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "-2px", marginBottom: "4px" }}>
          Defines the default end date when creating new sprints. Does not affect existing sprints.
        </span>
        <input
          type="number"
          min="1"
          max="365"
          value={localFormData.general?.sprint_duration_days || 14}
          onChange={(e) => {
              const val = parseInt(e.target.value);
              updateFormData('general.sprint_duration_days', val);
              onUpdateSettings({ general: { ...localFormData.general, sprint_duration_days: val } });
          }}
        />
      </label>
    </>
  );
};
