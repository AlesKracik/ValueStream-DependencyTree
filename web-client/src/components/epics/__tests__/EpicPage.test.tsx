import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicPage } from '../EpicPage';
import type { DashboardData } from '../../../types/models';

const mockData: DashboardData = {
    settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
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
        deleteEpic: vi.fn(),
        saveDashboardData: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-20')); // Middle of s_curr
    });

    it('prompts user and clears past work when shifting dates if they confirm', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        
        render(<EpicPage {...defaultProps} />);
        
        // Find "Target Start" input
        const startInput = screen.getByLabelText(/Target Start:/i);
        
        // Shift start date to future
        fireEvent.change(startInput, { target: { value: '2026-03-01' } });
        
        expect(confirmSpy).toHaveBeenCalled();
        // Check that updateEpic was called with cleared overrides
        expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
            target_start: '2026-03-01',
            sprint_effort_overrides: undefined // s_past was cleared
        }));
    });

    it('aborts date shift if user cancels the confirmation', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        
        render(<EpicPage {...defaultProps} />);
        
        const startInput = screen.getByLabelText(/Target Start:/i);
        fireEvent.change(startInput, { target: { value: '2026-03-01' } });
        
        expect(confirmSpy).toHaveBeenCalled();
        expect(updateEpicSpy).not.toHaveBeenCalled();
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
