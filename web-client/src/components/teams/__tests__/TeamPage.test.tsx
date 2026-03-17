import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import { ValueStreamProvider, NotificationProvider, useValueStreamContext } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../contexts/ValueStreamContext', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useValueStreamContext: vi.fn()
    };
});

const mockData: ValueStreamData = {
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [],
    workItems: [],
    teams: [
        { id: 't1', name: 'Team 1', total_capacity_mds: 10, country: 'Default', sprint_capacity_overrides: {} }
    ],
    issues: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
    ],
    valueStreams: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('TeamPage', () => {
    const updateTeamSpy = vi.fn();
    const addTeamSpy = vi.fn();
    const deleteTeamSpy = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);

    const defaultProps = {
        data: mockData,
        loading: false,
        updateTeam: updateTeamSpy,
        addTeam: addTeamSpy,
        deleteTeam: deleteTeamSpy
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: mockData,
            updateIssue: vi.fn()
        });
    });

    const renderTeamPage = (props = defaultProps, id = 't1') => {
        return render(
            <MemoryRouter initialEntries={[`/team/${id}`]}>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                        <Routes>
                            <Route path="/team/:id" element={<TeamPage {...props} />} />
                        </Routes>
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    it('renders team details correctly', () => {
        renderTeamPage();

        expect(screen.getByText('Team: Team 1')).toBeDefined();
        expect(screen.getByDisplayValue('Team 1')).toBeDefined();
        expect(screen.getByDisplayValue('10')).toBeDefined();
        expect(screen.getByDisplayValue('Default (No Holidays)')).toBeDefined();
    });

    it('calls updateTeam when name changes', () => {
        renderTeamPage();

        const nameInput = screen.getByLabelText(/Team Name/i);
        fireEvent.change(nameInput, { target: { value: 'Updated Team' } });

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', { name: 'Updated Team' });
    });

    it('calculates holiday impact and shows effective capacity', () => {
        const teamWithCZ = {
            ...mockData.teams[0],
            country: 'CZ'
        };
        const dataWithCZ = {
            ...mockData,
            teams: [teamWithCZ]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithCZ,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithCZ });

        expect(screen.getByText(/9 days/i)).toBeDefined();
        expect(screen.getByText(/\(🏖️ -1\)/i)).toBeDefined();

        expect(screen.getByPlaceholderText('9')).toBeDefined();
    });

    it('handles capacity override change', () => {
        renderTeamPage();

        const inputs = screen.getAllByRole('spinbutton');
        const s1Input = inputs[1];

        fireEvent.change(s1Input, { target: { value: '8.5' } });

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: { 's1': 8.5 }
        });
    });

    it('clears override when the clear button is clicked', () => {
        const teamWithOverride = {
            ...mockData.teams[0],
            sprint_capacity_overrides: { 's1': 5 }
        };
        const dataWithOverride = {
            ...mockData,
            teams: [teamWithOverride]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithOverride,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithOverride });

        const clearBtn = screen.getByTitle('Remove Override');
        fireEvent.click(clearBtn);

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
            sprint_capacity_overrides: {}
        });
    });

    it('renders and saves a new team', async () => {
        renderTeamPage(defaultProps, 'new');

        expect(screen.getByText('Create New Team')).toBeDefined();

        const nameInput = screen.getByLabelText(/Team Name/i);
        fireEvent.change(nameInput, { target: { value: 'Newly Created Team' } });

        const createBtn = screen.getByText('Create Team');
        fireEvent.click(createBtn);

        await waitFor(() => {
            expect(addTeamSpy).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Newly Created Team'
            }));
        });
    });

    it('deletes the team after confirmation', async () => {
        renderTeamPage();

        const deleteBtn = screen.getByText('Delete Team');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Team', expect.stringContaining('Team 1'));
        
        await waitFor(() => {
            expect(deleteTeamSpy).toHaveBeenCalledWith('t1');
        });
    });

    it('recalculates holiday impact when country changes', async () => {
        renderTeamPage();

        const countrySelect = screen.getByLabelText(/Country/i);
        
        fireEvent.change(countrySelect, { target: { value: 'CZ' } });
        
        expect(updateTeamSpy).toHaveBeenCalledWith('t1', { country: 'CZ' });

        const dataWithCZ: ValueStreamData = {
            ...mockData,
            teams: [{ ...mockData.teams[0], country: 'CZ' }]
        };

        cleanup();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithCZ,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithCZ });

        expect(screen.getByText(/9 days/i)).toBeDefined();
        expect(screen.getByText(/\(🏖️ -1\)/i)).toBeDefined();
        
        expect(screen.getByPlaceholderText('9')).toBeDefined();
    });

    it('updates effective capacity when total capacity changes', async () => {
        const teamWith20 = { ...mockData.teams[0], total_capacity_mds: 20 };
        const dataWith20 = {
            ...mockData,
            teams: [teamWith20]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWith20,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWith20 });

        const capacityInput = screen.getByDisplayValue('20');
        fireEvent.change(capacityInput, { target: { value: '30' } });
        
        expect(updateTeamSpy).toHaveBeenCalledWith('t1', { total_capacity_mds: 30 });

        // Both s1 and s2 will have placeholder 20 initially (10 days * 20/10 capacity proportion? No, proportion is based on total MDs / 10 standard days)
        // Wait, standard working days are 10. Total capacity is 20 MDs. Effective capacity is (20/10) * 10 = 20 MDs.
        expect(screen.getAllByPlaceholderText('20').length).toBeGreaterThan(0);
    });
});
