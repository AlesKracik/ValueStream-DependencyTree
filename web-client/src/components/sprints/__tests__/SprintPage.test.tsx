import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintPage } from '../SprintPage';
import * as DashboardContext from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

const mockData: DashboardData = {
    settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' }
    ],
    epics: []
};

describe('SprintPage', () => {
    const updateSprintSpy = vi.fn();
    const addSprintSpy = vi.fn();
    const deleteSprintSpy = vi.fn();
    const saveDashboardDataSpy = vi.fn().mockResolvedValue(undefined);
    const showConfirmSpy = vi.fn();

    const defaultProps = {
        sprintId: 's1',
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        addSprint: addSprintSpy,
        updateSprint: updateSprintSpy,
        deleteSprint: deleteSprintSpy,
        onNavigateToSprint: vi.fn(),
        saveDashboardData: saveDashboardDataSpy,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(DashboardContext, 'useDashboardContext').mockReturnValue({
            data: mockData,
            updateEpic: vi.fn(),
            showAlert: vi.fn(),
            showConfirm: showConfirmSpy
        });
    });

    it('renders current sprint details with read-only dates', () => {
        render(<SprintPage {...defaultProps} />);

        expect(screen.getByDisplayValue('Sprint 1')).toBeDefined();
        
        const startInput = screen.getByDisplayValue('2026-01-01') as HTMLInputElement;
        const endInput = screen.getByDisplayValue('2026-01-14') as HTMLInputElement;
        
        expect(startInput.disabled).toBe(true);
        expect(endInput.disabled).toBe(true);
    });

    it('shows "Create Next Sprint" button only when not on creation page', () => {
        const { rerender } = render(<SprintPage {...defaultProps} />);
        expect(screen.getByText('+ Create Next Sprint')).toBeDefined();

        rerender(<SprintPage {...defaultProps} sprintId="new" />);
        expect(screen.queryByText('+ Create Next Sprint')).toBeNull();
    });

    it('initializes new sprint with suggested name and dates', () => {
        render(<SprintPage {...defaultProps} sprintId="new" />);

        // Should suggest 'Sprint 2' starting day after 'Sprint 1' ends
        expect(screen.getByDisplayValue('Sprint 2')).toBeDefined();
        expect(screen.getByDisplayValue('2026-01-15')).toBeDefined();
        expect(screen.getByDisplayValue('2026-01-28')).toBeDefined();
    });

    it('calls addSprint and saveDashboardData when saving a new sprint', async () => {
        render(<SprintPage {...defaultProps} sprintId="new" />);

        const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
        
        await act(async () => {
            fireEvent.click(saveBtn);
        });

        expect(addSprintSpy).toHaveBeenCalled();
        expect(saveDashboardDataSpy).toHaveBeenCalled();
    });

    it('prompts for confirmation before deleting a sprint', async () => {
        showConfirmSpy.mockResolvedValue(true);
        
        render(<SprintPage {...defaultProps} />);

        const deleteBtn = screen.getByRole('button', { name: /Delete Sprint/i });
        
        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        expect(showConfirmSpy).toHaveBeenCalledWith('Delete Sprint', expect.stringContaining('Sprint 1'));
        expect(deleteSprintSpy).toHaveBeenCalledWith('s1');
    });
});
