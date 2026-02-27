import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkItemPage } from './WorkItemPage';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    settings: {
        jira_base_url: 'https://jira.example.com',
        jira_api_token: 'token',
        jira_api_version: '3'
    },
    customers: [
        { id: 'c1', name: 'Customer A' } // Removed non-existent handle_dots
    ] as any, // type assertion to bypass any missing properties
    workItems: [
        {
            id: 'f1',
            name: 'Work Item A',
            total_effort_mds: 10,
            customer_targets: [
                {
                    customer_id: 'c1',
                    tcv_type: 'existing',
                    priority: 'Should-have'
                }
            ]
        }
    ],
    epics: [],
    teams: [],
    sprints: []
};

describe('WorkItemPage', () => {
    const defaultProps = {
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        addWorkItem: vi.fn(),
        deleteWorkItem: vi.fn(),
        updateWorkItem: vi.fn(),
        addEpic: vi.fn(),
        deleteEpic: vi.fn(),
        updateEpic: vi.fn(),
        saveDashboardData: vi.fn(),
    };

    it('should have Nice-to-have option in the priority dropdown for existing targets', () => {
        render(<WorkItemPage {...defaultProps} workItemId="f1" />);

        const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
        expect(niceToHaveOptions.length).toBeGreaterThan(0);
        expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
    });

    it('should have Nice-to-have option in the priority dropdown when adding a new target', () => {
        const { container } = render(<WorkItemPage {...defaultProps} workItemId="new" />);

        const customerSelect = container.querySelector('#newCustomerSelect') as HTMLSelectElement;
        const targetBtn = screen.getByRole('button', { name: 'Target Customer' });

        if (customerSelect) {
            fireEvent.change(customerSelect, { target: { value: 'c1' } });
            fireEvent.click(targetBtn);

            const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
            expect(niceToHaveOptions.length).toBeGreaterThan(0);
            expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
        } else {
            throw new Error('Customer select not found');
        }
    });

    it('should include epics with "UNASSIGNED" work_item_id in the assignment dropdown', () => {
        const dataWithUnassigned: DashboardData = {
            ...mockData,
            epics: [
                { id: 'e-unassigned', jira_key: 'PROJ-123', work_item_id: 'UNASSIGNED', team_id: 't1', remaining_md: 5, name: 'Unassigned Epic' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        const { container } = render(<WorkItemPage {...defaultProps} data={dataWithUnassigned} workItemId="f1" />);

        const epicSelect = container.querySelector('#assignEpicSelect') as HTMLSelectElement;
        expect(epicSelect).toBeDefined();

        const options = Array.from(epicSelect.options).map(opt => opt.textContent);
        expect(options).toContain('PROJ-123 Unassigned Epic');
    });
});
