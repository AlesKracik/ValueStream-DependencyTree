import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeneralSettings } from '../GeneralSettings';
import type { Settings } from '@valuestream/shared-types';

const baseSettings: Settings = {
  general: { fiscal_year_start_month: 1, sprint_duration_days: 14, theme: 'dark', items_per_page: 25, theme_definitions: [] },
  persistence: {
    app_provider: 'mongo',
    customer_provider: 'mongo',
    mongo: {
      app: { uri: '', db: '', use_proxy: false, tunnel_name: 'app',
        auth: { method: 'scram', aws_auth_type: 'static',
          static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '' },
          sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '' },
          oidc_token: '' } },
      customer: { uri: '', db: '', use_proxy: false, tunnel_name: 'customer', collection: 'Customers',
        auth: { method: 'scram', aws_auth_type: 'static',
          static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
          role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '' },
          sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '' },
          oidc_token: '' } }
    }
  },
  jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
  ai: { provider: 'openai', api_key: '', support: { prompt: '' } },
  aha: { subdomain: '', api_key: '' },
  ldap: { url: '', bind_dn: '', bind_password: '', team: { base_dn: '', search_filter: '' } },
  auth: { method: 'local', session_expiry_hours: 24, default_role: 'viewer' },
};

describe('GeneralSettings', () => {
  let updateFormData: ReturnType<typeof vi.fn>;
  let onUpdateSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateFormData = vi.fn();
    onUpdateSettings = vi.fn();
  });

  const renderWith = (settings: Settings = baseSettings) =>
    render(
      <MemoryRouter initialEntries={['/settings?tab=general']}>
        <GeneralSettings
          localFormData={settings}
          settings={settings}
          updateFormData={updateFormData}
          onUpdateSettings={onUpdateSettings}
        />
      </MemoryRouter>
    );

  it('shows User subtab by default with theme & items-per-page fields', () => {
    renderWith();
    expect(screen.getByText('Active theme:')).toBeTruthy();
    expect(screen.getByText('Items per page:')).toBeTruthy();
    expect(screen.queryByText('Fiscal Year Start Month:')).toBeNull();
  });

  it('switches to Time subtab and shows fiscal/sprint fields', () => {
    renderWith();
    fireEvent.click(screen.getByRole('tab', { name: 'Time' }));
    expect(screen.getByText('Fiscal Year Start Month:')).toBeTruthy();
    expect(screen.getByText('Sprint Duration (Days):')).toBeTruthy();
  });

  it('switches to Theme Definition subtab and lists both built-in themes', () => {
    renderWith();
    fireEvent.click(screen.getByRole('tab', { name: 'Theme Definition' }));
    expect(screen.getByText('Dark mode')).toBeTruthy();
    expect(screen.getByText('Filips mode')).toBeTruthy();
    expect(screen.getByText(/Add custom theme/)).toBeTruthy();
  });

  it('adds a custom theme via the Add button', () => {
    renderWith();
    fireEvent.click(screen.getByRole('tab', { name: 'Theme Definition' }));
    fireEvent.click(screen.getByText(/Add custom theme/));

    expect(onUpdateSettings).toHaveBeenCalled();
    const lastCall = onUpdateSettings.mock.calls.at(-1)![0];
    const defs = lastCall.general.theme_definitions;
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ id: 'custom-1', builtin: false, base: 'dark' });
  });

  it('lists custom themes in the User subtab theme dropdown', () => {
    const settings: Settings = {
      ...baseSettings,
      general: {
        ...baseSettings.general,
        theme_definitions: [
          { id: 'mybrand', label: 'My Brand', builtin: false, base: 'dark', colors: {} },
        ],
      },
    };
    renderWith(settings);
    const select = screen.getByLabelText(/Active theme:/) as HTMLSelectElement;
    const labels = Array.from(select.options).map(o => o.textContent);
    expect(labels).toContain('My Brand');
  });
});
