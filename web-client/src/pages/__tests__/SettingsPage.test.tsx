import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../SettingsPage';
import type { DashboardData, Settings } from '../../types/models';

const mockSettings: Settings = {
    jira_base_url: 'https://jira.com',
    jira_api_version: '3',
    jira_api_token: 'token',
    mongo_uri: 'mongodb://localhost:27017',
    mongo_db: 'testdb'
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
        expect(screen.getByText('Export to mockData.json')).toBeDefined();
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

        const exportBtn = screen.getByText('Export to mockData.json');
        fireEvent.click(exportBtn);

        expect(global.fetch).toHaveBeenCalledWith('/api/mongo/export', expect.objectContaining({
            method: 'POST'
        }));

        await vi.waitFor(() => {
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(screen.getByText(/Export successful! mockData.json download started/i)).toBeDefined();
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
        expect(screen.queryByText('Export to mockData.json')).toBeNull();
    });
});
