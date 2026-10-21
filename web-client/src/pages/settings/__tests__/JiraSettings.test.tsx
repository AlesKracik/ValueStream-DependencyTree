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

describe('JiraSettings — Import team', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves an imported issue without a team mapping unassigned instead of taking the first team', async () => {
    (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { issues: [{ key: 'PROJ-1', fields: { summary: 'No team' } }], names: {} } })
    });
    const addIssue = vi.fn().mockResolvedValue({ id: 'i1' });
    const settings = baseSettings;
    render(
      <MemoryRouter initialEntries={['/?subtab=work-items']}>
        <JiraSettings
          localFormData={settings} updateFormData={vi.fn()} onUpdateSettings={vi.fn()} settings={settings}
          data={mockData} updateIssue={vi.fn()} addIssue={addIssue} updateCustomer={vi.fn()}
          updateWorkItem={vi.fn()} addWorkItem={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/project = PROJ/i), { target: { value: 'project = PROJ' } });
    fireEvent.click(screen.getByRole('button', { name: /import from jira/i }));

    await waitFor(() => expect(addIssue).toHaveBeenCalled());
    expect(addIssue.mock.calls[0][0]).toMatchObject({ jira_key: 'PROJ-1', team_id: '' });
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

describe('JiraSettings — Jira ↔ Aha! cross links', () => {
  beforeEach(() => vi.clearAllMocks());

  const crossSettings: Settings = {
    ...baseSettings,
    aha: { subdomain: 'acme', api_key: 'k', use_jira_cross_links: true },
  };
  const renderCross = (settings: Settings) => {
    const addIssue = vi.fn();
    const data = {
      ...mockData,
      workItems: [{ id: 'w1', name: 'DR-133', status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [], links: { aha: { key: 'DR-133' } } }],
    } as unknown as ValueStreamData;
    render(
      <MemoryRouter initialEntries={['/?subtab=work-items']}>
        <JiraSettings
          localFormData={settings} updateFormData={vi.fn()} onUpdateSettings={vi.fn()} settings={settings}
          data={data} updateIssue={vi.fn()} addIssue={addIssue} updateCustomer={vi.fn()}
          updateWorkItem={vi.fn()} addWorkItem={vi.fn()}
        />
      </MemoryRouter>
    );
    return addIssue;
  };

  it('hides the switch while Aha! is not configured', () => {
    renderCross(baseSettings);
    expect(screen.queryByText('Use Jira ↔ Aha! cross links')).toBeNull();
  });

  it('import requests the aha property and assigns the issue to the linked work item', async () => {
    (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { issues: [{
        key: 'DRAAS-49689',
        fields: { summary: 'Linked' },
        properties: { aha: { '7694707249561474905': { record_type: 'feature', reference_num: 'DR-133' } } },
      }], names: {} } })
    });
    const addIssue = renderCross(crossSettings);
    expect(screen.getByText('Use Jira ↔ Aha! cross links')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/project = PROJ/i), { target: { value: 'project = DRAAS' } });
    fireEvent.click(screen.getByRole('button', { name: /import from jira/i }));

    await waitFor(() => expect(addIssue).toHaveBeenCalled());
    const [, options] = (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body).properties).toEqual(['aha']);
    expect(addIssue.mock.calls[0][0]).toMatchObject({ jira_key: 'DRAAS-49689', work_item_id: 'w1' });
    await waitFor(() => expect(screen.getByText(/Cross links: 1 assigned/)).toBeTruthy());
  });
});

describe('JiraSettings — failure details', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sync lists issues Jira did not return', async () => {
    (api.authorizedFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { issues: [{ key: 'PROJ-1', fields: { summary: 'Kept' } }], names: {} } })
    });
    const data = {
      ...mockData,
      issues: [
        { id: 'e1', jira_key: 'PROJ-1', team_id: '', effort_md: 0 },
        { id: 'e2', jira_key: 'PROJ-2', team_id: '', effort_md: 0 },
      ],
    } as unknown as ValueStreamData;
    render(
      <MemoryRouter initialEntries={['/?subtab=work-items']}>
        <JiraSettings
          localFormData={baseSettings} updateFormData={vi.fn()} onUpdateSettings={vi.fn()} settings={baseSettings}
          data={data} updateIssue={vi.fn().mockResolvedValue(undefined)} addIssue={vi.fn()} updateCustomer={vi.fn()}
          updateWorkItem={vi.fn()} addWorkItem={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /sync issues from jira/i }));

    await waitFor(() => expect(screen.getByText(/Sync complete. 1 succeeded, 1 failed./)).toBeTruthy());
    expect(screen.getByText(/Not returned by Jira/)).toBeTruthy();
    expect(screen.getByText('PROJ-2')).toBeTruthy();
  });
});
