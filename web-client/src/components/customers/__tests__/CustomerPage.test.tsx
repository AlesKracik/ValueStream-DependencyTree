import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerPage } from '../CustomerPage';
import { useDashboardContext } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

// Mock the context
vi.mock('../../../contexts/DashboardContext', () => ({
    useDashboardContext: vi.fn(),
    DashboardProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockData: DashboardData = {
    dashboards: [],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [
        { id: 'c1', name: 'Customer A', existing_tcv: 100, potential_tcv: 50 }
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
    });

    it('renders customer details correctly', () => {
        render(<CustomerPage {...defaultProps} />);

        expect(screen.getByDisplayValue('Customer A')).toBeDefined();
        expect(screen.getByDisplayValue('100')).toBeDefined();
        expect(screen.getByDisplayValue('50')).toBeDefined();
        expect(screen.getByText('Feature 1')).toBeDefined();
    });

    it('calls updateCustomer when name changes', () => {
        render(<CustomerPage {...defaultProps} />);

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

        expect(defaultProps.updateCustomer).toHaveBeenCalledWith('c1', { name: 'Updated Name' });
    });

    it('removes a work item target', () => {
        render(<CustomerPage {...defaultProps} />);

        const removeBtn = screen.getByText('Remove');
        fireEvent.click(removeBtn);

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f1', expect.objectContaining({
            customer_targets: []
        }));
    });

    it('adds a work item target via SearchableDropdown', () => {
        const dataWithAnotherWorkItem: DashboardData = {
            ...mockData,
            workItems: [
                ...mockData.workItems,
                { id: 'f2', name: 'Feature 2', total_effort_mds: 5, score: 0, customer_targets: [] }
            ]
        };

        render(<CustomerPage {...defaultProps} data={dataWithAnotherWorkItem} />);

        const dropdown = screen.getByPlaceholderText('Search for a work item to add...');
        fireEvent.focus(dropdown);
        
        const option = screen.getByText('Feature 2');
        fireEvent.click(option);

        expect(defaultProps.updateWorkItem).toHaveBeenCalledWith('f2', expect.objectContaining({
            customer_targets: [{
                customer_id: 'c1',
                tcv_type: 'potential',
                priority: 'Should-have'
            }]
        }));
    });

    it('calls deleteCustomer after confirmation', async () => {
        render(<CustomerPage {...defaultProps} />);

        const deleteBtn = screen.getByText('Delete Customer');
        fireEvent.click(deleteBtn);

        await vi.waitFor(() => {
            expect(mockShowConfirm).toHaveBeenCalled();
            expect(defaultProps.deleteCustomer).toHaveBeenCalledWith('c1');
            expect(defaultProps.onBack).toHaveBeenCalled();
        });
    });

    it('handles new customer creation draft', () => {
        render(<CustomerPage {...defaultProps} customerId="new" />);

        const nameInput = screen.getByLabelText(/Name:/i) as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'New Brand' } });
        expect(nameInput.value).toBe('New Brand');

        const createBtn = screen.getByText('Create');
        fireEvent.click(createBtn);

        expect(defaultProps.addCustomer).toHaveBeenCalledWith(expect.objectContaining({
            name: 'New Brand'
        }));
    });
});
