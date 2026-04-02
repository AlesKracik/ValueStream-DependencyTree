import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, waitFor, fireEvent } from '@testing-library/react';
import { SupportPage } from '../SupportPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '@valuestream/shared-types';

const mockUpdateCustomer = vi.fn();
const mockedNavigate = vi.fn();

vi.mock('../../utils/api', () => ({
    llmGenerate: vi.fn(),
    gleanAuthLogin: vi.fn(),
    gleanAuthStatus: vi.fn(),
    gleanChat: vi.fn()
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate
    };
});

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: 'https://jira.com', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: '', api_key: '' },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } }
    },
    customers: [
        { 
            id: 'c1', 
            name: 'Customer A', 
            existing_tcv: 100, 
            potential_tcv: 50,
            support_issues: [
                { id: 'i1', description: 'Active Issue', status: 'to do', related_jiras: ['SUP-101'] },
                { id: 'i2', description: 'Expired Issue', status: 'done', expiration_date: '2020-01-01' },
                { id: 'i3', description: 'Future Expiring Issue', status: 'done', expiration_date: '2099-01-01' }
            ],
            jira_support_issues: [
                {
                    key: 'SUP-101',
                    summary: 'Linked Jira Summary',
                    status: 'In Progress',
                    priority: 'High',
                    url: 'https://jira.com/browse/SUP-101',
                    last_updated: '2026-03-05T09:00:00Z'
                },
                {
                    key: 'SUP-102',
                    summary: 'Independent Jira Summary',
                    status: 'New',
                    priority: 'Medium',
                    url: 'https://jira.com/browse/SUP-102',
                    last_updated: '2026-03-06T11:00:00Z'
                }
            ]
        }
    ],
    workItems: [],
    teams: [],
    issues: [],
    sprints: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('SupportPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders support issues and linked Jiras correctly', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        expect(screen.getByText('Active Issue')).toBeDefined();
        expect(screen.getByText('Expired Issue')).toBeDefined();
        expect(screen.getByText('Future Expiring Issue')).toBeDefined();

        // Check for linked Jira
        expect(screen.getByText('SUP-101')).toBeDefined();
        expect(screen.getByText('In Progress')).toBeDefined();

        // Check that independent Jira (SUP-102) is NOT displayed
        expect(screen.queryByText('SUP-102')).toBeNull();
        expect(screen.queryByText(/Independent Jira Summary/)).toBeNull();
    });

    it('opens linked Jira in a new tab when clicked', () => {
        const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const jiraTag = screen.getByText('SUP-101');
        fireEvent.click(jiraTag);

        expect(windowOpenSpy).toHaveBeenCalledWith('https://jira.com/browse/SUP-101', '_blank');
        windowOpenSpy.mockRestore();
    });

    it('cleans up expired issues on mount', async () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        await waitFor(() => {
            expect(mockUpdateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
                support_issues: [
                    expect.objectContaining({ id: 'i1' }),
                    expect.objectContaining({ id: 'i3' })
                ]
            }), true);
        });
    });

    it('shows loading state', () => {
        renderWithProviders(
            <SupportPage data={null} loading={true} updateCustomer={mockUpdateCustomer} />
        );

        expect(screen.getByText(/Loading support issues/i)).toBeDefined();
    });

    it('sorts by status correctly', async () => {
        const sortingData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    support_issues: [
                        { id: 's1', description: 'Done Issue', status: 'done' },
                        { id: 's2', description: 'Todo Issue', status: 'to do' },
                        { id: 's3', description: 'WIP Issue', status: 'work in progress' }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        // Find the "Status" sort button by its text within the "Sort by:" container or just by role
        const statusSortBtn = screen.getByRole('button', { name: /Status/i });
        await act(async () => {
            fireEvent.click(statusSortBtn);
        });

        // The items should now be in order: Todo, WIP, Done
        // We can check their relative position in the DOM
        const todoIdx = screen.getByText('Todo Issue').closest('div[class*="listItem"]');
        const wipIdx = screen.getByText('WIP Issue').closest('div[class*="listItem"]');
        const doneIdx = screen.getByText('Done Issue').closest('div[class*="listItem"]');

        expect(todoIdx).toBeDefined();
        expect(wipIdx).toBeDefined();
        expect(doneIdx).toBeDefined();

        // Check order using compareDocumentPosition
        expect(todoIdx!.compareDocumentPosition(wipIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(wipIdx!.compareDocumentPosition(doneIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sorts by status correctly with messy casing and spaces (normalization)', async () => {
        const sortingData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    support_issues: [
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        { id: 's1', description: 'Done Upper', status: 'DONE' as any },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        { id: 's2', description: 'Todo Spaced', status: '  to do  ' as any },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        { id: 's3', description: 'WIP Mixed', status: 'Work in Progress' as any }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const statusSortBtn = screen.getByRole('button', { name: /Status/i });
        await act(async () => {
            fireEvent.click(statusSortBtn);
        });

        const todoIdx = screen.getByText('Todo Spaced').closest('div[class*="listItem"]');
        const wipIdx = screen.getByText('WIP Mixed').closest('div[class*="listItem"]');
        const doneIdx = screen.getByText('Done Upper').closest('div[class*="listItem"]');

        expect(todoIdx!.compareDocumentPosition(wipIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(wipIdx!.compareDocumentPosition(doneIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('handles descending sort for status', async () => {
        const sortingData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    support_issues: [
                        { id: 's1', description: 'Done Issue', status: 'done' },
                        { id: 's2', description: 'Todo Issue', status: 'to do' }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const statusSortBtn = screen.getByRole('button', { name: /Status/i });
        // Click once for ascending (Todo -> Done)
        await act(async () => {
            fireEvent.click(statusSortBtn);
        });
        // Click again for descending (Done -> Todo)
        await act(async () => {
            fireEvent.click(statusSortBtn);
        });

        const todoIdx = screen.getByText('Todo Issue').closest('div[class*="listItem"]');
        const doneIdx = screen.getByText('Done Issue').closest('div[class*="listItem"]');

        // Done should now be BEFORE Todo
        expect(doneIdx!.compareDocumentPosition(todoIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sorts status globally across multiple customers', async () => {
        const multiCustomerData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    id: 'c1',
                    name: 'Customer A',
                    existing_tcv: 100,
                    potential_tcv: 50,
                    support_issues: [
                        { id: 's1', description: 'Done A', status: 'done' }
                    ]
                },
                {
                    id: 'c2',
                    name: 'Customer B',
                    existing_tcv: 200,
                    potential_tcv: 50,
                    support_issues: [
                        { id: 's2', description: 'Waiting B', status: 'waiting for other party' }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={multiCustomerData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const statusSortBtn = screen.getByRole('button', { name: /Status/i });
        // Click once for ascending (Waiting -> Done)
        await act(async () => {
            fireEvent.click(statusSortBtn);
        });

        const waitingB = screen.getByText('Waiting B').closest('div[class*="listItem"]');
        const doneA = screen.getByText('Done A').closest('div[class*="listItem"]');

        // Waiting B (4) should be BEFORE Done A (5)
        expect(waitingB!.compareDocumentPosition(doneA!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('calculates and displays TCV categories (money bags) correctly', () => {
        const tcvData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    id: 'c1',
                    name: 'Low TCV',
                    existing_tcv: 10,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i1', description: 'Low Issue', status: 'to do' }]
                },
                {
                    id: 'c2',
                    name: 'Mid TCV',
                    existing_tcv: 50,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i2', description: 'Mid Issue', status: 'to do' }]
                },
                {
                    id: 'c3',
                    name: 'High TCV',
                    existing_tcv: 100,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i3', description: 'High Issue', status: 'to do' }]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={tcvData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        // Max TCV is 100. BandSize is 33.33.
        // Low TCV (10) -> Band 1 (1 bag)
        // Mid TCV (50) -> Band 2 (2 bags)
        // High TCV (100) -> Band 3 (3 bags)

        const lowCategory = screen.getByTitle('TCV Category: 1');
        const midCategory = screen.getByTitle('TCV Category: 2');
        const highCategory = screen.getByTitle('TCV Category: 3');

        expect(lowCategory.textContent).toBe('💰');
        expect(midCategory.textContent).toBe('💰💰');
        expect(highCategory.textContent).toBe('💰💰💰');
    });

    it('sorts by TCV category (money bag) correctly', async () => {
        const tcvData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    id: 'c1',
                    name: 'Low TCV',
                    existing_tcv: 10,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i1', description: 'Low Issue', status: 'to do' }]
                },
                {
                    id: 'c2',
                    name: 'Mid TCV',
                    existing_tcv: 50,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i2', description: 'Mid Issue', status: 'to do' }]
                },
                {
                    id: 'c3',
                    name: 'High TCV',
                    existing_tcv: 100,
                    potential_tcv: 0,
                    support_issues: [{ id: 'i3', description: 'High Issue', status: 'to do' }]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={tcvData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        // Click on the 💰 column header to sort
        const tcvSortBtn = screen.getByRole('button', { name: /💰/i });
        await act(async () => {
            fireEvent.click(tcvSortBtn);
        });

        const lowIdx = screen.getByText('Low Issue').closest('div[class*="listItem"]');
        const midIdx = screen.getByText('Mid Issue').closest('div[class*="listItem"]');
        const highIdx = screen.getByText('High Issue').closest('div[class*="listItem"]');

        // Ascending order: 1, 2, 3 bags
        expect(lowIdx!.compareDocumentPosition(midIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(midIdx!.compareDocumentPosition(highIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // Click again for descending order
        await act(async () => {
            fireEvent.click(tcvSortBtn);
        });

        // Descending order: 3, 2, 1 bags
        expect(highIdx!.compareDocumentPosition(midIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(midIdx!.compareDocumentPosition(lowIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sorts by activity correctly', async () => {
        const today = new Date().toISOString().split('T')[0];
        const activityData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    support_issues: [
                        { id: 'a1', description: 'None Issue', status: 'to do', created_at: '2020-01-01', updated_at: '2020-01-01' },
                        { id: 'a2', description: 'New Issue', status: 'to do', created_at: today, updated_at: today },
                        { id: 'a3', description: 'Updated Issue', status: 'to do', created_at: '2020-01-01', updated_at: today }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={activityData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const activitySortBtn = screen.getByRole('button', { name: /Activity/i });
        await act(async () => {
            fireEvent.click(activitySortBtn);
        });

        // Order should be: New, Updated, None
        const newIdx = screen.getByText('New Issue').closest('div[class*="listItem"]');
        const updatedIdx = screen.getByText('Updated Issue').closest('div[class*="listItem"]');
        const noneIdx = screen.getByText('None Issue').closest('div[class*="listItem"]');

        expect(newIdx!.compareDocumentPosition(updatedIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(updatedIdx!.compareDocumentPosition(noneIdx!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does not display the "Updated" column or sort option', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        // Should not have the Updated sort button
        expect(screen.queryByRole('button', { name: /Updated/i })).toBeNull();
        
        // Should not have the "Updated" header (exact match for "Updated" to avoid "Updated Issue" or similar in rows)
        const headers = screen.queryAllByText('Updated');
        // We expect only 0 or 1 if it's a label in some row, but definitely NOT as a table header.
        // In this mockData, there's no "Updated" label.
        expect(headers.length).toBe(0);
    });

    it('preserves multiline formatting in description', () => {
        const multilineData: ValueStreamData = {
            ...mockData,
            customers: [
                {
                    ...mockData.customers[0],
                    support_issues: [
                        { id: 'm1', description: 'Line 1\nLine 2', status: 'to do' }
                    ]
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={multilineData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        // Using a regex to find the text which might be normalized in some environments
        const descriptionElement = screen.getByText(/Line 1/);
        expect(descriptionElement.textContent).toContain('Line 1');
        expect(descriptionElement.textContent).toContain('Line 2');
        expect(window.getComputedStyle(descriptionElement).whiteSpace).toBe('pre-wrap');
    });

    it('navigates to customer support tab when an issue is clicked', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const issueRow = screen.getByText('Active Issue').closest('[class*="listItem"]')!;
        fireEvent.click(issueRow);

        expect(mockedNavigate).toHaveBeenCalledWith('/customer/c1?tab=support&issueId=i1');
    });

    it('filters issues by description or customer name', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const filterInput = screen.getByPlaceholderText(/Filter issues/i);
        
        // Filter by description
        fireEvent.change(filterInput, { target: { value: 'Active' } });
        expect(screen.getByText('Active Issue')).toBeDefined();
        expect(screen.queryByText('Expired Issue')).toBeNull();

        // Filter by customer name
        fireEvent.change(filterInput, { target: { value: 'Customer A' } });
        expect(screen.getByText('Active Issue')).toBeDefined();
        expect(screen.getByText('Expired Issue')).toBeDefined();
    });

    it('performs AI search and matches customers by customerId and name fallback', async () => {
        const { llmGenerate } = await import('../../utils/api');
        const mockedLlmGenerate = vi.mocked(llmGenerate);
        
        const aiResponse = {
            customers: [
                {
                    name: 'Customer A',
                    customerId: 'c_id_1',
                    issues: [
                        {
                            summary: 'AI Found Issue 1',
                            impact: 'High',
                            rootCause: 'Bug',
                            jiraTickets: ['JIRA-1']
                        }
                    ]
                },
                {
                    name: 'Unknown Customer',
                    customerId: 'non-existent',
                    issues: [
                        {
                            summary: 'AI Found Issue 2',
                            impact: 'Low',
                            rootCause: 'Config',
                            jiraTickets: []
                        }
                    ]
                },
                {
                    name: 'Customer A', // Exact match for "Customer A"
                    // customerId is missing
                    issues: [
                        {
                            summary: 'AI Found Issue 3',
                            impact: 'Medium',
                            rootCause: 'Unknown'
                            // jiraTickets is missing
                        }
                    ]
                }
            ]
        };

        mockedLlmGenerate.mockResolvedValue(JSON.stringify(aiResponse));

        const dataWithCid: ValueStreamData = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ai: { provider: 'openai', support: { prompt: 'Test prompt' } }
            },
            customers: [
                {
                    ...mockData.customers[0],
                    customer_id: 'c_id_1'
                }
            ]
        };

        renderWithProviders(
            <SupportPage data={dataWithCid} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const aiSearchBtn = screen.getByText('AI Support Search');
        fireEvent.click(aiSearchBtn);

        await waitFor(() => {
            expect(screen.getByText('AI Search Results')).toBeDefined();
        });

        // Check customerId match (Customer A matched by c_id_1)
        expect(screen.getAllByText('MATCHED: Customer A').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('(c_id_1)')).toBeDefined();
        expect(screen.getByText('AI Found Issue 1')).toBeDefined();

        // Check no match for unknown customer
        const unknownResults = screen.getAllByText('NO MATCH');
        expect(unknownResults.length).toBeGreaterThan(0);
        expect(screen.getByText('AI Found Issue 2')).toBeDefined();

        // Check name fallback match (Cust A matches Customer A)
        await waitFor(() => {
            const matches = screen.getAllByText('MATCHED: Customer A');
            expect(matches.length).toBe(2);
        });
        expect(screen.getByText('AI Found Issue 3')).toBeDefined();
    });

    it('renders the Create Issue button', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        expect(screen.getByText('+ Create Issue')).toBeDefined();
    });

    it('opens the inline create form when clicking the Create Issue button', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        fireEvent.click(screen.getByText('+ Create Issue'));
        expect(screen.getByPlaceholderText('Describe the support issue...')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    });

    it('creates a support issue via the inline form', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);

        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        fireEvent.click(screen.getByText('+ Create Issue'));

        // Fill in description
        const textarea = screen.getByPlaceholderText('Describe the support issue...');
        fireEvent.change(textarea, { target: { value: 'New test issue' } });

        // Click Save
        const saveBtn = screen.getByRole('button', { name: 'Save' });
        expect((saveBtn as HTMLButtonElement).disabled).toBe(false);

        await act(async () => {
            fireEvent.click(saveBtn);
        });

        await waitFor(() => {
            expect(mockUpdateCustomer).toHaveBeenCalledWith(
                'c1',
                expect.objectContaining({
                    support_issues: expect.arrayContaining([
                        expect.objectContaining({
                            description: 'New test issue',
                            status: 'to do'
                        })
                    ])
                }),
                true
            );
        });

        // Form should be closed
        expect(screen.queryByPlaceholderText('Describe the support issue...')).toBeNull();
    });

    it('disables Save button when description is empty', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        fireEvent.click(screen.getByText('+ Create Issue'));

        const saveBtn = screen.getByRole('button', { name: 'Save' });
        expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('creates a support issue with selected status', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);

        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        fireEvent.click(screen.getByText('+ Create Issue'));

        const textarea = screen.getByPlaceholderText('Describe the support issue...');
        fireEvent.change(textarea, { target: { value: 'WIP issue' } });

        // Change status to "work in progress"
        const statusSelect = screen.getByDisplayValue('To Do');
        fireEvent.change(statusSelect, { target: { value: 'work in progress' } });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        });

        await waitFor(() => {
            expect(mockUpdateCustomer).toHaveBeenCalledWith(
                'c1',
                expect.objectContaining({
                    support_issues: expect.arrayContaining([
                        expect.objectContaining({
                            description: 'WIP issue',
                            status: 'work in progress'
                        })
                    ])
                }),
                true
            );
        });
    });

    it('closes the inline create form when clicking Cancel', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        fireEvent.click(screen.getByText('+ Create Issue'));
        expect(screen.getByPlaceholderText('Describe the support issue...')).toBeDefined();

        fireEvent.click(screen.getByText('Cancel'));
        expect(screen.queryByPlaceholderText('Describe the support issue...')).toBeNull();
    });

    it('shows dismiss button on "no match" AI results and removes them when clicked', async () => {
        const { llmGenerate } = await import('../../utils/api');
        const mockedLlmGenerate = vi.mocked(llmGenerate);

        const aiResponse = {
            customers: [
                {
                    name: 'Unknown Customer',
                    customerId: 'non-existent',
                    issues: [
                        {
                            summary: 'No Match Issue',
                            impact: 'Low',
                            rootCause: 'Config',
                            jiraTickets: []
                        }
                    ]
                }
            ]
        };

        mockedLlmGenerate.mockResolvedValue(JSON.stringify(aiResponse));

        const dataWithAi: ValueStreamData = {
            ...mockData,
            settings: {
                ...mockData.settings,
                ai: { provider: 'openai', support: { prompt: 'Test prompt' } }
            }
        };

        renderWithProviders(
            <SupportPage data={dataWithAi} loading={false} updateCustomer={mockUpdateCustomer} />
        );

        const aiSearchBtn = screen.getByText('AI Support Search');
        fireEvent.click(aiSearchBtn);

        await waitFor(() => {
            expect(screen.getByText('AI Search Results')).toBeDefined();
        });

        // Verify "NO MATCH" badge is shown
        expect(screen.getByText('NO MATCH')).toBeDefined();
        expect(screen.getByText('No Match Issue')).toBeDefined();

        // Verify dismiss button is present even for "no match" items
        const dismissBtn = screen.getByText('Dismiss');
        expect(dismissBtn).toBeDefined();

        // Click dismiss and verify the issue is removed
        fireEvent.click(dismissBtn);
        await waitFor(() => {
            expect(screen.queryByText('No Match Issue')).toBeNull();
        });
    });

    it('renders Upsert from JSON and Export JSON buttons', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        expect(screen.getByText('Upsert from JSON')).toBeDefined();
        expect(screen.getByText('Export JSON')).toBeDefined();
    });

    it('opens JSON upsert modal when Upsert from JSON button is clicked', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));
        expect(screen.getByText('Upsert Support Issues from JSON')).toBeDefined();
        expect(screen.getByText('Delete support issues not found in JSON')).toBeDefined();
        expect(screen.getByText('Select JSON File')).toBeDefined();
    });

    it('closes JSON modal when Cancel is clicked', () => {
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));
        expect(screen.getByText('Upsert Support Issues from JSON')).toBeDefined();
        fireEvent.click(screen.getByText('Cancel'));
        expect(screen.queryByText('Upsert Support Issues from JSON')).toBeNull();
    });

    it('exports JSON with correct format', () => {
        const createObjectURL = vi.fn(() => 'blob:url');
        const revokeObjectURL = vi.fn();

        global.URL.createObjectURL = createObjectURL;
        global.URL.revokeObjectURL = revokeObjectURL;

        // Spy on the real anchor's click method via createElement interception
        let capturedAnchor: HTMLAnchorElement | null = null;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
            const el = originalCreateElement(tagName, options);
            if (tagName === 'a') {
                capturedAnchor = el as HTMLAnchorElement;
                vi.spyOn(el, 'click').mockImplementation(() => {});
            }
            return el;
        });

        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Export JSON'));

        expect(createObjectURL).toHaveBeenCalled();
        const blobArg = createObjectURL.mock.calls[0][0] as Blob;
        expect(blobArg).toBeInstanceOf(Blob);
        expect(capturedAnchor).not.toBeNull();
        expect(capturedAnchor!.click).toHaveBeenCalled();

        vi.restoreAllMocks();
    });

    it('handles JSON upsert with file upload', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));

        const jsonContent = JSON.stringify([
            { customer: 'c1', description: 'Updated Issue', status: 'work in progress' },
            { customer: 'c1', description: 'New Issue', status: 'to do' }
        ]);
        const file = new File([jsonContent], 'test.json', { type: 'application/json' });

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeDefined();

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        await waitFor(() => {
            expect(mockUpdateCustomer).toHaveBeenCalled();
        });
    });

    it('handles JSON upsert with missing fields, applying defaults', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));

        // JSON with only description — status, related_jiras, expiration_date are missing
        const jsonContent = JSON.stringify([
            { customer: 'c1', description: 'Minimal Issue' }
        ]);
        const file = new File([jsonContent], 'minimal.json', { type: 'application/json' });

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeDefined();

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        await waitFor(() => {
            // The first call may be the expired-issue cleanup on mount; find the JSON upsert call
            const upsertCall = mockUpdateCustomer.mock.calls.find(
                (c: unknown[]) => {
                    const issues = (c[1] as { support_issues?: SupportIssue[] }).support_issues;
                    return issues?.some((i: SupportIssue) => i.description === 'Minimal Issue');
                }
            );
            expect(upsertCall).toBeDefined();
            const issues = upsertCall![1].support_issues as SupportIssue[];
            const added = issues.find((i: SupportIssue) => i.description === 'Minimal Issue');
            expect(added).toBeDefined();
            expect(added!.status).toBe('to do');
            expect(added!.related_jiras).toEqual([]);
        });
    });

    it('matches customer by substring of name during JSON upsert', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));

        // Use a substring of "Customer A" as the customer field
        const jsonContent = JSON.stringify([
            { customer: 'Customer', description: 'Substring Match Issue', status: 'to do' }
        ]);
        const file = new File([jsonContent], 'substring.json', { type: 'application/json' });

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeDefined();

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        await waitFor(() => {
            const upsertCall = mockUpdateCustomer.mock.calls.find(
                (c: unknown[]) => {
                    const issues = (c[1] as { support_issues?: SupportIssue[] }).support_issues;
                    return issues?.some((i: SupportIssue) => i.description === 'Substring Match Issue');
                }
            );
            expect(upsertCall).toBeDefined();
            // Should have matched to customer 'c1' (Customer A)
            expect(upsertCall![0]).toBe('c1');
        });
    });

    it('matches customer when customer name is a substring of input', async () => {
        mockUpdateCustomer.mockResolvedValue(undefined);
        renderWithProviders(
            <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
        );
        fireEvent.click(screen.getByText('Upsert from JSON'));

        // Use a longer string that contains "Customer A" as a substring
        const jsonContent = JSON.stringify([
            { customer: 'Customer A International', description: 'Reverse Substring Issue', status: 'to do' }
        ]);
        const file = new File([jsonContent], 'reverse.json', { type: 'application/json' });

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeDefined();

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        await waitFor(() => {
            const upsertCall = mockUpdateCustomer.mock.calls.find(
                (c: unknown[]) => {
                    const issues = (c[1] as { support_issues?: SupportIssue[] }).support_issues;
                    return issues?.some((i: SupportIssue) => i.description === 'Reverse Substring Issue');
                }
            );
            expect(upsertCall).toBeDefined();
            // Should have matched to customer 'c1' (Customer A)
            expect(upsertCall![0]).toBe('c1');
        });
    });
});
