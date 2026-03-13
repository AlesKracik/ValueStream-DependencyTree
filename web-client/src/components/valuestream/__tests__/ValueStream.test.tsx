import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValueStream } from '../ValueStream';
import { ReactFlowProvider } from '@xyflow/react';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData, ValueStreamViewState } from '../../../types/models';

// Mock ResizeObserver which is needed by React Flow
vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
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
        jira: { base_url: '', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [{ id: 'c1', name: 'Customer 1', existing_tcv: 100, potential_tcv: 50 }],
    workItems: [{ id: 'w1', name: 'Work Item 1', total_effort_mds: 10, score: 0, customer_targets: [] }],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 100 }],
    epics: [{ id: 'e1', jira_key: 'E1', work_item_id: 'w1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-14' }],
    sprints: [{ id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }]
};

const mockViewState: ValueStreamViewState = {
    sprintOffset: 0,
    customerFilter: '',
    workItemFilter: '',
    teamFilter: '',
    epicFilter: '',
    releasedFilter: 'all',
    minTcvFilter: '',
    minScoreFilter: '',
    showDependencies: true,
    disableHoverHighlight: false,
    isInitialOffsetSet: true
};

describe('Value Stream', () => {
    const onNavigateToSprint = vi.fn();
    const onNavigateToCustomer = vi.fn();

    const defaultProps = {
        data: mockData,
        loading: false,
        error: null,
        updateCustomer: vi.fn(),
        updateWorkItem: vi.fn(),
        updateTeam: vi.fn(),
        viewState: mockViewState,
        setViewState: vi.fn(),
        onNavigateToCustomer,
        onNavigateToWorkItem: vi.fn(),
        onNavigateToTeam: vi.fn(),
        onNavigateToEpic: vi.fn(),
        onNavigateToSprint,
        onNavigateToValueStreamEdit: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('navigates to team page when sprint capacity node is clicked', () => {
        const onNavigateToTeam = vi.fn();
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                            onNavigateToTeam={onNavigateToTeam}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );

        const sprintNode = screen.getByText(/Sprint 1/);
        fireEvent.click(sprintNode);

        expect(onNavigateToTeam).toHaveBeenCalledWith('t1');
    });

    it('navigates to customer page when customer node is clicked', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );
        const customerNode = screen.getByText('Customer 1');
        fireEvent.click(customerNode);

        expect(onNavigateToCustomer).toHaveBeenCalledWith('c1');
    });
});





