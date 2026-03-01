import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../SettingsPage';
import type { DashboardData, Settings } from '../../types/models';

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

const mockData: DashboardData = {
    dashboards: [],
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
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ 
                success: true, 
                data: mockData,
                message: 'Export successful!' 
            })
        }));
        
        // Mock URL methods for download
        global.URL.createObjectURL = vi.fn().mockReturnValue('mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    it('renders and shows Export button in MongoDB tab', () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        expect(screen.getByText('MongoDB Persistence')).toBeDefined();
        expect(screen.getByText('Export to staticImport.json')).toBeDefined();
    });

    it('calls export API and triggers download when Export button is clicked', async () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        const exportBtn = screen.getByText('Export to staticImport.json');
        fireEvent.click(exportBtn);

        expect(global.fetch).toHaveBeenCalledWith('/api/mongo/export', expect.objectContaining({
            method: 'POST'
        }));

        await vi.waitFor(() => {
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(screen.getByText(/Export successful! staticImport.json download started/i)).toBeDefined();
        });
    });

    it('switches to Jira tab and shows Jira settings', () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        const jiraTab = screen.getByText('Jira Integration');
        fireEvent.click(jiraTab);

        expect(screen.getByLabelText(/Jira Base URL:/i)).toBeDefined();
        expect(screen.queryByText('Export to staticImport.json')).toBeNull();
    });

    it('switches to General Project tab and shows Time settings', () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        const generalTab = screen.getByText('General Project');
        fireEvent.click(generalTab);

        expect(screen.getByText('Time')).toBeDefined();
        expect(screen.getByLabelText(/Fiscal Year Start Month:/i)).toBeDefined();
        expect(screen.getByLabelText(/Sprint Duration \(Days\):/i)).toBeDefined();
    });

    it('shows AWS fields when AWS IAM is selected', () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        const authSelect = screen.getByLabelText(/Authentication Method:/i);
        fireEvent.change(authSelect, { target: { value: 'aws' } });

        expect(screen.getByText('AWS IAM Credentials')).toBeDefined();
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
        expect(screen.getByLabelText(/Secret Access Key:/i)).toBeDefined();
    });

    it('shows OIDC fields when OIDC is selected', () => {
        render(
            <SettingsPage 
                settings={mockSettings} 
                onUpdateSettings={onUpdateSettings}
                data={mockData}
                updateEpic={updateEpic}
                addEpic={addEpic}
            />
        );

        const authSelect = screen.getByLabelText(/Authentication Method:/i);
        fireEvent.change(authSelect, { target: { value: 'oidc' } });

        expect(screen.getByText('OIDC Configuration')).toBeDefined();
        expect(screen.getByLabelText(/Access Token:/i)).toBeDefined();
    });
});
