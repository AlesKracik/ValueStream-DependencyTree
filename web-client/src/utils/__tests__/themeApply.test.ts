import { describe, it, expect, beforeEach } from 'vitest';
import type { ThemeDefinition } from '@valuestream/shared-types';
import { applyTheme, isBuiltinThemeId } from '../themeApply';

const STYLE_ID = 'theme-overrides';

function styleEl(): HTMLStyleElement | null {
  return document.getElementById(STYLE_ID) as HTMLStyleElement | null;
}

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    styleEl()?.remove();
  });

  it('sets data-theme to the requested built-in and emits no overrides for an unconfigured theme', () => {
    applyTheme('dark', undefined);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(styleEl()?.textContent ?? '').toBe('');
  });

  it('emits sparse overrides for a built-in theme with custom colors', () => {
    const themes: ThemeDefinition[] = [
      { id: 'dark', label: 'Dark', builtin: true, colors: { '--bg-page': '#000000' } },
    ];
    applyTheme('dark', themes);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const css = styleEl()?.textContent ?? '';
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--bg-page: #000000');
    // Other variables not specified should NOT be present.
    expect(css).not.toContain('--text-primary');
  });

  it('drops unknown variable names', () => {
    const themes: ThemeDefinition[] = [
      { id: 'dark', label: 'Dark', builtin: true, colors: { '--not-a-real-var': '#fff', '--bg-page': '#111111' } },
    ];
    applyTheme('dark', themes);
    const css = styleEl()?.textContent ?? '';
    expect(css).toContain('--bg-page: #111111');
    expect(css).not.toContain('--not-a-real-var');
  });

  it('emits a full palette for a custom theme rooted under its own data-theme value', () => {
    const themes: ThemeDefinition[] = [
      {
        id: 'mybrand',
        label: 'My Brand',
        builtin: false,
        base: 'dark',
        colors: { '--bg-page': '#222222', '--accent-primary': '#ff00aa' },
      },
    ];
    applyTheme('mybrand', themes);
    expect(document.documentElement.getAttribute('data-theme')).toBe('mybrand');
    const css = styleEl()?.textContent ?? '';
    expect(css).toContain(":root[data-theme='mybrand']");
    // Custom overrides applied
    expect(css).toContain('--bg-page: #222222');
    expect(css).toContain('--accent-primary: #ff00aa');
    // A variable not overridden falls back to the dark base default
    expect(css).toContain('--text-primary: #f1f5f9');
  });

  it('reuses a single style element across multiple calls', () => {
    applyTheme('dark', [{ id: 'dark', label: 'Dark', builtin: true, colors: { '--bg-page': '#111' } }]);
    const first = styleEl();
    applyTheme('filips', [{ id: 'filips', label: 'Filips', builtin: true, colors: { '--bg-page': '#fff' } }]);
    expect(styleEl()).toBe(first);
    expect(document.documentElement.getAttribute('data-theme')).toBe('filips');
    expect(styleEl()?.textContent ?? '').toContain("data-theme='filips'");
  });

  it('clears overrides when nothing is configured for the active theme', () => {
    applyTheme('dark', [{ id: 'dark', label: 'Dark', builtin: true, colors: { '--bg-page': '#000' } }]);
    expect(styleEl()?.textContent).toContain('--bg-page');
    applyTheme('dark', []);
    expect(styleEl()?.textContent ?? '').toBe('');
  });
});

describe('isBuiltinThemeId', () => {
  it('returns true for built-ins and false otherwise', () => {
    expect(isBuiltinThemeId('dark')).toBe(true);
    expect(isBuiltinThemeId('filips')).toBe(true);
    expect(isBuiltinThemeId('mybrand')).toBe(false);
  });
});
