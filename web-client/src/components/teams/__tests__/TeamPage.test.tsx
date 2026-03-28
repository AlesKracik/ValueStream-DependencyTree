import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TeamPage } from '../TeamPage';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import { useNotificationContext } from '../../../contexts/NotificationContext';
import type { ValueStreamData } from '@valuestream/shared-types';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockAuthorizedFetch = vi.fn();
vi.mock('../../../utils/api', () => ({
    authorizedFetch: (...args: unknown[]) => mockAuthorizedFetch(...args),
    debounce: (fn: (...a: unknown[]) => unknown) => fn
}));

vi.mock('../../../contexts/NotificationContext', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useNotificationContext: vi.fn()
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
        jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: '', api_key: '' },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } }
    },    customers: [],
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
        (useNotificationContext as any).mockReturnValue({
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
        (useNotificationContext as any).mockReturnValue({
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
        (useNotificationContext as any).mockReturnValue({
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
        (useNotificationContext as any).mockReturnValue({
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
        (useNotificationContext as any).mockReturnValue({
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

    it('renders Members tab with add form', () => {
        renderTeamPage();

        const membersTab = screen.getByText('Members');
        fireEvent.click(membersTab);

        expect(screen.getByLabelText(/New member name/i)).toBeDefined();
        expect(screen.getByLabelText(/New member username/i)).toBeDefined();
        expect(screen.getByLabelText(/New member capacity/i)).toBeDefined();
        expect(screen.getByText('Add')).toBeDefined();
    });

    it('adds a new member', () => {
        renderTeamPage();

        fireEvent.click(screen.getByText('Members'));

        fireEvent.change(screen.getByLabelText(/New member name/i), { target: { value: 'John Doe' } });
        fireEvent.change(screen.getByLabelText(/New member username/i), { target: { value: 'jdoe' } });
        fireEvent.change(screen.getByLabelText(/New member capacity/i), { target: { value: '80' } });
        fireEvent.click(screen.getByText('Add'));

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
            members: [{ name: 'John Doe', username: 'jdoe', capacity_percentage: 80 }]
        });
    });

    it('renders existing members and allows editing', () => {
        const dataWithMembers = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                members: [{ name: 'Alice', username: 'alice', capacity_percentage: 100 }]
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithMembers,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithMembers });

        fireEvent.click(screen.getByText('Members'));

        expect(screen.getByText('Alice')).toBeDefined();
        expect(screen.getByText('alice')).toBeDefined();
        expect(screen.getByText('100%')).toBeDefined();

        fireEvent.click(screen.getByText('Edit'));

        expect(screen.getByLabelText(/Edit member name/i)).toBeDefined();
        expect(screen.getByText('Save')).toBeDefined();
        expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('shows LDAP Team Name field when LDAP is configured', () => {
        const dataWithLdap = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ldap: { url: 'ldap://localhost', bind_dn: 'cn=admin', team: { base_dn: 'ou=teams', search_filter: '(cn={{LDAP_TEAM_NAME}})' } }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithLdap,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithLdap });

        fireEvent.click(screen.getByText('Members'));

        expect(screen.getByLabelText(/LDAP Team Name/i)).toBeDefined();
    });

    it('hides LDAP Team Name field when LDAP is not configured', () => {
        renderTeamPage();

        fireEvent.click(screen.getByText('Members'));

        expect(screen.queryByLabelText(/LDAP Team Name/i)).toBeNull();
    });

    it('hides LDAP Team Name field when settings are missing entirely', () => {
        const dataWithoutSettings = {
            ...mockData,
            settings: undefined as unknown as ValueStreamData['settings']
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithoutSettings,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithoutSettings });

        fireEvent.click(screen.getByText('Members'));

        expect(screen.queryByLabelText(/LDAP Team Name/i)).toBeNull();
    });

    it('saves edited member on Save click', () => {
        const dataWithMembers = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                members: [{ name: 'Alice', username: 'alice', capacity_percentage: 100 }]
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithMembers,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithMembers });

        fireEvent.click(screen.getByText('Members'));
        fireEvent.click(screen.getByText('Edit'));

        fireEvent.change(screen.getByLabelText(/Edit member name/i), { target: { value: 'Alice Updated' } });
        fireEvent.change(screen.getByLabelText(/Edit member username/i), { target: { value: 'alice2' } });
        fireEvent.change(screen.getByLabelText(/Edit member capacity/i), { target: { value: '75' } });
        fireEvent.click(screen.getByText('Save'));

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
            members: [{ name: 'Alice Updated', username: 'alice2', capacity_percentage: 75 }]
        });
    });

    it('cancels editing and restores add row', () => {
        const dataWithMembers = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                members: [{ name: 'Bob', username: 'bob', capacity_percentage: 50 }]
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithMembers,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithMembers });

        fireEvent.click(screen.getByText('Members'));
        fireEvent.click(screen.getByText('Edit'));

        // Add row should be hidden during edit
        expect(screen.queryByLabelText(/New member name/i)).toBeNull();

        fireEvent.click(screen.getByText('Cancel'));

        // Add row should reappear after cancel
        expect(screen.getByLabelText(/New member name/i)).toBeDefined();
    });

    it('removes a member after confirmation', async () => {
        const dataWithMembers = {
            ...mockData,
            teams: [{
                ...mockData.teams[0],
                members: [
                    { name: 'Alice', username: 'alice', capacity_percentage: 100 },
                    { name: 'Bob', username: 'bob', capacity_percentage: 50 }
                ]
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithMembers,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithMembers });

        fireEvent.click(screen.getByText('Members'));

        const removeButtons = screen.getAllByText('Remove');
        fireEvent.click(removeButtons[0]);

        expect(mockShowConfirm).toHaveBeenCalledWith('Remove Member', expect.stringContaining('Alice'));

        await waitFor(() => {
            expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
                members: [{ name: 'Bob', username: 'bob', capacity_percentage: 50 }]
            });
        });
    });

    it('updates ldap_team_name field', () => {
        const dataWithLdap = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ldap: { url: 'ldap://localhost', bind_dn: 'cn=admin', team: { base_dn: 'ou=teams', search_filter: '(cn={{LDAP_TEAM_NAME}})' } }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithLdap,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithLdap });

        fireEvent.click(screen.getByText('Members'));

        const ldapInput = screen.getByLabelText(/LDAP Team Name/i);
        fireEvent.change(ldapInput, { target: { value: 'engineering' } });

        expect(updateTeamSpy).toHaveBeenCalledWith('t1', { ldap_team_name: 'engineering' });
    });

    it('does not add member with empty name', () => {
        renderTeamPage();

        fireEvent.click(screen.getByText('Members'));

        fireEvent.change(screen.getByLabelText(/New member username/i), { target: { value: 'jdoe' } });
        fireEvent.click(screen.getByText('Add'));

        expect(updateTeamSpy).not.toHaveBeenCalled();
    });

    it('syncs members from LDAP, merging with existing', async () => {
        const dataWithLdapAndMembers = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ldap: { url: 'ldap://localhost', bind_dn: 'cn=admin', team: { base_dn: 'ou=teams', search_filter: '(cn={{LDAP_TEAM_NAME}})' } }
            },
            teams: [{
                ...mockData.teams[0],
                ldap_team_name: 'engineering',
                members: [
                    { name: 'Alice', username: 'alice', capacity_percentage: 80 },
                    { name: 'Old Member', username: 'old', capacity_percentage: 50 }
                ]
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithLdapAndMembers,
            updateIssue: vi.fn()
        });

        mockAuthorizedFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({
                success: true,
                members: [
                    { name: 'Alice Smith', username: 'alice' },
                    { name: 'Bob Jones', username: 'bob' }
                ]
            })
        });

        renderTeamPage({ ...defaultProps, data: dataWithLdapAndMembers });

        fireEvent.click(screen.getByText('Members'));
        fireEvent.click(screen.getByText('Sync from LDAP'));

        await waitFor(() => {
            expect(updateTeamSpy).toHaveBeenCalledWith('t1', {
                members: [
                    { name: 'Alice Smith', username: 'alice', capacity_percentage: 80 },
                    { name: 'Bob Jones', username: 'bob', capacity_percentage: 100 }
                ]
            });
        });

        expect(screen.getByText(/1 kept, 1 added, 1 removed/)).toBeDefined();
    });

    it('shows error message when LDAP sync fails', async () => {
        const dataWithLdap = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ldap: { url: 'ldap://localhost', bind_dn: 'cn=admin', team: { base_dn: 'ou=teams', search_filter: '(cn={{LDAP_TEAM_NAME}})' } }
            },
            teams: [{
                ...mockData.teams[0],
                ldap_team_name: 'bad-team'
            }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithLdap,
            updateIssue: vi.fn()
        });

        mockAuthorizedFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({
                success: false,
                error: 'No LDAP group found'
            })
        });

        renderTeamPage({ ...defaultProps, data: dataWithLdap });

        fireEvent.click(screen.getByText('Members'));
        fireEvent.click(screen.getByText('Sync from LDAP'));

        await waitFor(() => {
            expect(screen.getByText(/No LDAP group found/)).toBeDefined();
        });
    });

    it('disables Sync button when ldap_team_name is empty', () => {
        const dataWithLdap = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ldap: { url: 'ldap://localhost', bind_dn: 'cn=admin', team: { base_dn: 'ou=teams', search_filter: '(cn={{LDAP_TEAM_NAME}})' } }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: dataWithLdap,
            updateIssue: vi.fn()
        });

        renderTeamPage({ ...defaultProps, data: dataWithLdap });

        fireEvent.click(screen.getByText('Members'));

        const syncBtn = screen.getByText('Sync from LDAP') as HTMLButtonElement;
        expect(syncBtn.disabled).toBe(true);
    });
});



