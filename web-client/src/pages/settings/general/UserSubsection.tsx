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

const groupHeading = {
  margin: '0 0 4px 0',
  fontSize: '15px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-secondary)',
  paddingBottom: '4px',
};

/**
 * "User" sub-tab of General Settings — fields scoped per-user (client storage):
 * theme selection and list page size.
 */
export const UserSubsection: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  const themeDefs = localFormData.general?.theme_definitions ?? [];
  const themeOptions = [
    { value: 'dark', label: 'Dark mode' },
    { value: 'filips', label: 'Filips mode' },
    ...themeDefs
      .filter(t => !t.builtin)
      .map(t => ({ value: t.id, label: t.label || t.id })),
  ];

  return (
    <>
      <h3 style={groupHeading}>Theme</h3>
      <FormSelectField
        label="Active theme:"
        labelSuffix={<ScopeIndicator path="general.theme" />}
        helperText="Built-in themes plus any custom themes defined under 'Theme Definition'."
        value={localFormData.general?.theme || 'dark'}
        onChange={v => {
          const val = String(v);
          updateFormData('general.theme', val);
          onUpdateSettings({ general: { ...localFormData.general, theme: val } });
        }}
        options={themeOptions}
        style={{ ...fieldStyle, marginBottom: '20px' }}
      />

      <h3 style={groupHeading}>Lists</h3>
      <FormNumberField
        label="Items per page:"
        labelSuffix={<ScopeIndicator path="general.items_per_page" />}
        helperText="Page size for list views (Work Items, etc.)."
        value={localFormData.general?.items_per_page ?? 25}
        onChange={v => {
          const val = v ?? 25;
          updateFormData('general.items_per_page', val);
          onUpdateSettings({ general: { ...localFormData.general, items_per_page: val } });
        }}
        min={5}
        max={200}
        style={fieldStyle}
      />
    </>
  );
};
