import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintPage } from '../SprintPage';
import * as DashboardContext from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

const mockData: DashboardData = {
    dashboards: [], settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ],
    epics: []
};

describe('SprintPage', () => {
    const updateSprintSpy = vi.fn();
    const addSprintSpy = vi.fn();
    const deleteSprintSpy = vi.fn();
    
    const showConfirmSpy = vi.fn();

    const defaultProps = {
        data: mockData,
        loading: false,
        error: null,
        addSprint: addSprintSpy,
        updateSprint: updateSprintSpy,
        deleteSprint: deleteSprintSpy,
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

    it('renders the header title', () => {
        render(<SprintPage {...defaultProps} />);
        expect(screen.getByText('Sprints')).toBeDefined();
    });

    it('renders sprint name as an editable input', () => {
        render(<SprintPage {...defaultProps} />);
        const nameInput = screen.getByDisplayValue('Sprint 1') as HTMLInputElement;
        expect(nameInput.tagName).toBe('INPUT');
    });

    it('calls updateSprint when name is changed', () => {
        render(<SprintPage {...defaultProps} />);
        const nameInput = screen.getByDisplayValue('Sprint 1');
        fireEvent.change(nameInput, { target: { value: 'Updated Sprint' } });
        expect(updateSprintSpy).toHaveBeenCalledWith('s1', { name: 'Updated Sprint' });
    });

    it('starts creation flow when + New Sprint is clicked', async () => {
        render(<SprintPage {...defaultProps} />);
        const startBtn = screen.getByText('+ New Sprint');
        fireEvent.click(startBtn);
        
        // Should show a "NEW" tag or draft row
        expect(screen.getByText('NEW')).toBeDefined();
        // Should show a Create button
        expect(screen.getByText('Create')).toBeDefined();
    });

    it('calls addSprint when Create is clicked in draft row', async () => {
        render(<SprintPage {...defaultProps} />);
        fireEvent.click(screen.getByText('+ New Sprint'));
        
        const createBtn = screen.getByText('Create');
        await act(async () => {
            fireEvent.click(createBtn);
        });

        expect(addSprintSpy).toHaveBeenCalled();
    });

    it('prompts for confirmation before deleting a sprint', async () => {
        showConfirmSpy.mockResolvedValue(true);
        render(<SprintPage {...defaultProps} />);
        
        const deleteBtn = screen.getByText('Delete');
        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        expect(showConfirmSpy).toHaveBeenCalled();
        expect(deleteSprintSpy).toHaveBeenCalledWith('s1');
    });

    it('renders quarter grouping labels', () => {
        render(<SprintPage {...defaultProps} />);
        expect(screen.getByText('FY2026 Q1')).toBeDefined();
    });
});
