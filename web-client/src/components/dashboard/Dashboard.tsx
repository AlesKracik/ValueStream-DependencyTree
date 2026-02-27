import React from 'react';
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { parseISO, differenceInDays } from 'date-fns';
import '@xyflow/react/dist/style.css';

import { useGraphLayout } from '../../hooks/useGraphLayout';
import type { DashboardData, Customer, WorkItem, Team, Epic, Settings, DashboardViewState } from '../../types/models';
import { CustomerNode } from '../nodes/CustomerNode';
import { WorkItemNode } from '../nodes/WorkItemNode';
import { TeamNode } from '../nodes/TeamNode';
import { GanttBarNode } from '../nodes/GanttBarNode';
import { SprintCapacityNode } from '../nodes/SprintCapacityNode';
import { TodayLineNode } from '../nodes/TodayLineNode';
import { HeaderNode } from '../nodes/HeaderNode';
import { EditNodeModal } from './EditNodeModal';
import { SettingsModal } from './SettingsModal';
import { DocumentationModal } from './DocumentationModal';
import { DashboardProvider } from '../../contexts/DashboardContext';
import styles from './Dashboard.module.css';

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

interface DashboardControlsProps {
    data: DashboardData | null;
    nodes: Node[];
    setViewState: React.Dispatch<React.SetStateAction<DashboardViewState>>;
}

const DashboardControls: React.FC<DashboardControlsProps> = ({ data, nodes, setViewState }) => {
    const { zoomIn, zoomOut, setViewport } = useReactFlow();

    const handleFitView = React.useCallback(() => {
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
            const minX = Math.min(...nodesToFit.map(n => n.position.x));
            const maxX = Math.max(...nodesToFit.map(n => n.position.x + (n.measured?.width || 220)));
            const contentWidth = maxX - minX;

            const containerWidth = window.innerWidth;
            let targetZoom = (containerWidth * 0.9) / contentWidth;
            targetZoom = Math.min(Math.max(targetZoom, 0.5), 0.8);

            const contentCenterX = minX + (contentWidth / 2);
            const targetX = (containerWidth / 2) - (contentCenterX * targetZoom);
            const targetY = 60;

            setViewport({ x: targetX, y: targetY, zoom: targetZoom }, { duration: 800 });
        }
    }, [data, nodes, setViewState, setViewport]);

    return (
        <Panel position="bottom-right" style={{ display: 'flex', gap: '8px', padding: '12px', zIndex: 5 }}>
            <button 
                onClick={() => zoomIn()}
                style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: '#374151', color: '#e5e7eb', border: '1px solid #4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}
                title="Zoom In"
            >
                +
            </button>
            <button 
                onClick={() => zoomOut()}
                style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: '#374151', color: '#e5e7eb', border: '1px solid #4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}
                title="Zoom Out"
            >
                -
            </button>
            <button 
                onClick={handleFitView}
                style={{ padding: '0 12px', height: '32px', borderRadius: '4px', backgroundColor: '#374151', color: '#e5e7eb', border: '1px solid #4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}
                title="Reset View to Top & Active Sprint"
            >
                Reset View
            </button>
        </Panel>
    );
};

export interface DashboardProps {
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    updateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    addEpic: (epic: Epic) => void;
    updateSettings: (updates: Partial<Settings>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
    viewState: DashboardViewState;
    setViewState: React.Dispatch<React.SetStateAction<DashboardViewState>>;
    onNavigateToCustomer: (id: string) => void;
    onNavigateToWorkItem: (id: string) => void;
    onNavigateToTeam: (id: string) => void;
    onNavigateToEpic: (id: string) => void;
    onNavigateToSprint: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    data, loading, error,
    updateCustomer, updateWorkItem, updateTeam, updateEpic, addEpic, updateSettings,
    saveDashboardData, viewState, setViewState,
    onNavigateToCustomer,
    onNavigateToWorkItem,
    onNavigateToEpic,
    onNavigateToTeam,
    onNavigateToSprint
}) => {
    const { setViewport } = useReactFlow();
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
    const [editingNode, setEditingNode] = React.useState<Node | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
    const [isDocsModalOpen, setIsDocsModalOpen] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
        viewState.selectedNodeId || null
    );

    // Initial sprint offset and viewport calculation
    React.useEffect(() => {
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

                const containerWidth = window.innerWidth;
                let targetZoom = (containerWidth * 0.9) / contentWidth;
                targetZoom = Math.min(Math.max(targetZoom, 0.5), 0.8);

                const contentCenterX = minX + (contentWidth / 2);
                const targetX = (containerWidth / 2) - (contentCenterX * targetZoom);
                const targetY = 60;

                // Set immediately without duration for initial load
                setViewport({ x: targetX, y: targetY, zoom: targetZoom });
                setViewState(s => ({ ...s, isInitialOffsetSet: true }));
            }
        }
    }, [data, setViewState, viewState.isInitialOffsetSet, nodes, setViewport, viewState.sprintOffset]);

    const handleSave = async () => {
        if (!data) return;
        setSaveStatus('saving');
        try {
            await saveDashboardData(data);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to save data:', err);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleUpdateSettings = async (updates: Partial<Settings>) => {
        updateSettings(updates); // update in-memory
        if (data) {
            const newData = { ...data, settings: { ...data.settings, ...updates } };
            setSaveStatus('saving');
            try {
                await saveDashboardData(newData);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            } catch (err) {
                console.error('Failed to save settings:', err);
                setSaveStatus('error');
                setTimeout(() => setSaveStatus('idle'), 3000);
            }
        }
    };

    const hoverTimeoutRef = React.useRef<number | null>(null);

    const onNodeMouseEnter = React.useCallback((_: React.MouseEvent, node: Node) => {
        if (viewState.disableHoverHighlight) return;
        if (['headerNode', 'sprintCapacityNode', 'todayLineNode'].includes(node.type || '')) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredNodeId(node.id);
    }, [viewState.disableHoverHighlight]);

    const onNodeMouseLeave = React.useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = window.setTimeout(() => {
            setHoveredNodeId(null);
        }, 50);
    }, []);

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

    const onNodeClick = React.useCallback((_: React.MouseEvent, node: Node) => {
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
            // sprint-cap-{teamId}-{sprintId}
            const parts = node.id.split('-');
            const sprintId = parts[parts.length - 1];
            onNavigateToSprint(sprintId);
        }
    }, [onNavigateToCustomer, onNavigateToWorkItem, onNavigateToTeam, onNavigateToEpic, onNavigateToSprint]);

    const onNodeContextMenu = React.useCallback(
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
        },
        [setViewState]
    );

    if (loading) return <div>Loading dashboard...</div>;
    if (error) return <div>Error loading data: {error.message}</div>;
    if (!data) return <div>No data available</div>;

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <h1>Value Stream Dashboard</h1>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => onNavigateToCustomer('new')}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#3b82f6',
                                    border: '1px solid #2563eb',
                                    color: '#ffffff',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                + Add Customer
                            </button>
                            <button
                                onClick={() => onNavigateToWorkItem('new')}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#3b82f6',
                                    border: '1px solid #2563eb',
                                    color: '#ffffff',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                + Add Work Item
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setViewState(s => ({ ...s, sprintOffset: Math.max(0, s.sprintOffset - 1) }))}
                                disabled={viewState.sprintOffset === 0}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: viewState.sprintOffset === 0 ? '#1f2937' : '#374151',
                                    border: '1px solid #4b5563',
                                    color: viewState.sprintOffset === 0 ? '#6b7280' : '#e5e7eb',
                                    borderRadius: '4px',
                                    cursor: viewState.sprintOffset === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                &lt;
                            </button>
                            <span style={{ color: '#9ca3af', fontSize: '14px', alignSelf: 'center', padding: '0 8px' }}>
                                Sprints
                            </span>
                            <button
                                onClick={() => setViewState(s => ({ ...s, sprintOffset: s.sprintOffset + 1 }))}
                                disabled={!data || viewState.sprintOffset + 6 >= data.sprints.length}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: (!data || viewState.sprintOffset + 6 >= data.sprints.length) ? '#1f2937' : '#374151',
                                    border: '1px solid #4b5563',
                                    color: (!data || viewState.sprintOffset + 6 >= data.sprints.length) ? '#6b7280' : '#e5e7eb',
                                    borderRadius: '4px',
                                    cursor: (!data || viewState.sprintOffset + 6 >= data.sprints.length) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                &gt;
                            </button>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saveStatus === 'saving'}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
                                border: '1px solid ' + (saveStatus === 'saved' ? '#059669' : saveStatus === 'error' ? '#b91c1c' : '#2563eb'),
                                color: '#ffffff',
                                borderRadius: '4px',
                                cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}
                        >
                            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error!' : 'Save Changes'}
                        </button>
                        <button
                            onClick={() => setIsDocsModalOpen(true)}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#374151',
                                border: '1px solid #4b5563',
                                color: '#e5e7eb',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            📖 Documentation
                        </button>
                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#374151',
                                border: '1px solid #4b5563',
                                color: '#e5e7eb',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            ⚙️ Settings
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                    <input
                        type="text"
                        placeholder="Filter Customers..."
                        value={viewState.customerFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, customerFilter: e.target.value }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '130px' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter Work Items..."
                        value={viewState.workItemFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, workItemFilter: e.target.value }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '130px' }}
                    />
                    <select
                        value={viewState.releasedFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, releasedFilter: e.target.value as any }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '110px' }}
                    >
                        <option value="all">All Release</option>
                        <option value="released">Released</option>
                        <option value="unreleased">Unreleased</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Filter Teams..."
                        value={viewState.teamFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, teamFilter: e.target.value }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '110px' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter Epics..."
                        value={viewState.epicFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, epicFilter: e.target.value }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '110px' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', fontSize: '13px', marginLeft: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={viewState.showDependencies}
                            onChange={e => setViewState((s: DashboardViewState) => ({ ...s, showDependencies: e.target.checked }))}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        Show Dependencies
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', fontSize: '13px', marginLeft: '16px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={viewState.disableHoverHighlight}
                            onChange={e => setViewState((s: DashboardViewState) => ({ ...s, disableHoverHighlight: e.target.checked }))}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        Disable Hover Highlight
                    </label>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
                        <label style={{ color: '#9ca3af', fontSize: '13px' }}>Min TCV:</label>
                        <input
                            type="number"
                            placeholder="0"
                            value={viewState.minTcvFilter}
                            onChange={e => setViewState(s => ({ ...s, minTcvFilter: e.target.value }))}
                            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                            min="0"
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
                        <label style={{ color: '#9ca3af', fontSize: '13px' }}>Min Score:</label>
                        <input
                            type="number"
                            placeholder="0"
                            value={viewState.minScoreFilter}
                            onChange={e => setViewState(s => ({ ...s, minScoreFilter: e.target.value }))}
                            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                            min="0"
                            step="0.1"
                        />
                    </div>
                </div>
            </div>

            <div className={styles.flowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onNodeContextMenu={onNodeContextMenu}
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
                    <Background color="#1a1a1a" variant={BackgroundVariant.Lines} gap={100} />
                    <DashboardControls data={data} nodes={nodes} setViewState={setViewState} />
                </ReactFlow>
            </div>

            {editingNode && (
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

            {isSettingsModalOpen && (
                <SettingsModal
                    onClose={() => setIsSettingsModalOpen(false)}
                    settings={data.settings}
                    onUpdateSettings={handleUpdateSettings}
                    data={data}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            )}

            {isDocsModalOpen && (
                <DocumentationModal onClose={() => setIsDocsModalOpen(false)} />
            )}
        </div>
    );
};
