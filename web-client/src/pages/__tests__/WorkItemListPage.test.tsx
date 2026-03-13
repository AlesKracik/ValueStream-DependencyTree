import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkItemListPage } from '../WorkItemListPage';
import { MemoryRouter } from 'react-router-dom';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    valueStreams: [],
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
        { id: 'c1', name: 'Cust A', existing_tcv: 1000, potential_tcv: 500 }
    ],
    workItems: [
        { id: 'w1', name: 'Alpha Item', score: 10, total_effort_mds: 5, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing' }], released_in_sprint_id: 's3' },
        { id: 'w2', name: 'Gamma Item', score: 50, total_effort_mds: 20, customer_targets: [{ customer_id: 'c1', tcv_type: 'potential' }], released_in_sprint_id: 's1' },
        { id: 'w3', name: 'Beta Item', score: 30, total_effort_mds: 10, customer_targets: [], released_in_sprint_id: 's2' }
    ],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2024-01-01', end_date: '2024-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2024-01-15', end_date: '2024-01-28' },
        { id: 's3', name: 'Sprint 3', start_date: '2024-01-29', end_date: '2024-02-11' }
    ]
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

        // Check for attribute labels in header (may appear twice due to sort buttons)
        expect(screen.getAllByText('Score').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Effort').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('TCV').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Released').length).toBeGreaterThanOrEqual(1);

        // Check for specific values
        expect(screen.getByText('10')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
        expect(screen.getByText('5 MDs')).toBeDefined();
        expect(screen.getByText('$1,000')).toBeDefined();
        expect(screen.getByText('Sprint 1')).toBeDefined();
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

    it('sorts work items by released sprint', () => {
        const { container } = render(
            <MemoryRouter>
                <WorkItemListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const releasedBtn = screen.getByRole('button', { name: /Released/i });
        
        // Sprints: Sprint 1 (Gamma), Sprint 2 (Beta), Sprint 3 (Alpha)
        fireEvent.click(releasedBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });
});



