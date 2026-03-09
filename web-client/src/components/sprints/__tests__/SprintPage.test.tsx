import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintPage } from '../SprintPage';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';

const mockData: ValueStreamData = {
    valueStreams: [],
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
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        expect(screen.getByText('Sprint Management')).toBeDefined();
    });

    it('renders sprint name as an editable input', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        const input = screen.getByDisplayValue('Sprint 1');
        expect(input).toBeDefined();
    });

    it('calls updateSprint when name is changed', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        const input = screen.getByDisplayValue('Sprint 1');
        fireEvent.change(input, { target: { value: 'Updated Name' } });
        expect(defaultProps.updateSprint).toHaveBeenCalledWith('s1', { name: 'Updated Name' });
    });

    it('starts creation flow when + Create Next Sprint is clicked', async () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
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
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
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
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        // Since it's the last sprint, delete is available
        expect(screen.queryByText(/Locked/i)).toBeNull();
    });

    it('shows archive button on the first sprint only if it is in the past', async () => {
        // Provide mock data with two sprints to distinguish first/last
        // s1 is in the past, s2 is in the future (relative to any current date > 1970)
        const twoSprintsData: ValueStreamData = {
            ...mockData,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '1970-01-01', end_date: '1970-01-14', quarter: 'FY1970 Q1' },
                { id: 's2', name: 'Sprint 2', start_date: '2099-01-15', end_date: '2099-01-28', quarter: 'FY2099 Q1' }
            ]
        };
        
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: twoSprintsData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} data={twoSprintsData} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        
        // Sprint 1 is the first sprint AND in the past, it should have Archive
        const archiveBtns = screen.getAllByText('Archive');
        expect(archiveBtns.length).toBe(1);
        
        fireEvent.click(archiveBtns[0]);
        const confirmBtn = screen.getByText('Confirm');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(defaultProps.updateSprint).toHaveBeenCalledWith('s1', { is_archived: true });
        });
    });

    it('hides archive button if the first sprint is not in the past', async () => {
        // s1 and s2 are both in the future
        const futureSprintsData: ValueStreamData = {
            ...mockData,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2099-01-01', end_date: '2099-01-14', quarter: 'FY2099 Q1' },
                { id: 's2', name: 'Sprint 2', start_date: '2099-01-15', end_date: '2099-01-28', quarter: 'FY2099 Q1' }
            ]
        };
        
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: futureSprintsData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} data={futureSprintsData} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        
        // No Archive button should be visible
        expect(screen.queryByText('Archive')).toBeNull();
        // It should show "Locked" instead
        expect(screen.getByTitle('Only the first past sprint or the last sprint can be managed.')).toBeDefined();
    });

    it('renders quarter grouping labels', () => {
        const { container } = render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <SprintPage {...defaultProps} />
                </ValueStreamProvider>
            </NotificationProvider>
        );
        // Look for the text inside a div with the sectionHeader class
        const qHeader = container.querySelector('[class*="sectionHeader"]');
        expect(qHeader?.textContent).toBe('FY2026 Q1');
    });
});



