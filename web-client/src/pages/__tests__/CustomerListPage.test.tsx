import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { CustomerListPage } from '../CustomerListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    // ... same mockData

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
    customers: [
        { id: 'c1', name: 'Alpha Cust', existing_tcv: 5000, potential_tcv: 1000 },
        { id: 'c2', name: 'Gamma Cust', existing_tcv: 1000, potential_tcv: 10000 },
        { id: 'c3', name: 'Beta Cust', existing_tcv: 10000, potential_tcv: 500 }
    ],
    workItems: [],
    teams: [],
    epics: [],
    sprints: []
};

describe('CustomerListPage', () => {
    it('renders the list of customers and their attributes', () => {
        renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha Cust')).toBeDefined();
        expect(screen.getByText('Beta Cust')).toBeDefined();
        expect(screen.getByText('Gamma Cust')).toBeDefined();

        // Check for attribute labels in header
        expect(screen.getByText('Existing TCV')).toBeDefined();
        expect(screen.getByText('Potential TCV')).toBeDefined();

        // Check for specific values
        expect(screen.getByText('$5,000')).toBeDefined();
        expect(screen.getAllByText('$1,000').length).toBeGreaterThan(0);
    });

    it('sorts customers by name', () => {
        const { container } = renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        // Alpha, Beta, Gamma
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
        
        // Click for asc: Gamma (100), Alpha (500), Beta (1000)
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Cust');
        expect(items[1].textContent).toContain('Alpha Cust');
        expect(items[2].textContent).toContain('Beta Cust');
    });

    it('sorts customers by potential TCV', () => {
        const { container } = renderWithProviders(
            <CustomerListPage data={mockData} loading={false} />
        );

        const sortBtn = screen.getByRole('button', { name: /Potential/i });
        
        // Click for asc: Beta (50), Alpha (100), Gamma (1000)
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Cust');
        expect(items[1].textContent).toContain('Alpha Cust');
        expect(items[2].textContent).toContain('Gamma Cust');
    });
});



