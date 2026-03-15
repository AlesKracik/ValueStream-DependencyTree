import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { ReactFlow, Panel, useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { parseISO, differenceInDays } from 'date-fns';
import '@xyflow/react/dist/style.css';

import { useGraphLayout } from '../../hooks/useGraphLayout';
import type { ValueStreamData, Customer, WorkItem, Team, ValueStreamViewState, ValueStreamParameters, Epic } from '../../types/models';
import { CustomerNode } from '../nodes/CustomerNode';
import { WorkItemNode } from '../nodes/WorkItemNode';
import { TeamNode } from '../nodes/TeamNode';
import { GanttBarNode } from '../nodes/GanttBarNode';
import { SprintCapacityNode } from '../nodes/SprintCapacityNode';
import { TodayLineNode } from '../nodes/TodayLineNode';
import { HeaderNode } from '../nodes/HeaderNode';
import { EditNodeModal } from './EditNodeModal';
import styles from './ValueStream.module.css';

// Register custom node types with React Flow
const nodeTypes = {
    customerNode: CustomerNode,
    workItemNode: WorkItemNode,
    teamNode: TeamNode,
    ganttBarNode: GanttBarNode,
    sprintCapacityNode: SprintCapacityNode,
    todayLineNode: TodayLineNode,
    headerNode: HeaderNode,
};

interface ValueStreamControlsProps {
    onFitView: () => void;
}

const ValueStreamControls: React.FC<ValueStreamControlsProps> = ({ onFitView }) => {
    const { zoomIn, zoomOut } = useReactFlow();

    return (
        <Panel position="bottom-right" style={{ display: 'flex', gap: '8px', padding: '12px', zIndex: 5 }}>
            <button 
                onClick={() => zoomIn()}
                className="btn-secondary"
                style={{ width: '32px', height: '32px', padding: 0, fontSize: '18px' }}
                title="Zoom In"
            >
                +
            </button>
            <button 
                onClick={() => zoomOut()}
                className="btn-secondary"
                style={{ width: '32px', height: '32px', padding: 0, fontSize: '18px' }}
                title="Zoom Out"
            >
                -
            </button>
            <button 
                onClick={onFitView}
                className="btn-secondary"
                style={{ height: '32px' }}
                title="Reset View to Top & Active Sprint"
            >
                Reset View
            </button>
        </Panel>
    );
};

export interface ValueStreamProps {
    data: ValueStreamData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
    updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
    updateTeam: (id: string, updates: Partial<Team>, immediate?: boolean) => Promise<void>;
    updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
    currentValueStreamId?: string;
    
    viewState: ValueStreamViewState;
    setViewState: React.Dispatch<React.SetStateAction<ValueStreamViewState>>;
    onNavigateToCustomer: (id: string) => void;
    onNavigateToWorkItem: (id: string) => void;
    onNavigateToTeam: (id: string) => void;
    onNavigateToEpic: (id: string) => void;
    onNavigateToSprint: (id: string) => void;
    onNavigateToValueStreamEdit: (id: string) => void;
}

export const ValueStream: React.FC<ValueStreamProps> = ({
    data, loading, error,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateCustomer, updateWorkItem, updateTeam, currentValueStreamId,
     viewState, setViewState,
    onNavigateToCustomer,
    onNavigateToWorkItem,
    onNavigateToEpic,
    onNavigateToTeam,
    onNavigateToSprint,
    onNavigateToValueStreamEdit
}) => {
    const { setViewport } = useReactFlow();
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [editingNode, setEditingNode] = useState<Node | null>(null);

    const currentValueStream = useMemo(() => 
        data?.valueStreams.find(d => d.id === currentValueStreamId),
    [data, currentValueStreamId]);
    
    const baseParams: ValueStreamParameters = useMemo(() => ({
        customerFilter: currentValueStream?.parameters?.customerFilter || '',
        workItemFilter: currentValueStream?.parameters?.workItemFilter || '',
        releasedFilter: currentValueStream?.parameters?.releasedFilter || 'all',
        minTcvFilter: currentValueStream?.parameters?.minTcvFilter || '',
        minScoreFilter: currentValueStream?.parameters?.minScoreFilter || '',
        teamFilter: currentValueStream?.parameters?.teamFilter || '',
        epicFilter: currentValueStream?.parameters?.epicFilter || '',
        startSprintId: currentValueStream?.parameters?.startSprintId || '',
        endSprintId: currentValueStream?.parameters?.endSprintId || ''
    }), [currentValueStream]);

    const { nodes, edges } = useGraphLayout(
        data,
        hoveredNodeId,
        viewState.sprintOffset,
        viewState.customerFilter,
        viewState.workItemFilter,
        viewState.releasedFilter,
        viewState.teamFilter,
        viewState.epicFilter,
        viewState.showDependencies,
        viewState.minTcvFilter ? Number(viewState.minTcvFilter) : 0,
        viewState.minScoreFilter ? Number(viewState.minScoreFilter) : 0,
        viewState.selectedNodeId || null,
        baseParams
    );

    const handleFitView = useCallback(() => {
        // Shift sprint view logic
        if (data && data.sprints && data.sprints.length > 0) {
            const today = new Date();
            let currentSprintIdx = -1;

            for (let i = 0; i < data.sprints.length; i++) {
                const start = parseISO(data.sprints[i].start_date);
                const end = parseISO(data.sprints[i].end_date);
                if (today >= start && today <= end) {
                    currentSprintIdx = i;
                    break;
                }
            }

            if (currentSprintIdx === -1 && today < parseISO(data.sprints[0].start_date)) {
                currentSprintIdx = 0;
            }

            if (currentSprintIdx !== -1) {
                const currentSprintStart = parseISO(data.sprints[currentSprintIdx].start_date);
                const daysSinceStart = differenceInDays(today, currentSprintStart);
                const targetOffset = daysSinceStart <= 2 ? Math.max(0, currentSprintIdx - 1) : currentSprintIdx;
                
                setViewState(s => ({ ...s, sprintOffset: targetOffset }));
            }
        }
        
        // Manual Viewport Calculation to "Show the Top"
        const nodesToFit = nodes.filter(n => 
            ['customerNode', 'workItemNode', 'teamNode', 'headerNode', 'sprintCapacityNode'].includes(n.type || '')
        );

        if (nodesToFit.length > 0) {
            // Calculate horizontal bounds
            const minX = nodesToFit.reduce((acc, n) => Math.min(acc, n.position.x), nodesToFit[0].position.x);
            const maxX = nodesToFit.reduce((acc, n) => Math.max(acc, n.position.x + (n.measured?.width || 220)), nodesToFit[0].position.x);
            const contentWidth = maxX - minX;

            const containerWidth = document.querySelector(`.${styles.flowWrapper}`)?.clientWidth || window.innerWidth;
            let targetZoom = (containerWidth * 0.9) / contentWidth;
            targetZoom = Math.min(Math.max(targetZoom, 0.3), 0.8); // allow zooming out slightly more if needed

            const contentCenterX = minX + (contentWidth / 2);
            const targetX = (containerWidth / 2) - (contentCenterX * targetZoom);
            const targetY = 20;
            setViewport({ x: targetX, y: targetY, zoom: targetZoom }, { duration: 800 });
        }
    }, [data, nodes, setViewState, setViewport]);

    // Initial sprint offset and viewport calculation
    useEffect(() => {
        if (!data || !data.sprints || data.sprints.length === 0 || viewState.isInitialOffsetSet || nodes.length === 0) return;

        const today = new Date();
        let currentSprintIdx = -1;

        // Find current sprint
        for (let i = 0; i < data.sprints.length; i++) {
            const start = parseISO(data.sprints[i].start_date);
            const end = parseISO(data.sprints[i].end_date);
            if (today >= start && today <= end) {
                currentSprintIdx = i;
                break;
            }
        }

        // If no current sprint found, but today is before first sprint, idx=0
        if (currentSprintIdx === -1 && today < parseISO(data.sprints[0].start_date)) {
            currentSprintIdx = 0;
        }

        if (currentSprintIdx !== -1) {
            const currentSprintStart = parseISO(data.sprints[currentSprintIdx].start_date);
            const daysSinceStart = differenceInDays(today, currentSprintStart);

            // If starting sprint (up to two days after start), show previous sprint
            const targetOffset = daysSinceStart <= 2 ? Math.max(0, currentSprintIdx - 1) : currentSprintIdx;
            
            // If the offset in viewState is not yet the targetOffset, update it first.
            // This will cause a re-render and nodes will be updated with the correct layout.
            if (viewState.sprintOffset !== targetOffset) {
                setViewState(s => ({ ...s, sprintOffset: targetOffset }));
                return; 
            }

            // Now offset is correct and nodes are stable.
            // Calculate and set viewport.
            const nodesToFit = nodes.filter(n => 
                ['customerNode', 'workItemNode', 'teamNode', 'headerNode', 'sprintCapacityNode'].includes(n.type || '')
            );

            if (nodesToFit.length > 0) {
                const minX = Math.min(...nodesToFit.map(n => n.position.x));
                const maxX = Math.max(...nodesToFit.map(n => n.position.x + (n.measured?.width || 220)));
                const contentWidth = maxX - minX;

                const containerWidth = document.querySelector(`.${styles.flowWrapper}`)?.clientWidth || window.innerWidth;
                let targetZoom = (containerWidth * 0.9) / contentWidth;
                targetZoom = Math.min(Math.max(targetZoom, 0.3), 0.8);

                const contentCenterX = minX + (contentWidth / 2);
                const targetX = (containerWidth / 2) - (contentCenterX * targetZoom);
                const targetY = 20;

                // Set immediately without duration for initial load
                setViewport({ x: targetX, y: targetY, zoom: targetZoom });
                setViewState(s => ({ ...s, isInitialOffsetSet: true }));
            }
        }
    }, [data, setViewState, viewState.isInitialOffsetSet, nodes, setViewport, viewState.sprintOffset]);

    const hoverTimeoutRef = useRef<number | null>(null);

    const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
        if (viewState.disableHoverHighlight) return;
        if (['headerNode', 'sprintCapacityNode', 'todayLineNode'].includes(node.type || '')) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredNodeId(node.id);
    }, [viewState.disableHoverHighlight]);

    const onNodeMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = window.setTimeout(() => {
            setHoveredNodeId(null);
        }, 50);
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.type === 'customerNode') {
            const customerId = node.id.replace('customer-', '');
            onNavigateToCustomer(customerId);
        } else if (node.type === 'workItemNode') {
            const workItemId = node.id.replace('workitem-', '');
            onNavigateToWorkItem(workItemId);
        } else if (node.type === 'teamNode') {
            const teamId = node.id.replace('team-', '');
            onNavigateToTeam(teamId);
        } else if (node.type === 'ganttBarNode') {
            // epic id format is gantt-{id}
            const epicId = node.id.replace('gantt-', '');
            onNavigateToEpic(epicId);
        } else if (node.type === 'sprintCapacityNode') {
            // Navigate to the team page for editing overrides
            const teamId = node.data.teamId as string;
            if (teamId) {
                onNavigateToTeam(teamId);
            } else {
                onNavigateToSprint('list');
            }
        }
    }, [onNavigateToCustomer, onNavigateToWorkItem, onNavigateToTeam, onNavigateToEpic, onNavigateToSprint]);

    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            // Don't show modal for static layout elements
            if (['sprintCapacityNode', 'todayLineNode'].includes(node.type || '')) return;
            
            setViewState(s => {
                // If it's already selected, clear the selection (unfilter)
                if (s.selectedNodeId === node.id) {
                    return { ...s, selectedNodeId: null };
                }
                // Otherwise set the new selection
                return { ...s, selectedNodeId: node.id };
            });

            // Trigger reset view after a small delay to allow nodes to update
            setTimeout(() => {
                handleFitView();
            }, 50);
        },
        [setViewState, handleFitView]
    );

    const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        handleFitView();
    }, [handleFitView]);

    const [localFilters, setLocalFilters] = useState({
        customerFilter: viewState.customerFilter,
        workItemFilter: viewState.workItemFilter,
        teamFilter: viewState.teamFilter,
        epicFilter: viewState.epicFilter,
        minTcvFilter: viewState.minTcvFilter,
        minScoreFilter: viewState.minScoreFilter
    });

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalFilters({
            customerFilter: viewState.customerFilter,
            workItemFilter: viewState.workItemFilter,
            teamFilter: viewState.teamFilter,
            epicFilter: viewState.epicFilter,
            minTcvFilter: viewState.minTcvFilter,
            minScoreFilter: viewState.minScoreFilter
        });
    }, [
        viewState.customerFilter,
        viewState.workItemFilter,
        viewState.teamFilter,
        viewState.epicFilter,
        viewState.minTcvFilter,
        viewState.minScoreFilter
    ]);

    // Debounce effect to update global viewState
    useEffect(() => {
        const timer = setTimeout(() => {
            setViewState(s => ({
                ...s,
                ...localFilters
            }));
        }, 500);
        return () => clearTimeout(timer);
    }, [localFilters, setViewState]);

    const handleFilterChange = (key: string, value: string) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    if (loading && !data) return <div>Loading ValueStream...</div>;
    if (error) return <div>Error loading data: {error.message}</div>;
    if (!data && !loading) return <div>No data available</div>;

    return (
        <div className={styles.ValueStreamContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <h1>Value Stream</h1>
                        {loading && (
                            <div className={styles.loadingSpinner} title="Updating data..." />
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setViewState(s => ({ ...s, sprintOffset: Math.max(0, s.sprintOffset - 1) }))}
                                disabled={viewState.sprintOffset === 0}
                                className="btn-secondary"
                                style={{
                                    padding: '8px 12px',
                                    height: '37px'
                                }}
                            >
                                &lt;
                            </button>
                            <span style={{ color: 'var(--text-muted)', fontSize: '14px', alignSelf: 'center', padding: '0 8px' }}>
                                Sprints
                            </span>
                            <button
                                onClick={() => setViewState(s => ({ ...s, sprintOffset: s.sprintOffset + 1 }))}
                                disabled={!data || viewState.sprintOffset + 6 >= data.sprints.length}
                                className="btn-secondary"
                                style={{
                                    padding: '8px 12px',
                                    height: '37px'
                                }}
                            >
                                &gt;
                            </button>
                        </div>
                        {currentValueStreamId && (
                            <button
                                onClick={() => onNavigateToValueStreamEdit(currentValueStreamId)}
                                className="btn-primary"
                                style={{ height: '37px', padding: '0 12px', fontSize: '13px' }}
                            >
                                Edit Parameters
                            </button>
                        )}
                    </div>
                </div>
                <div className={styles.filterBar}>
                    {/* Text Search Group */}
                    <div className={styles.filterGroup}>
                        <label>Search</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <input
                                type="text"
                                placeholder="Customers..."
                                value={localFilters.customerFilter}
                                onChange={e => handleFilterChange('customerFilter', e.target.value)}
                                style={{ width: '140px' }}
                            />
                            <input
                                type="text"
                                placeholder="Work Items..."
                                value={localFilters.workItemFilter}
                                onChange={e => handleFilterChange('workItemFilter', e.target.value)}
                                style={{ width: '140px' }}
                            />
                            <input
                                type="text"
                                placeholder="Teams..."
                                value={localFilters.teamFilter}
                                onChange={e => handleFilterChange('teamFilter', e.target.value)}
                                style={{ width: '120px' }}
                            />
                            <input
                                type="text"
                                placeholder="Epics..."
                                value={localFilters.epicFilter}
                                onChange={e => handleFilterChange('epicFilter', e.target.value)}
                                style={{ width: '120px' }}
                            />
                        </div>
                    </div>

                    {/* Status & Metrics Group */}
                    <div className={styles.filterGroup}>
                        <label>Status & Metrics</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <select
                                value={viewState.releasedFilter}
                                onChange={e => setViewState((s: ValueStreamViewState) => ({ ...s, releasedFilter: e.target.value as 'all' | 'released' | 'unreleased' }))}
                                style={{ width: '150px' }}
                            >
                                <option value="all">Release: All</option>
                                <option value="released">Release: Yes</option>
                                <option value="unreleased">Release: No</option>
                            </select>
                            
                            <input
                                type="number"
                                placeholder="Min TCV"
                                value={viewState.minTcvFilter}
                                onChange={e => setViewState(s => ({ ...s, minTcvFilter: e.target.value }))}
                                style={{ width: '100px' }}
                                min="0"
                            />
                            
                            <input
                                type="number"
                                placeholder="Min Score"
                                value={viewState.minScoreFilter}
                                onChange={e => setViewState(s => ({ ...s, minScoreFilter: e.target.value }))}
                                style={{ width: '100px' }}
                                min="0"
                                step="0.1"
                            />
                        </div>
                    </div>

                    {/* Visualization Toggles */}
                    <div className={styles.filterGroup}>
                        <label>Visualization</label>
                        <div className={styles.toggleGroup}>
                            <label className={styles.toggleItem}>
                                <input
                                    type="checkbox"
                                    checked={viewState.showDependencies}
                                    onChange={e => setViewState((s: ValueStreamViewState) => ({ ...s, showDependencies: e.target.checked }))}
                                />
                                Show Dependencies
                            </label>
                            <label className={styles.toggleItem}>
                                <input
                                    type="checkbox"
                                    checked={viewState.disableHoverHighlight}
                                    onChange={e => setViewState((s: ValueStreamViewState) => ({ ...s, disableHoverHighlight: e.target.checked }))}
                                />
                                Disable Hover Highlight
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.flowWrapper}>
                <ReactFlow
                    data-testid="react-flow-pane"
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onNodeContextMenu={onNodeContextMenu}
                    onPaneContextMenu={onPaneContextMenu as any}
                    onNodeClick={onNodeClick}
                    onMoveEnd={(_, viewport) => {
                        setViewState(s => ({ ...s, viewport }));
                    }}
                    defaultViewport={viewState.viewport}
                    fitView={false}
                    minZoom={0.2}
                    maxZoom={1.5}
                    proOptions={{ hideAttribution: true }}
                >
                    <ValueStreamControls onFitView={handleFitView} />
                </ReactFlow>
            </div>

            {editingNode && data && (
                <EditNodeModal
                    node={editingNode}
                    onClose={() => setEditingNode(null)}
                    // Pass down update functions and the raw data to map IDs correctly
                    data={data}
                    onUpdateCustomer={updateCustomer}
                    onUpdateWorkItem={updateWorkItem}
                    onUpdateTeam={updateTeam}
                />
            )}
        </div>
    );
};
