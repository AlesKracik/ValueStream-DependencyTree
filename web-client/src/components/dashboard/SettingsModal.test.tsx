import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';

describe('SettingsModal', () => {
    const mockSettings = {
        jira_base_url: 'https://test.atlassian.net',
        jira_api_version: '3' as const,
        jira_api_token: 'valid-token'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn() as any;
    });

    it('renders with existing settings', () => {
        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} />);

        expect((screen.getByLabelText(/Jira Base URL/i) as HTMLInputElement).value).toBe('https://test.atlassian.net');
        expect((screen.getByLabelText(/Jira Personal Access Token/i) as HTMLInputElement).value).toBe('valid-token');
    });

    it('tests connection successfully and displays success message', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, message: 'Connection successful!' })
        });

        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} />);

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

        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={mockSettings} />);

        const testBtn = screen.getByRole('button', { name: 'Test Connection' });
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByText('Unauthorized: Invalid token')).toBeTruthy();
        });
    });

    it('disables test button if fields are missing', () => {
        render(<SettingsModal onClose={vi.fn()} onUpdateSettings={vi.fn()} settings={{ ...mockSettings, jira_api_token: '', jira_base_url: '' }} />);

        const testBtn = screen.getByRole('button', { name: 'Test Connection' });
        // Empty token should disable the button
        expect((testBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('saves updated settings', () => {
        const onUpdateSpy = vi.fn();
        const onCloseSpy = vi.fn();
        render(<SettingsModal onClose={onCloseSpy} onUpdateSettings={onUpdateSpy} settings={mockSettings} />);

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
});
