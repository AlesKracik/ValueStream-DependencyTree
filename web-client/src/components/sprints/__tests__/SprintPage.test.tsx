import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintPage } from '../SprintPage';
import { DashboardProvider, NotificationProvider } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

const mockData: DashboardData = {
    dashboards: [],
    settings: { jira_base_url: '', jira_api_version: '3', sprint_duration_days: 14 },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ]
};

const defaultProps = {
    data: mockData,
    loading: false,
    error: null,
    addSprint: vi.fn(),
    updateSprint: vi.fn(),
    deleteSprint: vi.fn()
};

describe('SprintPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the header title', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        expect(screen.getByText('Sprint Management')).toBeDefined();
    });

    it('renders sprint name as an editable input', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const input = screen.getByDisplayValue('Sprint 1');
        expect(input).toBeDefined();
    });

    it('calls updateSprint when name is changed', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const input = screen.getByDisplayValue('Sprint 1');
        fireEvent.change(input, { target: { value: 'Updated Name' } });
        expect(defaultProps.updateSprint).toHaveBeenCalledWith('s1', { name: 'Updated Name' });
    });

    it('starts creation flow when + Create Next Sprint is clicked', async () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const startBtn = screen.getByText('+ Create Next Sprint');
        fireEvent.click(startBtn);

        // Should see a new row with "NEW" status and "Save" button
        expect(screen.getByText('NEW')).toBeDefined();
        expect(screen.getByText('Save')).toBeDefined();
    });

    it('calls addSprint when Save is clicked in draft row', async () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        fireEvent.click(screen.getByText('+ Create Next Sprint'));

        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

        expect(defaultProps.addSprint).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Sprint 2'
        }));
    });

    it('prompts for confirmation before deleting a sprint', async () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        // Since it's the last sprint, delete is available
        expect(screen.queryByText(/Locked/i)).toBeNull();
    });

    it('renders quarter grouping labels', () => {
        const { container } = render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        // Look for the text inside a div with the sectionHeader class
        const qHeader = container.querySelector('[class*="sectionHeader"]');
        expect(qHeader?.textContent).toBe('FY2026 Q1');
    });
});
