import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ValueStream } from '../ValueStream';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData, ValueStreamViewState } from '@valuestream/shared-types';

// Mock ResizeObserver which is needed by React Flow
vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

// Mock useReactFlow and ReactFlow
vi.mock('@xyflow/react', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = await importOriginal() as any;
    return {
        ...original,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ReactFlow: vi.fn(({ nodes, children, onNodeContextMenu, onPaneContextMenu, onNodeClick, ...props }: any) => (
            <div 
                data-testid="react-flow-pane" 
                onContextMenu={onPaneContextMenu}
                {...props}
            >
                {children}
                <div data-testid="nodes-layer">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {nodes?.map((node: any) => (
                        <div 
                            key={node.id} 
                            data-testid={`node-${node.id}`}
                            onContextMenu={(e) => onNodeContextMenu?.(e, node)}
                            onClick={(e) => onNodeClick?.(e, node)}
                            >
                            {node.data?.name || node.data?.label || node.data?.sprintLabel || node.id}
                            {node.type === 'ganttBarNode' && ` (${node.data?.effort_md} MDs)`}
                            </div>

                    ))}
                </div>
            </div>
        )),
        useReactFlow: vi.fn(() => ({
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
            setViewport: vi.fn(),
            getNodes: vi.fn(() => []),
            getEdges: vi.fn(() => []),
        } as unknown as ReturnType<typeof useReactFlow>)),
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
        jira: { base_url: '', api_version: '3', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: "", api_key: "" },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } }
    },
    customers: [{ id: 'c1', name: 'Customer 1', existing_tcv: 100, potential_tcv: 50 }],
    workItems: [{ id: 'w1', name: 'Work Item 1', total_effort_mds: 10, score: 0, status: 'Backlog', customer_targets: [] }],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 100 }],
    issues: [{ id: 'e1', jira_key: 'E1', work_item_id: 'w1', team_id: 't1', effort_md: 5, target_start: '2026-01-01', target_end: '2026-01-14' }],
    sprints: [{ id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }],
    metrics: { maxScore: 100, maxRoi: 10 }
};

const mockViewState: ValueStreamViewState = {
    sprintOffset: 0,
    customerFilter: '',
    workItemFilter: '',
    teamFilter: '',
    issueFilter: '',
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
        updateIssue: vi.fn(),
        viewState: mockViewState,
        setViewState: vi.fn(),
        onNavigateToCustomer,
        onNavigateToWorkItem: vi.fn(),
        onNavigateToTeam: vi.fn(),
        onNavigateToIssue: vi.fn(),
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
                <ValueStreamProvider value={{ data: mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
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
                <ValueStreamProvider value={{ data: mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
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

    it('navigates to work item page when work item node is clicked', () => {
        const onNavigateToWorkItem = vi.fn();
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                            onNavigateToWorkItem={onNavigateToWorkItem}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );
        const workItemNode = screen.getByText('Work Item 1');
        fireEvent.click(workItemNode);

        expect(onNavigateToWorkItem).toHaveBeenCalledWith('w1');
    });

    it('navigates to issue page when gantt bar node is clicked', () => {
        const onNavigateToIssue = vi.fn();
        // Gantt node id is gantt-e1 in useGraphLayout
        const ganttNodeData = {
            ...mockData,
            issues: [{ ...mockData.issues[0], name: 'Issue 1' }]
        };
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: ganttNodeData as unknown as ValueStreamData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                            data={ganttNodeData}
                            onNavigateToIssue={onNavigateToIssue}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );
        
        // GanttBarNode renders the name + effort
        const issueNode = screen.getByText(/Issue 1/i);
        fireEvent.click(issueNode);

        expect(onNavigateToIssue).toHaveBeenCalledWith('e1');
    });

    it('navigates to value stream edit page when "Edit Parameters" is clicked', () => {
        const onNavigateToValueStreamEdit = vi.fn();
        const dataWithVS: ValueStreamData = {
            ...mockData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            valueStreams: [{ id: 'vs1', name: 'My VS', description: '', parameters: {} as any }]
        };

        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: dataWithVS, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                            data={dataWithVS}
                            currentValueStreamId="vs1"
                            onNavigateToValueStreamEdit={onNavigateToValueStreamEdit}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );


        const editBtn = screen.getByText('Edit Parameters');
        fireEvent.click(editBtn);

        expect(onNavigateToValueStreamEdit).toHaveBeenCalledWith('vs1');
    });

    it('triggers fit view on node right-click', async () => {
        const mockSetViewport = vi.fn();
        vi.mocked(useReactFlow).mockReturnValue({
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
            setViewport: mockSetViewport,
            getNodes: vi.fn(() => []),
            getEdges: vi.fn(() => []),
        } as never);

        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );

        const customerNode = screen.getByText('Customer 1');
        fireEvent.contextMenu(customerNode);

        // Should call handleFitView which eventually calls setViewport
        await waitFor(() => {
            expect(mockSetViewport).toHaveBeenCalled();
        }, { timeout: 1500 });
    });

    it('triggers fit view on pane right-click', async () => {
        const mockSetViewport = vi.fn();
        vi.mocked(useReactFlow).mockReturnValue({
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
            setViewport: mockSetViewport,
            getNodes: vi.fn(() => []),
            getEdges: vi.fn(() => []),
        } as never);

        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                    <ReactFlowProvider>
                        <ValueStream 
                            {...defaultProps}
                        />
                    </ReactFlowProvider>
                </ValueStreamProvider>
            </NotificationProvider>
        );

        const flowPane = screen.getByTestId('react-flow-pane');
        fireEvent.contextMenu(flowPane);
        
        await waitFor(() => {
            expect(mockSetViewport).toHaveBeenCalled();
        }, { timeout: 1500 });
    });
});



