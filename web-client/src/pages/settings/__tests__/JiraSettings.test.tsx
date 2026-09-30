import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JiraSettings } from '../JiraSettings';
import * as api from '../../../utils/api';
import type { Settings, ValueStreamData, Team } from '@valuestream/shared-types';

vi.mock('../../../utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/api')>()),
  authorizedFetch: vi.fn()
}));

const baseSettings: Settings = {
  general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
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
  jira: {
    base_url: 'https://example.atlassian.net',
    api_version: '3',
    username: 'me@example.com',
    api_token: 'tok',
    customer: { jql_new: '', jql_in_progress: '', jql_noop: '' }
  },
  ai: { provider: 'openai', api_key: '', support: { prompt: '' } },
  aha: { subdomain: '', api_key: '' },
  ldap: { url: '', bind_dn: '', bind_password: '', team: { base_dn: '', search_filter: '' } },
  auth: { method: 'local', session_expiry_hours: 24, default_role: 'viewer' }
};

const mockData = {
  valueStreams: [],
  settings: baseSettings,
  customers: [],
  workItems: [],
  teams: [{ id: 't1', name: 'Team 1' } as unknown as Team],
  issues: [],
  users: []
} as unknown as ValueStreamData;

const renderJiraSettings = (
  jiraOverrides: Partial<Settings['jira']> = {},
  subtab = 'work-items',
) => {
  const settings: Settings = { ...baseSettings, jira: { ...baseSettings.jira, ...jiraOverrides } };
  const props = {
    localFormData: settings,
    updateFormData: vi.fn(),
    onUpdateSettings: vi.fn(),
    settings,
    data: mockData,
    updateIssue: vi.fn().mockResolvedValue(undefined),
    addIssue: vi.fn(),
    updateCustomer: vi.fn().mockResolvedValue(undefined),
    updateWorkItem: vi.fn().mockResolvedValue(undefined),
    addWorkItem: vi.fn()
  };
  return render(
    <MemoryRouter initialEntries={[`/?subtab=${subtab}`]}>
      <JiraSettings {...props} />
    </MemoryRouter>
  );
};

describe('JiraSettings — Import JQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the user JQL verbatim to /api/jira/search (no auto-appended issuetype clause)', async () => {
    (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { issues: [], names: {} } })
    });

    renderJiraSettings();

    const userJql = 'project = PROJ AND status = "In Progress"';
    const jqlInput = screen.getByPlaceholderText(/project = PROJ/i) as HTMLInputElement;
    fireEvent.change(jqlInput, { target: { value: userJql } });

    const importButton = screen.getByRole('button', { name: /import from jira/i });
    fireEvent.click(importButton);

    await waitFor(() => expect(api.authorizedFetch).toHaveBeenCalled());

    const [url, options] = (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/jira/search');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.jql).toBe(userJql);
    expect(sentBody.jql).not.toMatch(/issuetype\s*=\s*Issue/i);
  });
});

describe('JiraSettings — Cloud vs Data Center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Cloud: shows the account e-mail + API token fields and forwards them', async () => {
    (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Connected' })
    });

    renderJiraSettings({}, 'common');

    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByText(/Jira API Token:/)).toBeTruthy();
    expect(screen.getByLabelText('Jira API Version')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => expect(api.authorizedFetch).toHaveBeenCalled());
    const [url, options] = (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/jira/test');
    expect(JSON.parse(options.body).jira).toMatchObject({
      base_url: 'https://example.atlassian.net',
      username: 'me@example.com',
      api_token: 'tok',
    });
  });

  it('Cloud: refuses to test without the account e-mail', async () => {
    renderJiraSettings({ username: '' }, 'common');
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    expect(await screen.findByText(/account e-mail and API token are required/i)).toBeTruthy();
    expect(api.authorizedFetch).not.toHaveBeenCalled();
  });

  it('Data Center: shows the PAT field, hides e-mail and API-version selector', () => {
    renderJiraSettings({ base_url: 'https://jira.example.com', username: undefined }, 'common');
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
    expect(screen.getByText(/Personal Access Token \(PAT\)/)).toBeTruthy();
    expect(screen.queryByLabelText('Jira API Version')).toBeNull();
    expect(screen.getByText(/uses REST API v2/)).toBeTruthy();
  });

  it('explicit deployment overrides URL detection', () => {
    renderJiraSettings({ base_url: 'https://jira.example.com', deployment: 'cloud' }, 'common');
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  });

  it('labels the hierarchy field per deployment', () => {
    const { unmount } = renderJiraSettings();
    expect(screen.getByText(/follow parent\)/)).toBeTruthy();
    unmount();
    renderJiraSettings({ base_url: 'https://jira.example.com' });
    expect(screen.getByText(/follow Parent Link\)/)).toBeTruthy();
  });
});
