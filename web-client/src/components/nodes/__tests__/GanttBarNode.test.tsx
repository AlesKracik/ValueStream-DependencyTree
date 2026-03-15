import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GanttBarNode } from '../GanttBarNode';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';

// Mock React Flow components that don't play well with RTL
vi.mock('@xyflow/react', () => ({
    Handle: () => <div data-testid="handle" />,
    Position: { Left: 'left', Right: 'right' }
}));

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
        jira: { base_url: 'https://jira', api_version: '3' },
        ai: { provider: 'openai' }
    },
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
            effort_md: 10,
            target_start: '2026-01-05',
            target_end: '2026-02-25'
        }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
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
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy, addEpic: vi.fn(), deleteEpic: vi.fn() }}>
                    <GanttBarNode data={nodeData} />
                </ValueStreamProvider>
            </NotificationProvider>
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

    it('calculates proportional effort correctly and avoids NaN by using effort_md', async () => {
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
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy, addEpic: vi.fn(), deleteEpic: vi.fn() }}>
                    <GanttBarNode data={nodeData} />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        act(() => {
            vi.runAllTimers();
        });

        // Verify the calculation result isn't NaN or null
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = (updateEpicSpy as any).mock.calls.find((c: any) => c[0] === 'e1');
        expect(call).toBeDefined();
        const overrides = call![1].sprint_effort_overrides;
        const pastEffort = overrides['s_past'];
        
        expect(pastEffort).not.toBeNaN();
        expect(pastEffort).toBeGreaterThan(0);
        // Duration: Jan 5 to Feb 25 = 52 days
        // Overlap with s_past (Jan 1 to Jan 14): Jan 5 to Jan 14 = 10 days
        // Calculated effort: 10 * (10/52) = 1.923... rounded to 1.9
        expect(pastEffort).toBe(1.9);
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});



