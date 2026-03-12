import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock date-holidays
const mockIsHoliday = vi.fn().mockImplementation((date: Date) => {
    // Jan 1st 2026: Public Holiday (Thu)
    if (date.getFullYear() === 2026 && date.getMonth() === 0 && date.getDate() === 1) {
        return [{ type: 'public', name: 'New Year' }];
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

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [
        { id: 't1', name: 'Team 1', total_capacity_mds: 2000, country: 'US' }
    ],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ]
};

describe('TeamPage', () => {
    const updateTeamSpy = vi.fn().mockResolvedValue(undefined);
    const addTeamSpy = vi.fn().mockResolvedValue('new-t1');
    
    const defaultProps = {
        data: mockData,
        loading: false,
        updateTeam: updateTeamSpy,
        addTeam: addTeamSpy
    };

    const renderTeamPage = (props = defaultProps, teamId = 't1') => {
        return render(
            <MemoryRouter initialEntries={[`/team/${teamId}`]}>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateEpic: vi.fn() }}>
                        <Routes>
                            <Route path="/team/:id" element={<TeamPage {...props} />} />
                        </Routes>
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders team details', () => {
        renderTeamPage();
        expect(screen.getByDisplayValue('Team 1')).toBeDefined();
        expect(screen.getByDisplayValue('2000')).toBeDefined();
        // The implementation uses a select with text options
        expect(screen.getByText('United States')).toBeDefined();
    });

    it('calls updateTeam when name changes', async () => {
        renderTeamPage();
        const nameInput = screen.getByLabelText(/Team Name/i);
        fireEvent.change(nameInput, { target: { value: 'Team Alpha' } });
        
        expect(updateTeamSpy).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Team Alpha' }));
    });

    it('calculates holiday impact and shows suggested capacity', () => {
        renderTeamPage();
        
        // Sprint 1: 2026-01-01 to 2026-01-14
        // Jan 1 (Thu) - Holiday
        // Jan 2 (Fri) - Work
        // Jan 3, 4 (Sat, Sun) - Weekend
        // Jan 5-9 (Mon-Fri) - Work
        // Jan 10, 11 (Sat, Sun) - Weekend
        // Jan 12-14 (Mon-Wed) - Work
        // Total work days = 9 days
        
        expect(screen.getByText('9 days')).toBeDefined();
        expect(screen.getByTitle('1 holiday(s)')).toBeDefined();
    });

    it('handles capacity override change', async () => {
        renderTeamPage();
        // Base capacity 2000, 1 holiday impact = (2000/10)*1 = 200. Calculated = 1800.
        const input = screen.getByPlaceholderText('1,800');
        fireEvent.change(input, { target: { value: '1700' } });
        
        expect(updateTeamSpy).toHaveBeenCalledWith('t1', expect.objectContaining({
            sprint_capacity_overrides: {
                's1': 1700
            }
        }));
    });

    it('clears override', () => {
        const dataWithOverride: ValueStreamData = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                sprint_capacity_overrides: { 's1': 85 }
            }]
        };

        renderTeamPage({ ...defaultProps, data: dataWithOverride });
        
        const input = screen.getByDisplayValue('85');
        fireEvent.change(input, { target: { value: '' } });

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', expect.objectContaining({
            sprint_capacity_overrides: {}
        }));
    });

    it('renders and saves a new team', async () => {
        renderTeamPage(defaultProps, 'new');

        expect(screen.getByText('Create New Team')).toBeDefined();
        const nameInput = screen.getByLabelText(/Team Name/i);
        fireEvent.change(nameInput, { target: { value: 'Newly Created Team' } });
        
        // For new teams, we still need to click 'Create Team'
        const createBtn = screen.getByText('Create Team');
        fireEvent.click(createBtn);

        await waitFor(() => {
            expect(addTeamSpy).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Newly Created Team'
            }));
        });
    });
});




