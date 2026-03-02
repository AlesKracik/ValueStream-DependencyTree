import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardEditPage } from '../DashboardEditPage';
import { DashboardProvider, NotificationProvider } from '../../contexts/DashboardContext';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [
        { id: 'd1', name: 'Existing Dashboard', description: 'Desc', parameters: { customerFilter: '', workItemFilter: '', releasedFilter: 'all', minTcvFilter: '', minScoreFilter: '', teamFilter: '', epicFilter: '', startSprintId: '', endSprintId: '' } }
    ],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
    ]
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
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <DashboardEditPage {...defaultProps} dashboardId="new" />
                </DashboardProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('Create Dashboard')).toBeDefined();
        expect(screen.getByDisplayValue('New Dashboard')).toBeDefined();
    });

    it('calls addDashboard when Create button is clicked', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <DashboardEditPage {...defaultProps} dashboardId="new" />
                </DashboardProvider>
            </NotificationProvider>
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
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <DashboardEditPage {...defaultProps} dashboardId="d1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('Edit: Existing Dashboard')).toBeDefined();
        expect(screen.queryByText('Create')).toBeNull();
    });

    it('shows error if dashboard not found', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <DashboardEditPage {...defaultProps} dashboardId="invalid" />
                </DashboardProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('Dashboard not found.')).toBeDefined();
    });

    it('renders Time Range sprint selects', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <DashboardEditPage {...defaultProps} dashboardId="new" />
                </DashboardProvider>
            </NotificationProvider>
        );

        expect(screen.getByLabelText(/Start Sprint:/i)).toBeDefined();
        expect(screen.getByLabelText(/End Sprint:/i)).toBeDefined();
        
        // Check options
        expect(screen.getByText('Sprint 1 (2026-01-01)')).toBeDefined();
        expect(screen.getByText('Sprint 2 (2026-01-15)')).toBeDefined();
    });
});
