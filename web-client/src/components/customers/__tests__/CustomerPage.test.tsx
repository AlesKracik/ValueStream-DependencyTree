import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CustomerPage } from '../CustomerPage';
import { useDashboardContext } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';
import * as api from '../../../utils/api';

// Mock the context
vi.mock('../../../contexts/DashboardContext', () => ({
    useDashboardContext: vi.fn(),
    DashboardProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../../../utils/api', () => ({
    authorizedFetch: vi.fn()
}));

const mockData: DashboardData = {
    dashboards: [],
    settings: { 
        jira_base_url: 'https://jira.com', 
        jira_api_version: '3',
        customer_jql_new: "status = New",
        customer_jql_in_progress: "status = 'In Progress'",
        customer_jql_noop: "status = Blocked"
    },
    customers: [
        { 
            id: 'c1', 
            name: 'Customer A', 
            customer_id: 'CUST-A',
            existing_tcv: 100, 
            existing_tcv_valid_from: '2026-01-01',
            potential_tcv: 50,
            tcv_history: []
        }
    ],
    workItems: [
        { id: 'f1', name: 'Feature 1', total_effort_mds: 10, score: 0, customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] }
    ],
    teams: [],
    epics: [],
    sprints: []
};

describe('CustomerPage', () => {
    const defaultProps = {
        customerId: 'c1',
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        updateCustomer: vi.fn(),
        deleteCustomer: vi.fn(),
        addCustomer: vi.fn(),
        updateWorkItem: vi.fn()
    };

    const mockShowConfirm = vi.fn().mockResolvedValue(true);
    const mockShowAlert = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();
        (useDashboardContext as any).mockReturnValue({
            data: mockData,
            updateEpic: vi.fn(),
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert
        });
        (api.authorizedFetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: { issues: [] } })
        });
    });

    it('renders customer details correctly and Actual TCV is readOnly', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        expect(screen.getByDisplayValue('Customer A')).toBeDefined();
        const existingTcvInput = screen.getByLabelText(/Actual Existing TCV \(\$\):/i);
        expect(existingTcvInput).toBeDefined();
        expect(existingTcvInput.hasAttribute('readonly')).toBe(true);
        expect(screen.getByText(/Valid from: 2026-01-01/i)).toBeDefined();
    });

    it('switches between Targeted Work Items, TCV History and Support Health tabs', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        // Default tab is Work Items
        expect(screen.getByText('Feature 1')).toBeDefined();

        // Switch to History tab
        const historyTab = screen.getByText(/TCV History/i);
        await act(async () => {
            fireEvent.click(historyTab);
        });
        expect(screen.queryByText('Feature 1')).toBeNull();
        expect(screen.getByText(/No historical entries/i)).toBeDefined();

        // Switch to Support Health tab
        const supportTab = screen.getByText(/Support Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });
        expect(screen.getByText(/Support Health Overview/i)).toBeDefined();
    });

    it('displays Jira issues in Support Health tab', async () => {
        (api.authorizedFetch as any).mockImplementation((_url: string, options: any) => {
            const body = JSON.parse(options.body);
            if (body.jql.includes('status = New')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { 
                            issues: [
                                { key: 'BUG-NEW', fields: { summary: 'Broken UI', status: { name: 'New' }, priority: { name: 'High' } } }
                            ] 
                        } 
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: { issues: [] } })
            });
        });

        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });
        
        const supportTab = screen.getByText(/Support Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        await waitFor(() => {
            expect(screen.getByText('BUG-NEW')).toBeDefined();
            expect(screen.getByText('Broken UI')).toBeDefined();
        });
    });

    it('handles AI summary generation', async () => {
        (api.authorizedFetch as any).mockImplementation((url: string) => {
            if (url === '/api/llm/generate') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ success: true, text: 'This customer is doing great.' })
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: { issues: [] } })
            });
        });

        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });
        
        await act(async () => {
            fireEvent.click(screen.getByText(/Support Health/i));
        });
        
        // Wait for Jira loading to finish so button appears
        await waitFor(() => {
            expect(screen.queryByText(/Loading Jira data.../i)).toBeNull();
        });

        const generateBtn = screen.getByText(/Generate AI Health Summary/i);
        await act(async () => {
            fireEvent.click(generateBtn);
        });

        await waitFor(() => {
            expect(screen.getByText('This customer is doing great.')).toBeDefined();
        });
    });

    it('handles the Update TCV flow (archiving current to history)', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        const updateBtn = screen.getByText('Update TCV');
        await act(async () => {
            fireEvent.click(updateBtn);
        });

        // Form should appear
        expect(screen.getByText('Archive Current and Set New Actual TCV')).toBeDefined();

        const dateInput = screen.getByLabelText(/New Valid From Date:/i);
        const valueInput = screen.getByLabelText(/New TCV Value \(\$\):/i);

        await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2026-03-01' } });
            fireEvent.change(valueInput, { target: { value: '2000' } });
        });

        const confirmBtn = screen.getByText('Confirm Update');
        await act(async () => {
            fireEvent.click(confirmBtn);
        });

        await waitFor(() => {
            expect(mockShowConfirm).toHaveBeenCalledWith(
                'Update Actual TCV',
                expect.stringContaining('$100') // should be formatted
            );
            expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
                existing_tcv: 2000,
                existing_tcv_valid_from: '2026-03-01',
                tcv_history: [
                    expect.objectContaining({ value: 100, valid_from: '2026-01-01' })
                ]
            }));
        });
    });

    it('shows TCV history selection when targeting Existing TCV', async () => {
        const historyData: DashboardData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    existing_tcv: 1000,
                    tcv_history: [{ id: 'h1', value: 800, valid_from: '2025-01-01' }]
                }
            ],
            workItems: [
                {
                    id: 'f1',
                    name: 'Feature 1',
                    total_effort_mds: 10,
                    score: 0,
                    customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }]
                }
            ]
        };

        await act(async () => {
            render(<CustomerPage {...defaultProps} data={historyData} />);
        });

        // Should see "Existing" in the type dropdown
        const typeDropdown = screen.getByDisplayValue('Existing');
        expect(typeDropdown).toBeDefined();

        // Should see "Latest Actual ($1,000)" in the selection dropdown
        const selectionDropdown = screen.getByDisplayValue('Latest Actual ($1,000)');
        expect(selectionDropdown).toBeDefined();

        // Should see historical option
        await act(async () => {
            fireEvent.change(selectionDropdown, { target: { value: 'h1' } });
        });
        
        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            customer_targets: [
                expect.objectContaining({ customer_id: 'c1', tcv_history_id: 'h1' })
            ]
        }));
    });

    it('removes a work item target', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        const removeBtn = screen.getByText('Remove');
        await act(async () => {
            fireEvent.click(removeBtn);
        });

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            customer_targets: []
        }));
    });

    it('adds a new customer with initial validity date', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} customerId="new" />);
        });

        const nameInput = screen.getByLabelText(/Name:/i);
        const dateInput = screen.getByLabelText(/Valid From \(Initial\):/i);
        
        await act(async () => {
            fireEvent.change(nameInput, { target: { value: 'New Brand' } });
            fireEvent.change(dateInput, { target: { value: '2026-02-01' } });
        });

        const createBtn = screen.getByText('Create');
        await act(async () => {
            fireEvent.click(createBtn);
        });

        expect(defaultProps.addCustomer).toHaveBeenCalledWith(expect.objectContaining({
            name: 'New Brand',
            existing_tcv_valid_from: '2026-02-01'
        }));
    });

    it('shows "Add Work Item Target" section even for existing customers', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        expect(screen.getByText('Add Work Item Target')).toBeDefined();
        expect(screen.getByPlaceholderText('Search for a work item to add...')).toBeDefined();
    });
});


