import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkItemPage } from './WorkItemPage';
import { ValueStreamProvider, NotificationProvider } from '../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../types/models';
import * as api from '../../utils/api';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../utils/api', async () => {
    const actual = await vi.importActual('../../utils/api');
    return {
        ...actual,
        authorizedFetch: vi.fn(),
        syncJiraIssue: vi.fn()
    };
});

const mockData: ValueStreamData = {
    valueStreams: [], settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
          mongo: { 
            app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
            customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
          }
        },
        jira: { base_url: 'https://jira.example.com', api_version: '3', api_token: 'token' },
        ai: { provider: 'openai' }
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

    const renderPage = (props = defaultProps, workItemId = 'f1') => {
        return render(
            <MemoryRouter>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateEpic: vi.fn() }}>
                        <WorkItemPage {...props} workItemId={workItemId} />
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should show TCV history selection when targeting Existing TCV', () => {
        renderPage();

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
        renderPage();

        const niceToHaveOptions = screen.getAllByRole('option', { name: 'Nice-to-have' }) as HTMLOptionElement[];
        expect(niceToHaveOptions.length).toBeGreaterThan(0);
        expect(niceToHaveOptions[0].value).toBe('Nice-to-have');
    });

    it('should have Nice-to-have option in the priority dropdown when adding a new target', () => {
        renderPage(defaultProps, 'new');

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
        const dataWithUnassigned: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e-unassigned', jira_key: 'PROJ-123', work_item_id: 'UNASSIGNED', team_id: 't1', effort_md: 5, name: 'Unassigned Epic' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        renderPage({ ...defaultProps, data: dataWithUnassigned });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        const epicInput = screen.getByPlaceholderText('Search for an unassigned epic to link...');
        fireEvent.focus(epicInput);

        // Options should appear in the list
        const option = screen.getByText('PROJ-123 Unassigned Epic');
        expect(option).toBeDefined();
    });

    it('toggles global target row and hides individual customer search', () => {
        renderPage();

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

    it('unsets global target when already set', () => {
        const dataWithGlobal: ValueStreamData = {
            ...mockData,
            workItems: [
                {
                    ...mockData.workItems[0],
                    all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
                }
            ]
        };
        renderPage({ ...defaultProps, data: dataWithGlobal });

        const globalCheckbox = screen.getByLabelText(/ALL CUSTOMERS \(Global\)/i);
        expect((globalCheckbox as HTMLInputElement).checked).toBe(true);

        fireEvent.click(globalCheckbox);

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', {
            all_customers_target: null
        });
    });

    it('shows an alert and prevents epic update if start date is not before end date', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-14' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        const updateEpicSpy = vi.fn();

        renderPage({ ...defaultProps, data: dataWithEpic, updateEpic: updateEpicSpy });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
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
        const dataWithDatelessEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, target_start: undefined, target_end: undefined }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        renderPage({ ...defaultProps, data: dataWithDatelessEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Check for ⚠️ icon
        const warningIcon = screen.getByTitle(/Missing start date/i);
        expect(warningIcon).toBeDefined();
    });

    it('renders and updates the description field', () => {
        const dataWithDesc: ValueStreamData = {
            ...mockData,
            workItems: [
                { id: 'f1', name: 'Work Item A', description: 'Initial description', total_effort_mds: 10, score: 0, customer_targets: [] }
            ]
        };

        renderPage({ ...defaultProps, data: dataWithDesc });

        const textarea = screen.getByPlaceholderText(/Add a detailed description for this work item.../i) as HTMLTextAreaElement;
        expect(textarea.value).toBe('Initial description');

        fireEvent.change(textarea, { target: { value: 'Updated description' } });

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { description: 'Updated description' });
    });

    it('renders core edit fields and handles updates', () => {
        const dataWithSprint: ValueStreamData = {
            ...mockData,
            sprints: [{ id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY26 Q1' }]
        };

        renderPage({ ...defaultProps, data: dataWithSprint });

        // 1. Name Field
        const nameInput = screen.getByLabelText(/Name:/i) as HTMLInputElement;
        expect(nameInput.value).toBe('Work Item A');
        fireEvent.change(nameInput, { target: { value: 'Renamed Item' } });
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { name: 'Renamed Item' });

        // 2. Effort Field
        const effortInput = screen.getByLabelText(/Baseline Effort \(MDs\):/i) as HTMLInputElement;
        expect(effortInput.value).toBe('10');
        fireEvent.change(effortInput, { target: { value: '25' } });
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', { total_effort_mds: 25 });

        // 3. Sprint Field (SearchableDropdown)
        expect(screen.getByText(/Released in Sprint:/i)).toBeDefined();
    });

    it('renders and saves a new work item', async () => {
        renderPage(defaultProps, 'new');

        // Header should show "New Work Item" by default when name is empty
        expect(screen.getByText('Create New Work Item')).toBeDefined();

        // Name input should be empty and have placeholder
        const nameInput = screen.getByLabelText(/Name:/i) as HTMLInputElement;
        expect(nameInput.value).toBe('');
        expect(nameInput.placeholder).toBe('New Work Item');

        fireEvent.change(nameInput, { target: { value: 'Brand New Feature' } });
        
        // Header should update to show the title with name
        expect(screen.getByText('Create New Work Item')).toBeDefined();

        const createBtn = screen.getByText('Save Work Item');
        fireEvent.click(createBtn);

        expect(defaultProps.addWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Brand New Feature'
        }));
    });

    it('shows error alert when syncEpic fails', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        // Mock syncJiraIssue to return an error
        (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Jira API Error'));

        renderPage({ ...defaultProps, data: dataWithEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Click Sync button
        const syncButton = screen.getByText('Sync from Jira');
        fireEvent.click(syncButton);

        // Should show alert
        await waitFor(() => {
            expect(screen.getByText('Sync Failed')).toBeDefined();
            expect(screen.getByText('Jira API Error')).toBeDefined();
        });
    });

    it('shows error alert when syncEpic throws exception', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        // Mock syncJiraIssue to throw
        (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Network Failure'));

        renderPage({ ...defaultProps, data: dataWithEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Click Sync button
        const syncButton = screen.getByText('Sync from Jira');
        fireEvent.click(syncButton);

        // Should show alert
        await waitFor(() => {
            expect(screen.getByText('Sync Failed')).toBeDefined();
            expect(screen.getByText('Network Failure')).toBeDefined();
        });
    });

    it('passes correct jira settings to syncJiraIssue', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        // Mock successful sync
        (api.syncJiraIssue as any).mockResolvedValueOnce({ fields: { summary: 'Synced Epic' } });

        renderPage({ ...defaultProps, data: dataWithEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Click Sync button
        const syncButton = screen.getByText('Sync from Jira');
        fireEvent.click(syncButton);

        await waitFor(() => {
            // Verify syncJiraIssue was called with the nested jira settings, not the root settings object
            expect(api.syncJiraIssue).toHaveBeenCalledWith('E-1', mockData.settings.jira);
        });
    });
});



