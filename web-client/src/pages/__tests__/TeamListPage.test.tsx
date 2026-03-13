import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { TeamListPage } from '../TeamListPage';
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
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
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
        const { container } = renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        // Alpha, Beta, Gamma
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Team');
        expect(items[1].textContent).toContain('Beta Team');
        expect(items[2].textContent).toContain('Gamma Team');
    });

    it('sorts teams by capacity', () => {
        const { container } = renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
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
        const { container } = renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
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
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('+ New Team')).toBeDefined();
    });
});



