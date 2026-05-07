import type { SettingsTabProps } from '../types';
import { FormSelectField, FormNumberField } from '../../../components/common/FormFields';
import { ScopeIndicator } from '../../../components/common/ScopeIndicator';

const fieldStyle = {
  display: 'flex' as const,
  flexDirection: 'column' as const,
  gap: '6px',
  fontSize: '14px',
  color: 'var(--text-secondary)',
  maxWidth: '32rem',
};

/**
 * "Time" sub-tab of General Settings — fiscal calendar and sprint defaults.
 */
export const TimeSubsection: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  return (
    <>
      <FormSelectField
        label="Fiscal Year Start Month:"
        labelSuffix={<ScopeIndicator path="general.fiscal_year_start_month" />}
        value={localFormData.general?.fiscal_year_start_month || 1}
        onChange={v => {
          const val = parseInt(String(v));
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
        style={{ ...fieldStyle, marginBottom: '20px' }}
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
        style={fieldStyle}
      />
    </>
  );
};
