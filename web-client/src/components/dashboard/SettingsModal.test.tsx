import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';

describe('SettingsModal', () => {
    const mockSettings = {
        jira_base_url: 'https://test.atlassian.net',
        jira_api_version: '3' as const,
        jira_api_token: 'valid-token'
    };

    const mockData = {
        epics: [
            { id: 'epic-1', jira_key: 'PROJ-100', name: 'Original Name', remaining_md: 5, target_start: '2025-01-01', target_end: '2025-01-15' },
            { id: 'epic-2', jira_key: 'PROJ-101' },
            { id: 'epic-3', jira_key: 'TBD' }
        ],
        teams: [],
        customerFilters: [],
        numberFilters: [],
        features: [],
        customers: [],
        sprints: [],
        settings: mockSettings
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn() as any;
    });

    it('renders with existing settings', () => {
        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} data={mockData} updateEpic={vi.fn()} />);

        expect((screen.getByLabelText(/Jira Base URL/i) as HTMLInputElement).value).toBe('https://test.atlassian.net');
        expect((screen.getByLabelText(/Jira Personal Access Token/i) as HTMLInputElement).value).toBe('valid-token');
    });

    it('tests connection successfully and displays success message', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, message: 'Connection successful!' })
        });

        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} data={mockData} updateEpic={vi.fn()} />);

        const testBtn = screen.getByRole('button', { name: 'Test Connection' });
        fireEvent.click(testBtn);

        expect(testBtn.textContent).toBe('Testing...');
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/jira/test', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                jira_base_url: 'https://test.atlassian.net',
                jira_api_token: 'valid-token',
                jira_api_version: '3'
            })
        }));

        await waitFor(() => {
            expect(screen.getByText('Connection successful!')).toBeTruthy();
            expect(testBtn.textContent).toBe('Test Connection');
        });
    });

    it('tests connection with error and displays error message', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true, // Our proxy always returns 200, but logic success is false
            json: async () => ({ success: false, error: 'Unauthorized: Invalid token' })
        });

        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} data={mockData} updateEpic={vi.fn()} />);

        const testBtn = screen.getByRole('button', { name: 'Test Connection' });
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByText('Unauthorized: Invalid token')).toBeTruthy();
        });
    });

    it('disables test button if fields are missing', () => {
        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={{ ...mockSettings, jira_api_token: '', jira_base_url: '' }} data={mockData} updateEpic={vi.fn()} />);

        const testBtn = screen.getByRole('button', { name: 'Test Connection' });
        // Empty token should disable the button
        expect((testBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('saves updated settings', () => {
        const onUpdateSpy = vi.fn();
        const onCloseSpy = vi.fn();
        render(<SettingsModal onClose={onCloseSpy} onUpdateSettings={onUpdateSpy} settings={mockSettings} data={mockData} updateEpic={vi.fn()} />);

        const tokenInput = screen.getByLabelText(/Jira Personal Access Token/i);
        fireEvent.change(tokenInput, { target: { value: 'new-token' } });

        const saveBtn = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(saveBtn);

        expect(onUpdateSpy).toHaveBeenCalledWith({
            jira_base_url: 'https://test.atlassian.net',
            jira_api_version: '3',
            jira_api_token: 'new-token'
        });
        expect(onCloseSpy).toHaveBeenCalled();
    });

    it('bulk syncs all valid epics from Jira and issues updates', async () => {
        const updateEpicSpy = vi.fn();
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    fields: {
                        summary: 'Updated Summary',
                        timeestimate: 288000 // 10 MDs
                    },
                    names: {
                        customfield_123: 'Target start',
                        customfield_124: 'Target end'
                    }
                }
            })
        });

        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} data={mockData} updateEpic={updateEpicSpy} />);

        const syncBtn = screen.getByRole('button', { name: 'Sync Epics from Jira' });
        fireEvent.click(syncBtn);

        await waitFor(() => {
            // epic-3 had 'TBD' and should be skipped, epic-1 and epic-2 should be called
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
            expect(updateEpicSpy).toHaveBeenCalledTimes(2);
        });

        // Verify update signature
        expect(updateEpicSpy).toHaveBeenCalledWith('epic-1', expect.objectContaining({
            name: 'Updated Summary',
            remaining_md: 10
        }));
    });
});
