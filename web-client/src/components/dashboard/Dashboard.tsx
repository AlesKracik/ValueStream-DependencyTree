import React from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphLayout } from '../../hooks/useGraphLayout';
import type { DashboardData, Customer, Feature, Team, Epic, Settings } from '../../types/models';
import { CustomerNode } from '../nodes/CustomerNode';
import { FeatureNode } from '../nodes/FeatureNode';
import { TeamNode } from '../nodes/TeamNode';
import { GanttBarNode } from '../nodes/GanttBarNode';
import { SprintCapacityNode } from '../nodes/SprintCapacityNode';
import { TodayLineNode } from '../nodes/TodayLineNode';
import { EditNodeModal } from './EditNodeModal';
import { SettingsModal } from './SettingsModal';
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
};

export interface DashboardProps {
    data: DashboardData | null;
    loading: boolean;
    error: Error | null;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    updateFeature: (id: string, updates: Partial<Feature>) => void;
    updateTeam: (id: string, updates: Partial<Team>) => void;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    updateSettings: (updates: Partial<Settings>) => void;
    saveDashboardData: (data: DashboardData) => Promise<void>;
    onNavigateToCustomer: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    data, loading, error,
    updateCustomer, updateFeature, updateTeam, updateEpic, updateSettings,
    saveDashboardData, onNavigateToCustomer
}) => {
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
    const [editingNode, setEditingNode] = React.useState<Node | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
    const [sprintOffset, setSprintOffset] = React.useState(0);
    const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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

    // Column Filters
    const [customerFilter, setCustomerFilter] = React.useState('');
    const [featureFilter, setFeatureFilter] = React.useState('');
    const [teamFilter, setTeamFilter] = React.useState('');
    const [epicFilter, setEpicFilter] = React.useState('');
    const [showDependencies, setShowDependencies] = React.useState(false);

    const { nodes, edges } = useGraphLayout(data, hoveredNodeId, sprintOffset, customerFilter, featureFilter, teamFilter, epicFilter, showDependencies);

    const hoverTimeoutRef = React.useRef<number | null>(null);

    const onNodeMouseEnter = React.useCallback((_: React.MouseEvent, node: Node) => {
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

    const onNodeContextMenu = React.useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault(); // Prevent default browser context menu

        // Customer right-click modal is disabled in favor of dedicated page navigation
        if (['featureNode', 'teamNode', 'ganttBarNode', 'sprintCapacityNode'].includes(node.type || '')) {
            setEditingNode(node);
        }
    }, [data, updateTeam]);

    const onNodeClick = React.useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'customerNode') {
            const domainId = node.id.split('-').slice(1).join('-');
            onNavigateToCustomer(domainId);
        } else if (node.id === 'add-customer-btn') {
            onNavigateToCustomer('new');
        }
    }, [onNavigateToCustomer]);

    if (loading) return <div>Loading dashboard...</div>;
    if (error) return <div>Error loading data: {error.message}</div>;
    if (!data) return <div>No data available</div>;

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1>Value Stream Dashboard</h1>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setSprintOffset(Math.max(0, sprintOffset - 1))}
                                disabled={sprintOffset === 0}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: sprintOffset === 0 ? '#1f2937' : '#374151',
                                    border: '1px solid #4b5563',
                                    color: sprintOffset === 0 ? '#6b7280' : '#e5e7eb',
                                    borderRadius: '4px',
                                    cursor: sprintOffset === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                &lt;
                            </button>
                            <span style={{ color: '#9ca3af', fontSize: '14px', alignSelf: 'center', padding: '0 8px' }}>
                                Sprints
                            </span>
                            <button
                                onClick={() => setSprintOffset(sprintOffset + 1)}
                                disabled={!data || sprintOffset + 6 >= data.sprints.length}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: (!data || sprintOffset + 6 >= data.sprints.length) ? '#1f2937' : '#374151',
                                    border: '1px solid #4b5563',
                                    color: (!data || sprintOffset + 6 >= data.sprints.length) ? '#6b7280' : '#e5e7eb',
                                    borderRadius: '4px',
                                    cursor: (!data || sprintOffset + 6 >= data.sprints.length) ? 'not-allowed' : 'pointer',
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
                        value={customerFilter}
                        onChange={e => setCustomerFilter(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', minWidth: '180px' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter Features..."
                        value={featureFilter}
                        onChange={e => setFeatureFilter(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', minWidth: '180px' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter Teams..."
                        value={teamFilter}
                        onChange={e => setTeamFilter(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', minWidth: '180px' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter Epics..."
                        value={epicFilter}
                        onChange={e => setEpicFilter(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #4b5563', backgroundColor: '#374151', color: '#fff', fontSize: '13px', minWidth: '180px' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', color: '#cbd5e1', fontSize: '13px', marginLeft: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showDependencies}
                            onChange={e => setShowDependencies(e.target.checked)}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        Show Dependencies
                    </label>
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
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.2}
                            maxZoom={1.5}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background color="#1a1a1a" variant={BackgroundVariant.Lines} gap={100} />
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
                    onUpdateEpic={updateEpic}
                />
            )}

            {isSettingsModalOpen && (
                <SettingsModal
                    onClose={() => setIsSettingsModalOpen(false)}
                    settings={data.settings}
                    onUpdateSettings={updateSettings}
                />
            )}
        </div>
    );
};
