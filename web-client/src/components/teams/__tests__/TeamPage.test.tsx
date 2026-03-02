import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import { DashboardProvider, NotificationProvider } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

// Mock date-holidays
const mockIsHoliday = vi.fn().mockImplementation((date: Date) => {
    // Jan 1st 2026 is a holiday in our mock
    return date.getFullYear() === 2026 && date.getMonth() === 0 && date.getDate() === 1;
});

vi.mock('date-holidays', () => {
    return {
        default: class {
            isHoliday = mockIsHoliday;
        }
    };
});

const mockData: DashboardData = {
    dashboards: [],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [
        { id: 't1', name: 'Team 1', total_capacity_mds: 100, country: 'US' }
    ],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ]
};

describe('TeamPage', () => {
    const defaultProps = {
        teamId: 't1',
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        updateTeam: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders team details', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        expect(screen.getByDisplayValue('Team 1')).toBeDefined();
        expect(screen.getByDisplayValue('100')).toBeDefined();
        expect(screen.getByDisplayValue('USA')).toBeDefined();
    });

    it('calls updateTeam when name changes', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const nameInput = screen.getByLabelText(/Team Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Team Alpha' } });
        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', { name: 'Team Alpha' });
    });

    it('calculates holiday impact and shows suggested capacity', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        
        // Sprint 1: 2026-01-01 to 2026-01-14
        // Jan 1 (Thu) - Holiday
        // Jan 2 (Fri) - Work
        // Jan 3, 4 (Sat, Sun) - Weekend
        // Jan 5-9 (Mon-Fri) - Work
        // Jan 10, 11 (Sat, Sun) - Weekend
        // Jan 12-14 (Mon-Wed) - Work
        // Total work days = 1 (Jan 2) + 5 (Jan 5-9) + 3 (Jan 12-14) = 9 days
        
        expect(screen.getByText('9 days')).toBeDefined();
    });

    it('handles capacity override change', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        const input = screen.getByPlaceholderText('100');
        fireEvent.change(input, { target: { value: '85' } });
        
        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: {
                's1': 85
            }
        });
    });

    it('clears override', () => {
        const dataWithOverride: DashboardData = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                sprint_capacity_overrides: { 's1': 85 }
            }]
        };

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithOverride, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} data={dataWithOverride} />
                </DashboardProvider>
            </NotificationProvider>
        );
        
        const input = screen.getByDisplayValue('85');
        fireEvent.change(input, { target: { value: '' } });

        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: {}
        });
    });
});
