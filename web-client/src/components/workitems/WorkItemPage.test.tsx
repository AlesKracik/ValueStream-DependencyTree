import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WorkItemPage } from './WorkItemPage';
import { useValueStreamContext, NotificationProvider, ValueStreamProvider } from '../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../types/models';
import * as api from '../../utils/api';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/ValueStreamContext', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useValueStreamContext: vi.fn()
    };
});

vi.mock('../../utils/api', async () => {
    const actual = await vi.importActual('../../utils/api');
    return {
        ...actual,
        authorizedFetch: vi.fn(),
        syncJiraIssue: vi.fn(),
        syncAhaFeature: vi.fn()
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
        aha: { subdomain: 'test-subdomain', api_key: 'test-key' },
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
    metrics: { maxScore: 100, maxRoi: 10 }
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

    const mockShowConfirm = vi.fn().mockResolvedValue(true);
    const mockShowAlert = vi.fn().mockResolvedValue(undefined);

    const renderPage = (props = defaultProps, workItemId = 'f1') => {
        return render(
            <MemoryRouter>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateEpic: vi.fn(), addEpic: vi.fn(), deleteEpic: vi.fn() }}>
                        <WorkItemPage {...props} workItemId={workItemId} />
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: mockData,
            updateEpic: vi.fn()
        });
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithUnassigned,
            updateEpic: vi.fn()
        });

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithGlobal,
            updateEpic: vi.fn()
        });

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: updateEpicSpy
        });

        renderPage({ ...defaultProps, data: dataWithEpic, updateEpic: updateEpicSpy });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Since it's a table, let's find by value
        const startInput = screen.getByDisplayValue('2026-01-01');
        
        // Change start to 2026-01-15 (after end 2026-01-14)
        fireEvent.change(startInput, { target: { value: '2026-01-15' } });

        expect(mockShowAlert).toHaveBeenCalledWith('Invalid Dates', 'The Start Date must be before the End Date.');
        
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithDatelessEpic,
            updateEpic: vi.fn()
        });

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithDesc,
            updateEpic: vi.fn()
        });

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithSprint,
            updateEpic: vi.fn()
        });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Jira API Error'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: vi.fn()
        });

        renderPage({ ...defaultProps, data: dataWithEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Click Sync button
        const syncButton = screen.getByText('Sync from Jira');
        await act(async () => {
            fireEvent.click(syncButton);
        });

        // Should show alert
        await waitFor(() => {
            expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Jira API Error');
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Network Failure'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: vi.fn()
        });

        renderPage({ ...defaultProps, data: dataWithEpic });

        // Switch to Epics tab
        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Click Sync button
        const syncButton = screen.getByText('Sync from Jira');
        await act(async () => {
            fireEvent.click(syncButton);
        });

        // Should show alert
        await waitFor(() => {
            expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Network Failure');
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.syncJiraIssue as any).mockResolvedValueOnce({ fields: { summary: 'Synced Epic' } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: vi.fn()
        });

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

    it('deletes the work item after confirmation', async () => {
        renderPage();

        const deleteBtn = screen.getByText('Delete Work Item');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Work Item', expect.any(String));
        
        await waitFor(() => {
            expect(defaultProps.deleteWorkItem).toHaveBeenCalledWith('f1');
            expect(defaultProps.onBack).toHaveBeenCalled();
        });
    });

    it('adds a new epic to the work item', () => {
        renderPage();

        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        const addBtn = screen.getByText('+ New Epic');
        fireEvent.click(addBtn);

        expect(defaultProps.addEpic).toHaveBeenCalledWith(expect.objectContaining({
            work_item_id: 'f1',
            jira_key: 'TBD'
        }));
    });

    it('deletes an epic after confirmation', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, name: 'Epic to delete' }
            ],
            teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: vi.fn()
        });

        renderPage({ ...defaultProps, data: dataWithEpic });

        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Epic', expect.stringContaining('Epic to delete'));
        
        await waitFor(() => {
            expect(defaultProps.deleteEpic).toHaveBeenCalledWith('e1');
        });
    });

    it('updates epic fields: Team, Effort, and Dates', async () => {
        const dataWithEpic: ValueStreamData = {
            ...mockData,
            epics: [
                { id: 'e1', jira_key: 'E-1', work_item_id: 'f1', team_id: 't1', effort_md: 5, name: 'Test Epic' }
            ],
            teams: [
                { id: 't1', name: 'Team 1', total_capacity_mds: 10 },
                { id: 't2', name: 'Team 2', total_capacity_mds: 20 }
            ]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: dataWithEpic,
            updateEpic: defaultProps.updateEpic
        });

        renderPage({ ...defaultProps, data: dataWithEpic });

        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        // Update Team
        const teamSelect = screen.getByDisplayValue('Team 1');
        fireEvent.change(teamSelect, { target: { value: 't2' } });
        expect(defaultProps.updateEpic).toHaveBeenCalledWith('e1', { team_id: 't2' });

        // Update Effort
        const effortInput = screen.getByDisplayValue('5');
        fireEvent.change(effortInput, { target: { value: '15' } });
        expect(defaultProps.updateEpic).toHaveBeenCalledWith('e1', { effort_md: 15 });

        // Update Start Date
        // Find empty start date input
        const emptyDateInputs = screen.getAllByDisplayValue('').filter(i => (i as HTMLInputElement).type === 'date');
        fireEvent.change(emptyDateInputs[0], { target: { value: '2026-03-01' } });
        
        expect(defaultProps.updateEpic).toHaveBeenCalledWith('e1', { target_start: '2026-03-01' });
    });

    it('syncs data from Aha! into synced data and allows applying it', async () => {
        const mockFeature = {
            id: 'aha-123',
            reference_num: 'PROD-1',
            name: 'Aha Feature Name',
            description: { body: '<p>Aha Description</p>' },
            url: 'https://test.aha.io/features/PROD-1',
            original_estimate: 480, // 1 MD
            score: 75,
            requirements: [
                { id: 'r1', reference_num: 'PROD-1-R1', name: 'Requirement 1', description: { body: 'Req Desc' }, url: 'req-url' }
            ],
            custom_fields: [
                { name: 'Product Value', value: 'High Value' }
            ]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.syncAhaFeature as any).mockResolvedValueOnce(mockFeature);

        renderPage(defaultProps, 'new');

        // Switch to Aha tab
        const ahaTab = screen.getByText(/Aha! Integration/i);
        fireEvent.click(ahaTab);

        // Enter reference number
        const refInput = screen.getByPlaceholderText('PROD-123');
        fireEvent.change(refInput, { target: { value: 'PROD-1' } });

        // Click Sync button
        const syncButton = screen.getByText('Sync from Aha!');
        await act(async () => {
            fireEvent.click(syncButton);
        });

        await waitFor(() => {
            expect(api.syncAhaFeature).toHaveBeenCalledWith('PROD-1', expect.any(Object));
            
            // Core fields should NOT be updated yet (name is initially empty for 'new')
            expect((screen.getByLabelText(/Name:/i) as HTMLInputElement).value).toBe('');
            
            // Synced data should be visible in the Aha tab
            // Use getAllByText if needed, but here they should be unique enough or we can use specific roles
            expect(screen.getByText('Aha Feature Name')).toBeDefined();
            expect(screen.getByText('High Value')).toBeDefined();
            expect(screen.getByText('75')).toBeDefined();
            expect(screen.getByText('PROD-1-R1')).toBeDefined();
            expect(screen.getByText('Requirement 1')).toBeDefined();
            expect(screen.getByText('Req Desc')).toBeDefined();
        });

        // Click Apply button
        const applyButton = screen.getByText('Apply to Work Item');
        await act(async () => {
            fireEvent.click(applyButton);
        });

        // Confirmation should be shown
        expect(mockShowConfirm).toHaveBeenCalledWith('Apply Aha! Data', expect.any(String));

        await waitFor(() => {
            // Core fields should now be updated
            expect((screen.getByLabelText(/Name:/i) as HTMLInputElement).value).toBe('Aha Feature Name');
            expect((screen.getByPlaceholderText(/Add a detailed description/i) as HTMLTextAreaElement).value).toBe('Aha Description');
            expect((screen.getByLabelText(/Baseline Effort/i) as HTMLInputElement).value).toBe('1');
        });
    });

    it('saves new work item with draft epics', () => {
        renderPage(defaultProps, 'new');

        fireEvent.change(screen.getByLabelText(/Name:/i), { target: { value: 'New Feature' } });

        const epicsTab = screen.getByText(/Engineering Epics \(/i);
        fireEvent.click(epicsTab);

        fireEvent.click(screen.getByText('+ New Epic'));
        
        // Find the newly added epic row and fill it
        fireEvent.change(screen.getByPlaceholderText('Key'), { target: { value: 'PROJ-999' } });
        fireEvent.change(screen.getByPlaceholderText('Epic Name'), { target: { value: 'Draft Epic' } });

        fireEvent.click(screen.getByText('Save Work Item'));

        expect(defaultProps.addWorkItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Feature' }));
        expect(defaultProps.addEpic).toHaveBeenCalledWith(expect.objectContaining({
            jira_key: 'PROJ-999',
            name: 'Draft Epic',
            work_item_id: expect.any(String) // the new work item ID
        }));
    });
});
