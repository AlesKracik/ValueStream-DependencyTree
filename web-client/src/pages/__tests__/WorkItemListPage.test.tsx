import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkItemListPage } from '../WorkItemListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '@valuestream/shared-types';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate
    };
});

const mockData: ValueStreamData = {
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: {
            app_provider: 'mongo',
            customer_provider: 'mongo',
            mongo: {
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: '', api_key: '' },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } },
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
    },    customers: [
        { id: 'c1', name: 'Cust A', existing_tcv: 1000, potential_tcv: 500 }
    ],
    workItems: [
        { id: 'w1', name: 'Alpha Item', score: 10, calculated_score: 10, calculated_tcv: 1000, calculated_effort: 5, total_effort_mds: 5, stackrank: 200, status: 'Backlog', customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }], released_in_sprint_id: 's3' },
        { id: 'w2', name: 'Gamma Item', score: 50, calculated_score: 50, calculated_tcv: 500, calculated_effort: 20, total_effort_mds: 20, stackrank: 100, status: 'Backlog', customer_targets: [{ customer_id: 'c1', tcv_type: 'potential' }], released_in_sprint_id: 's1' },
        { id: 'w3', name: 'Beta Item', score: 30, calculated_score: 30, calculated_tcv: 0, calculated_effort: 10, total_effort_mds: 10, status: 'Backlog', customer_targets: [], released_in_sprint_id: 's2' }
    ],
    teams: [],
    issues: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2024-01-01', end_date: '2024-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2024-01-15', end_date: '2024-01-28' },
        { id: 's3', name: 'Sprint 3', start_date: '2024-01-29', end_date: '2024-02-11' }
    ],
    valueStreams: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('WorkItemListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the list of work items and their attributes', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.getByText('Beta Item')).toBeDefined();
        expect(screen.getByText('Gamma Item')).toBeDefined();

        expect(screen.getAllByText('Score').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Effort').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('TCV').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Released').length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText('10')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
        expect(screen.getByText('5 MDs')).toBeDefined();
        expect(screen.getByText('$1,000')).toBeDefined();
        expect(screen.getByText('Sprint 1')).toBeDefined();
    });

    it('filters work items by name', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const filterInput = screen.getByPlaceholderText(/Filter work items.../i);
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.queryByText('Beta Item')).toBeNull();
        expect(screen.queryByText('Gamma Item')).toBeNull();
    });

    it('sorts work items by stack rank — higher value = higher priority, unranked at the bottom', () => {
        const { container } = renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const stackRankBtn = screen.getByRole('button', { name: /Stack Rank/i });
        // First click: ascending → unranked first (MIN_SAFE_INTEGER), then 100, then 200.
        fireEvent.click(stackRankBtn);
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Item');   // unranked
        expect(items[1].textContent).toContain('Gamma Item');  // 100
        expect(items[2].textContent).toContain('Alpha Item');  // 200

        // Second click: descending → highest priority first, unranked last.
        fireEvent.click(stackRankBtn);
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');  // 200
        expect(items[1].textContent).toContain('Gamma Item');  // 100
        expect(items[2].textContent).toContain('Beta Item');   // unranked
    });

    it('renders "—" for work items with no stack rank', () => {
        const { container } = renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        // Default sort by name ascending: Alpha, Beta (unranked), Gamma
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[1].textContent).toContain('—');
    });

    it('sorts work items by name', () => {
        const { container } = renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const nameBtn = screen.getByRole('button', { name: /Name/i });
        
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Gamma Item');

        fireEvent.click(nameBtn);
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });

    it('navigates to work item detail page when a work item is clicked', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const workItemRow = screen.getByText('Alpha Item').closest('[class*="listItem"]')!;
        fireEvent.click(workItemRow);

        expect(mockedNavigate).toHaveBeenCalledWith('/workitem/w1');
    });

    it('navigates to new work item page when "+ New Work Item" is clicked', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const newBtn = screen.getByText('+ New Work Item');
        fireEvent.click(newBtn);

        expect(mockedNavigate).toHaveBeenCalledWith('/workitem/new');
    });

    it('shows loading message when loading is true', () => {
        renderWithProviders(
            <WorkItemListPage data={null} loading={true} />
        );

        expect(screen.getByText('Loading work items...')).toBeDefined();
    });

    it('Compact Ranks renumbers ranked items to multiples of 1000 in their current order, leaving unranked alone', async () => {
        const updateWorkItem = vi.fn().mockResolvedValue(undefined);
        // Ranks: 100 (Gamma), 200 (Alpha), unranked (Beta) → after compact: 1000, 2000, unranked.
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} updateWorkItem={updateWorkItem} />
        );

        fireEvent.click(screen.getByRole('button', { name: /Compact Ranks/i }));

        // Confirm the modal that asks "Compact stack ranks?"
        await waitFor(() => screen.getByText(/Compact stack ranks\?/i));
        fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

        await waitFor(() => expect(updateWorkItem).toHaveBeenCalledTimes(2));

        // Lower current rank gets the lower new rank — Gamma (100) → 1000, Alpha (200) → 2000.
        expect(updateWorkItem).toHaveBeenNthCalledWith(1, 'w2', { stackrank: 1000 });
        expect(updateWorkItem).toHaveBeenNthCalledWith(2, 'w1', { stackrank: 2000 });

        // Beta (no stackrank) is never updated.
        const updatedIds = updateWorkItem.mock.calls.map(c => c[0]);
        expect(updatedIds).not.toContain('w3');
    });

    it('Compact Ranks shows an alert (no update calls) when no work item has a stack rank', async () => {
        const updateWorkItem = vi.fn().mockResolvedValue(undefined);
        const dataNoRanks: ValueStreamData = {
            ...mockData,
            workItems: mockData.workItems.map(w => ({ ...w, stackrank: undefined }))
        };
        renderWithProviders(
            <WorkItemListPage data={dataNoRanks} loading={false} updateWorkItem={updateWorkItem} />
        );

        fireEvent.click(screen.getByRole('button', { name: /Compact Ranks/i }));

        await waitFor(() => screen.getByText(/Nothing to compact/i));
        expect(updateWorkItem).not.toHaveBeenCalled();
    });

    it('shows empty message when no work items are found', () => {
        renderWithProviders(
            <WorkItemListPage data={{ ...mockData, workItems: [] }} loading={false} />
        );

        expect(screen.getByText('No work items found.')).toBeDefined();
    });

    it('displays correct sprint name in Released column for each work item', () => {
        const { container } = renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const items = container.querySelectorAll('[class*="listItem"]');
        // Default sort is by name ascending: Alpha (s3), Beta (s2), Gamma (s1)
        expect(items[0].textContent).toContain('Sprint 3');
        expect(items[1].textContent).toContain('Sprint 2');
        expect(items[2].textContent).toContain('Sprint 1');
    });

    it('shows "Not Released" when work item has no released_in_sprint_id', () => {
        const dataWithUnreleased = {
            ...mockData,
            workItems: [
                { ...mockData.workItems[0], released_in_sprint_id: undefined },
                mockData.workItems[1]
            ]
        };

        const { container } = renderWithProviders(
            <WorkItemListPage data={dataWithUnreleased} loading={false} />
        );

        const items = container.querySelectorAll('[class*="listItem"]');
        // Alpha (no sprint) then Gamma (s1)
        expect(items[0].textContent).toContain('Not Released');
        expect(items[1].textContent).toContain('Sprint 1');
    });

    it('shows "Not Released" when sprints array is missing from data', () => {
        const dataWithoutSprints = {
            ...mockData,
            sprints: undefined as unknown as ValueStreamData['sprints']
        };

        renderWithProviders(
            <WorkItemListPage data={dataWithoutSprints} loading={false} />
        );

        // All items should show "Not Released" since sprints can't be resolved
        const notReleasedElements = screen.getAllByText('Not Released');
        expect(notReleasedElements.length).toBe(3);
    });
});





