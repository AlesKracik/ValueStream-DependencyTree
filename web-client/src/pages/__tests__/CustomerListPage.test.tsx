import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerListPage } from '../CustomerListPage';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [],
    settings: { jira_base_url: '', jira_api_version: '3', fiscal_year_start_month: 1 },
    customers: [
        { id: 'c1', name: 'Alpha Cust', existing_tcv: 500, potential_tcv: 100 },
        { id: 'c2', name: 'Gamma Cust', existing_tcv: 100, potential_tcv: 1000 },
        { id: 'c3', name: 'Beta Cust', existing_tcv: 1000, potential_tcv: 50 }
    ],
    workItems: [],
    teams: [],
    epics: [],
    sprints: []
};

describe('CustomerListPage', () => {
    it('renders the list of customers', () => {
        render(
            <MemoryRouter>
                <CustomerListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('Alpha Cust')).toBeDefined();
        expect(screen.getByText('Beta Cust')).toBeDefined();
        expect(screen.getByText('Gamma Cust')).toBeDefined();
    });

    it('sorts customers by name', () => {
        const { container } = render(
            <MemoryRouter>
                <CustomerListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        // Alpha, Beta, Gamma
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Cust');
        expect(items[1].textContent).toContain('Beta Cust');
        expect(items[2].textContent).toContain('Gamma Cust');
    });

    it('sorts customers by existing TCV', () => {
        const { container } = render(
            <MemoryRouter>
                <CustomerListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const sortBtn = screen.getByRole('button', { name: /Existing/i });
        
        // Click for asc: Gamma (100), Alpha (500), Beta (1000)
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Cust');
        expect(items[1].textContent).toContain('Alpha Cust');
        expect(items[2].textContent).toContain('Beta Cust');
    });

    it('sorts customers by potential TCV', () => {
        const { container } = render(
            <MemoryRouter>
                <CustomerListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const sortBtn = screen.getByRole('button', { name: /Potential/i });
        
        // Click for asc: Beta (50), Alpha (100), Gamma (1000)
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Cust');
        expect(items[1].textContent).toContain('Alpha Cust');
        expect(items[2].textContent).toContain('Gamma Cust');
    });

    it('sorts customers by total TCV', () => {
        const { container } = render(
            <MemoryRouter>
                <CustomerListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const sortBtn = screen.getByRole('button', { name: /Total/i });
        
        // Totals: Alpha (600), Gamma (1100), Beta (1050)
        // Click for asc: Alpha, Beta, Gamma
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Cust');
        expect(items[1].textContent).toContain('Beta Cust');
        expect(items[2].textContent).toContain('Gamma Cust');
    });
});
