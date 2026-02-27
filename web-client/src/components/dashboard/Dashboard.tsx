import React from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Panel, useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { parseISO, differenceInDays } from 'date-fns';
import '@xyflow/react/dist/style.css';

import { useGraphLayout } from '../../hooks/useGraphLayout';
import type { DashboardData, Customer, Feature, Team, Epic, Settings, DashboardViewState } from '../../types/models';
import { CustomerNode } from '../nodes/CustomerNode';
import { FeatureNode } from '../nodes/FeatureNode';
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
    featureNode: FeatureNode,
    teamNode: TeamNode,
    ganttBarNode: GanttBarNode,
    sprintCapacityNode: SprintCapacityNode,
    todayLineNode: TodayLineNode,
    headerNode: HeaderNode,
};

interface DashboardControlsProps {
    data: DashboardData | null;
    setViewState: React.Dispatch<React.SetStateAction<DashboardViewState>>;
}

const DashboardControls: React.FC<DashboardControlsProps> = ({ data, setViewState }) => {
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    const handleFitView = () => {
        // Shift sprint view logic copied from useEffect
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
        
        fitView({ padding: 0.2, duration: 800 });
    };

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
                title="Fit to View"
            >
                Fit View
            </button>
        </Panel>
    );
};

export interface DashboardProps {
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    updateFeature: (id: string, updates: Partial<Feature>) => void;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    addEpic: (epic: Epic) => void;
    updateSettings: (updates: Partial<Settings>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
    viewState: DashboardViewState;
    setViewState: React.Dispatch<React.SetStateAction<DashboardViewState>>;
    onNavigateToCustomer: (id: string) => void;
    onNavigateToFeature: (id: string) => void;
    onNavigateToTeam: (id: string) => void;
    onNavigateToEpic: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    data, loading, error,
    updateCustomer, updateFeature, updateTeam, updateEpic, addEpic, updateSettings,
    saveDashboardData, viewState, setViewState,
    onNavigateToCustomer,
    onNavigateToFeature,
    onNavigateToEpic,
    onNavigateToTeam
}) => {
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
    const [editingNode, setEditingNode] = React.useState<Node | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
    const [isDocsModalOpen, setIsDocsModalOpen] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isInitialOffsetSet, setIsInitialOffsetSet] = React.useState(false);

    // Initial sprint offset calculation
    React.useEffect(() => {
        if (data && data.sprints && data.sprints.length > 0 && !isInitialOffsetSet) {
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
                
                setViewState(s => ({ ...s, sprintOffset: targetOffset }));
            }
            setIsInitialOffsetSet(true);
        }
    }, [data, setViewState, isInitialOffsetSet]);

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

    const { nodes, edges } = useGraphLayout(
        data,
        hoveredNodeId,
        viewState.sprintOffset,
        viewState.customerFilter,
        viewState.featureFilter,
        viewState.teamFilter,
        viewState.epicFilter,
        viewState.showDependencies,
        viewState.minTcvFilter ? Number(viewState.minTcvFilter) : 0,
        viewState.minScoreFilter ? Number(viewState.minScoreFilter) : 0,
        viewState.selectedNodeId || null
    );

    const hoverTimeoutRef = React.useRef<number | null>(null);

    const onNodeMouseEnter = React.useCallback((_: React.MouseEvent, node: Node) => {
        if (['headerNode', 'sprintCapacityNode', 'todayLineNode'].includes(node.type || '')) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredNodeId(node.id);
    }, []);

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
        } else if (node.type === 'featureNode') {
            const featureId = node.id.replace('feature-', '');
            onNavigateToFeature(featureId);
        } else if (node.type === 'teamNode') {
            const teamId = node.id.replace('team-', '');
            onNavigateToTeam(teamId);
        } else if (node.type === 'ganttBarNode') {
            // epic id format is gantt-{id}
            const epicId = node.id.replace('gantt-', '');
            onNavigateToEpic(epicId);
        }
    }, [onNavigateToCustomer, onNavigateToFeature, onNavigateToTeam, onNavigateToEpic]);

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
                                onClick={() => onNavigateToFeature('new')}
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
                                + Add Feature
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
                        placeholder="Filter Features..."
                        value={viewState.featureFilter}
                        onChange={e => setViewState((s: DashboardViewState) => ({ ...s, featureFilter: e.target.value }))}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', width: '130px' }}
                    />
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
                <DashboardProvider value={{ updateEpic }}>
                    <ReactFlowProvider>
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
                            fitView={!viewState.viewport}
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.2}
                            maxZoom={1.5}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background color="#1a1a1a" variant={BackgroundVariant.Lines} gap={100} />
                            <DashboardControls data={data} setViewState={setViewState} />
                        </ReactFlow>
                    </ReactFlowProvider>
                </DashboardProvider>
            </div>

            {editingNode && (
                <EditNodeModal
                    node={editingNode}
                    onClose={() => setEditingNode(null)}
                    // Pass down update functions and the raw data to map IDs correctly
                    data={data}
                    onUpdateCustomer={updateCustomer}
                    onUpdateFeature={updateFeature}
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
