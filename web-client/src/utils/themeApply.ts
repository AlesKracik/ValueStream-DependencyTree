import { THEME_VARIABLES, type BuiltinThemeId, type ThemeDefinition } from '@valuestream/shared-types';

const STYLE_ELEMENT_ID = 'theme-overrides';
const VALID_VAR_NAMES = new Set(THEME_VARIABLES.map(v => v.name));
const BUILTIN_IDS: ReadonlySet<string> = new Set<BuiltinThemeId>(['dark', 'filips']);

/**
 * Apply the active theme to the document.
 *
 * - `data-theme` is set to a value that picks up the right CSS defaults from `index.css`.
 *   Built-in themes use their own ID. Custom themes use their own ID as well, so the
 *   default `:root[data-theme='dark']` rules don't bleed into them.
 * - A single `<style id="theme-overrides">` element is upserted with the active theme's
 *   variable values. For built-in themes only the overrides are emitted (CSS defaults
 *   handle the rest). For custom themes a full palette is emitted, computed by merging
 *   the chosen `base` defaults with the per-theme overrides.
 */
export function applyTheme(activeThemeId: string | undefined, themeDefs: ThemeDefinition[] | undefined): void {
  const def = activeThemeId ? findTheme(activeThemeId, themeDefs) : undefined;

  // Determine the data-theme attribute value and CSS palette base.
  let attrValue: string;
  let base: BuiltinThemeId;
  let overrides: Record<string, string>;
  let emitFullPalette = false;

  if (def && !def.builtin) {
    attrValue = def.id;
    base = def.base ?? 'dark';
    overrides = def.colors ?? {};
    emitFullPalette = true;
  } else if (def && def.builtin) {
    attrValue = def.id;
    base = def.id as BuiltinThemeId;
    overrides = def.colors ?? {};
  } else {
    // Active theme is a built-in with no saved customisation, or unset.
    attrValue = activeThemeId === 'filips' ? 'filips' : 'dark';
    base = attrValue as BuiltinThemeId;
    overrides = {};
  }

  document.documentElement.setAttribute('data-theme', attrValue);

  const css = buildOverrideCss(attrValue, base, overrides, emitFullPalette);
  upsertStyleElement(css);
}

function findTheme(id: string, themeDefs: ThemeDefinition[] | undefined): ThemeDefinition | undefined {
  return themeDefs?.find(t => t.id === id);
}

function buildOverrideCss(
  attrValue: string,
  base: BuiltinThemeId,
  overrides: Record<string, string>,
  emitFullPalette: boolean,
): string {
  const decls: string[] = [];

  if (emitFullPalette) {
    // Custom theme: emit every known variable, falling through to the base default
    // when the custom theme has not specified an override.
    for (const v of THEME_VARIABLES) {
      const value = overrides[v.name] ?? v.defaults[base];
      if (typeof value === 'string' && value.trim() !== '') {
        decls.push(`  ${v.name}: ${value};`);
      }
    }
  } else {
    // Built-in theme: only the changed values; the rest is in index.css.
    for (const [name, value] of Object.entries(overrides)) {
      if (!VALID_VAR_NAMES.has(name)) continue;
      if (typeof value !== 'string' || value.trim() === '') continue;
      decls.push(`  ${name}: ${value};`);
    }
  }

  if (decls.length === 0) return '';
  return `:root[data-theme='${escapeAttr(attrValue)}'] {\n${decls.join('\n')}\n}`;
}

function upsertStyleElement(css: string): void {
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) {
    el.textContent = css;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/['"\\]/g, '\\$&');
}

/** Whether the given ID names a built-in CSS theme. */
export function isBuiltinThemeId(id: string): id is BuiltinThemeId {
  return BUILTIN_IDS.has(id);
}
