import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkItemListPage } from '../WorkItemListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '@valuestream/shared-types';
import * as filteredWorkItemsModule from '../../hooks/useFilteredWorkItems';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate
    };
});

// Mock the backend hook so tests assert the filter/sort args the page sends
// without exercising the fetch path twice (the hook has its own coverage).
vi.mock('../../hooks/useFilteredWorkItems');
const useFilteredWorkItemsMock = vi.mocked(filteredWorkItemsModule.useFilteredWorkItems);

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
    },
    customers: [
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

/** Helper: install a mock for useFilteredWorkItems that just returns the items it was given. */
function mockHook(items = mockData.workItems, opts: { loading?: boolean; refetching?: boolean; error?: string | null } = {}) {
    useFilteredWorkItemsMock.mockReturnValue({
        workItems: items,
        metrics: { maxScore: 100, maxRoi: 10 },
        loading: opts.loading ?? false,
        refetching: opts.refetching ?? false,
        error: opts.error ?? null,
        reload: vi.fn(),
    });
}

/** Last (filters, sort) tuple the page passed to the hook. */
function lastHookCall() {
    const calls = useFilteredWorkItemsMock.mock.calls;
    return calls[calls.length - 1];
}

describe('WorkItemListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHook();
    });

    describe('rendering', () => {
        it('renders the list of work items and their attributes', () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

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
            // 'Sprint 1' appears both in the Released column and in the Released-filter chip,
            // so use getAllByText.
            expect(screen.getAllByText('Sprint 1').length).toBeGreaterThanOrEqual(1);
        });

        it('renders "—" for work items with no stack rank when toggled to Stack Rank', () => {
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            fireEvent.click(screen.getByRole('radio', { name: /Stack Rank/i }));

            // The page renders items in the order the hook returned them; we passed unsorted mockData.
            // Beta (id w3) has no stackrank, so its row should contain '—' in the priority column.
            const rows = container.querySelectorAll('[class*="listItem"]');
            const betaRow = Array.from(rows).find(r => r.textContent?.includes('Beta Item'))!;
            expect(betaRow.textContent).toContain('—');
        });

        it('toggle switches the Priority column header label', () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            expect(screen.getByRole('button', { name: /^Score/i })).toBeDefined();

            fireEvent.click(screen.getByRole('radio', { name: /Stack Rank/i }));
            expect(screen.getByRole('button', { name: /^Stack Rank/i })).toBeDefined();

            fireEvent.click(screen.getByRole('radio', { name: /Product Value/i }));
            expect(screen.getByRole('button', { name: /^Product Value/i })).toBeDefined();
        });

        it('renders Product Value from aha_synced_data.score when toggled to Product Value', () => {
            const items = [
                { ...mockData.workItems[0], aha_synced_data: { score: 77 } },
                { ...mockData.workItems[1] },
                { ...mockData.workItems[2], aha_synced_data: { score: 42 } }
            ];
            mockHook(items);

            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            fireEvent.click(screen.getByRole('radio', { name: /Product Value/i }));

            const rows = container.querySelectorAll('[class*="listItem"]');
            const findRow = (name: string) => Array.from(rows).find(r => r.textContent?.includes(name))!;
            expect(findRow('Alpha Item').textContent).toContain('77');
            expect(findRow('Beta Item').textContent).toContain('42');
            expect(findRow('Gamma Item').textContent).toContain('—');
        });

        it('shows loading message when the page or the hook is loading', () => {
            mockHook([], { loading: true });
            renderWithProviders(<WorkItemListPage data={null} loading={false} />);
            expect(screen.getByText('Loading work items...')).toBeDefined();
        });

        it('shows empty message when no work items match', () => {
            mockHook([]);
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            expect(screen.getByText('No work items found.')).toBeDefined();
        });

        it('displays correct sprint name in Released column for each work item', () => {
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            const rows = container.querySelectorAll('[class*="listItem"]');
            const find = (name: string) => Array.from(rows).find(r => r.textContent?.includes(name))!;
            expect(find('Alpha Item').textContent).toContain('Sprint 3');
            expect(find('Beta Item').textContent).toContain('Sprint 2');
            expect(find('Gamma Item').textContent).toContain('Sprint 1');
        });

        it('shows "Not Released" when work item has no released_in_sprint_id', () => {
            const items = [
                { ...mockData.workItems[0], released_in_sprint_id: undefined },
                mockData.workItems[1]
            ];
            mockHook(items);
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            const rows = container.querySelectorAll('[class*="listItem"]');
            expect(Array.from(rows).find(r => r.textContent?.includes('Alpha'))!.textContent).toContain('Not Released');
        });

        it('renders the global flag icon for work items with all_customers_target', () => {
            const items = [
                { ...mockData.workItems[0], all_customers_target: { tcv_type: 'existing' as const } },
                mockData.workItems[1],
            ];
            mockHook(items);
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            const rows = container.querySelectorAll('[class*="listItem"]');
            const alpha = Array.from(rows).find(r => r.textContent?.includes('Alpha'))!;
            const gamma = Array.from(rows).find(r => r.textContent?.includes('Gamma'))!;
            expect(alpha.querySelector('[aria-label="Relates to all existing customers"]')).not.toBeNull();
            expect(gamma.querySelector('[aria-label="Relates to all existing customers"]')).toBeNull();
        });

        it('does not render the released icon (Released column already shows the sprint)', () => {
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            container.querySelectorAll('[class*="listItem"]').forEach(item => {
                expect(item.textContent).not.toContain('📦');
            });
        });
    });

    describe('navigation', () => {
        it('navigates to work item detail page when a work item is clicked', () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            const workItemRow = screen.getByText('Alpha Item').closest('[class*="listItem"]')!;
            fireEvent.click(workItemRow);
            expect(mockedNavigate).toHaveBeenCalledWith('/workitem/w1');
        });

        it('navigates to new work item page when "+ New Work Item" is clicked', () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            fireEvent.click(screen.getByText('+ New Work Item'));
            expect(mockedNavigate).toHaveBeenCalledWith('/workitem/new');
        });
    });

    describe('backend filter & sort wiring', () => {
        it('passes the typed name into the hook filters', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            const filterInput = screen.getByPlaceholderText(/Filter by name.../i);
            fireEvent.change(filterInput, { target: { value: 'Alpha' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.name).toBe('Alpha');
            });
        });

        it('passes min/max priority range into the hook filters with the active metric', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            // Default metric is Score.
            fireEvent.change(screen.getByLabelText('Min Score'), { target: { value: '10' } });
            fireEvent.change(screen.getByLabelText('Max Score'), { target: { value: '100' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minPriority).toBe('10');
                expect(filters.maxPriority).toBe('100');
                expect(filters.priorityMetric).toBe('score');
            });
        });

        it('updates the priority filter label and forwards the new metric when the toggle changes', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            // Switching to Stack Rank should rename the filter label and the aria-labels.
            fireEvent.click(screen.getByRole('radio', { name: /Stack Rank/i }));
            expect(screen.getByLabelText('Min Stack Rank')).toBeDefined();
            expect(screen.getByLabelText('Max Stack Rank')).toBeDefined();

            // Type a value — it should be sent as minPriority along with priorityMetric=stackrank.
            fireEvent.change(screen.getByLabelText('Min Stack Rank'), { target: { value: '50' } });
            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minPriority).toBe('50');
                expect(filters.priorityMetric).toBe('stackrank');
            });

            // Switching to Product Value updates the label again and re-sends with new metric.
            fireEvent.click(screen.getByRole('radio', { name: /Product Value/i }));
            expect(screen.getByLabelText('Min Product Value')).toBeDefined();
            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.priorityMetric).toBe('aha_score');
                // The numeric value persists across the metric switch.
                expect(filters.minPriority).toBe('50');
            });
        });

        it('toggles status checkboxes (multiselect dropdown) into the hook filters', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            // Open the Status dropdown.
            fireEvent.click(screen.getByLabelText('Status filter'));
            // Toggle two options on.
            fireEvent.click(screen.getByRole('option', { name: 'Backlog' }));
            fireEvent.click(screen.getByRole('option', { name: 'Planning' }));

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.status).toEqual(['Backlog', 'Planning']);
            });

            // Toggling Backlog off removes it but keeps Planning.
            fireEvent.click(screen.getByRole('option', { name: 'Backlog' }));
            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.status).toEqual(['Planning']);
            });
        });

        it('Released dropdown lists one option per non-archived sprint plus an "Unreleased" option', () => {
            const dataWithArchived = {
                ...mockData,
                sprints: [
                    ...mockData.sprints,
                    { id: 's0', name: 'Old Sprint', start_date: '2023-01-01', end_date: '2023-01-14', is_archived: true },
                ]
            };
            renderWithProviders(<WorkItemListPage data={dataWithArchived} loading={false} />);
            fireEvent.click(screen.getByLabelText('Released filter'));

            const labels = screen.getAllByRole('option').map(o => o.textContent);
            // Unreleased + Sprint 1/2/3 — Old Sprint excluded as archived
            expect(labels).toEqual(['Unreleased', 'Sprint 1', 'Sprint 2', 'Sprint 3']);
        });

        it('selecting Unreleased in the Released dropdown puts the literal sentinel into the filter', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            fireEvent.click(screen.getByLabelText('Released filter'));
            fireEvent.click(screen.getByRole('option', { name: 'Unreleased' }));
            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.releasedSprintIds).toEqual(['unreleased']);
            });
        });

        it('forwards column-header sort clicks to the hook', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            // Default sort is by name ascending. Clicking the same column flips order.
            const nameBtn = screen.getByRole('button', { name: /Name/i });
            fireEvent.click(nameBtn);
            await waitFor(() => {
                const [, sort] = lastHookCall();
                expect(sort).toEqual({ sortBy: 'name', sortOrder: 'desc' });
            });

            // Clicking a different column starts at asc.
            const tcvBtn = screen.getByRole('button', { name: /^TCV/i });
            fireEvent.click(tcvBtn);
            await waitFor(() => {
                const [, sort] = lastHookCall();
                expect(sort).toEqual({ sortBy: 'tcv', sortOrder: 'asc' });
            });
        });

        it('Released column is no longer sortable (server-side sort intentionally unsupported)', () => {
            const { container } = renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            // The Released column header is rendered as a non-button div (sortKey omitted)
            // — but a "Released filter" dropdown trigger button still exists in the filter
            // bar, so we have to look specifically inside the listHeader row.
            const headerRow = container.querySelector('[class*="listHeader"]')!;
            const buttons = Array.from(headerRow.querySelectorAll('button'));
            expect(buttons.find(b => b.textContent?.trim().startsWith('Released'))).toBeUndefined();
            // And the Released text is in fact present in the header row, just not as a button.
            expect(headerRow.textContent).toContain('Released');
        });
    });

    describe('collapsible filter region', () => {
        it('shows the active filter count on the collapsed pull-tab', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            // Apply two filters: a name and a status.
            fireEvent.change(screen.getByPlaceholderText(/Filter by name.../i), { target: { value: 'A' } });
            fireEvent.click(screen.getByLabelText('Status filter'));
            fireEvent.click(screen.getByRole('option', { name: 'Backlog' }));

            // Collapse via the chevron in the filter bar.
            fireEvent.click(screen.getByTitle('Hide filters'));

            // Pull-tab now reads "▾ (2)".
            const tab = screen.getByTitle('Show filters');
            expect(tab.textContent).toContain('(2)');

            // Reopening should hide the pull-tab again.
            fireEvent.click(tab);
            expect(screen.queryByTitle('Show filters')).toBeNull();
        });

        it('Clear filters resets all filter fields and the count', async () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);

            fireEvent.change(screen.getByLabelText('Min Score'), { target: { value: '10' } });
            fireEvent.click(screen.getByLabelText('Status filter'));
            fireEvent.click(screen.getByRole('option', { name: 'Done' }));

            const clearBtn = await screen.findByRole('button', { name: /Clear filters/i });
            fireEvent.click(clearBtn);

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minPriority).toBeUndefined();
                expect(filters.status).toBeUndefined();
            });
            expect(screen.queryByRole('button', { name: /Clear filters/i })).toBeNull();
        });
    });

    describe('Compact Ranks', () => {
        it('renumbers ranked items to multiples of 1000 in their current order, leaving unranked alone', async () => {
            const updateWorkItem = vi.fn().mockResolvedValue(undefined);
            renderWithProviders(
                <WorkItemListPage data={mockData} loading={false} updateWorkItem={updateWorkItem} />
            );

            fireEvent.click(screen.getByRole('radio', { name: /Stack Rank/i }));
            fireEvent.click(screen.getByRole('button', { name: /Compact Ranks/i }));

            await waitFor(() => screen.getByText(/Compact stack ranks\?/i));
            fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

            await waitFor(() => expect(updateWorkItem).toHaveBeenCalledTimes(2));
            // Lower current rank gets the lower new rank — Gamma (100) → 1000, Alpha (200) → 2000.
            expect(updateWorkItem).toHaveBeenNthCalledWith(1, 'w2', { stackrank: 1000 });
            expect(updateWorkItem).toHaveBeenNthCalledWith(2, 'w1', { stackrank: 2000 });

            const updatedIds = updateWorkItem.mock.calls.map(c => c[0]);
            expect(updatedIds).not.toContain('w3');
        });

        it('shows an alert (no update calls) when no work item has a stack rank', async () => {
            const updateWorkItem = vi.fn().mockResolvedValue(undefined);
            const dataNoRanks: ValueStreamData = {
                ...mockData,
                workItems: mockData.workItems.map(w => ({ ...w, stackrank: undefined }))
            };
            renderWithProviders(
                <WorkItemListPage data={dataNoRanks} loading={false} updateWorkItem={updateWorkItem} />
            );

            fireEvent.click(screen.getByRole('radio', { name: /Stack Rank/i }));
            fireEvent.click(screen.getByRole('button', { name: /Compact Ranks/i }));

            await waitFor(() => screen.getByText(/Nothing to compact/i));
            expect(updateWorkItem).not.toHaveBeenCalled();
        });

        it('button is not shown when toggle is set to Score (default)', () => {
            renderWithProviders(<WorkItemListPage data={mockData} loading={false} />);
            expect(screen.queryByRole('button', { name: /Compact Ranks/i })).toBeNull();
        });
    });
});
