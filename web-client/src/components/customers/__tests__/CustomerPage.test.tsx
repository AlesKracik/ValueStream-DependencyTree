import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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
            existing_tcv_duration_months: 12,
            potential_tcv: 50,
            potential_tcv_valid_from: '2026-04-01',
            potential_tcv_duration_months: 12,
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
        
        // Valid From is now an input with date value
        expect(screen.getByDisplayValue('2026-01-01')).toBeDefined();
    });

    it('switches between Targeted Work Items, TCV History and Support tabs', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        // Default tab is Custom Fields now, switch to Work Items
        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
        });

        expect(screen.getByText('Feature 1')).toBeDefined();

        // Switch to History tab
        const historyTab = screen.getByText(/TCV History/i);
        await act(async () => {
            fireEvent.click(historyTab);
        });
        expect(screen.queryByText('Feature 1')).toBeNull();
        expect(screen.getByText(/No historical entries/i)).toBeDefined();

        // Switch to Support tab
        const supportTab = screen.getByText(/Support/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });
        expect(screen.getByText(/Support Overview/i)).toBeDefined();
    });

    it('displays Jira issues in Support tab', async () => {
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
        
        const supportTab = screen.getByText(/Support/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        await waitFor(() => {
            expect(screen.getByText('BUG-NEW')).toBeDefined();
            expect(screen.getByText('Broken UI')).toBeDefined();
        });
    });

    it('handles AI summary generation and follow-up chat with streaming', async () => {
        // Mock a streaming response
        const mockStream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode('data: {"text": "Hello"}\n\n'));
                controller.enqueue(encoder.encode('data: {"text": " world"}\n\n'));
                controller.close();
            }
        });

        (api.authorizedFetch as any).mockImplementation((url: string) => {
            if (url === '/api/llm/generate') {
                return Promise.resolve({
                    ok: true,
                    body: mockStream
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
            fireEvent.click(screen.getByText(/Support/i));
        });
        
        // Wait for Jira loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Loading Jira data.../i)).toBeNull();
        });

        const generateBtn = screen.getByText(/Generate AI Summary/i);
        await act(async () => {
            fireEvent.click(generateBtn);
        });

        await waitFor(() => {
            expect(screen.getByText('Hello world')).toBeDefined();
        });

        // Test follow-up question
        const input = screen.getByPlaceholderText(/Ask a follow-up question.../i);
        const sendBtn = screen.getByText('Send');

        // Mock another stream for follow-up
        const followUpStream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode('data: {"text": "Sure, I can help."}\n\n'));
                controller.close();
            }
        });

        (api.authorizedFetch as any).mockResolvedValueOnce({
            ok: true,
            body: followUpStream
        });

        await act(async () => {
            fireEvent.change(input, { target: { value: 'How are you?' } });
            fireEvent.click(sendBtn);
        });

        await waitFor(() => {
            expect(screen.getByText('How are you?')).toBeDefined();
            expect(screen.getByText('Sure, I can help.')).toBeDefined();
        });
    });

    it('handles the Promote Potential TCV flow', async () => {
        await act(async () => {
            render(<CustomerPage {...defaultProps} />);
        });

        const promoteBtn = screen.getByText('Promote to Actual');
        // The date is already '2026-04-01' in mockData
        expect(screen.getByDisplayValue('2026-04-01')).toBeDefined();

        await act(async () => {
            fireEvent.click(promoteBtn);
        });

        await waitFor(() => {
            expect(mockShowConfirm).toHaveBeenCalledWith(
                'Promote Potential TCV',
                expect.stringContaining('2026-04-01')
            );
            expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
                existing_tcv: 50, // potential_tcv from mockData
                existing_tcv_valid_from: '2026-04-01',
                potential_tcv: 0,
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

        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
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

        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
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
        // Find the first "Valid From" input (Existing TCV section)
        const existingSection = screen.getByText(/Actual Existing TCV \(\$\):/i).closest('div');
        const dateInput = within(existingSection!).getByLabelText(/Valid From:/i);
        
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

        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
        });

        expect(screen.getByText('Add Work Item Target')).toBeDefined();
        expect(screen.getByPlaceholderText('Search for a work item to add...')).toBeDefined();
    });
});


