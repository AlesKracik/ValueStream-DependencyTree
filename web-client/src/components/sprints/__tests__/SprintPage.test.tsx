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

    it('renders the header title and back button', () => {
        render(<SprintPage {...defaultProps} />);
        
        expect(screen.getByText('Sprint Management')).toBeDefined();
        const backBtn = screen.getByRole('button', { name: /Back to Dashboard/i });
        expect(backBtn).toBeDefined();
        
        fireEvent.click(backBtn);
        expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('renders current sprint as an editable row in the table', () => {
        render(<SprintPage {...defaultProps} />);

        // The selected sprint name should be an input field
        const nameInput = screen.getByDisplayValue('Sprint 1') as HTMLInputElement;
        expect(nameInput.tagName).toBe('INPUT');
        
        // Dates should be visible as text
        expect(screen.getByText('2026-01-01')).toBeDefined();
        expect(screen.getByText('2026-01-14')).toBeDefined();
    });

    it('shows "Delete" button only for the last sprint', () => {
        const dataWithTwo: DashboardData = {
            ...mockData,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
            ]
        };

        // Select s1 (not last)
        const { rerender } = render(<SprintPage {...defaultProps} data={dataWithTwo} sprintId="s1" />);
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(screen.getByText('Locked (not last)')).toBeDefined();

        // Select s2 (last)
        rerender(<SprintPage {...defaultProps} data={dataWithTwo} sprintId="s2" />);
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    });

    it('initializes new sprint draft row at the bottom of the table', () => {
        render(<SprintPage {...defaultProps} sprintId="new" />);

        // Get all rows in the tbody
        const rows = screen.getAllByRole('row');
        // rows[0] is header, rows[1] is Sprint 1, rows[2] should be NEW
        expect(rows).toHaveLength(3);
        
        const lastRow = rows[2];
        expect(lastRow.textContent).toContain('NEW');
        
        // Since it's an input, we need to check the display value within that row
        const input = screen.getByDisplayValue('Sprint 2');
        expect(lastRow.contains(input)).toBe(true);
    });

    it('calls addSprint and saveDashboardData when saving a new sprint', async () => {
        render(<SprintPage {...defaultProps} sprintId="new" />);

        // Get the single Save button now remaining in the UI
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

        // The 'Delete' button is now in the table row Actions column
        const deleteBtn = screen.getByRole('button', { name: 'Delete' });
        
        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        expect(showConfirmSpy).toHaveBeenCalledWith('Delete Sprint', expect.stringContaining('Sprint 1'));
        expect(deleteSprintSpy).toHaveBeenCalledWith('s1');
    });

    it('shows "Create Next Sprint" button only when not on creation page', () => {
        const { rerender } = render(<SprintPage {...defaultProps} />);
        expect(screen.getByText('+ Create Next Sprint')).toBeDefined();

        rerender(<SprintPage {...defaultProps} sprintId="new" />);
        expect(screen.queryByText('+ Create Next Sprint')).toBeNull();
    });
});
