import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { CustomerListPage } from '../CustomerListPage';
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

describe('CustomerListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the list of customers and their attributes', () => {
        renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha Cust')).toBeDefined();
        expect(screen.getByText('Beta Cust')).toBeDefined();
        expect(screen.getByText('Gamma Cust')).toBeDefined();

        expect(screen.getByText('Existing TCV')).toBeDefined();
        expect(screen.getByText('Potential TCV')).toBeDefined();

        expect(screen.getByText('$5,000')).toBeDefined();
        expect(screen.getAllByText('$1,000').length).toBeGreaterThan(0);
    });

    it('sorts customers by name', () => {
        const { container } = renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Cust');
        expect(items[1].textContent).toContain('Beta Cust');
        expect(items[2].textContent).toContain('Gamma Cust');
    });

    it('sorts customers by existing TCV', () => {
        const { container } = renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const sortBtn = screen.getByRole('button', { name: /Existing/i });
        
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Cust');
        expect(items[1].textContent).toContain('Alpha Cust');
        expect(items[2].textContent).toContain('Beta Cust');
    });

    it('filters customers by name', () => {
        renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const filterInput = screen.getByPlaceholderText('Filter customers...');
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Cust')).toBeDefined();
        expect(screen.queryByText('Beta Cust')).toBeNull();
        expect(screen.queryByText('Gamma Cust')).toBeNull();
    });

    it('navigates to customer detail page when a customer is clicked', () => {
        renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const customerRow = screen.getByText('Alpha Cust').closest('[class*="listItem"]')!;
        fireEvent.click(customerRow);

        expect(mockedNavigate).toHaveBeenCalledWith('/customer/c1');
    });

    it('navigates to new customer page when "+ New Customer" is clicked', () => {
        renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const newBtn = screen.getByText('+ New Customer');
        fireEvent.click(newBtn);

        expect(mockedNavigate).toHaveBeenCalledWith('/customer/new');
    });

    it('shows loading message when loading is true', () => {
        renderWithProviders(
            <CustomerListPage data={null} loading={true} />
        );

        expect(screen.getByText('Loading customers...')).toBeDefined();
    });

    it('shows empty message when no customers are found', () => {
        renderWithProviders(
            <CustomerListPage data={{ ...mockData, customers: [] }} loading={false} />
        );

        expect(screen.getByText('No customers found.')).toBeDefined();
    });
});






