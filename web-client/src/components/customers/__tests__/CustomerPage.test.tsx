import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerPage } from '../CustomerPage';
import { useNotificationContext } from '../../../contexts/NotificationContext';
import type { ValueStreamData, SupportIssue } from '@valuestream/shared-types';
import * as api from '../../../utils/api';
import { SUPPORT_DONE_RETENTION_DAYS } from '../../../utils/businessLogic';

// Mock the context
vi.mock('../../../contexts/NotificationContext', () => ({
    useNotificationContext: vi.fn(),
}));

vi.mock('../../../utils/api', () => ({
    authorizedFetch: vi.fn()
}));

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: { 
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            app_provider: 'mongo',
            customer_provider: 'mongo',
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { 
            base_url: 'https://jira.com', 
            api_version: '3',
            customer: {
                jql_new: "status = New",
                jql_in_progress: "status = 'In Progress'",
                jql_noop: "status = Blocked"
            }
        },
        ai: { provider: 'openai', support: { prompt: '' } },
        aha: { subdomain: "", api_key: "" },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } },
        auth: { method: 'local' as const, session_expiry_hours: 24, default_role: 'viewer' as const }
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
        { id: 'f1', name: 'Feature 1', total_effort_mds: 10, score: 0, status: 'Backlog', customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] }
    ],
    teams: [],
    issues: [],
    sprints: [],
    metrics: { maxScore: 100, maxRoi: 10 }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: { issues: [] } })
        });
    });

    it('renders customer details correctly and Actual TCV is readOnly', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
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
        // Check for specific text inside history tab
        expect(screen.getByText(/Delete/i)).toBeDefined(); 

        // Switch to Support tab
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });
        expect(screen.getByText(/Support Issues/i)).toBeDefined();
    });

    it('displays Jira issues in Support tab', async () => {
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation((_url: string, options: any) => {
            const body = JSON.parse(options.body || '{}');
            if (body.jql && body.jql.includes('status = New')) {
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });
        
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        // Wait for the sync effect to trigger healthData loading
        await waitFor(() => {
            expect(screen.getByText('BUG-NEW')).toBeDefined();
            expect(screen.getByText('Broken UI')).toBeDefined();
        });
    });

    it('handles the Promote Potential TCV flow', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        const promoteBtn = screen.getByText('Promote');
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
        const historyData: ValueStreamData = {
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
                    status: 'Backlog',
                    customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }]
                }
            ]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={historyData} />
                </MemoryRouter>
            );
        });

        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
        });

        // Should see "Existing" in the type dropdown
        const typeDropdown = screen.getByDisplayValue('Existing');
        expect(typeDropdown).toBeDefined();

        // Should see "Latest Actual ($1,000)" in the selection dropdown
        // The formatting might be different now due to Template, but let's check
        const selectionDropdown = screen.getByDisplayValue(/Latest Actual/i);
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} customerId="new" />
                </MemoryRouter>
            );
        });

        const nameInput = screen.getByLabelText(/Name:/i);
        // Find the "Existing Valid From" input
        const dateInput = screen.getByLabelText(/Existing Valid From:/i);
        
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        const workItemsTab = screen.getByText(/Targeted Work Items/i);
        await act(async () => {
            fireEvent.click(workItemsTab);
        });

        expect(screen.getByText('Add Work Item Target')).toBeDefined();
        expect(screen.getByPlaceholderText('Search for a work item to add...')).toBeDefined();
    });

    it('focuses on a support issue when issueId is in query params', async () => {
        const now = new Date().toISOString();
        const mockIssue: SupportIssue = {
            id: 'issue-123',
            description: 'Test Issue',
            status: 'to do',
            created_at: now,
            updated_at: now
        };
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [mockIssue]
            }]
        };

        // Mock scrollIntoView
        const scrollIntoViewMock = vi.fn();
        window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/customer/c1?tab=support&issueId=issue-123']}>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        // Switch to Support tab first
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        // The useEffect has a 300ms timeout
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 400));
        });

        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        const element = document.getElementById('issue-issue-123');
        expect(element).not.toBeNull();
    });

    it('allows linking Jira issues to support issues', async () => {
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation((_url: string, options: any) => {
            const body = JSON.parse(options.body || '{}');
            if (body.jql && body.jql.includes('status = New')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { 
                            issues: [
                                { key: 'JIRA-123', fields: { summary: 'Problem summary', status: { name: 'New' }, priority: { name: 'High' } } }
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
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });
        
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        await waitFor(() => {
            expect(screen.getByText('JIRA-123')).toBeDefined();
        });

        const dropdown = screen.getByDisplayValue('Link to...');
        
        // Option 1: Create New
        await act(async () => {
            fireEvent.change(dropdown, { target: { value: 'NEW' } });
        });

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: [
                expect.objectContaining({
                    description: 'Problem summary',
                    related_jiras: ['JIRA-123']
                })
            ]
        }));

        cleanup();

        // Option 2: Link to existing
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ id: 'si-1', description: 'Existing Issue', status: 'to do', created_at: '', updated_at: '' }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        const supportTab2 = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab2);
        });

        await waitFor(() => {
            expect(screen.queryByDisplayValue('Link to...')).not.toBeNull();
        });

        const dropdown2 = screen.getByDisplayValue('Link to...');
        await act(async () => {
            fireEvent.change(dropdown2, { target: { value: 'si-1' } });
        });

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: [
                expect.objectContaining({
                    id: 'si-1',
                    related_jiras: ['JIRA-123']
                })
            ]
        }));
    });

    it('cleans up expired support issues when support tab is active', async () => {
        const dataWithExpiredIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [
                    { id: 'i1', description: 'Active Issue', status: 'to do' },
                    { id: 'i2', description: 'Expired Issue', status: 'done', expiration_date: '2020-01-01' }
                ]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/customer/c1?tab=support']}>
                    <CustomerPage {...defaultProps} data={dataWithExpiredIssue} />
                </MemoryRouter>
            );
        });

        // Switch to Support & Health tab to trigger cleanup
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        await waitFor(() => {
            expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
                support_issues: [
                    expect.objectContaining({ id: 'i1' })
                ]
            }), true);
        });
    });

    it('displays all three health summary boxes in Support tab', async () => {
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation((_url: string, options: any) => {
            const body = JSON.parse(options.body || '{}');
            if (body.jql && body.jql.includes('status = New')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { issues: [{ key: 'NEW-1', fields: { summary: 'New Issue', status: { name: 'New' } } }] } 
                    })
                });
            }
            if (body.jql && body.jql.includes("status = 'In Progress'")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { issues: [{ key: 'IP-1', fields: { summary: 'In Progress Issue', status: { name: 'In Progress' } } }] } 
                    })
                });
            }
            if (body.jql && body.jql.includes('status = Blocked')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { issues: [{ key: 'BLOCKED-1', fields: { summary: 'Blocked Issue', status: { name: 'Blocked' } } }] } 
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: { issues: [] } })
            });
        });

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });
        
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        await waitFor(() => {
            const boxes = screen.getAllByText('1').map(el => el.parentElement?.textContent || '');
            
            expect(boxes.some(text => text.includes('New / Untriaged'))).toBe(true);
            expect(boxes.some(text => text.includes('In Progress'))).toBe(true);
            expect(boxes.some(text => text.includes('Blocked / Pending'))).toBe(true);
        });
    });

    it('displays a status dot in the Support tab label when health status is not Healthy', async () => {
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api.authorizedFetch as any).mockImplementation((_url: string, options: any) => {
            const body = JSON.parse(options.body || '{}');
            // Mock one 'New' issue to trigger 'New / Untriaged' status
            if (body.jql && body.jql.includes('status = New')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ 
                        success: true, 
                        data: { issues: [{ key: 'NEW-1', fields: { summary: 'New Issue', status: { name: 'New' } } }] } 
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: { issues: [] } })
            });
        });

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        await waitFor(() => {
            const supportTab = screen.getByText(/Support & Health/i);
            // The dot is a span with title matching healthStatus
            const dot = supportTab.querySelector('span[title="New / Untriaged"]');
            expect(dot).not.toBeNull();
            // In New / Untriaged status, it should be var(--status-danger)
            expect((dot as HTMLElement).style.backgroundColor).toBe('var(--status-danger)');
        });
    });

    it('shows the correct set and order of manual support statuses', async () => {
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ id: 'si-1', description: 'Test Issue', status: 'to do', created_at: '', updated_at: '' }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        // Switch to Support tab
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        const statusDropdown = screen.getByDisplayValue('To Do');
        const options = within(statusDropdown).getAllByRole('option');
        
        const expectedStatuses = [
            { value: 'to do', label: 'To Do' },
            { value: 'work in progress', label: 'Work in Progress' },
            { value: 'noop', label: 'Noop' },
            { value: 'waiting for customer', label: 'Waiting for Customer' },
            { value: 'waiting for other party', label: 'Waiting for Other Party' },
            { value: 'done', label: 'Done' }
        ];

        expect(options).toHaveLength(expectedStatuses.length);
        expectedStatuses.forEach((status, idx) => {
            expect(options[idx].getAttribute('value')).toBe(status.value);
            expect(options[idx].textContent).toBe(status.label);
        });
    });

    it('automatically sets expiration date when manual status is changed to done', async () => {
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ id: 'si-1', description: 'Test Issue', status: 'to do', created_at: '', updated_at: '' }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        // Switch to Support tab
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        const statusDropdown = screen.getByDisplayValue('To Do');
        
        await act(async () => {
            fireEvent.change(statusDropdown, { target: { value: 'done' } });
        });

        const expectedExpiry = new Date();
        expectedExpiry.setDate(expectedExpiry.getDate() + SUPPORT_DONE_RETENTION_DAYS);
        const expectedExpiryStr = expectedExpiry.toISOString().split('T')[0];

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: [
                expect.objectContaining({
                    id: 'si-1',
                    status: 'done',
                    expiration_date: expectedExpiryStr
                })
            ]
        }));
    });

    it('shows "Customer ID Not Defined" in Custom Fields tab if customer_id is missing', async () => {
        const dataWithoutId: ValueStreamData = {
            ...mockData,
            customers: [
                { 
                    ...mockData.customers[0],
                    customer_id: undefined
                }
            ]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithoutId} />
                </MemoryRouter>
            );
        });

        // Custom Fields tab is default
        expect(screen.getByText(/Customer ID Not Defined/i)).toBeDefined();
        // Use a more flexible matcher for the description text which is broken up by bold tags
        expect(screen.getByText(/Please set the Customer ID above to fetch data/i)).toBeDefined();
    });

    it('allows unsetting expiration date', async () => {
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ 
                    id: 'si-1', 
                    description: 'Test Issue', 
                    status: 'done', 
                    expiration_date: '2026-12-31',
                    created_at: '', 
                    updated_at: '' 
                }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        // Switch to Support tab
        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        const unsettingButton = screen.getByTitle('Remove Expiration Date');
        expect(unsettingButton).toBeDefined();

        await act(async () => {
            fireEvent.click(unsettingButton);
        });

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: [expect.objectContaining({
                expiration_date: undefined
            })]
        }));
    });

    it('updates Related Jiras via JiraKeysInput', async () => {
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ id: 'si-1', description: 'Test', status: 'to do', related_jiras: ['J-1'] }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        const jiraInput = screen.getByPlaceholderText(/e.g. PROJ-123/i);
        fireEvent.change(jiraInput, { target: { value: 'J-1, J-2' } });

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: [expect.objectContaining({
                related_jiras: ['J-1', 'J-2']
            })]
        }));
    });

    it('automatically syncs fetched Jira issues to the database', async () => {
        // healthData is mocked to return 1 issue in 'New' status by default in some tests,
        // but let's make it explicit here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useNotificationContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert
        });
        
        // Mock the hook return value
        vi.mocked(api.authorizedFetch).mockResolvedValue({
            ok: true,
            json: async () => ({ 
                success: true, 
                data: { issues: [{ key: 'BUG-1', fields: { summary: 'Bug 1', status: { name: 'New' }, priority: { name: 'High' } } }] } 
            })
        } as unknown as Response);

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        // The useEffect should trigger updateCustomer
        await waitFor(() => {
            expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
                jira_support_issues: expect.arrayContaining([
                    expect.objectContaining({ key: 'BUG-1' })
                ])
            }), true);
        });
    });

    it('deletes a TCV history entry', async () => {
        const dataWithHistory: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                tcv_history: [{ id: 'h1', value: 500, valid_from: '2025-01-01' }]
            }]
        };

        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithHistory} />
                </MemoryRouter>
            );
        });

        const historyTab = screen.getByText(/TCV History/i);
        await act(async () => {
            fireEvent.click(historyTab);
        });

        const historyTable = screen.getByRole('table');
        const deleteBtn = within(historyTable).getByText('Delete');
        fireEvent.click(deleteBtn);

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            tcv_history: []
        }));
    });

    it('adds and removes manual support issues', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        const supportTab = screen.getByText(/Support & Health/i);
        await act(async () => {
            fireEvent.click(supportTab);
        });

        const addBtn = screen.getByText('+ Add Issue');
        fireEvent.click(addBtn);

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: expect.arrayContaining([
                expect.objectContaining({ status: 'to do', description: '' })
            ])
        }));

        // Now test removal
        const dataWithIssue: ValueStreamData = {
            ...mockData,
            customers: [{
                ...mockData.customers[0],
                support_issues: [{ id: 'si-1', description: 'To Remove', status: 'to do' }]
            }]
        };

        cleanup();
        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} data={dataWithIssue} />
                </MemoryRouter>
            );
        });

        await act(async () => {
            fireEvent.click(screen.getByText(/Support & Health/i));
        });

        const removeBtn = screen.getByText('Remove');
        fireEvent.click(removeBtn);

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            support_issues: []
        }));
    });

    it('deletes the customer after confirmation', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <CustomerPage {...defaultProps} />
                </MemoryRouter>
            );
        });

        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Customer', expect.stringContaining('Customer A'));
        
        await waitFor(() => {
            expect(defaultProps.deleteCustomer).toHaveBeenCalledWith('c1');
            expect(defaultProps.onBack).toHaveBeenCalled();
        });
    });
});





