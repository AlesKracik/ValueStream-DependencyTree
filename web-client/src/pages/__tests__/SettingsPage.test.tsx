import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SettingsPage, DEFAULT_SETTINGS } from '../SettingsPage';
import type { ValueStreamData, Settings } from '@valuestream/shared-types';
import { MemoryRouter } from 'react-router-dom';

// Mock NotificationContext
const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();

vi.mock('../../contexts/NotificationContext', () => ({
    useNotificationContext: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    })
}));

const mockSettings: Settings = {
    general: {
        fiscal_year_start_month: 1,
        sprint_duration_days: 14
    },
    persistence: {
        app_provider: 'mongo',
        customer_provider: 'mongo',
        mongo: {
            app: {
                uri: 'mongodb://localhost:27017',
                db: 'testdb',
                use_proxy: false,
                tunnel_name: 'app',
                auth: {
                    method: 'scram',
                    aws_auth_type: 'static',
                    static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
                    role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '' },
                    sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '' },
                    oidc_token: ''
                }
            },
            customer: {
                uri: '',
                db: '',
                use_proxy: false,
                tunnel_name: 'customer',
                collection: 'Customers',
                auth: {
                    method: 'scram',
                    aws_auth_type: 'static',
                    static: { aws_access_key: '', aws_secret_key: '', aws_session_token: '' },
                    role: { aws_role_arn: '', aws_external_id: '', aws_role_session_name: '' },
                    sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '' },
                    oidc_token: ''
                }
            }
        }
    },
    jira: {
        base_url: 'https://jira.com',
        api_version: '3',
        api_token: 'token',
        customer: { jql_new: '', jql_in_progress: '', jql_noop: '' }
    },
    ai: {
        provider: 'openai',
        api_key: '',
        support: { prompt: '' }
    },
    aha: { subdomain: '', api_key: '' },
    ldap: { url: '', bind_dn: '', bind_password: '', team: { base_dn: '', search_filter: '' } },
    auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
};

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: mockSettings,
    customers: [],
    workItems: [],
    teams: [],
    issues: [],
    sprints: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('SettingsPage', () => {
    const onUpdateSettings = vi.fn();
    const updateIssue = vi.fn();
    const addIssue = vi.fn();
    const updateCustomer = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url === '/api/mongo/databases') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, databases: ['db1', 'db2', 'testdb'] })
                });
            }
            if (url === '/api/mongo/test') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, exists: true, message: 'Connection successful!' })
                });
            }
            return Promise.resolve({ 
                ok: true,
                json: () => Promise.resolve({ 
                    success: true, 
                    data: mockData,
                    message: 'Success' 
                })
            });
        }));
        
        // Mock URL methods for download
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('mock-url'),
            revokeObjectURL: vi.fn()
        });
    });

    it('renders and shows Export button in Persistence tab', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByText('Export to JSON')).toBeDefined();
        expect(screen.getByText('Import from JSON')).toBeDefined();
    });

    it('calls export API and triggers download when Export button is clicked', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const exportBtn = screen.getByText('Export to JSON');
        await act(async () => {
            fireEvent.click(exportBtn);
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/export', expect.objectContaining({
            method: 'POST'
        }));

        await waitFor(() => {
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(screen.getByText(/Export successful! valuestream_export.json download started/i)).toBeDefined();
        });
    });

    it('calls import API when a file is selected and confirmed', async () => {
        mockShowConfirm.mockResolvedValue(true);
        const reloadSpy = vi.fn();
        vi.stubGlobal('location', { reload: reloadSpy });

        const { container } = render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const fileInput = container.querySelector('input[type="file"]')!;
        const file = new File(['{"data": {"customers": []}}'], 'test.json', { type: 'application/json' });

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        expect(mockShowConfirm).toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledWith('/api/mongo/import', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"data":{"data":{"customers":[]}}')
        }));

        await waitFor(() => {
            expect(screen.getByText(/Import successful! Data has been restored/i)).toBeDefined();
        });
    });

    it('shows AWS fields when AWS IAM is selected via props', async () => {
        const awsSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: { 
                            method: 'aws' as const, 
                            aws_auth_type: 'static' as const,
                            aws_profile: 'default'
                        }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={awsSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByText('AWS IAM Credentials')).toBeDefined();
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
    });

    it('saves connection settings on blur', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const uriInput = screen.getByLabelText(/MongoDB URI:/i);
        
        await act(async () => {
            fireEvent.change(uriInput, { target: { value: 'mongodb://new-host:27017' } });
        });
        
        expect(onUpdateSettings).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.blur(uriInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            persistence: expect.objectContaining({
                mongo: expect.objectContaining({
                    app: expect.objectContaining({ uri: 'mongodb://new-host:27017' })
                })
            })
        }));
    });

    it('shows AWS Assume Role configuration when role type is active', async () => {
        const roleSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: {
                            method: 'aws' as const,
                            aws_auth_type: 'role' as const,
                            role: { aws_role_arn: '' }
                        }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={roleSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Role ARN:/i)).toBeDefined();
        expect(screen.getByLabelText(/External ID \(Optional\):/i)).toBeDefined();
        
        const arnInput = screen.getByLabelText(/Role ARN:/i);
        await act(async () => {
            fireEvent.change(arnInput, { target: { value: 'arn:aws:iam::123:role/MyRole' } });
            fireEvent.blur(arnInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            persistence: expect.objectContaining({
                mongo: expect.objectContaining({
                    app: expect.objectContaining({
                        auth: expect.objectContaining({ role: expect.objectContaining({ aws_role_arn: 'arn:aws:iam::123:role/MyRole' }) })
                    })
                })
            })
        }));
    });

    it('shows SSO Configuration fields and disables login button when start URL is empty', async () => {
        const ssoSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: {
                            method: 'aws' as const,
                            aws_auth_type: 'sso' as const,
                            sso: { aws_sso_start_url: '', aws_sso_region: '', aws_sso_account_id: '', aws_sso_role_name: '' },
                        }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage
                    settings={ssoSettings}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/SSO Start URL:/i)).toBeDefined();
        expect(screen.getByLabelText(/SSO Region:/i)).toBeDefined();

        const loginBtn = screen.getByText('Login via AWS SSO');
        expect(loginBtn).toBeDefined();
        expect((loginBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('renders correctly with empty settings using defaults', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={DEFAULT_SETTINGS} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Fiscal Year Start Month:/i)).toBeDefined();
        const select = screen.getByLabelText(/Fiscal Year Start Month:/i) as HTMLSelectElement;
        expect(select.value).toBe('1');
    });

    it('renders Jira tab without crashing when settings prop is an empty object', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=jira&subtab=common']}>
                <SettingsPage 
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    settings={{} as any} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Jira Base URL:/i)).toBeDefined();
        const input = screen.getByLabelText(/Jira Base URL:/i) as HTMLInputElement;
        expect(input.value).toBe('');
    });

    it('renders Persistence tab without crashing when settings are from DEFAULT_SETTINGS', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={DEFAULT_SETTINGS} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/MongoDB URI:/i)).toBeDefined();
        const input = screen.getByLabelText(/MongoDB URI:/i) as HTMLInputElement;
        expect(input.value).toBe('');
    });

    it('switches between tabs', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const jiraBtn = screen.getByText('Jira Integration');
        fireEvent.click(jiraBtn);
        expect(screen.getByText('Jira Base URL:')).toBeDefined();

        const persistenceBtn = screen.getByText('Persistence');
        fireEvent.click(persistenceBtn);
        expect(screen.getByText('MongoDB URI:')).toBeDefined();

        const aiBtn = screen.getByText('AI & LLM');
        fireEvent.click(aiBtn);
        expect(screen.getByText('LLM Provider:')).toBeDefined();
    });

    it('tests MongoDB connection successfully', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const testBtn = screen.getByText('Test Mongo Connection');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByText('Connection successful!')).toBeDefined();
        });
    });

    it('shows error when MongoDB connection fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url === '/api/mongo/test') {
                return Promise.resolve({
                    ok: false,
                    json: () => Promise.resolve({ success: false, error: 'Auth failed' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, databases: [] }) });
        }));

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const testBtn = screen.getByText('Test Mongo Connection');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByText('Auth failed')).toBeDefined();
        });
    });

    it('tests Jira connection successfully', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=jira&subtab=common']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const testBtn = screen.getByText('Test Connection');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/jira/test', expect.any(Object));
            expect(screen.getByText('Success')).toBeDefined();
        });
    });

    it('initiates AWS SSO login and shows waiting message', async () => {
        const awsSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: {
                            method: 'aws' as const,
                            aws_auth_type: 'sso' as const,
                            sso: { aws_sso_start_url: 'https://test.awsapps.com/start', aws_sso_region: 'us-east-1', aws_sso_account_id: '123456789012', aws_sso_role_name: 'ReadOnly' },
                        }
                    }
                }
            }
        };

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url === '/api/aws/sso/login') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        success: true,
                        session_id: 'test-session',
                        verification_url: 'https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-1234',
                        message: 'Waiting for authorization...'
                    })
                });
            }
            // Poll returns pending
            if (url === '/api/aws/sso/poll') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: false, pending: true })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
        }));

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage
                    settings={awsSettings}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const loginBtn = screen.getByText('Login via AWS SSO');
        fireEvent.click(loginBtn);

        await waitFor(() => {
            // Both the button and the message div show "Waiting for authorization..."
            expect(screen.getAllByText('Waiting for authorization...').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('isolates SSO login messages between app and customer contexts', async () => {
        const awsSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: {
                            method: 'aws' as const,
                            aws_auth_type: 'sso' as const,
                            sso: { aws_sso_start_url: 'https://test.awsapps.com/start', aws_sso_region: 'us-east-1', aws_sso_account_id: '123', aws_sso_role_name: 'R' },
                        }
                    },
                    customer: {
                        ...mockSettings.persistence.mongo.customer,
                        auth: {
                            method: 'aws' as const,
                            aws_auth_type: 'sso' as const,
                            sso: { aws_sso_start_url: 'https://test-customer.awsapps.com/start', aws_sso_region: 'us-east-1', aws_sso_account_id: '456', aws_sso_role_name: 'R' },
                        }
                    }
                }
            }
        };

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url === '/api/aws/sso/login') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        success: true,
                        session_id: 'test-session',
                        message: 'Waiting for authorization...'
                    })
                });
            }
            if (url === '/api/aws/sso/poll') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: false, pending: true })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
        }));

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subtab=mongo&subsubtab=application']}>
                <SettingsPage
                    settings={awsSettings}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        // Click login on app tab
        const loginBtn = screen.getByText('Login via AWS SSO');
        fireEvent.click(loginBtn);

        await waitFor(() => {
            expect(screen.getAllByText('Waiting for authorization...').length).toBeGreaterThanOrEqual(1);
        });

        // Navigate to customer tab - SSO message should not carry over
        const customerTab = screen.getByText('Customer');
        fireEvent.click(customerTab);

        await waitFor(() => {
            // Customer tab should show a fresh "Login via AWS SSO" button (not "Waiting...")
            expect(screen.getByText('Login via AWS SSO')).toBeDefined();
        });
    });

    it('correctly displays nested settings data from props in the UI', async () => {
        const customSettings: Settings = {
            ...mockSettings,
            jira: {
                ...mockSettings.jira,
                base_url: 'https://custom-jira.com',
                customer: {
                    jql_new: 'project = NEW',
                    jql_in_progress: 'project = WIP',
                    jql_noop: 'project = BLOCKED'
                }
            },
            ai: {
                ...mockSettings.ai,
                support: {
                    prompt: 'Extract issues from these Slack logs'
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=jira&subtab=common']}>
                <SettingsPage 
                    settings={customSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        // Check common Jira settings
        expect(screen.getByDisplayValue('https://custom-jira.com')).toBeDefined();

        // Navigate to Jira Customer subtab
        const customerSubTabBtn = screen.getByText('Customer');
        fireEvent.click(customerSubTabBtn);

        // Verify nested JQL fields are shown
        expect(screen.getByDisplayValue('project = NEW')).toBeDefined();
        expect(screen.getByDisplayValue('project = WIP')).toBeDefined();
        expect(screen.getByDisplayValue('project = BLOCKED')).toBeDefined();

        // Navigate to AI Support subtab
        const aiTabBtn = screen.getByText('AI & LLM');
        fireEvent.click(aiTabBtn);
        const supportSubTabBtn = screen.getByText('Support');
        fireEvent.click(supportSubTabBtn);

        // Verify nested prompt is shown
        expect(screen.getByDisplayValue('Extract issues from these Slack logs')).toBeDefined();
    });

    it('renders Glean provider configuration correctly', async () => {
        const gleanSettings = {
            ...mockSettings,
            ai: {
                ...mockSettings.ai,
                provider: 'glean' as const,
                api_key: 'test-token',
                glean_url: 'https://custom-glean.com'
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=ai&subtab=general']}>
                <SettingsPage 
                    settings={gleanSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Glean URL:/i)).toBeDefined();
        expect(screen.getByDisplayValue('https://custom-glean.com')).toBeDefined();

        const urlInput = screen.getByLabelText(/Glean URL:/i);
        await act(async () => {
            fireEvent.change(urlInput, { target: { value: 'https://new-glean.com' } });
            fireEvent.blur(urlInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            ai: expect.objectContaining({ glean_url: 'https://new-glean.com' })
        }));
        
        // Model input should be hidden for glean
        expect(screen.queryByLabelText(/LLM Model \(Optional\):/i)).toBeNull();
    });

    it('handles theme selection and persistence', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={DEFAULT_SETTINGS} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        const themeSelect = screen.getByLabelText(/Color Palette:/i) as HTMLSelectElement;
        expect(themeSelect.value).toBe('dark');

        await act(async () => {
            fireEvent.change(themeSelect, { target: { value: 'filips' } });
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            general: expect.objectContaining({ theme: 'filips' })
        }));
    });

    it('renders LDAP General subtab with connection fields', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=ldap&subtab=general']}>
                <SettingsPage
                    settings={mockSettings}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/LDAP URL:/i)).toBeDefined();
        expect(screen.getByLabelText(/Bind DN:/i)).toBeDefined();
        expect(screen.getByLabelText(/Bind Password:/i)).toBeDefined();
    });

    it('renders LDAP Team subtab with search fields', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=ldap&subtab=team']}>
                <SettingsPage
                    settings={mockSettings}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Base DN:/i)).toBeDefined();
        expect(screen.getByLabelText(/Search Filter:/i)).toBeDefined();
        expect(screen.getByText(/LDAP_TEAM_NAME/)).toBeDefined();
    });

    it('renders LDAP tab without crashing when settings prop is an empty object', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=ldap&subtab=general']}>
                <SettingsPage
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    settings={{} as any}
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateIssue={updateIssue}
                    addIssue={addIssue}
                    updateCustomer={updateCustomer}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/LDAP URL:/i)).toBeDefined();
        const input = screen.getByLabelText(/LDAP URL:/i) as HTMLInputElement;
        expect(input.value).toBe('');
    });
});
