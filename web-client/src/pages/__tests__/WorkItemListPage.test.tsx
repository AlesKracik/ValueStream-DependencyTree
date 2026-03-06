import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkItemListPage } from '../WorkItemListPage';
import { MemoryRouter } from 'react-router-dom';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    ValueStreams: [],
    settings: { jira_base_url: '', jira_api_version: '3', fiscal_year_start_month: 1 },
    customers: [
        { id: 'c1', name: 'Cust A', existing_tcv: 1000, potential_tcv: 500 }
    ],
    workItems: [
        { id: 'w1', name: 'Alpha Item', score: 10, total_effort_mds: 5, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }] },
        { id: 'w2', name: 'Gamma Item', score: 50, total_effort_mds: 20, customer_targets: [{ customer_id: 'c1', tcv_type: 'potential' }] },
        { id: 'w3', name: 'Beta Item', score: 30, total_effort_mds: 10, customer_targets: [] }
    ],
    teams: [],
    epics: [],
    sprints: []
};

describe('WorkItemListPage', () => {
    it('renders the list of work items and their attributes', () => {
        render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.getByText('Beta Item')).toBeDefined();
        expect(screen.getByText('Gamma Item')).toBeDefined();

        // Check for attribute labels
        expect(screen.getAllByText('Score:').length).toBe(3);
        expect(screen.getAllByText('Effort:').length).toBe(3);
        expect(screen.getAllByText('TCV:').length).toBe(3);
        expect(screen.getAllByText('Released:').length).toBe(3);

        // Check for specific values
        expect(screen.getByText('10')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
        expect(screen.getByText('5 MDs')).toBeDefined();
        expect(screen.getByText('$1,000')).toBeDefined();
    });

    it('filters work items by name', () => {
        render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const filterInput = screen.getByPlaceholderText(/Filter work items.../i);
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.queryByText('Beta Item')).toBeNull();
        expect(screen.queryByText('Gamma Item')).toBeNull();
    });

    it('sorts work items by name', () => {
        const { container } = render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const nameBtn = screen.getByRole('button', { name: /Name/i });
        
        // Initial sort is name asc: Alpha, Beta, Gamma
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Gamma Item');

        // Click again for desc: Gamma, Beta, Alpha
        fireEvent.click(nameBtn);
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });

    it('sorts work items by score', () => {
        const { container } = render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const scoreBtn = screen.getByRole('button', { name: /Score/i });
        
        // Click for score asc: Alpha (10), Beta (30), Gamma (50)
        fireEvent.click(scoreBtn);
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Gamma Item');

        // Click for score desc: Gamma, Beta, Alpha
        fireEvent.click(scoreBtn);
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });

    it('sorts work items by effort', () => {
        const { container } = render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const effortBtn = screen.getByRole('button', { name: /Effort/i });
        
        // Effort: Alpha (5), Beta (10), Gamma (20)
        fireEvent.click(effortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Gamma Item');
    });

    it('sorts work items by TCV', () => {
        const { container } = render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const tcvBtn = screen.getByRole('button', { name: /TCV/i });
        
        // TCV: Beta (0), Gamma (500), Alpha (1000)
        fireEvent.click(tcvBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Item');
        expect(items[1].textContent).toContain('Gamma Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });
});



