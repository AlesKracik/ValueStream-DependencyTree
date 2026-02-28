import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import type { DashboardData } from '../../../types/models';

// Mock date-holidays
const mockGetHolidays = vi.fn().mockReturnValue([
    { date: '2026-01-01 00:00:00', type: 'public', name: 'New Year' }
]);

vi.mock('date-holidays', () => {
    return {
        default: class {
            getHolidays = mockGetHolidays;
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
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' }
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
        render(<TeamPage {...defaultProps} />);
        expect(screen.getByDisplayValue('Team 1')).toBeDefined();
        expect(screen.getByDisplayValue('100')).toBeDefined();
        expect(screen.getByDisplayValue('US')).toBeDefined();
    });

    it('calls updateTeam when name changes', () => {
        render(<TeamPage {...defaultProps} />);
        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Team Alpha' } });
        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', { name: 'Team Alpha' });
    });

    it('calculates holiday impact and shows suggested capacity', () => {
        render(<TeamPage {...defaultProps} />);
        
        // Jan 1st 2026 is a Thursday (not weekend)
        // Holiday count = 1
        // Impact = (100 / 10) * 1 = 10
        // Suggested = 100 - 10 = 90
        
        expect(screen.getByText('🏝️ -1d')).toBeDefined();
        const input = screen.getByPlaceholderText('90');
        expect(input).toBeDefined();
    });

    it('handles capacity override change', () => {
        render(<TeamPage {...defaultProps} />);
        const input = screen.getByPlaceholderText('90');
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

        render(<TeamPage {...defaultProps} data={dataWithOverride} />);
        
        const clearBtn = screen.getByTitle('Clear override');
        fireEvent.click(clearBtn);

        expect(defaultProps.updateTeam).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: {}
        });
    });
});
