import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import { DashboardProvider, NotificationProvider, useDashboardContext } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

// Mock date-holidays
const mockIsHoliday = vi.fn().mockImplementation((date: Date) => {
    // Jan 1st 2026: Public Holiday (Thu)
    if (date.getFullYear() === 2026 && date.getMonth() === 0 && date.getDate() === 1) {
        return [{ type: 'public', name: 'New Year' }];
    }
    // Jan 2nd 2026: Non-public Holiday (Fri)
    if (date.getFullYear() === 2026 && date.getMonth() === 0 && date.getDate() === 2) {
        return [{ type: 'observance', name: 'Some Observance' }];
    }
    return false;
});

vi.mock('date-holidays', () => {
    return {
        default: class {
            isHoliday = mockIsHoliday;
            getCountries = () => ({
                'US': 'United States of America',
                'GB': 'United Kingdom',
                'CZ': 'Czech Republic'
            });
        }
    };
});

// Mock useDashboardContext
vi.mock('../../../contexts/DashboardContext', async () => {
    const actual = await vi.importActual('../../../contexts/DashboardContext');
    return {
        ...actual as any,
        useDashboardContext: vi.fn()
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
        updateTeam: vi.fn(),
        deleteTeam: vi.fn(),
        addTeam: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useDashboardContext as any).mockReturnValue({
            showConfirm: vi.fn().mockResolvedValue(true),
            showAlert: vi.fn().mockResolvedValue(undefined)
        });
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
        expect(screen.getByDisplayValue('United States of America (US)')).toBeDefined();
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
        // Holiday count = 1
        
        expect(screen.getByText('9 days')).toBeDefined();
        expect(screen.getByTitle('1 holiday(s)')).toBeDefined();
    });

    it('handles capacity override change', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        // Base capacity 100, 1 holiday impact = (100/10)*1 = 10. Calculated = 90.
        const input = screen.getByPlaceholderText('90');
        fireEvent.change(input, { target: { value: '85' } });
        
        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: {
                's1': 85
            }
        });
    });

    it('calls deleteTeam when delete button clicked', async () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} />
                </DashboardProvider>
            </NotificationProvider>
        );
        
        const deleteBtn = screen.getByText('Delete Team');
        fireEvent.click(deleteBtn);
        
        await waitFor(() => {
            expect(defaultProps.deleteTeam).toHaveBeenCalledWith('t1');
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

    it('renders and saves a new team', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <TeamPage {...defaultProps} teamId="new" />
                </DashboardProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('New Team')).toBeDefined();
        const nameInput = screen.getByLabelText(/Team Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Newly Created Team' } });
        
        const createBtn = screen.getByText('Create Team');
        fireEvent.click(createBtn);

        expect(defaultProps.addTeam).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Newly Created Team',
            total_capacity_mds: 10
        }));
        expect(defaultProps.onBack).toHaveBeenCalled();
    });
});
