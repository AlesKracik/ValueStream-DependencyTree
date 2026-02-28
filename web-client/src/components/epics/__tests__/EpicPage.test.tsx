import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpicPage } from '../EpicPage';
import { DashboardProvider } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

const mockData: DashboardData = {
    dashboards: [], settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    sprints: [
        { id: 's_past', name: 'Past', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's_curr', name: 'Active', start_date: '2026-02-15', end_date: '2026-02-28' }
    ],
    epics: [
        {
            id: 'e1',
            jira_key: 'J-1',
            team_id: 't1',
            remaining_md: 10,
            target_start: '2026-01-05',
            target_end: '2026-02-25',
            sprint_effort_overrides: { 's_past': 5 }
        }
    ]
};

describe('EpicPage Date Shift Logic', () => {
    const updateEpicSpy = vi.fn();
    
    const defaultProps = {
        epicId: 'e1',
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        updateEpic: updateEpicSpy,
        deleteEpic: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-20')); // Middle of s_curr
    });

    it('prompts user and clears past work when shifting dates if they confirm', async () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <EpicPage {...defaultProps} />
            </DashboardProvider>
        );
        
        const startInput = screen.getByLabelText(/Target Start:/i);
        // Shift start from 2026-01-05 to 2026-01-10 (still before end 2026-02-25)
        fireEvent.change(startInput, { target: { value: '2026-01-10' } });
        
        // Custom modal should be visible
        expect(screen.getByText('Historical Work Warning')).toBeDefined();
        
        // Confirm
        fireEvent.click(screen.getByText('Confirm'));
        
        // Wait for the async function to continue after the promise resolves
        await act(async () => {
            await Promise.resolve();
        });

        expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
            target_start: '2026-01-10',
            sprint_effort_overrides: undefined
        }));
    });

    it('aborts date shift if user cancels the confirmation', async () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <EpicPage {...defaultProps} />
            </DashboardProvider>
        );
        
        const startInput = screen.getByLabelText(/Target Start:/i);
        // Shift start from 2026-01-05 to 2026-01-10 (still before end 2026-02-25)
        fireEvent.change(startInput, { target: { value: '2026-01-10' } });
        
        expect(screen.getByText('Historical Work Warning')).toBeDefined();
        
        // Cancel
        fireEvent.click(screen.getByText('Cancel'));
        
        expect(updateEpicSpy).not.toHaveBeenCalled();
    });

    it('does NOT prompt when shifting end date into the future', async () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <EpicPage {...defaultProps} />
            </DashboardProvider>
        );
        
        const endInput = screen.getByLabelText(/Target End:/i);
        // Current end is 2026-02-25. Shift to 2026-03-15 (future).
        fireEvent.change(endInput, { target: { value: '2026-03-15' } });
        
        // Custom modal should NOT be visible
        expect(screen.queryByText('Historical Work Warning')).toBeNull();
        
        expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
            target_end: '2026-03-15'
        }));
    });

    it('shows an alert and prevents update if start date is not before end date', async () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <EpicPage {...defaultProps} />
            </DashboardProvider>
        );
        
        const startInput = screen.getByLabelText(/Target Start:/i);
        // Current end is 2026-02-25. Setting start to 2026-02-26 (after end).
        fireEvent.change(startInput, { target: { value: '2026-02-26' } });
        
        expect(screen.getByText('Invalid Dates')).toBeDefined();
        expect(screen.getByText('The Start Date must be before the End Date.')).toBeDefined();
        
        expect(updateEpicSpy).not.toHaveBeenCalled();
    });

    it('shows an alert and prevents update if start date is equal to end date', async () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <EpicPage {...defaultProps} />
            </DashboardProvider>
        );
        
        const startInput = screen.getByLabelText(/Target Start:/i);
        // Current end is 2026-02-25. Setting start to 2026-02-25.
        fireEvent.change(startInput, { target: { value: '2026-02-25' } });
        
        expect(screen.getByText('Invalid Dates')).toBeDefined();
        
        expect(updateEpicSpy).not.toHaveBeenCalled();
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
