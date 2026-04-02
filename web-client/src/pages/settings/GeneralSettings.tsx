import type { SettingsTabProps } from './types';
import { FormSelectField, FormNumberField } from '../../components/common/FormFields';
import { ScopeIndicator } from '../../components/common/ScopeIndicator';

const settingsFieldStyle = { display: "flex" as const, flexDirection: "column" as const, gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" };

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
      <FormSelectField
        label="Color Palette:"
        labelSuffix={<ScopeIndicator path="general.theme" />}
        value={localFormData.general?.theme || 'dark'}
        onChange={v => {
            const val = v as 'dark' | 'filips';
            updateFormData('general.theme', val);
            onUpdateSettings({ general: { ...localFormData.general, theme: val } });
        }}
        options={[
            { value: 'dark', label: 'Dark mode' },
            { value: 'filips', label: 'Filips mode' },
        ]}
        style={{ ...settingsFieldStyle, marginBottom: "20px" }}
      />

      <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-secondary)", paddingBottom: "4px" }}>
        Time
      </h3>
      <FormSelectField
        label="Fiscal Year Start Month:"
        labelSuffix={<ScopeIndicator path="general.fiscal_year_start_month" />}
        value={localFormData.general?.fiscal_year_start_month || 1}
        onChange={v => {
            const val = parseInt(v);
            updateFormData('general.fiscal_year_start_month', val);
            onUpdateSettings({ general: { ...localFormData.general, fiscal_year_start_month: val } });
        }}
        options={[
            { value: 1, label: 'January (Calendar Year)' },
            { value: 2, label: 'February' },
            { value: 3, label: 'March' },
            { value: 4, label: 'April' },
            { value: 5, label: 'May' },
            { value: 6, label: 'June' },
            { value: 7, label: 'July' },
            { value: 8, label: 'August' },
            { value: 9, label: 'September' },
            { value: 10, label: 'October' },
            { value: 11, label: 'November' },
            { value: 12, label: 'December' },
        ]}
        style={settingsFieldStyle}
      />

      <FormNumberField
        label="Sprint Duration (Days):"
        labelSuffix={<ScopeIndicator path="general.sprint_duration_days" />}
        helperText="Defines the default end date when creating new sprints. Does not affect existing sprints."
        value={localFormData.general?.sprint_duration_days || 14}
        onChange={v => {
            const val = v ?? 14;
            updateFormData('general.sprint_duration_days', val);
            onUpdateSettings({ general: { ...localFormData.general, sprint_duration_days: val } });
        }}
        min={1}
        max={365}
        style={settingsFieldStyle}
      />
    </>
  );
};
