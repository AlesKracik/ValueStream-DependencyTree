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
});
