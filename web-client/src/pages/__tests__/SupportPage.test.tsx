import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
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
});
