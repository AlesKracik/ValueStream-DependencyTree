import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GanttBarNode } from '../GanttBarNode';
import { DashboardProvider } from '../../../contexts/DashboardContext';
import type { DashboardData } from '../../../types/models';

// Mock React Flow components that don't play well with RTL
vi.mock('@xyflow/react', () => ({
    Handle: () => <div data-testid="handle" />,
    Position: { Left: 'left', Right: 'right' }
}));

const mockData: DashboardData = {
    settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }],
    sprints: [
        { id: 's_past', name: 'Past', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's_curr', name: 'Active', start_date: '2026-02-15', end_date: '2026-02-28' }
    ],
    epics: [
        {
            id: 'e1',
            jira_key: 'J-1',
            team_id: 't1',
            remaining_md: 10,
            target_start: '2026-01-05',
            target_end: '2026-02-25'
        }
    ]
};

describe('GanttBarNode Auto-Freeze', () => {
    const updateEpicSpy = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-20'));
    });

    it('automatically snapshots past effort into overrides if they do not exist', async () => {
        const nodeData = {
            label: 'Epic 1',
            width: 400,
            color: '#8b5cf6',
            epicId: 'e1',
            targetStart: '2026-01-05',
            targetEnd: '2026-02-25',
            segments: [
                { startOffsetPixels: 0, widthPixels: 100, intensity: 1, color: '#475569', isFrozen: true },
                { startOffsetPixels: 100, widthPixels: 100, intensity: 1, color: '#8b5cf6', isFrozen: false }
            ]
        };

        render(
            <DashboardProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                <GanttBarNode data={nodeData} />
            </DashboardProvider>
        );

        // Advance timers to trigger useEffect
        act(() => {
            vi.runAllTimers();
        });

        // The useEffect should trigger updateEpic with new overrides for s_past
        expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
            sprint_effort_overrides: expect.objectContaining({
                's_past': expect.any(Number)
            })
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
