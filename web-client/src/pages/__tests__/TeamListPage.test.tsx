import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamListPage } from '../TeamListPage';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [],
    settings: { jira_base_url: '', fiscal_year_start_month: 1 },
    customers: [],
    workItems: [],
    teams: [
        { id: 't1', name: 'Alpha Team', total_capacity_mds: 50 },
        { id: 't2', name: 'Gamma Team', total_capacity_mds: 10 },
        { id: 't3', name: 'Beta Team', total_capacity_mds: 100 }
    ],
    epics: [],
    sprints: []
};

describe('TeamListPage', () => {
    it('renders the list of teams', () => {
        render(
            <MemoryRouter>
                <TeamListPage data={mockData} loading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('Alpha Team')).toBeDefined();
        expect(screen.getByText('Beta Team')).toBeDefined();
        expect(screen.getByText('Gamma Team')).toBeDefined();
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
});
