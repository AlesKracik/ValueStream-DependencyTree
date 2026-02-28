import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardEditPage } from '../DashboardEditPage';
import { DashboardProvider } from '../../contexts/DashboardContext';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [
        { id: 'd1', name: 'Existing Dashboard', description: 'Desc', parameters: { customerFilter: '', workItemFilter: '', releasedFilter: 'all', minTcvFilter: '', minScoreFilter: '', teamFilter: '', epicFilter: '' } }
    ],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: []
};

describe('DashboardEditPage', () => {
    const defaultProps = {
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        addDashboard: vi.fn(),
        updateDashboard: vi.fn(),
        deleteDashboard: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders "Create Dashboard" when dashboardId is "new"', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <DashboardEditPage {...defaultProps} dashboardId="new" />
            </DashboardProvider>
        );

        expect(screen.getByText('Create Dashboard')).toBeDefined();
        expect(screen.getByDisplayValue('New Dashboard')).toBeDefined();
    });

    it('calls addDashboard when Create button is clicked', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <DashboardEditPage {...defaultProps} dashboardId="new" />
            </DashboardProvider>
        );

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'My Brand New Dashboard' } });

        const createBtn = screen.getByText('Create');
        fireEvent.click(createBtn);

        expect(defaultProps.addDashboard).toHaveBeenCalledWith(expect.objectContaining({
            name: 'My Brand New Dashboard'
        }));
        expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('renders edit mode for existing dashboard', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <DashboardEditPage {...defaultProps} dashboardId="d1" />
            </DashboardProvider>
        );

        expect(screen.getByText('Edit: Existing Dashboard')).toBeDefined();
        expect(screen.queryByText('Create')).toBeNull();
    });

    it('shows error if dashboard not found', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <DashboardEditPage {...defaultProps} dashboardId="invalid" />
            </DashboardProvider>
        );

        expect(screen.getByText('Dashboard not found.')).toBeDefined();
    });
});
