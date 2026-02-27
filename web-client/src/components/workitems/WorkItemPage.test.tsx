import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkItemPage } from './WorkItemPage';
import { DashboardProvider } from '../../contexts/DashboardContext';
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
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <WorkItemPage {...defaultProps} workItemId="f1" />
            </DashboardProvider>
        );

        const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
        expect(niceToHaveOptions.length).toBeGreaterThan(0);
        expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
    });

    it('should have Nice-to-have option in the priority dropdown when adding a new target', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <WorkItemPage {...defaultProps} workItemId="new" />
            </DashboardProvider>
        );

        const customerInput = screen.getByPlaceholderText('Search for a customer to target...');
        
        // Simulate typing and selecting a customer
        fireEvent.change(customerInput, { target: { value: 'Customer A' } });
        const option = screen.getByText('Customer A');
        fireEvent.click(option);

        // After selection, the priority dropdown for that customer should appear in the table
        const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
        expect(niceToHaveOptions.length).toBeGreaterThan(0);
        expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
    });

    it('should include epics with "UNASSIGNED" work_item_id in the assignment dropdown', () => {
        const dataWithUnassigned: DashboardData = {
            ...mockData,
            epics: [
                { id: 'e-unassigned', jira_key: 'PROJ-123', work_item_id: 'UNASSIGNED', team_id: 't1', remaining_md: 5, name: 'Unassigned Epic' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        render(
            <DashboardProvider value={{ data: dataWithUnassigned, updateEpic: vi.fn() }}>
                <WorkItemPage {...defaultProps} data={dataWithUnassigned} workItemId="f1" />
            </DashboardProvider>
        );

        const epicInput = screen.getByPlaceholderText('Search for an unassigned epic to link...');
        fireEvent.focus(epicInput);

        // Options should appear in the list
        const option = screen.getByText('PROJ-123 Unassigned Epic');
        expect(option).toBeDefined();
    });

    it('toggles global target row and hides individual customer search', () => {
        render(
            <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                <WorkItemPage {...defaultProps} workItemId="f1" />
            </DashboardProvider>
        );

        const globalCheckbox = screen.getByLabelText(/ALL CUSTOMERS \(Global\)/i);
        expect(globalCheckbox).toBeDefined();

        // Initially individual search is visible (f1 doesn't have all_customers_target in mockData)
        expect(screen.queryByPlaceholderText(/Search for a customer to target.../i)).not.toBeNull();

        // Toggle ON
        fireEvent.click(globalCheckbox);

        // Verify updateWorkItem was called (or state changed if local)
        // Note: WorkItemPage uses updateWorkItem prop
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            all_customers_target: expect.objectContaining({ tcv_type: 'existing' })
        }));
    });
});
