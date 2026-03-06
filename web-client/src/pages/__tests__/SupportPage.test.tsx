import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupportPage } from '../SupportPage';
import type { ValueStreamData } from '../types/models';

const mockUpdateCustomer = vi.fn();

const mockData: ValueStreamData = {
    ValueStreams: [],
    settings: { jira_base_url: 'https://jira.com', jira_api_version: '3' },
    customers: [
        { 
            id: 'c1', 
            name: 'Customer A', 
            existing_tcv: 100, 
            potential_tcv: 50,
            support_issues: [
                { id: 'i1', description: 'Active Issue', status: 'to do' },
                { id: 'i2', description: 'Expired Issue', status: 'done', expiration_date: '2020-01-01' },
                { id: 'i3', description: 'Future Expiring Issue', status: 'done', expiration_date: '2099-01-01' }
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

    it('renders support issues correctly', () => {
        render(
            <MemoryRouter>
                <SupportPage data={mockData} loading={false} updateCustomer={mockUpdateCustomer} />
            </MemoryRouter>
        );

        expect(screen.getByText('Active Issue')).toBeDefined();
        expect(screen.getByText('Expired Issue')).toBeDefined();
        expect(screen.getByText('Future Expiring Issue')).toBeDefined();
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
});
