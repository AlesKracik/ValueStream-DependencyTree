import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { ReactFlow, Panel, useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { parseISO, differenceInDays } from 'date-fns';
import '@xyflow/react/dist/style.css';

import { useGraphLayout, type DashboardFilters } from '../../hooks/useGraphLayout';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import type { ValueStreamData, Customer, WorkItem, Team, ValueStreamViewState, ValueStreamParameters, Issue } from '@valuestream/shared-types';
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
    updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
    currentValueStreamId?: string;
    
    viewState: ValueStreamViewState;
    setViewState: React.Dispatch<React.SetStateAction<ValueStreamViewState>>;
    onNavigateToCustomer: (id: string) => void;
    onNavigateToWorkItem: (id: string) => void;
    onNavigateToTeam: (id: string) => void;
    onNavigateToIssue: (id: string) => void;
    onNavigateToSprint: (id: string) => void;
    onNavigateToValueStreamEdit: (id: string) => void;
}

export const ValueStream: React.FC<ValueStreamProps> = ({
    data, loading, error,
    updateCustomer, updateWorkItem, updateTeam, currentValueStreamId,
     viewState, setViewState,
    onNavigateToCustomer,
    onNavigateToWorkItem,
    onNavigateToIssue,
    onNavigateToTeam,
    onNavigateToSprint,
    onNavigateToValueStreamEdit
}) => {
    const { setViewport } = useReactFlow();
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [editingNode, setEditingNode] = useState<Node | null>(null);
    const [flowReady, setFlowReady] = useState(false);

    const currentValueStream = useMemo(() => 
        data?.valueStreams.find(d => d.id === currentValueStreamId),
    [data, currentValueStreamId]);
    
    const baseParams: ValueStreamParameters = useMemo(() => {
        // Hierarchy: prefer the new array fields, fall back to the legacy
        // singular fields so saved value-streams created before the multi-
        // select rollout keep working without a migration.
        const p = currentValueStream?.parameters;
        const parentIds = (p?.parentIds && p.parentIds.length > 0)
            ? p.parentIds
            : (p?.parentId ? [p.parentId] : []);
        const subtreeOfIds = (p?.subtreeOfIds && p.subtreeOfIds.length > 0)
            ? p.subtreeOfIds
            : (p?.subtreeOf ? [p.subtreeOf] : []);
        return {
            customerFilter: p?.customerFilter || '',
            workItemFilter: p?.workItemFilter || '',
            releasedFilter: p?.releasedFilter || 'all',
            minTcvFilter: p?.minTcvFilter || '',
            minScoreFilter: p?.minScoreFilter || '',
            teamFilter: p?.teamFilter || '',
            issueFilter: p?.issueFilter || '',
            startSprintId: p?.startSprintId || '',
            endSprintId: p?.endSprintId || '',
            parentIds,
            subtreeOfIds,
            rootsOnly: p?.rootsOnly || false,
        };
    }, [currentValueStream]);

    // Pack the new WorkItems-list-style filters into a single object so the
    // useGraphLayout signature stays manageable. NaN means "no bound" — the
    // hook treats !Number.isFinite as unset.
    const dashboardFilters = useMemo<DashboardFilters>(() => {
        const num = (s: string | undefined): number => (s !== undefined && s !== '' ? Number(s) : NaN);
        return {
            maxTcv: num(viewState.maxTcvFilter),
            minPriority: num(viewState.minPriorityFilter),
            maxPriority: num(viewState.maxPriorityFilter),
            minEffort: num(viewState.minEffortFilter),
            maxEffort: num(viewState.maxEffortFilter),
            statuses: viewState.statusFilter,
            releasedSprintIds: viewState.releasedSprintIds,
            priorityMetric: viewState.prioritizationMetric,
            parentIds: viewState.parentIds,
            subtreeOfIds: viewState.subtreeOfIds,
            rootsOnly: viewState.rootsOnly,
        };
    }, [
        viewState.maxTcvFilter,
        viewState.minPriorityFilter, viewState.maxPriorityFilter,
        viewState.minEffortFilter, viewState.maxEffortFilter,
        viewState.statusFilter, viewState.releasedSprintIds,
        viewState.prioritizationMetric,
        viewState.parentIds, viewState.subtreeOfIds, viewState.rootsOnly,
    ]);

    const { nodes, edges } = useGraphLayout(
        data,
        hoveredNodeId,
        viewState.sprintOffset,
        viewState.customerFilter,
        viewState.workItemFilter,
        viewState.releasedFilter,
        viewState.teamFilter,
        viewState.issueFilter,
        viewState.showDependencies,
        viewState.minTcvFilter ? Number(viewState.minTcvFilter) : 0,
        viewState.minScoreFilter ? Number(viewState.minScoreFilter) : 0,
        viewState.selectedNodeId || null,
        baseParams,
        viewState.prioritizationMetric,
        dashboardFilters
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

    // On initial load (or browser refresh), call reset view once flow and data are ready
    useEffect(() => {
        if (!flowReady || !data || nodes.length === 0 || viewState.isInitialOffsetSet) return;

        setViewState(s => ({ ...s, isInitialOffsetSet: true }));
        // Small delay to ensure ReactFlow has rendered the nodes before calculating viewport
        setTimeout(() => handleFitView(), 50);
    }, [flowReady, data, nodes, viewState.isInitialOffsetSet, setViewState, handleFitView]);

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
            // issue id format is gantt-{id}
            const issueId = node.id.replace('gantt-', '');
            onNavigateToIssue(issueId);
        } else if (node.type === 'sprintCapacityNode') {
            // Navigate to the team page for editing overrides
            const teamId = node.data.teamId as string;
            if (teamId) {
                onNavigateToTeam(teamId);
            } else {
                onNavigateToSprint('list');
            }
        }
    }, [onNavigateToCustomer, onNavigateToWorkItem, onNavigateToTeam, onNavigateToIssue, onNavigateToSprint]);

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

    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
        event.preventDefault();
        handleFitView();
    }, [handleFitView]);

    // localFilters holds the debounced text + numeric inputs. Every value the
    // user types into a free-text or range input is staged here first, then
    // pushed to viewState 500ms after the last keystroke. Multi-selects (status,
    // released sprints) and the metric toggle update viewState directly.
    type LocalFilters = {
        customerFilter: string;
        workItemFilter: string;
        teamFilter: string;
        issueFilter: string;
        minTcvFilter: string;
        maxTcvFilter: string;
        minPriorityFilter: string;
        maxPriorityFilter: string;
        minEffortFilter: string;
        maxEffortFilter: string;
    };
    const [localFilters, setLocalFilters] = useState<LocalFilters>(() => ({
        customerFilter: viewState.customerFilter,
        workItemFilter: viewState.workItemFilter,
        teamFilter: viewState.teamFilter,
        issueFilter: viewState.issueFilter,
        minTcvFilter: viewState.minTcvFilter,
        maxTcvFilter: viewState.maxTcvFilter ?? '',
        minPriorityFilter: viewState.minPriorityFilter ?? '',
        maxPriorityFilter: viewState.maxPriorityFilter ?? '',
        minEffortFilter: viewState.minEffortFilter ?? '',
        maxEffortFilter: viewState.maxEffortFilter ?? '',
    }));

    useEffect(() => {
        // Sync local (debounced) state from external viewState changes — e.g. when
        // a saved value-stream parameter set is loaded.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalFilters({
            customerFilter: viewState.customerFilter,
            workItemFilter: viewState.workItemFilter,
            teamFilter: viewState.teamFilter,
            issueFilter: viewState.issueFilter,
            minTcvFilter: viewState.minTcvFilter,
            maxTcvFilter: viewState.maxTcvFilter ?? '',
            minPriorityFilter: viewState.minPriorityFilter ?? '',
            maxPriorityFilter: viewState.maxPriorityFilter ?? '',
            minEffortFilter: viewState.minEffortFilter ?? '',
            maxEffortFilter: viewState.maxEffortFilter ?? '',
        });
    }, [
        viewState.customerFilter,
        viewState.workItemFilter,
        viewState.teamFilter,
        viewState.issueFilter,
        viewState.minTcvFilter,
        viewState.maxTcvFilter,
        viewState.minPriorityFilter,
        viewState.maxPriorityFilter,
        viewState.minEffortFilter,
        viewState.maxEffortFilter,
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

    const handleFilterChange = (key: keyof LocalFilters, value: string) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const setStatusFilter = (next: string[]) => {
        setViewState(s => ({ ...s, statusFilter: next.length > 0 ? next : undefined }));
    };
    const setReleasedSprintFilter = (next: string[]) => {
        setViewState(s => ({ ...s, releasedSprintIds: next.length > 0 ? next : undefined }));
    };

    // Hierarchy filter helpers — mirror the WorkItems list page contract.
    // `rootsOnly` is mutually exclusive with parentIds/subtreeOfIds; setting
    // one clears the others so the merge with saved baseParams stays clean.
    const setHierarchyParents = (ids: string[], scope: 'direct' | 'subtree') => {
        const clean = ids.filter(Boolean);
        setViewState(s => ({
            ...s,
            parentIds: clean.length > 0 && scope === 'direct' ? clean : undefined,
            subtreeOfIds: clean.length > 0 && scope === 'subtree' ? clean : undefined,
            rootsOnly: undefined,
        }));
    };
    const liveParentIds = (viewState.parentIds && viewState.parentIds.length > 0)
        ? viewState.parentIds
        : (viewState.subtreeOfIds || []);
    const liveParentScope: 'direct' | 'subtree' = (viewState.subtreeOfIds && viewState.subtreeOfIds.length > 0) ? 'subtree' : 'direct';
    const sortedWorkItemsForPicker = useMemo(
        () => (data?.workItems ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(w => ({ value: w.id, label: w.name })),
        [data?.workItems],
    );

    // Multi-select options that depend on data come from the loaded sprints.
    const releasedOptions = useMemo(() => {
        const sprints = (data?.sprints || []).filter(s => !s.is_archived);
        return [
            { value: 'unreleased', label: 'Unreleased' },
            ...sprints.map(s => ({ value: s.id, label: s.name })),
        ];
    }, [data]);

    const STATUS_OPTIONS = [
        { value: 'Backlog', label: 'Backlog' },
        { value: 'Planning', label: 'Planning' },
        { value: 'Development', label: 'Development' },
        { value: 'Done', label: 'Done' },
    ];

    const METRIC_LABEL: Record<ValueStreamViewState['prioritizationMetric'], string> = {
        score: 'Score',
        aha_score: 'Product Value',
        stackrank: 'Stack Rank',
    };

    // Count active *filters* (not visualization toggles) so the user can tell at a glance
    // whether the diagram is filtered while the bar is collapsed.
    const activeFilterCount =
        (viewState.customerFilter ? 1 : 0) +
        (viewState.workItemFilter ? 1 : 0) +
        (viewState.teamFilter ? 1 : 0) +
        (viewState.issueFilter ? 1 : 0) +
        (viewState.releasedFilter !== 'all' ? 1 : 0) +
        (viewState.releasedSprintIds && viewState.releasedSprintIds.length > 0 ? 1 : 0) +
        (viewState.statusFilter && viewState.statusFilter.length > 0 ? 1 : 0) +
        (viewState.minTcvFilter || viewState.maxTcvFilter ? 1 : 0) +
        (viewState.minPriorityFilter || viewState.maxPriorityFilter ? 1 : 0) +
        (viewState.minEffortFilter || viewState.maxEffortFilter ? 1 : 0);

    if (loading && !data) return <div>Loading ValueStream...</div>;
    if (error) return <div>Error loading data: {error.message}</div>;
    if (!data && !loading) return <div>No data available</div>;

    return (
        <div className={styles.ValueStreamContainer}>
            <div className={styles.header} style={{ position: 'relative' }}>
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
                {!viewState.filtersCollapsed ? (
                <div id="value-stream-filter-bar" className={styles.filterBar}>
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
                                placeholder="Issues..."
                                value={localFilters.issueFilter}
                                onChange={e => handleFilterChange('issueFilter', e.target.value)}
                                style={{ width: '120px' }}
                            />
                        </div>
                    </div>

                    {/*
                      Work-item filters mirroring the WorkItems list page:
                      Priority / Effort / Score / TCV ranges, plus Status and
                      Released multi-selects. Each range is a min–max pair; the
                      Priority range targets the field selected by the metric
                      toggle (in the Visualization group).
                    */}
                    <div className={styles.filterGroup}>
                        <label>{METRIC_LABEL[viewState.prioritizationMetric]}</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input aria-label={`Min ${METRIC_LABEL[viewState.prioritizationMetric]}`}
                                type="number" placeholder="min"
                                value={localFilters.minPriorityFilter}
                                onChange={e => handleFilterChange('minPriorityFilter', e.target.value)}
                                style={{ width: '90px' }} />
                            <span style={{ color: 'var(--text-muted)' }}>–</span>
                            <input aria-label={`Max ${METRIC_LABEL[viewState.prioritizationMetric]}`}
                                type="number" placeholder="max"
                                value={localFilters.maxPriorityFilter}
                                onChange={e => handleFilterChange('maxPriorityFilter', e.target.value)}
                                style={{ width: '90px' }} />
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Effort (MDs)</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input aria-label="Min effort" type="number" placeholder="min"
                                value={localFilters.minEffortFilter}
                                onChange={e => handleFilterChange('minEffortFilter', e.target.value)}
                                style={{ width: '90px' }} />
                            <span style={{ color: 'var(--text-muted)' }}>–</span>
                            <input aria-label="Max effort" type="number" placeholder="max"
                                value={localFilters.maxEffortFilter}
                                onChange={e => handleFilterChange('maxEffortFilter', e.target.value)}
                                style={{ width: '90px' }} />
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>TCV ($)</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input aria-label="Min TCV" type="number" placeholder="min"
                                value={localFilters.minTcvFilter}
                                onChange={e => handleFilterChange('minTcvFilter', e.target.value)}
                                style={{ width: '90px' }} min="0" />
                            <span style={{ color: 'var(--text-muted)' }}>–</span>
                            <input aria-label="Max TCV" type="number" placeholder="max"
                                value={localFilters.maxTcvFilter}
                                onChange={e => handleFilterChange('maxTcvFilter', e.target.value)}
                                style={{ width: '90px' }} min="0" />
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Status</label>
                        <MultiSelectDropdown
                            ariaLabel="Status filter"
                            placeholder="All statuses"
                            options={STATUS_OPTIONS}
                            selected={viewState.statusFilter || []}
                            onChange={setStatusFilter}
                            width={170}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Released in</label>
                        <MultiSelectDropdown
                            ariaLabel="Released filter"
                            placeholder="All sprints"
                            options={releasedOptions}
                            selected={viewState.releasedSprintIds || []}
                            onChange={setReleasedSprintFilter}
                            width={200}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Hierarchy</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ opacity: viewState.rootsOnly ? 0.5 : 1, pointerEvents: viewState.rootsOnly ? 'none' : 'auto' }}>
                                <MultiSelectDropdown
                                    ariaLabel="Hierarchy parents"
                                    placeholder="Children of..."
                                    options={sortedWorkItemsForPicker}
                                    selected={liveParentIds}
                                    onChange={(next) => setHierarchyParents(next, liveParentScope)}
                                    width={200}
                                />
                            </div>
                            <div
                                role="radiogroup"
                                aria-label="Hierarchy scope"
                                style={{
                                    display: 'inline-flex',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                    opacity: liveParentIds.length > 0 ? 1 : 0.5,
                                    pointerEvents: liveParentIds.length > 0 ? 'auto' : 'none',
                                }}
                            >
                                {(['direct', 'subtree'] as const).map((scope, i) => {
                                    const active = liveParentScope === scope;
                                    return (
                                        <button
                                            key={scope}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            aria-label={scope === 'direct' ? 'Direct children only' : 'Entire subtree'}
                                            onClick={() => setHierarchyParents(liveParentIds, scope)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: 12,
                                                background: active ? 'var(--accent-primary)' : 'transparent',
                                                color: active ? 'white' : 'var(--text-primary)',
                                                border: 'none',
                                                borderLeft: i === 0 ? 'none' : '1px solid var(--border-primary)',
                                                cursor: 'pointer',
                                                fontWeight: active ? 600 : 400,
                                            }}
                                            title={scope === 'direct' ? 'Direct children only' : 'Entire subtree (all descendants)'}
                                        >
                                            {scope === 'direct' ? 'Direct' : 'Subtree'}
                                        </button>
                                    );
                                })}
                            </div>
                            {liveParentIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setHierarchyParents([], liveParentScope)}
                                    className="btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: 11 }}
                                    title="Clear hierarchy filter"
                                >
                                    ×
                                </button>
                            )}
                            <label className={styles.toggleItem}>
                                <input
                                    type="checkbox"
                                    checked={!!viewState.rootsOnly}
                                    onChange={e => setViewState(s => ({
                                        ...s,
                                        rootsOnly: e.target.checked || undefined,
                                        parentIds: e.target.checked ? undefined : s.parentIds,
                                        subtreeOfIds: e.target.checked ? undefined : s.subtreeOfIds,
                                    }))}
                                />
                                Roots only
                            </label>
                        </div>
                    </div>

                    {/* Visualization Toggles */}
                    <div className={styles.filterGroup}>
                        <label>Visualization</label>
                        <div className={styles.toggleGroup}>
                            <label className={styles.toggleItem} title="Which metric drives work item ordering and node size">
                                Prioritize by:
                                <select
                                    value={viewState.prioritizationMetric}
                                    onChange={e => setViewState((s: ValueStreamViewState) => ({ ...s, prioritizationMetric: e.target.value as ValueStreamViewState['prioritizationMetric'] }))}
                                    style={{ marginLeft: '6px' }}
                                >
                                    <option value="score">Score</option>
                                    <option value="aha_score">Product Value</option>
                                    <option value="stackrank">Stack Rank</option>
                                </select>
                            </label>
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
                    <button
                        onClick={() => setViewState(s => ({ ...s, filtersCollapsed: true }))}
                        className="btn-secondary"
                        aria-expanded={true}
                        aria-controls="value-stream-filter-bar"
                        title="Hide filters & visualization"
                        style={{
                            marginLeft: 'auto',
                            alignSelf: 'flex-start',
                            padding: '4px 16px',
                            fontSize: '12px',
                            lineHeight: 1.2
                        }}
                    >
                        ▴
                    </button>
                </div>
                ) : (
                <div style={{
                    // Pull-handle hanging off the bottom-right of the header. top: 100%
                    // anchors the tab's top edge to the header's lower border so it
                    // overlaps into the dashboard area below, like a real pull tab.
                    position: 'absolute',
                    top: '100%',
                    right: '2rem',
                    zIndex: 2
                }}>
                    <button
                        onClick={() => setViewState(s => ({ ...s, filtersCollapsed: false }))}
                        className="btn-secondary"
                        aria-expanded={false}
                        aria-controls="value-stream-filter-bar"
                        title="Show filters & visualization"
                        style={{
                            padding: '4px 16px',
                            fontSize: '12px',
                            lineHeight: 1.2,
                            // Square top corners + no top border so the tab visually
                            // merges with the header's border-bottom; rounded bottom
                            // corners give it the dangling-handle look.
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderTop: 'none'
                        }}
                    >
                        ▾{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                </div>
                )}
            </div>

            <div className={styles.flowWrapper}>
                <ReactFlow
                    data-testid="react-flow-pane"
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onInit={() => setFlowReady(true)}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onNodeContextMenu={onNodeContextMenu}
                    onPaneContextMenu={onPaneContextMenu}
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
