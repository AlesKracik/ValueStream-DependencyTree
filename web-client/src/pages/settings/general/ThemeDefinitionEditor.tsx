import { useState } from 'react';
import {
  THEME_VARIABLES,
  type BuiltinThemeId,
  type ThemeDefinition,
  type ThemeVariableDef,
  type ThemeVariableGroup,
} from '@valuestream/shared-types';
import type { SettingsTabProps } from '../types';
import { ScopeIndicator } from '../../../components/common/ScopeIndicator';

const BUILTIN_THEMES: { id: BuiltinThemeId; label: string }[] = [
  { id: 'dark', label: 'Dark mode' },
  { id: 'filips', label: 'Filips mode' },
];

const GROUP_ORDER: ThemeVariableGroup[] = [
  'Backgrounds',
  'Text',
  'Nodes',
  'Sprint Nodes',
  'Borders & Edges',
  'Accents',
  'Status',
  'Misc',
];

const groupedVariables: Record<ThemeVariableGroup, ThemeVariableDef[]> = (() => {
  const acc = Object.fromEntries(GROUP_ORDER.map(g => [g, [] as ThemeVariableDef[]])) as Record<ThemeVariableGroup, ThemeVariableDef[]>;
  for (const v of THEME_VARIABLES) acc[v.group].push(v);
  return acc;
})();

/**
 * Server-scoped editor for theme palette overrides and custom themes.
 *
 * Built-in themes (`dark`, `filips`) start with the index.css defaults and store only
 * sparse overrides in `theme_definitions`. Custom themes always carry a `base` built-in
 * plus an explicit (and again sparse) override map; runtime resolution falls back to
 * the base's defaults for any unset variable.
 */
export const ThemeDefinitionEditor: React.FC<SettingsTabProps> = ({
  localFormData,
  updateFormData,
  onUpdateSettings,
}) => {
  const themeDefs = localFormData.general?.theme_definitions ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  const allRows: ThemeDefinition[] = [
    ...BUILTIN_THEMES.map(b => themeDefs.find(t => t.builtin && t.id === b.id) ?? {
      id: b.id, label: b.label, builtin: true, colors: {} as Record<string, string>,
    } satisfies ThemeDefinition),
    ...themeDefs.filter(t => !t.builtin),
  ];

  const persist = (next: ThemeDefinition[]) => {
    // Drop synthesised built-in stubs that have no overrides to keep the saved value tidy.
    const trimmed = next.filter(t => !t.builtin || Object.keys(t.colors).length > 0);
    updateFormData('general.theme_definitions', trimmed);
    onUpdateSettings({ general: { ...localFormData.general, theme_definitions: trimmed } });
  };

  const upsertTheme = (theme: ThemeDefinition) => {
    const idx = themeDefs.findIndex(t => t.id === theme.id);
    const next = idx === -1 ? [...themeDefs, theme] : themeDefs.map((t, i) => (i === idx ? theme : t));
    persist(next);
  };

  const removeCustomTheme = (id: string) => {
    persist(themeDefs.filter(t => !(t.id === id && !t.builtin)));
  };

  const addCustomTheme = () => {
    const baseId = (themeDefs.find(t => t.id === 'dark')?.id ?? 'dark') as BuiltinThemeId;
    let n = 1;
    while (allRows.some(t => t.id === `custom-${n}`)) n++;
    const created: ThemeDefinition = {
      id: `custom-${n}`,
      label: `Custom ${n}`,
      builtin: false,
      base: baseId,
      colors: {},
    };
    persist([...themeDefs, created]);
    setExpanded(created.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Customise built-in themes or define new ones. Stored at server level.</span>
        <ScopeIndicator path="general.theme_definitions" />
      </div>

      {allRows.map(theme => (
        <ThemeRow
          key={theme.id}
          theme={theme}
          expanded={expanded === theme.id}
          onToggle={() => setExpanded(expanded === theme.id ? null : theme.id)}
          onChange={upsertTheme}
          onDelete={!theme.builtin ? () => removeCustomTheme(theme.id) : undefined}
          customIdsTaken={allRows.filter(t => t.id !== theme.id).map(t => t.id)}
        />
      ))}

      <div>
        <button
          type="button"
          onClick={addCustomTheme}
          style={{
            background: 'var(--accent-primary-bg)',
            color: 'var(--accent-text)',
            border: '1px solid var(--accent-primary)',
            padding: '8px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          + Add custom theme
        </button>
      </div>
    </div>
  );
};

/* ───────────── Row ───────────── */

interface ThemeRowProps {
  theme: ThemeDefinition;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: ThemeDefinition) => void;
  onDelete?: () => void;
  customIdsTaken: string[];
}

const ThemeRow: React.FC<ThemeRowProps> = ({ theme, expanded, onToggle, onChange, onDelete, customIdsTaken }) => {
  const base: BuiltinThemeId = theme.builtin ? (theme.id as BuiltinThemeId) : (theme.base ?? 'dark');
  const overrideCount = Object.keys(theme.colors).length;

  const updateColor = (varName: string, value: string) => {
    const def = THEME_VARIABLES.find(v => v.name === varName);
    const defaultValue = def?.defaults[base] ?? '';
    const nextColors = { ...theme.colors };
    if (value.trim() === '' || value === defaultValue) {
      delete nextColors[varName];
    } else {
      nextColors[varName] = value;
    }
    onChange({ ...theme, colors: nextColors });
  };

  const resetColor = (varName: string) => {
    const next = { ...theme.colors };
    delete next[varName];
    onChange({ ...theme, colors: next });
  };

  return (
    <div style={{
      border: '1px solid var(--border-secondary)',
      borderRadius: 6,
      background: 'var(--bg-tertiary)',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 12 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{theme.label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {theme.builtin ? `built-in (${theme.id})` : `custom · base: ${theme.base ?? 'dark'} · id: ${theme.id}`}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {overrideCount} {overrideCount === 1 ? 'override' : 'overrides'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '4px 14px 14px 14px', borderTop: '1px solid var(--border-secondary)' }}>
          {!theme.builtin && (
            <CustomThemeMeta theme={theme} onChange={onChange} onDelete={onDelete} customIdsTaken={customIdsTaken} />
          )}

          {GROUP_ORDER.map(group => (
            <div key={group} style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: 'var(--text-secondary)' }}>{group}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                {groupedVariables[group].map(v => (
                  <ColorRow
                    key={v.name}
                    varDef={v}
                    base={base}
                    value={theme.colors[v.name]}
                    onChange={val => updateColor(v.name, val)}
                    onReset={() => resetColor(v.name)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ───────────── Custom theme metadata ───────────── */

interface CustomThemeMetaProps {
  theme: ThemeDefinition;
  onChange: (next: ThemeDefinition) => void;
  onDelete?: () => void;
  customIdsTaken: string[];
}

const CustomThemeMeta: React.FC<CustomThemeMetaProps> = ({ theme, onChange, onDelete, customIdsTaken }) => {
  const [idDraft, setIdDraft] = useState(theme.id);

  const idValid = /^[a-z0-9][a-z0-9-]*$/i.test(idDraft) && !customIdsTaken.includes(idDraft);

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', paddingTop: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>Display name</span>
        <input
          type="text"
          value={theme.label}
          onChange={e => onChange({ ...theme, label: e.target.value })}
          style={{ padding: '6px 8px', minWidth: 200 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>ID (used internally)</span>
        <input
          type="text"
          value={idDraft}
          onChange={e => setIdDraft(e.target.value)}
          onBlur={() => {
            if (idValid && idDraft !== theme.id) onChange({ ...theme, id: idDraft });
            else setIdDraft(theme.id);
          }}
          style={{
            padding: '6px 8px',
            minWidth: 160,
            border: idDraft !== theme.id && !idValid ? '1px solid var(--status-danger)' : undefined,
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>Base palette</span>
        <select
          value={theme.base ?? 'dark'}
          onChange={e => onChange({ ...theme, base: e.target.value as BuiltinThemeId })}
          style={{ padding: '6px 8px' }}
        >
          {BUILTIN_THEMES.map(b => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
      </label>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'var(--status-danger-bg)',
            color: 'var(--status-danger-text)',
            border: '1px solid var(--status-danger-border)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Delete theme
        </button>
      )}
    </div>
  );
};

/* ───────────── Color row ───────────── */

interface ColorRowProps {
  varDef: ThemeVariableDef;
  base: BuiltinThemeId;
  value: string | undefined;
  onChange: (value: string) => void;
  onReset: () => void;
}

const ColorRow: React.FC<ColorRowProps> = ({ varDef, base, value, onChange, onReset }) => {
  const defaultValue = varDef.defaults[base];
  const effective = value ?? defaultValue;
  const isOverridden = value !== undefined;
  const isColor = varDef.kind === 'color' && /^#[0-9a-f]{6}$/i.test(effective);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 1fr) auto auto auto',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      padding: '4px 0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: isOverridden ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {varDef.label}
          {isOverridden && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-text)' }}>(overridden)</span>}
        </span>
        <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{varDef.name}</code>
      </div>

      {isColor ? (
        <input
          type="color"
          value={effective}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 28, padding: 0, border: '1px solid var(--border-secondary)', background: 'transparent' }}
          aria-label={`${varDef.label} color`}
        />
      ) : (
        <span
          style={{
            width: 36,
            height: 28,
            borderRadius: 4,
            border: '1px solid var(--border-secondary)',
            background: effective,
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
      )}

      <input
        type="text"
        value={effective}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          padding: '4px 6px',
          width: 200,
          border: '1px solid var(--border-secondary)',
          background: 'var(--bg-input-focus)',
          color: 'var(--text-primary)',
          borderRadius: 4,
        }}
      />

      <button
        type="button"
        onClick={onReset}
        disabled={!isOverridden}
        style={{
          background: 'transparent',
          color: isOverridden ? 'var(--text-link)' : 'var(--text-muted)',
          border: 'none',
          padding: '4px 8px',
          cursor: isOverridden ? 'pointer' : 'default',
          fontSize: 12,
        }}
        title={isOverridden ? `Reset to default (${defaultValue})` : 'No override to reset'}
      >
        Reset
      </button>
    </div>
  );
};
