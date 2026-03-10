import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SettingsPage } from '../SettingsPage';
import type { ValueStreamData, Settings } from '../../types/models';
import { MemoryRouter } from 'react-router-dom';

// Mock ValueStreamContext
const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();

vi.mock('../../contexts/ValueStreamContext', () => ({
    useValueStreamContext: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    })
}));

const mockSettings: Settings = {
    jira_base_url: 'https://jira.com',
    jira_api_version: '3',
    jira_api_token: 'token',
    mongo_uri: 'mongodb://localhost:27017',
    mongo_db: 'testdb',
    mongo_auth_method: 'scram',
    mongo_aws_access_key: '',
    mongo_aws_secret_key: '',
    mongo_aws_session_token: '',
    mongo_oidc_token: '',
    customer_jql_new: '',
    customer_jql_in_progress: '',
    customer_jql_noop: '',
    fiscal_year_start_month: 1,
    sprint_duration_days: 14
};

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: mockSettings,
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: []
};

describe('SettingsPage', () => {
    const onUpdateSettings = vi.fn();
    const updateEpic = vi.fn();
    const addEpic = vi.fn();

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
                    updateEpic={updateEpic}
                    addEpic={addEpic}
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
                    updateEpic={updateEpic}
                    addEpic={addEpic}
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
            expect(screen.getByText(/Export successful! staticImport.json download started/i)).toBeDefined();
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
                    updateEpic={updateEpic}
                    addEpic={addEpic}
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

    it('triggers file picker when Import button is clicked and shows confirmation after selection', async () => {
        mockShowConfirm.mockResolvedValue(false); // Cancel the import for this test
        
        const { container } = render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const importBtn = screen.getByText('Import from JSON');
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        
        // Spy on the click method of the hidden file input
        const clickSpy = vi.spyOn(fileInput, 'click');

        // 1. Click the visible button
        await act(async () => {
            fireEvent.click(importBtn);
        });

        // Verify it triggered the hidden file picker
        expect(clickSpy).toHaveBeenCalled();

        // 2. Simulate file selection (which should trigger the confirmation dialog)
        const file = new File(['{}'], 'test.json', { type: 'application/json' });
        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        // Verify confirmation was shown
        expect(mockShowConfirm).toHaveBeenCalledWith(
            "Warning: Irreversible Action",
            expect.stringContaining("Importing data will DELETE all existing collections")
        );
        
        clickSpy.mockRestore();
    });

    it('switches to Jira tab and shows Jira sub-tabs', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const jiraTab = screen.getByText('Jira Integration');
        await act(async () => {
            fireEvent.click(jiraTab);
        });

        // Common sub-tab should be active by default
        expect(screen.getByText('Common')).toBeDefined();
        expect(screen.getByText('Epics')).toBeDefined();
        expect(screen.getByText('Customer')).toBeDefined();
        
        expect(screen.getByLabelText(/Jira Base URL:/i)).toBeDefined();
        expect(screen.queryByText('Export to JSON')).toBeNull();
    });

    it('navigates between Jira sub-tabs', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=jira']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        // Initially in Common
        expect(screen.getByLabelText(/Jira Base URL:/i)).toBeDefined();

        // Switch to Epics
        const importTab = screen.getByText('Epics');
        await act(async () => {
            fireEvent.click(importTab);
        });
        expect(screen.getByLabelText(/Import JQL Query:/i)).toBeDefined();
        expect(screen.queryByLabelText(/Jira Base URL:/i)).toBeNull();

        // Switch to Customer
        const customerTab = screen.getByText('Customer');
        await act(async () => {
            fireEvent.click(customerTab);
        });
        expect(screen.getByText((content) => content.includes('as a placeholder for the customer ID'))).toBeDefined();
        expect(screen.getByLabelText(/New \/ Untriaged JQL:/i)).toBeDefined();
        expect(screen.queryByLabelText(/Import JQL Query:/i)).toBeNull();
    });

    it('shows AWS fields when AWS IAM is selected', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const authSelect = screen.getByLabelText(/Authentication Method:/i);
        await act(async () => {
            fireEvent.change(authSelect, { target: { value: 'aws' } });
        });

        expect(screen.getByText('AWS IAM Credentials')).toBeDefined();
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
    });

    it('saves General settings immediately on change', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const sprintInput = screen.getByLabelText(/Sprint Duration \(Days\):/i);
        await act(async () => {
            fireEvent.change(sprintInput, { target: { value: '21' } });
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            sprint_duration_days: 21
        }));
    });

    it('saves connection settings on blur', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
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
            mongo_uri: 'mongodb://new-host:27017'
        }));
    });

    it('handles the "Use SOCKS Proxy" toggle for application mongo', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const proxyCheckbox = screen.getByLabelText(/Use SOCKS Proxy \(from .env\)/i);
        expect(proxyCheckbox).toBeDefined();

        await act(async () => {
            fireEvent.click(proxyCheckbox);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            mongo_use_proxy: true
        }));
    });

    it('handles the "Use SOCKS Proxy" toggle for customer mongo', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subsubtab=customer']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const proxyCheckbox = screen.getByLabelText(/Use SOCKS Proxy \(from .env\)/i);
        expect(proxyCheckbox).toBeDefined();

        await act(async () => {
            fireEvent.click(proxyCheckbox);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            customer_mongo_use_proxy: true
        }));
    });

    it('shows AWS Assume Role configuration when AWS role auth type is selected', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        // Switch to AWS auth method
        const authSelect = screen.getByLabelText(/Authentication Method:/i);
        await act(async () => {
            fireEvent.change(authSelect, { target: { value: 'aws' } });
        });

        // Default type should be static
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
        
        // Switch to Assume Role
        const typeSelect = screen.getByLabelText(/AWS Authentication Type:/i);
        await act(async () => {
            fireEvent.change(typeSelect, { target: { value: 'role' } });
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            mongo_aws_auth_type: 'role'
        }));

        expect(screen.getByLabelText(/Role ARN:/i)).toBeDefined();
        expect(screen.getByLabelText(/External ID \(Optional\):/i)).toBeDefined();
        expect(screen.getByLabelText(/Role Session Name \(Optional\):/i)).toBeDefined();

        const arnInput = screen.getByLabelText(/Role ARN:/i);
        await act(async () => {
            fireEvent.change(arnInput, { target: { value: 'arn:aws:iam::123:role/MyRole' } });
            fireEvent.blur(arnInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            mongo_aws_role_arn: 'arn:aws:iam::123:role/MyRole'
        }));
    });

    it('shows Customer AWS Assume Role configuration when AWS role auth type is selected', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subsubtab=customer']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        // Switch to AWS auth method for customer
        const authSelects = screen.getAllByLabelText(/Authentication Method:/i);
        const customerAuthSelect = authSelects[0]; // In customer tab
        await act(async () => {
            fireEvent.change(customerAuthSelect, { target: { value: 'aws' } });
        });

        // Default type should be static
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
        
        // Switch to Assume Role
        const typeSelect = screen.getByLabelText(/AWS Authentication Type:/i);
        await act(async () => {
            fireEvent.change(typeSelect, { target: { value: 'role' } });
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            customer_mongo_aws_auth_type: 'role'
        }));

        expect(screen.getByLabelText(/Role ARN:/i)).toBeDefined();
        
        const arnInput = screen.getByLabelText(/Role ARN:/i);
        await act(async () => {
            fireEvent.change(arnInput, { target: { value: 'arn:aws:iam::789:role/CustomerRole' } });
            fireEvent.blur(arnInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            customer_mongo_aws_role_arn: 'arn:aws:iam::789:role/CustomerRole'
        }));
    });

    it('performs database discovery and shows existence badge on test', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const testBtn = screen.getByText('Test Mongo Connection');
        
        await act(async () => {
            fireEvent.click(testBtn);
        });

        // Should call both endpoints
        expect(fetch).toHaveBeenCalledWith('/api/mongo/databases', expect.objectContaining({
            body: expect.stringContaining('"connection_type":"app"')
        }));
        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"connection_type":"app"')
        }));

        // Should show the "Exists" badge and the connection message
        await waitFor(() => {
            expect(screen.getByText('Connection successful!')).toBeDefined();
            expect(screen.getByText('Exists')).toBeDefined();
        });
    });

    it('sends connection_type: customer when testing customer mongo', async () => {
        const settingsWithCustomer = {
            ...mockSettings,
            customer_mongo_uri: 'mongodb://customer-host'
        };
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subsubtab=customer']}>
                <SettingsPage 
                    settings={settingsWithCustomer} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const testBtn = screen.getByText('Test Customer Mongo Connection');
        
        await act(async () => {
            fireEvent.click(testBtn);
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/databases', expect.objectContaining({
            body: expect.stringContaining('"connection_type":"customer"')
        }));
        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"connection_type":"customer"')
        }));
    });

    it('switches to AI tab and shows LLM settings', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const aiTab = screen.getByText('AI & LLM');
        await act(async () => {
            fireEvent.click(aiTab);
        });

        expect(screen.getByLabelText(/LLM Provider:/i)).toBeDefined();
        expect(screen.getByLabelText(/LLM API Key:/i)).toBeDefined();

        const apiKeyInput = screen.getByLabelText(/LLM API Key:/i);
        await act(async () => {
            fireEvent.change(apiKeyInput, { target: { value: 'new-api-key' } });
            fireEvent.blur(apiKeyInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            llm_api_key: 'new-api-key'
        }));
    });

    it('loads and saves customer_mongo_uri from settings', async () => {
        const customSettings = {
            ...mockSettings,
            customer_mongo_uri: 'mongodb://customer-host:27017'
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence&subsubtab=customer']}>
                <SettingsPage 
                    settings={customSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const uriInput = screen.getByLabelText(/Customer MongoDB URI:/i) as HTMLInputElement;
        expect(uriInput.value).toBe('mongodb://customer-host:27017');

        await act(async () => {
            fireEvent.change(uriInput, { target: { value: 'mongodb://updated-customer:27017' } });
            fireEvent.blur(uriInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            customer_mongo_uri: 'mongodb://updated-customer:27017'
        }));
    });
});



