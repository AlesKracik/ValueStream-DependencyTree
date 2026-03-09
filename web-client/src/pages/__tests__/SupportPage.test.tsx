import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupportPage } from '../SupportPage';
import type { ValueStreamData } from '../types/models';

const mockUpdateCustomer = vi.fn();

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: { jira_base_url: 'https://jira.com', jira_api_version: '3' },
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
    epics: [],
    sprints: []
};

describe('SupportPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders support issues and linked Jiras correctly', () => {
        render(
            <MemoryRouter>
                <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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
        render(
            <MemoryRouter>
                <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
        );

        const jiraTag = screen.getByText('SUP-101');
        fireEvent.click(jiraTag);

        expect(windowOpenSpy).toHaveBeenCalledWith('https://jira.com/browse/SUP-101', '_blank');
        windowOpenSpy.mockRestore();
    });

    it('cleans up expired issues on mount', async () => {
        render(
            <MemoryRouter>
                <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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
        render(
            <MemoryRouter>
                <SupportPage data={null} loading={true} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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

        render(
            <MemoryRouter>
                <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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
                        { id: 's1', description: 'Done Upper', status: 'DONE' as any },
                        { id: 's2', description: 'Todo Spaced', status: '  to do  ' as any },
                        { id: 's3', description: 'WIP Mixed', status: 'Work in Progress' as any }
                    ]
                }
            ]
        };

        render(
            <MemoryRouter>
                <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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

        render(
            <MemoryRouter>
                <SupportPage data={sortingData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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

        render(
            <MemoryRouter>
                <SupportPage data={multiCustomerData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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

        render(
            <MemoryRouter>
                <SupportPage data={tcvData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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

        render(
            <MemoryRouter>
                <SupportPage data={activityData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
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
        render(
            <MemoryRouter>
                <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
        );

        // Should not have the Updated sort button
        expect(screen.queryByRole('button', { name: /Updated/i })).toBeNull();
        
        // Should not have the "Updated" header (exact match for "Updated" to avoid "Updated Issue" or similar in rows)
        const headers = screen.queryAllByText('Updated');
        // We expect only 0 or 1 if it's a label in some row, but definitely NOT as a table header.
        // In this mockData, there's no "Updated" label.
        expect(headers.length).toBe(0);
    });
});
