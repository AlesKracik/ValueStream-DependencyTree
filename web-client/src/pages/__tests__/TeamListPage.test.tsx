import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { TeamListPage } from '../TeamListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '../../types/models';

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
    issues: [],
    sprints: [],
    valueStreams: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('TeamListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the list of teams and their attributes', () => {
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha Team')).toBeDefined();
        expect(screen.getByText('Beta Team')).toBeDefined();
        expect(screen.getByText('Gamma Team')).toBeDefined();

        expect(screen.getAllByText('Capacity').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Country').length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText('50 MDs')).toBeDefined();
        expect(screen.getByText('100 MDs')).toBeDefined();
        expect(screen.getByText('USA')).toBeDefined();
    });

    it('sorts teams by name', () => {
        const { container } = renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

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
        
        fireEvent.click(sortBtn);
        const items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Beta Team');
        expect(items[1].textContent).toContain('Gamma Team');
        expect(items[2].textContent).toContain('Alpha Team');
    });

    it('filters teams by name', () => {
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        const filterInput = screen.getByPlaceholderText('Filter teams...');
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Team')).toBeDefined();
        expect(screen.queryByText('Beta Team')).toBeNull();
        expect(screen.queryByText('Gamma Team')).toBeNull();
    });

    it('navigates to team detail page when a team is clicked', () => {
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        const teamRow = screen.getByText('Alpha Team').closest('[class*="listItem"]')!;
        fireEvent.click(teamRow);

        expect(mockedNavigate).toHaveBeenCalledWith('/team/t1');
    });

    it('navigates to new team page when "+ New Team" is clicked', () => {
        renderWithProviders(
            <TeamListPage data={mockData} loading={false} />
        );

        const newBtn = screen.getByText('+ New Team');
        fireEvent.click(newBtn);

        expect(mockedNavigate).toHaveBeenCalledWith('/team/new');
    });

    it('shows loading message when loading is true', () => {
        renderWithProviders(
            <TeamListPage data={null} loading={true} />
        );

        expect(screen.getByText('Loading teams...')).toBeDefined();
    });

    it('shows empty message when no teams are found', () => {
        renderWithProviders(
            <TeamListPage data={{ ...mockData, teams: [] }} loading={false} />
        );

        expect(screen.getByText('No teams found.')).toBeDefined();
    });
});



