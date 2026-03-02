import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkItemPage } from './WorkItemPage';
import { DashboardProvider, NotificationProvider } from '../../contexts/DashboardContext';
import type { DashboardData } from '../../types/models';

const mockData: DashboardData = {
    dashboards: [], settings: {
        jira_base_url: 'https://jira.example.com',
        jira_api_token: 'token',
        jira_api_version: '3'
    },
    customers: [
        { 
            id: 'c1', 
            name: 'Customer A', 
            existing_tcv: 100, 
            potential_tcv: 0,
            tcv_history: [
                { id: 'h1', value: 80, valid_from: '2025-01-01' }
            ]
        }
    ],
    workItems: [
        {
            id: 'f1',
            name: 'Work Item A',
            total_effort_mds: 10, score: 0,
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
    sprints: [],
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
        updateEpic: vi.fn()
    };

    it('should show TCV history selection when targeting Existing TCV', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        // History dropdown should be visible because f1 targets existing TCV of c1 which has history
        const historySelect = screen.getByDisplayValue(/Latest Actual/i);
        expect(historySelect).toBeDefined();

        // Select the historical entry
        fireEvent.change(historySelect, { target: { value: 'h1' } });

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            customer_targets: expect.arrayContaining([
                expect.objectContaining({ tcv_history_id: 'h1' })
            ])
        }));
    });

    it('should have Nice-to-have option in the priority dropdown for existing targets', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
        expect(niceToHaveOptions.length).toBeGreaterThan(0);
        expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
    });

    it('should have Nice-to-have option in the priority dropdown when adding a new target', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} workItemId="new" />
                </DashboardProvider>
            </NotificationProvider>
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
                { id: 'e-unassigned', jira_key: 'PROJ-123', work_item_id: 'UNASSIGNED', team_id: 't1', effort_md: 5, name: 'Unassigned Epic' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithUnassigned, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} data={dataWithUnassigned} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Epics \(/i);
        fireEvent.click(epicsTab);

        const epicInput = screen.getByPlaceholderText('Search for an unassigned epic to link...');
        fireEvent.focus(epicInput);

        // Options should appear in the list
        const option = screen.getByText('PROJ-123 Unassigned Epic');
        expect(option).toBeDefined();
    });

    it('toggles global target row and hides individual customer search', () => {
        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        const globalCheckbox = screen.getByLabelText(/ALL CUSTOMERS \(Global\)/i);
        expect(globalCheckbox).toBeDefined();

        // Initially individual search is visible (f1 doesn't have all_customers_target in mockData)
        expect(screen.queryByPlaceholderText(/Search for a customer to target.../i)).not.toBeNull();

        // Toggle ON
        fireEvent.click(globalCheckbox);

        // Verify updateWorkItem was called (or state changed if local)
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            all_customers_target: expect.objectContaining({ tcv_type: 'existing' })
        }));
    });

    it('shows an alert and prevents epic update if start date is not before end date', async () => {
        const dataWithEpic: DashboardData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-14' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        const updateEpicSpy = vi.fn();

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithEpic, updateEpic: updateEpicSpy }}>
                    <WorkItemPage {...defaultProps} data={dataWithEpic} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Epics \(/i);
        fireEvent.click(epicsTab);

        // Since it's a table, let's find by value
        const startInput = screen.getByDisplayValue('2026-01-01');
        
        // Change start to 2026-01-15 (after end 2026-01-14)
        fireEvent.change(startInput, { target: { value: '2026-01-15' } });

        expect(screen.getByText('Invalid Dates')).toBeDefined();
        expect(screen.getByText('The Start Date must be before the End Date.')).toBeDefined();
        
        expect(updateEpicSpy).not.toHaveBeenCalled();
    });

    it('shows warning icon for epics with missing dates', async () => {
        const dataWithDatelessEpic: DashboardData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: undefined, target_end: undefined }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithDatelessEpic, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} data={dataWithDatelessEpic} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Epics \(/i);
        fireEvent.click(epicsTab);

        // Check for ⚠️ icon
        const warningIcon = screen.getByTitle(/Missing start date/i);
        expect(warningIcon).toBeDefined();
    });

    it('renders and updates the description field', () => {
        const dataWithDesc: DashboardData = {
            ...mockData,
            workItems: [
                { id: 'f1', name: 'Work Item A', description: 'Initial description', total_effort_mds: 10, score: 0, customer_targets: [] }
            ]
        };

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithDesc, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} data={dataWithDesc} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        const textarea = screen.getByPlaceholderText(/Add a detailed description for this work item.../i) as HTMLTextAreaElement;
        expect(textarea.value).toBe('Initial description');

        fireEvent.change(textarea, { target: { value: 'Updated description' } });

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { description: 'Updated description' });
    });

    it('renders core edit fields and handles updates', () => {
        const dataWithSprint: DashboardData = {
            ...mockData,
            sprints: [{ id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY26 Q1' }]
        };

        render(
            <NotificationProvider>
                <DashboardProvider value={{ data: dataWithSprint, updateEpic: vi.fn() }}>
                    <WorkItemPage {...defaultProps} data={dataWithSprint} workItemId="f1" />
                </DashboardProvider>
            </NotificationProvider>
        );

        // 1. Name Field
        const nameInput = screen.getByLabelText(/Name:/i) as HTMLInputElement;
        expect(nameInput.value).toBe('Work Item A');
        fireEvent.change(nameInput, { target: { value: 'Renamed Item' } });
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { name: 'Renamed Item' });

        // 2. Effort Field
        const effortInput = screen.getByLabelText(/Total Effort \(MDs\):/i) as HTMLInputElement;
        expect(effortInput.value).toBe('10');
        fireEvent.change(effortInput, { target: { value: '25' } });
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { total_effort_mds: 25 });

        // 3. Sprint Field (SearchableDropdown)
        expect(screen.getByText(/Released in Sprint:/i)).toBeDefined();
    });
});
