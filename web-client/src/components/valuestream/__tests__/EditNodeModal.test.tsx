import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditNodeModal } from '../EditNodeModal';
import type { ValueStreamData } from '../../../types/models';
import type { Node } from '@xyflow/react';

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
        jira: { base_url: "https://jira", api_version: "3" },
        ai: { provider: 'openai' }
    },
    customers: [],
    workItems: [],
    teams: [
        { id: 'team-uuid-123', name: 'Team Alpha', total_capacity_mds: 10, sprint_capacity_overrides: { 'sprint-uuid-456': 7 } }
    ],
    epics: [],
    sprints: [
        { id: 'sprint-uuid-456', name: 'Sprint 1', start_date: '2026-02-12', end_date: '2026-02-26' }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('EditNodeModal', () => {
    const onUpdateCustomer = vi.fn();
    const onUpdateWorkItem = vi.fn();
    const onUpdateTeam = vi.fn();
    const onUpdateEpic = vi.fn();
    const onClose = vi.fn();

    const defaultProps = {
        onClose,
        data: mockData,
        onUpdateCustomer,
        onUpdateWorkItem,
        onUpdateTeam,
        onUpdateEpic
    };

    it('correctly extracts team and sprint info from node.data for sprintCapacityNode', () => {
        const node: Node = {
            id: 'sprint-cap-team-uuid-123-sprint-uuid-456',
            type: 'sprintCapacityNode',
            position: { x: 0, y: 0 },
            data: {
                teamId: 'team-uuid-123',
                sprintId: 'sprint-uuid-456'
            }
        };

        render(<EditNodeModal {...defaultProps} node={node} />);

        expect(screen.getByText(/Edit Capacity Override: Team Alpha \/ Sprint 1/)).toBeDefined();
        
        const input = screen.getByDisplayValue('7') as HTMLInputElement;
        expect(input).toBeDefined();

        fireEvent.change(input, { target: { value: '8' } });
        fireEvent.click(screen.getByText('Save'));

        expect(onUpdateTeam).toHaveBeenCalledWith('team-uuid-123', {
            sprint_capacity_overrides: {
                'sprint-uuid-456': 8
            }
        });
    });

    it('edits customerNode name and TCV', () => {
        const dataWithCustomer: ValueStreamData = {
            ...mockData,
            customers: [{ id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 50 }]
        };
        const node: Node = { id: 'customer-c1', type: 'customerNode', position: { x: 0, y: 0 }, data: {} };

        render(<EditNodeModal {...defaultProps} data={dataWithCustomer} node={node} />);

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Updated Cust' } });

        const existingInput = screen.getByLabelText(/Actual Existing TCV/i);
        fireEvent.change(existingInput, { target: { value: '200' } });

        fireEvent.click(screen.getByText('Save'));

        expect(onUpdateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({
            name: 'Updated Cust',
            existing_tcv: 200
        }));
    });

    it('edits workItemNode and handles global target toggle', () => {
        const dataWithWorkItem: ValueStreamData = {
            ...mockData,
            workItems: [{ id: 'w1', name: 'Work 1', total_effort_mds: 10, customer_targets: [] }]
        };
        const node: Node = { id: 'workitem-w1', type: 'workItemNode', position: { x: 0, y: 0 }, data: {} };

        render(<EditNodeModal {...defaultProps} data={dataWithWorkItem} node={node} />);

        // Toggle Global Target
        const globalCheckbox = screen.getByLabelText(/Relates to ALL Customers/i);
        fireEvent.click(globalCheckbox);

        // Should show TCV Basis and Priority dropdowns
        expect(screen.getByText(/Existing TCV/i)).toBeDefined();
        expect(screen.getByDisplayValue(/Must-have/i)).toBeDefined();

        fireEvent.click(screen.getByText('Save'));

        expect(onUpdateWorkItem).toHaveBeenCalledWith('w1', expect.objectContaining({
            all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
        }));
    });

    it('handles customer target priority and history selection in workItemNode', () => {
        const dataWithWorkItem: ValueStreamData = {
            ...mockData,
            customers: [
                { 
                    id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 0, 
                    tcv_history: [{ id: 'h1', value: 80, valid_from: '2025-01-01' }] 
                }
            ],
            workItems: [
                { 
                    id: 'w1', name: 'Work 1', total_effort_mds: 10, 
                    customer_targets: [{ customer_id: 'c1', tcv_type: 'existing', priority: 'Must-have' }] 
                }
            ]
        };
        const node: Node = { id: 'workitem-w1', type: 'workItemNode', position: { x: 0, y: 0 }, data: {} };

        render(<EditNodeModal {...defaultProps} data={dataWithWorkItem} node={node} />);

        // Priority change
        const prioritySelect = screen.getByDisplayValue('Must-have');
        fireEvent.change(prioritySelect, { target: { value: 'Nice-to-have' } });

        // History change
        const historySelect = screen.getByDisplayValue(/Latest Actual/i);
        fireEvent.change(historySelect, { target: { value: 'h1' } });

        fireEvent.click(screen.getByText('Save'));

        expect(onUpdateWorkItem).toHaveBeenCalledWith('w1', expect.objectContaining({
            customer_targets: [
                expect.objectContaining({ customer_id: 'c1', priority: 'Nice-to-have', tcv_history_id: 'h1' })
            ]
        }));
    });
});
