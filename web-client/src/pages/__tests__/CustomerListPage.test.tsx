import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomerListPage } from '../CustomerListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '@valuestream/shared-types';
import * as filteredCustomersModule from '../../hooks/useFilteredCustomers';

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
vi.mock('../../hooks/useFilteredCustomers');
const useFilteredCustomersMock = vi.mocked(filteredCustomersModule.useFilteredCustomers);

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
        { id: 'c1', name: 'Alpha Cust', existing_tcv: 5000, potential_tcv: 1000 },
        { id: 'c2', name: 'Gamma Cust', existing_tcv: 1000, potential_tcv: 10000 },
        { id: 'c3', name: 'Beta Cust', existing_tcv: 10000, potential_tcv: 500 }
    ],
    workItems: [],
    teams: [],
    issues: [],
    sprints: [],
    metrics: { maxScore: 100, maxRoi: 10 },
    valueStreams: []
};

/** Helper: install a mock for useFilteredCustomers that just returns the items it was given. */
function mockHook(items = mockData.customers, opts: { loading?: boolean; refetching?: boolean; error?: string | null; total?: number } = {}) {
    useFilteredCustomersMock.mockReturnValue({
        customers: items,
        total: opts.total ?? items.length,
        loading: opts.loading ?? false,
        refetching: opts.refetching ?? false,
        error: opts.error ?? null,
        reload: vi.fn(),
    });
}

/** Last (filters, sort, pagination) tuple the page passed to the hook. */
function lastHookCall() {
    const calls = useFilteredCustomersMock.mock.calls;
    return calls[calls.length - 1];
}

describe('CustomerListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHook();
    });

    describe('rendering', () => {
        it('renders the list of customers and their attributes', () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            expect(screen.getByText('Alpha Cust')).toBeDefined();
            expect(screen.getByText('Beta Cust')).toBeDefined();
            expect(screen.getByText('Gamma Cust')).toBeDefined();

            // Column headers (sortable so they render as buttons)
            expect(screen.getByRole('button', { name: /Existing/i })).toBeDefined();
            expect(screen.getByRole('button', { name: /Potential/i })).toBeDefined();

            expect(screen.getByText('$5,000')).toBeDefined();
            expect(screen.getAllByText('$1,000').length).toBeGreaterThan(0);
        });

        it('shows loading message when the page or the hook is loading', () => {
            mockHook([], { loading: true });
            renderWithProviders(<CustomerListPage data={null} loading={false} />);
            expect(screen.getByText('Loading customers...')).toBeDefined();
        });

        it('shows empty message when no customers match', () => {
            mockHook([]);
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);
            expect(screen.getByText('No customers found.')).toBeDefined();
        });
    });

    describe('navigation', () => {
        it('navigates to customer detail page when a customer is clicked', () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);
            const customerRow = screen.getByText('Alpha Cust').closest('[class*="listItem"]')!;
            fireEvent.click(customerRow);
            expect(mockedNavigate).toHaveBeenCalledWith('/customer/c1');
        });

        it('navigates to new customer page when "+ New Customer" is clicked', () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);
            fireEvent.click(screen.getByText('+ New Customer'));
            expect(mockedNavigate).toHaveBeenCalledWith('/customer/new');
        });
    });

    describe('backend filter & sort wiring', () => {
        it('passes the typed name into the hook filters', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            const filterInput = screen.getByPlaceholderText(/Filter customers.../i);
            fireEvent.change(filterInput, { target: { value: 'Alpha' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.name).toBe('Alpha');
            });
        });

        it('passes existing-TCV range into the hook filters', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            fireEvent.change(screen.getByLabelText('Min existing TCV'), { target: { value: '1000' } });
            fireEvent.change(screen.getByLabelText('Max existing TCV'), { target: { value: '5000' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minExistingTcv).toBe('1000');
                expect(filters.maxExistingTcv).toBe('5000');
            });
        });

        it('passes potential-TCV range into the hook filters', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            fireEvent.change(screen.getByLabelText('Min potential TCV'), { target: { value: '500' } });
            fireEvent.change(screen.getByLabelText('Max potential TCV'), { target: { value: '20000' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minPotentialTcv).toBe('500');
                expect(filters.maxPotentialTcv).toBe('20000');
            });
        });

        it('passes total-TCV range into the hook filters', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            fireEvent.change(screen.getByLabelText('Min total TCV'), { target: { value: '2000' } });

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minTotalTcv).toBe('2000');
            });
        });

        it('forwards column-header sort clicks to the hook', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            // Default sort is by name asc — clicking flips to desc.
            fireEvent.click(screen.getByRole('button', { name: /Name/i }));
            await waitFor(() => {
                const [, sort] = lastHookCall();
                expect(sort).toEqual({ sortBy: 'name', sortOrder: 'desc' });
            });

            // Clicking a different column starts at asc.
            fireEvent.click(screen.getByRole('button', { name: /Existing/i }));
            await waitFor(() => {
                const [, sort] = lastHookCall();
                expect(sort).toEqual({ sortBy: 'existing', sortOrder: 'asc' });
            });
        });

        it('passes pagination args to the hook based on page size from settings', () => {
            const dataWithPageSize: ValueStreamData = {
                ...mockData,
                settings: { ...mockData.settings, general: { ...mockData.settings.general, items_per_page: 50 } }
            };
            renderWithProviders(<CustomerListPage data={dataWithPageSize} loading={false} />);
            const [, , pagination] = lastHookCall();
            expect(pagination!).toEqual({ page: 1, pageSize: 50 });
        });

        it('snaps back to page 1 when a filter changes', async () => {
            // Mock returns enough total for pagination to be relevant.
            mockHook(mockData.customers, { total: 200 });
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            // Advance to page 2.
            fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
            await waitFor(() => {
                const [, , pagination] = lastHookCall();
                expect(pagination?.page).toBe(2);
            });

            // Type a filter — page should snap back to 1.
            fireEvent.change(screen.getByPlaceholderText(/Filter customers.../i), { target: { value: 'A' } });
            await waitFor(() => {
                const [, , pagination] = lastHookCall();
                expect(pagination?.page).toBe(1);
            });
        });
    });

    describe('collapsible filter region', () => {
        it('shows the active filter count on the collapsed pull-tab', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            // Apply two filters: a name and an existing-TCV range.
            fireEvent.change(screen.getByPlaceholderText(/Filter customers.../i), { target: { value: 'A' } });
            fireEvent.change(screen.getByLabelText('Min existing TCV'), { target: { value: '100' } });

            // Collapse via the chevron in the filter bar.
            fireEvent.click(screen.getByTitle('Hide filters'));

            const tab = screen.getByTitle('Show filters');
            expect(tab.textContent).toContain('(2)');

            // Reopening should hide the pull-tab again.
            fireEvent.click(tab);
            expect(screen.queryByTitle('Show filters')).toBeNull();
        });

        it('Clear filters resets all filter fields and the count', async () => {
            renderWithProviders(<CustomerListPage data={mockData} loading={false} />);

            fireEvent.change(screen.getByLabelText('Min existing TCV'), { target: { value: '100' } });
            fireEvent.change(screen.getByLabelText('Max potential TCV'), { target: { value: '999' } });

            const clearBtn = await screen.findByRole('button', { name: /Clear filters/i });
            fireEvent.click(clearBtn);

            await waitFor(() => {
                const [filters] = lastHookCall();
                expect(filters.minExistingTcv).toBeUndefined();
                expect(filters.maxPotentialTcv).toBeUndefined();
            });
        });
    });
});
