import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamListPage } from '../TeamListPage';
import { MemoryRouter } from 'react-router-dom';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    ValueStreams: [],
    settings: { jira_base_url: '', jira_api_version: '3', fiscal_year_start_month: 1 },
    customers: [],
    workItems: [],
    teams: [
        { id: 't1', name: 'Alpha Team', total_capacity_mds: 50, country: 'USA' },
        { id: 't2', name: 'Gamma Team', total_capacity_mds: 10, country: 'Canada' },
        { id: 't3', name: 'Beta Team', total_capacity_mds: 100, country: 'Brazil' }
    ],
    epics: [],
    sprints: []
};

describe('TeamListPage', () => {
    it('renders the list of teams and their attributes', () => {
        render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('Alpha Team')).toBeDefined();
        expect(screen.getByText('Beta Team')).toBeDefined();
        expect(screen.getByText('Gamma Team')).toBeDefined();

        // Check for attribute labels in header (may appear twice due to sort buttons)
        expect(screen.getAllByText('Capacity').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Country').length).toBeGreaterThanOrEqual(1);

        // Check for specific values
        expect(screen.getByText('50 MDs')).toBeDefined();
        expect(screen.getByText('100 MDs')).toBeDefined();
        expect(screen.getByText('USA')).toBeDefined();
    });

    it('sorts teams by name', () => {
        const { container } = render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        // Alpha, Beta, Gamma
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Team');
        expect(items[1].textContent).toContain('Beta Team');
        expect(items[2].textContent).toContain('Gamma Team');
    });

    it('sorts teams by capacity', () => {
        const { container } = render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const sortBtn = screen.getByRole('button', { name: /Capacity/i });
        
        // Click for asc: Gamma (10), Alpha (50), Beta (100)
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Team');
        expect(items[1].textContent).toContain('Alpha Team');
        expect(items[2].textContent).toContain('Beta Team');
    });

    it('sorts teams by country', () => {
        const { container } = render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        const sortBtn = screen.getByRole('button', { name: /Country/i });
        
        // Brazil, Canada, USA
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Team');
        expect(items[1].textContent).toContain('Gamma Team');
        expect(items[2].textContent).toContain('Alpha Team');
    });

    it('shows the New Team button', () => {
        render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('+ New Team')).toBeDefined();
    });
});



