import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { WorkItemListPage } from '../WorkItemListPage';
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
    ],
    valueStreams: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('WorkItemListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the list of work items and their attributes', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.getByText('Beta Item')).toBeDefined();
        expect(screen.getByText('Gamma Item')).toBeDefined();

        expect(screen.getAllByText('Score').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Effort').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('TCV').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Released').length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText('10')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
        expect(screen.getByText('5 MDs')).toBeDefined();
        expect(screen.getByText('$1,000')).toBeDefined();
        expect(screen.getByText('Sprint 1')).toBeDefined();
    });

    it('filters work items by name', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const filterInput = screen.getByPlaceholderText(/Filter work items.../i);
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Item')).toBeDefined();
        expect(screen.queryByText('Beta Item')).toBeNull();
        expect(screen.queryByText('Gamma Item')).toBeNull();
    });

    it('sorts work items by name', () => {
        const { container } = renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const nameBtn = screen.getByRole('button', { name: /Name/i });
        
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Alpha Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Gamma Item');

        fireEvent.click(nameBtn);
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Gamma Item');
        expect(items[1].textContent).toContain('Beta Item');
        expect(items[2].textContent).toContain('Alpha Item');
    });

    it('navigates to work item detail page when a work item is clicked', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const workItemRow = screen.getByText('Alpha Item').closest('[class*="listItem"]')!;
        fireEvent.click(workItemRow);

        expect(mockedNavigate).toHaveBeenCalledWith('/workitem/w1');
    });

    it('navigates to new work item page when "+ New Work Item" is clicked', () => {
        renderWithProviders(
            <WorkItemListPage data={mockData} loading={false} />
        );

        const newBtn = screen.getByText('+ New Work Item');
        fireEvent.click(newBtn);

        expect(mockedNavigate).toHaveBeenCalledWith('/workitem/new');
    });

    it('shows loading message when loading is true', () => {
        renderWithProviders(
            <WorkItemListPage data={null} loading={true} />
        );

        expect(screen.getByText('Loading work items...')).toBeDefined();
    });

    it('shows empty message when no work items are found', () => {
        renderWithProviders(
            <WorkItemListPage data={{ ...mockData, workItems: [] }} loading={false} />
        );

        expect(screen.getByText('No work items found.')).toBeDefined();
    });
});



