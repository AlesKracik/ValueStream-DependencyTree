import { useMemo } from 'react';
import { differenceInDays, parseISO, min, max, format, isWeekend, addDays } from 'date-fns';
import type { Node, Edge } from '@xyflow/react';
import type { DashboardData, DashboardParameters } from '../types/models';
import Holidays from 'date-holidays';

export function useGraphLayout(
    data: DashboardData | null,
    hoveredNodeId: string | null = null,
    sprintOffset: number = 0,
    customerFilter: string = '',
    workItemFilter: string = '',
    releasedFilter: 'all' | 'released' | 'unreleased' = 'all',
    teamFilter: string = '',
    epicFilter: string = '',
    showDependencies: boolean = true,
    minTcv: number = 0,
    minScore: number = 0,
    selectedNodeId: string | null = null,
    baseParams: DashboardParameters | null = null
) {
    return useMemo(() => {
        if (!data) return { nodes: [], edges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // Column X coordinates
        const COL_CUSTOMER_X = 0;
        const COL_WORKITEM_X = 350;
        const COL_TEAM_X = 700;
        const HEADER_Y = 0;
        const START_Y = 200; // Increased to ensure max size node doesn't overlap header

        // Add Header Nodes
        nodes.push({
            id: 'header-customers',
            type: 'headerNode',
            position: { x: COL_CUSTOMER_X - 110, y: HEADER_Y }, // centered roughly
            data: { label: 'Customers' },
            selectable: false,
            draggable: false,
        });
        nodes.push({
            id: 'header-workitems',
            type: 'headerNode',
            position: { x: COL_WORKITEM_X - 110, y: HEADER_Y },
            data: { label: 'Work Items' },
            selectable: false,
            draggable: false,
        });
        nodes.push({
            id: 'header-teams',
            type: 'headerNode',
            position: { x: COL_TEAM_X - 110, y: HEADER_Y },
            data: { label: 'Teams' },
            selectable: false,
            draggable: false,
        });

        // Calculate visible sets based on combined filters (Logical AND)
        const bcf = (baseParams?.customerFilter || '').toLowerCase();
        const bff = (baseParams?.workItemFilter || '').toLowerCase();
        const btf = (baseParams?.teamFilter || '').toLowerCase();
        const bef = (baseParams?.epicFilter || '').toLowerCase();
        const bMinTcv = Number(baseParams?.minTcvFilter) || 0;
        const bMinScore = Number(baseParams?.minScoreFilter) || 0;

        const cf = customerFilter.toLowerCase();
        const ff = workItemFilter.toLowerCase();
        const tf = teamFilter.toLowerCase();
        const ef = epicFilter.toLowerCase();

        const combinedMinTcv = Math.max(minTcv, bMinTcv);
        const combinedMinScore = Math.max(minScore, bMinScore);

        const bRel = baseParams?.releasedFilter || 'all';

        // Sprint Range persistent filter logic
        const rangeStartSprint = baseParams?.startSprintId ? data.sprints.find(s => s.id === baseParams.startSprintId) : null;
        const rangeEndSprint = baseParams?.endSprintId ? data.sprints.find(s => s.id === baseParams.endSprintId) : null;
        const rangeStartDate = rangeStartSprint ? parseISO(rangeStartSprint.start_date) : null;
        const rangeEndDate = rangeEndSprint ? parseISO(rangeEndSprint.end_date) : null;

        const passRelease = (isR: boolean) => {
            if (releasedFilter === 'released' && !isR) return false;
            if (releasedFilter === 'unreleased' && isR) return false;
            if (bRel === 'released' && !isR) return false;
            if (bRel === 'unreleased' && isR) return false;
            return true;
        };

        const isFilterActive = cf || bcf || ff || bff || tf || btf || ef || bef || 
                             releasedFilter !== 'all' || bRel !== 'all' ||
                             minTcv > 0 || bMinTcv > 0 || minScore > 0 || bMinScore > 0 ||
                             !!baseParams?.startSprintId || !!baseParams?.endSprintId;

        const visibleCustomers = new Set<string>();
        const visibleWorkItems = new Set<string>();
        const visibleTeams = new Set<string>();
        const visibleEpics = new Set<string>();

        const hasRangeFilter = !!rangeStartDate || !!rangeEndDate;

        // Identify intrinsically valid items based on text + number filters
        const validCustomers = new Set(
            data.customers.filter(c => {
                const transientTextMatch = !cf || c.name.toLowerCase().includes(cf);
                const baseTextMatch = !bcf || c.name.toLowerCase().includes(bcf);
                const numMatch = (c.existing_tcv + c.potential_tcv) >= combinedMinTcv;
                return transientTextMatch && baseTextMatch && numMatch;
            }).map(c => c.id)
        );

        // For workitems, we need their calculated score.
        const validWorkItems = new Set(
            data.workItems.filter(f => {
                const transientTextMatch = !ff || f.name.toLowerCase().includes(ff);
                const baseTextMatch = !bff || f.name.toLowerCase().includes(bff);
                if (!transientTextMatch || !baseTextMatch) return false;

                if (!passRelease(!!f.released_in_sprint_id)) return false;

                const epicsForWorkItem = data.epics.filter(e => e.work_item_id === f.id);
                const epicMdsSum = epicsForWorkItem.reduce((sum, e) => sum + e.effort_md, 0);
                const displayEffort = Math.max(f.total_effort_mds || 0, epicMdsSum) || 1;

                let maxImpact = 0;
                f.customer_targets.forEach(target => {
                    const customer = data.customers.find(c => c.id === target.customer_id);
                    if (!customer) return;

                    const priority = target.priority || 'Must-have';
                    const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;

                    if (priority === 'Must-have') {
                        maxImpact += targetTcv;
                    } else if (priority === 'Should-have') {
                        let shouldHaveCount = 0;
                        data.workItems.forEach(globalF => {
                            const hasShould = globalF.customer_targets.find(ct =>
                                ct.customer_id === target.customer_id &&
                                ct.priority === 'Should-have' &&
                                ct.tcv_type === target.tcv_type
                            );
                            if (hasShould) shouldHaveCount++;
                        });
                        if (shouldHaveCount > 0) {
                            maxImpact += (targetTcv / shouldHaveCount);
                        }
                    }
                });

                const maxPossibleScore = maxImpact / displayEffort;
                return maxPossibleScore >= combinedMinScore;
            }).map(f => f.id)
        );

        const validEpics = new Set(
            data.epics.filter(e => {
                const team = data.teams.find(t => t.id === e.team_id);
                const transientTeamMatch = !tf || (team && team.name.toLowerCase().includes(tf));
                const baseTeamMatch = !btf || (team && team.name.toLowerCase().includes(btf));
                
                const workItem = data.workItems.find(f => f.id === e.work_item_id);
                const epicName = e.name || workItem?.name || 'Task';
                const transientEpicMatch = !ef || epicName.toLowerCase().includes(ef);
                const baseEpicMatch = !bef || epicName.toLowerCase().includes(bef);

                // Sprint Range Filter
                let rangeMatch = true;
                if (rangeStartDate || rangeEndDate) {
                    if (!e.target_start || !e.target_end) {
                        rangeMatch = false; // Epics without dates fail if range is set
                    } else {
                        const start = parseISO(e.target_start);
                        const end = parseISO(e.target_end);
                        
                        const startInRange = rangeStartDate && rangeEndDate 
                            ? (start >= rangeStartDate && start <= rangeEndDate)
                            : (rangeStartDate ? start >= rangeStartDate : true) && (rangeEndDate ? start <= rangeEndDate : true);
                        
                        const endInRange = rangeStartDate && rangeEndDate
                            ? (end >= rangeStartDate && end <= rangeEndDate)
                            : (rangeStartDate ? end >= rangeStartDate : true) && (rangeEndDate ? end <= rangeEndDate : true);

                        rangeMatch = startInRange || endInRange;
                    }
                }

                return transientTeamMatch && baseTeamMatch && transientEpicMatch && baseEpicMatch && rangeMatch;
            }).map(e => e.id)
        );

        const hasCustomerFilter = cf !== '' || bcf !== '' || minTcv > 0 || bMinTcv > 0;
        const hasWorkItemFilter = ff !== '' || bff !== '' || minScore > 0 || bMinScore > 0 || releasedFilter !== 'all' || bRel !== 'all';
        const hasTeamEpicFilter = tf !== '' || btf !== '' || ef !== '' || bef !== '' || hasRangeFilter;

        if (!isFilterActive && !selectedNodeId) {
            data.customers.forEach(c => visibleCustomers.add(c.id));
            data.workItems.forEach(f => visibleWorkItems.add(f.id));
            data.teams.forEach(t => visibleTeams.add(t.id));
            data.epics.forEach(e => visibleEpics.add(e.id));
        } else {
            // Build intersection graph
            data.workItems.forEach(f => {
                if (!validWorkItems.has(f.id)) return; // WorkItem intrinsically fails

                // Find connected valid Customers
                let connectedValidCustomers: string[] = [];
                if (f.all_customers_target) {
                    const type = f.all_customers_target.tcv_type;
                    // All valid customers who have relevant TCV
                    connectedValidCustomers = data.customers
                        .filter(c => validCustomers.has(c.id) && (type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0)) > 0)
                        .map(c => c.id);
                } else {
                    connectedValidCustomers = f.customer_targets
                        .filter(ct => validCustomers.has(ct.customer_id))
                        .map(ct => ct.customer_id);
                }

                // Find connected valid Epics
                const connectedValidEpics = data.epics
                    .filter(e => e.work_item_id === f.id && validEpics.has(e.id));

                // Strict intersection rules:
                // If a customer filter is active (transient or base), we MUST have a valid connected customer.
                if (hasCustomerFilter && connectedValidCustomers.length === 0) return;

                // If a team/epic filter is active (transient or base), we MUST have a valid connected epic.
                if (hasTeamEpicFilter && connectedValidEpics.length === 0) return;

                // If it survives to here, this workitem path is fully viable!
                visibleWorkItems.add(f.id);
                connectedValidCustomers.forEach(cId => visibleCustomers.add(cId));
                connectedValidEpics.forEach(e => {
                    visibleEpics.add(e.id);
                    visibleTeams.add(e.team_id);
                });
            });

            // Special case: WorkItemless Customers
            // If ONLY customer filters are applied, standalone valid customers should appear.
            // If a range filter is active, we don't show standalone customers (they must be in a connection tree of an in-range epic)
            if (!hasTeamEpicFilter && !hasWorkItemFilter && !hasRangeFilter) {
                validCustomers.forEach(cId => {
                    visibleCustomers.add(cId);
                });
            }

            // Special case: WorkItemless Epics
            // If NO customer/workitem filters are applied, standalone valid epics should appear.
            if (!hasCustomerFilter && !hasWorkItemFilter) {
                data.epics.forEach(e => {
                    if ((!e.work_item_id || e.work_item_id === 'UNASSIGNED') && validEpics.has(e.id)) {
                        visibleEpics.add(e.id);
                        visibleTeams.add(e.team_id);
                    }
                });
            }
        }

        // Apply Selection-based filtering if selectedNodeId is present
        if (selectedNodeId) {
            const logicalEdges: { id: string, source: string, target: string }[] = [];
            data.workItems.forEach((workItem) => {
                if (workItem.all_customers_target) {
                    const type = workItem.all_customers_target.tcv_type;
                    // Logic: Connect to all customers who have relevant TCV
                    data.customers.forEach(customer => {
                        const val = type === 'existing' ? (customer.existing_tcv || 0) : (customer.potential_tcv || 0);
                        if (val > 0) {
                            logicalEdges.push({
                                id: `edge-${customer.id}-${workItem.id}-all`,
                                source: `customer-${customer.id}`,
                                target: `workitem-${workItem.id}`
                            });
                        }
                    });
                } else {
                    workItem.customer_targets.forEach((target) => {
                        logicalEdges.push({
                            id: `edge-${target.customer_id}-${workItem.id}-${target.tcv_type}`,
                            source: `customer-${target.customer_id}`,
                            target: `workitem-${workItem.id}`
                        });
                    });
                }
            });

            data.epics.forEach(epic => {
                logicalEdges.push({
                    id: `edge-${epic.work_item_id}-${epic.team_id}-${epic.id}`,
                    source: `workitem-${epic.work_item_id}`,
                    target: `team-${epic.team_id}`
                });
                logicalEdges.push({
                    id: `edge-team-gantt-${epic.id}`,
                    source: `team-${epic.team_id}`,
                    target: `gantt-${epic.id}`
                });
                if (epic.dependencies && showDependencies) {
                    epic.dependencies.forEach(dep => {
                        logicalEdges.push({
                            id: `dep-${dep.epic_id}-to-${epic.id}-${dep.dependency_type}`,
                            source: `gantt-${dep.epic_id}`,
                            target: `gantt-${epic.id}`,
                        });
                    });
                }
            });

            const hNodes = new Set<string>();
            const visitedTarget = new Set<string>();
            const traceDownstream = (currentNodeId: string, sourceEpicId?: string) => {
                const contextKey = `${currentNodeId}-${sourceEpicId || 'none'}`;
                if (visitedTarget.has(contextKey)) return;
                visitedTarget.add(contextKey);

                hNodes.add(currentNodeId);
                let outgoingEdges = logicalEdges.filter(e => e.source === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceEpicId) {
                    outgoingEdges = outgoingEdges.filter(e => e.target === `gantt-${sourceEpicId}`);
                }

                outgoingEdges.forEach(e => {
                    let nextEpicId = sourceEpicId;
                    if (currentNodeId.startsWith('workitem-') && e.id.startsWith('edge-')) {
                        const parts = e.id.split('-');
                        if (parts.length >= 4) {
                            nextEpicId = parts.slice(3).join('-');
                        }
                    }
                    traceDownstream(e.target, nextEpicId);
                });
            };

            const visitedSource = new Set<string>();
            const traceUpstream = (currentNodeId: string, sourceEpicId?: string) => {
                const contextKey = `${currentNodeId}-${sourceEpicId || 'none'}`;
                if (visitedSource.has(contextKey)) return;
                visitedSource.add(contextKey);

                hNodes.add(currentNodeId);
                let incomingEdges = logicalEdges.filter(e => e.target === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceEpicId) {
                    incomingEdges = incomingEdges.filter(e => e.id.endsWith(`-${sourceEpicId}`));
                }

                incomingEdges.forEach(e => {
                    let nextEpicId = sourceEpicId;
                    if (currentNodeId.startsWith('gantt-')) {
                        nextEpicId = currentNodeId.replace('gantt-', '');
                    }
                    traceUpstream(e.source, nextEpicId);
                });
            };

            traceDownstream(selectedNodeId);
            traceUpstream(selectedNodeId);

            // Keep only elements that are both already visible and in the highlighted set
            const newVisibleCustomers = new Set<string>();
            const newVisibleWorkItems = new Set<string>();
            const newVisibleTeams = new Set<string>();
            const newVisibleEpics = new Set<string>();

            visibleCustomers.forEach(id => { if (hNodes.has(`customer-${id}`)) newVisibleCustomers.add(id); });
            visibleWorkItems.forEach(id => { if (hNodes.has(`workitem-${id}`)) newVisibleWorkItems.add(id); });
            visibleTeams.forEach(id => { if (hNodes.has(`team-${id}`)) newVisibleTeams.add(id); });
            visibleEpics.forEach(id => { if (hNodes.has(`gantt-${id}`)) newVisibleEpics.add(id); });

            visibleCustomers.clear(); newVisibleCustomers.forEach(id => visibleCustomers.add(id));
            visibleWorkItems.clear(); newVisibleWorkItems.forEach(id => visibleWorkItems.add(id));
            visibleTeams.clear(); newVisibleTeams.forEach(id => visibleTeams.add(id));
            visibleEpics.clear(); newVisibleEpics.forEach(id => visibleEpics.add(id));
        }

        // 1. Process Customers (Column 1)
        // Sort Highest Total TCV to Lowest, apply Min TCV filter
        const maxTcv = Math.max(...data.customers.map(c => c.existing_tcv + c.potential_tcv), 1);
        const sortedCustomers = [...data.customers]
            .filter(c => visibleCustomers.has(c.id) && (c.existing_tcv + c.potential_tcv) >= minTcv)
            .sort((a, b) => (b.existing_tcv + b.potential_tcv) - (a.existing_tcv + a.potential_tcv));

        // Add Customer node removed from canvas

        sortedCustomers.forEach((customer, index) => {
            const totalTcv = customer.existing_tcv + customer.potential_tcv;
            const sizeRatio = maxTcv > 0 ? totalTcv / maxTcv : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `customer-${customer.id}`,
                type: 'customerNode',
                position: { x: COL_CUSTOMER_X - (nodeSize / 2), y: index * 180 + START_Y - (nodeSize / 2) }, // Adjusted starting Y
                data: {
                    label: customer.name,
                    existingTcv: customer.existing_tcv,
                    potentialTcv: customer.potential_tcv,
                    totalTcv: totalTcv,
                    maxTcv: maxTcv,
                    baseSize: 100, // base px size
                    highlightMode: 'all', // Default mode
                },
            });
        });

        // 2. Process WorkItems (Column 2)
        // Implement RICE WorkItem Prioritization
        const workItemsWithScores = [...data.workItems]
            .filter(f => visibleWorkItems.has(f.id))
            .map(f => {
                const epicsForWorkItem = data.epics.filter(e => e.work_item_id === f.id && visibleEpics.has(e.id));
                const epicMdsSum = epicsForWorkItem.reduce((sum, e) => sum + e.effort_md, 0);
                const displayEffort = Math.max(f.total_effort_mds || 0, epicMdsSum) || 1; // Prevent div by 0

                const hasDatelessEpics = epicsForWorkItem.some(e => !e.target_start || !e.target_end);

                let impact = 0;

                if (f.all_customers_target) {
                    const type = f.all_customers_target.tcv_type;
                    const priority = f.all_customers_target.priority || 'Must-have';
                    
                    // Sum up relevant TCV for ALL customers
                    let totalRelevantTcv = data.customers.reduce((sum, c) => {
                        const val = type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0);
                        return sum + val;
                    }, 0);

                    if (priority === 'Must-have') {
                        impact = totalRelevantTcv;
                    } else if (priority === 'Should-have') {
                        // For global "Should-haves", we also divide by global count of Should-haves if we want consistency,
                        // but usually global maintenance is a single item. For now, let's treat it as total/1 for simplicity
                        // or find all global items with should-have.
                        let globalShouldCount = data.workItems.filter(wf => wf.all_customers_target?.priority === 'Should-have' && wf.all_customers_target?.tcv_type === type).length;
                        impact = totalRelevantTcv / (globalShouldCount || 1);
                    }
                } else {
                    f.customer_targets.forEach(target => {
                        const customer = data.customers.find(c => c.id === target.customer_id);
                        if (!customer) return;

                        const priority = target.priority || 'Must-have';
                        const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;

                        if (priority === 'Must-have') {
                            impact += targetTcv;
                        } else if (priority === 'Should-have') {
                            // Find how many Should-haves this customer has across ALL workitems globally
                            let shouldHaveCount = 0;
                            data.workItems.forEach(globalF => {
                                const hasShould = globalF.customer_targets.find(ct =>
                                    ct.customer_id === target.customer_id &&
                                    ct.priority === 'Should-have' &&
                                    ct.tcv_type === target.tcv_type
                                );
                                if (hasShould) shouldHaveCount++;
                            });
                            if (shouldHaveCount > 0) {
                                impact += (targetTcv / shouldHaveCount);
                            }
                        } else if (priority === 'Nice-to-have') {
                            impact += 0;
                        }
                    });
                }

                const score = impact / displayEffort;

                return {
                    ...f,
                    epicMdsSum,
                    displayEffort,
                    impact,
                    score,
                    hasDatelessEpics
                };
            });

        // Apply Min Score filter
        const filteredWorkItemsByScore = workItemsWithScores.filter(f => f.score >= minScore);
        const maxScore = Math.max(...filteredWorkItemsByScore.map(f => f.score), 1);
        const sortedWorkItems = filteredWorkItemsByScore.sort((a, b) => b.score - a.score); // Descending by Score

        let maxRoi = 0.0001; // Avoid division by zero
        sortedWorkItems.forEach((workItem) => {
            workItem.customer_targets.forEach((target) => {
                if (!visibleCustomers.has(target.customer_id)) return;
                const customer = data.customers.find(c => c.id === target.customer_id);
                if (customer) {
                    const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;
                    const roi = targetTcv / workItem.total_effort_mds;
                    if (roi > maxRoi) maxRoi = roi;
                }
            });
        });

        // Add WorkItem node removed from canvas

        sortedWorkItems.forEach((workItem, index) => {
            const sizeRatio = maxScore > 0 ? workItem.score / maxScore : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `workitem-${workItem.id}`,
                type: 'workItemNode',
                position: { x: COL_WORKITEM_X - (nodeSize / 2), y: index * 180 + START_Y - (nodeSize / 2) }, // Adjusted starting Y
                data: {
                    label: workItem.name,
                    effortMds: workItem.total_effort_mds,
                    epicMds: workItem.epicMdsSum,
                    score: workItem.score,
                    maxScore: maxScore,
                    baseSize: 100,
                    isGlobal: !!workItem.all_customers_target,
                    releasedInSprintId: workItem.released_in_sprint_id,
                    hasDatelessEpics: workItem.hasDatelessEpics,
                },
            });

            // 3. Create Edges (Customer -> WorkItem)
            // Skip visual edges for items that relate to all existing customers to avoid clutter
            if (!workItem.all_customers_target) {
                // Thickness proportional to ROI: Potential_TCV / Total_Effort_MDs
                workItem.customer_targets.forEach((target) => {
                    if (!visibleCustomers.has(target.customer_id)) return;
                    const customer = data.customers.find(c => c.id === target.customer_id);
                    if (customer) {
                        const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;
                        const roi = targetTcv / workItem.total_effort_mds;
                        // Scale width based on ROI, keeping min 2px and max 10px
                        const normalizedStrokeWidth = Math.min(10, Math.max(2, (roi / maxRoi) * 10));

                        edges.push({
                            id: `edge-${target.customer_id}-${workItem.id}-${target.tcv_type}`,
                            source: `customer-${target.customer_id}`,
                            sourceHandle: target.tcv_type, // 'existing' or 'potential'
                            target: `workitem-${workItem.id}`,
                            type: 'default',
                            style: {
                                strokeWidth: normalizedStrokeWidth,
                                stroke: '#b0b0b0',
                            },
                        });
                    }
                });
            }
        });

        // 4. Pre-process Gantt Lanes and Sprints to calculate Team Y positions
        // Compute capacities over ALL teams
        const maxCapacity = Math.max(...data.teams.map(t => t.total_capacity_mds), 1);
        const sprints = data.sprints || [];
        const visibleSprints = sprints.slice(sprintOffset, sprintOffset + 6);

        // Calculate visual boundaries based on visible window
        const windowStartDate = visibleSprints.length > 0 ? parseISO(visibleSprints[0].start_date) : new Date();
        const windowEndDate = visibleSprints.length > 0 ? parseISO(visibleSprints[visibleSprints.length - 1].end_date) : new Date();

        const sprintWidthTracker: Record<string, number> = {};

        const PIXELS_PER_DAY = 20;
        const COL_GANTT_START_X = COL_TEAM_X + 250;

        // Identify Active Sprint for freezing logic
        const today = new Date();
        const activeSprint = sprints.find(s => {
            const start = parseISO(s.start_date);
            const end = parseISO(s.end_date);
            return today >= start && today <= end;
        }) || sprints[0]; // Fallback to first if none match

        const activeSprintStartDate = activeSprint ? parseISO(activeSprint.start_date) : new Date();

        sprints.forEach((sprint) => {
            const startStr = parseISO(sprint.start_date);
            const endStr = parseISO(sprint.end_date);
            const days = differenceInDays(endStr, startStr) + 1;
            const width = days * PIXELS_PER_DAY;
            sprintWidthTracker[sprint.id] = width;
        });

        const teamLanes: Record<string, { endDates: Date[] }> = {};
        const teamMaxLanes: Record<string, number> = {};
        const teamSprintUsage: Record<string, Record<string, number>> = {};

        data.teams.forEach(team => {
            teamLanes[team.id] = { endDates: [] };
            teamMaxLanes[team.id] = 0;
            teamSprintUsage[team.id] = {};
            sprints.forEach(s => teamSprintUsage[team.id][s.id] = 0);
        });

        // 4.1. Pre-calculate global team capacity usage (NOT affected by UI filters)
        data.epics.forEach(epic => {
            if (!epic.target_start || !epic.target_end) return;
            const team = data.teams.find(t => t.id === epic.team_id);
            if (!team) return;

            const start = parseISO(epic.target_start);
            const end = parseISO(epic.target_end);
            const duration = differenceInDays(end, start) + 1;

            let totalOverrideMd = 0;
            let overrideDays = 0;

            sprints.forEach(sprint => {
                const spStart = parseISO(sprint.start_date);
                const spEnd = parseISO(sprint.end_date);
                const overlapStart = max([start, spStart]);
                const overlapEnd = min([end, spEnd]);
                if (overlapStart <= overlapEnd) {
                    const overrideVal = epic.sprint_effort_overrides?.[sprint.id];
                    if (overrideVal !== undefined) {
                        totalOverrideMd += overrideVal;
                        overrideDays += (differenceInDays(overlapEnd, overlapStart) + 1);
                    }
                }
            });

            const remainingDefaultMd = Math.max(0, epic.effort_md - totalOverrideMd);
            const remainingDefaultDays = Math.max(0, duration - overrideDays);

            sprints.forEach((sprint) => {
                const sprintStart = parseISO(sprint.start_date);
                const sprintEnd = parseISO(sprint.end_date);
                const overlapStart = max([start, sprintStart]);
                const overlapEnd = min([end, sprintEnd]);

                if (overlapStart <= overlapEnd) {
                    const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                    const overrideVal = epic.sprint_effort_overrides?.[sprint.id];

                    if (overrideVal !== undefined) {
                        teamSprintUsage[team.id][sprint.id] += overrideVal;
                    } else {
                        const proportion = remainingDefaultDays > 0 ? (overlapDays / remainingDefaultDays) : 0;
                        teamSprintUsage[team.id][sprint.id] += (remainingDefaultMd * proportion);
                    }
                }
            });
        });

        const visibleEpicIds = new Set(visibleEpics);
        const allEpicsToShow = (data.epics || []).filter(e => visibleEpicIds.has(e.id));
        
        // Sort epics: first those with dates (by start date), then those without.
        const sortedEpics = [...allEpicsToShow].sort((a, b) => {
            const hasDateA = !!(a.target_start && a.target_end);
            const hasDateB = !!(b.target_start && b.target_end);
            
            if (hasDateA && hasDateB) {
                return parseISO(a.target_start!).getTime() - parseISO(b.target_start!).getTime();
            }
            if (hasDateA) return -1;
            if (hasDateB) return 1;
            return 0;
        });

        const epicLanes: Record<string, number> = {};

        sortedEpics.forEach(epic => {
            const team = data.teams.find(t => t.id === epic.team_id);
            if (!team) return;

            const lanes = teamLanes[team.id].endDates;
            let laneIdx = 0;

            if (epic.target_start && epic.target_end) {
                const start = parseISO(epic.target_start);
                const end = parseISO(epic.target_end);
                
                while (laneIdx < lanes.length && start <= lanes[laneIdx]) {
                    laneIdx++;
                }
                lanes[laneIdx] = end;

                epicLanes[epic.id] = laneIdx;
                if (laneIdx + 1 > teamMaxLanes[team.id]) {
                    teamMaxLanes[team.id] = laneIdx + 1;
                }
            }
        });

        const teamBaseY: Record<string, number> = {};
        let currentLaneTop = START_Y - 90; // start aligned with START_Y based on min team height 180

        const sortedTeams = [...data.teams]
            .filter(t => visibleTeams.has(t.id))
            .sort((a, b) => b.total_capacity_mds - a.total_capacity_mds);

        sortedTeams.forEach((team) => {
            const maxLanes = Math.max(teamMaxLanes[team.id] || 1, 1);
            // Height needed for lanes: maxLanes * 45. Add padding for header (sprint capacity) and bottom space.
            const teamHeight = Math.max(180, (maxLanes * 45) + 100);
            const baseY = currentLaneTop + teamHeight / 2;
            teamBaseY[team.id] = baseY;
            currentLaneTop += teamHeight;

            const sizeRatio = maxCapacity > 0 ? team.total_capacity_mds / maxCapacity : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `team-${team.id}`,
                type: 'teamNode',
                position: { x: COL_TEAM_X - (nodeSize / 2), y: baseY - (nodeSize / 2) },
                data: {
                    label: team.name,
                    capacityMds: team.total_capacity_mds,
                    maxCapacity: maxCapacity,
                    baseSize: 100,
                },
            });
        });

        // 5. Create Edges (WorkItem -> Team)
        let maxRemainingMd = 0.0001;
        data.epics.forEach(epic => {
            if (!epic.work_item_id || !visibleWorkItems.has(epic.work_item_id) || !visibleTeams.has(epic.team_id) || !visibleEpics.has(epic.id)) return;
            if (epic.effort_md > maxRemainingMd) maxRemainingMd = epic.effort_md;
        });

        data.epics.forEach(epic => {
            if (!epic.work_item_id || !visibleWorkItems.has(epic.work_item_id) || !visibleTeams.has(epic.team_id) || !visibleEpics.has(epic.id)) return;

            // Scale width based on remaining MDs, keeping min 2px and max 10px
            const normalizedStrokeWidth = Math.min(10, Math.max(2, (epic.effort_md / maxRemainingMd) * 10));
            edges.push({
                id: `edge-${epic.work_item_id}-${epic.team_id}-${epic.id}`,
                source: `workitem-${epic.work_item_id}`,
                target: `team-${epic.team_id}`,
                type: 'default',
                style: {
                    strokeWidth: normalizedStrokeWidth,
                    stroke: '#b0b0b0',
                },
            });
        });

        // 6. Process Timeline and Gantt Bars
        if (data.epics && data.epics.length > 0) {
            sortedEpics.forEach(epic => {
                if (!visibleEpics.has(epic.id)) return;

                const team = data.teams.find(t => t.id === epic.team_id);
                if (!team) return;

                const baseY = teamBaseY[team.id];

                if (epic.target_start && epic.target_end) {
                    const start = parseISO(epic.target_start);
                    const end = parseISO(epic.target_end);

                    // Only render if it overlaps the visible window
                    if (end < windowStartDate || start > windowEndDate) return;

                    const renderStart = max([start, windowStartDate]);
                    const renderEnd = min([end, windowEndDate]);

                    const daysOffset = Math.max(0, differenceInDays(renderStart, windowStartDate));
                    // Ensure duration doesn't go negative or 0 if start == end
                    const visibleDuration = Math.max(1, differenceInDays(renderEnd, renderStart) + 1);
                    const totalEpicDuration = Math.max(1, differenceInDays(end, start) + 1);

                    const laneIdx = epicLanes[epic.id];
                    const maxLanes = Math.max(teamMaxLanes[team.id] || 1, 1);

                    // Center vertically around baseY
                    const ganttStartY = baseY - ((maxLanes - 1) * 45) / 2;
                    const yPos = ganttStartY + (laneIdx * 45);

                    const workItem = data.workItems.find(f => f.id === epic.work_item_id);

                    // Build the segments for heat/intensity mapping
                    const segments: { startOffsetPixels: number, widthPixels: number, intensity: number, color: string, isFrozen: boolean }[] = [];
                    sprints.forEach(sprint => {
                        const sprintStart = parseISO(sprint.start_date);
                        const sprintEnd = parseISO(sprint.end_date);
                        const overlapStart = max([start, sprintStart]);
                        const overlapEnd = min([end, sprintEnd]);

                        if (overlapStart <= overlapEnd) {
                            const overlapStartOffsetDays = differenceInDays(overlapStart, windowStartDate);
                            const segmentOffsetPixels = Math.max(0, (overlapStartOffsetDays - daysOffset) * PIXELS_PER_DAY);

                            const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                            let segmentWidthPixels = overlapDays * PIXELS_PER_DAY;

                            // Crop segments so they don't draw outside the main rendering bar boundary
                            if (segmentOffsetPixels + segmentWidthPixels > visibleDuration * PIXELS_PER_DAY) {
                                segmentWidthPixels = (visibleDuration * PIXELS_PER_DAY) - segmentOffsetPixels;
                            }

                            let segmentEffort = 0;
                            const overrideVal = epic.sprint_effort_overrides?.[sprint.id];

                            let totalOverrideMd = 0;
                            let overrideDays = 0;
                            sprints.forEach(sp => {
                                const spStart = parseISO(sp.start_date);
                                const spEnd = parseISO(sp.end_date);
                                const oStart = max([start, spStart]);
                                const oEnd = min([end, spEnd]);
                                if (oStart <= oEnd) {
                                    const oVal = epic.sprint_effort_overrides?.[sp.id];
                                    if (oVal !== undefined) {
                                        totalOverrideMd += oVal;
                                        overrideDays += (differenceInDays(oEnd, oStart) + 1);
                                    }
                                }
                            });
                            const remainingDefaultMd = Math.max(0, epic.effort_md - totalOverrideMd);
                            const remainingDefaultDays = Math.max(0, totalEpicDuration - overrideDays);

                            if (overrideVal !== undefined) {
                                segmentEffort = overrideVal;
                            } else {
                                const proportion = remainingDefaultDays > 0 ? (overlapDays / remainingDefaultDays) : 0;
                                segmentEffort = remainingDefaultMd * proportion;
                            }

                            // Calculate mathematical strictly uniform proportion for the baseline:
                            // Use TOTAL duration for baseline, so intensity remains constant regardless of visible window
                            const baselineProportion = overlapDays / totalEpicDuration;
                            const baselineEffort = epic.effort_md * baselineProportion;

                            let intensityRatio = 1;
                            if (baselineEffort > 0) {
                                intensityRatio = segmentEffort / baselineEffort;
                            } else if (segmentEffort > 0) {
                                intensityRatio = 2; // if baseline is 0 but we threw effort on it, glow white
                            }

                            // Progress-Aware Color Logic: Sprints older than Active Sprint are frozen
                            const isFrozen = sprintEnd < activeSprintStartDate;
                            const baseColor = isFrozen ? '#475569' : '#8b5cf6'; // Slate Blue for past, Purple for future

                            segments.push({
                                startOffsetPixels: segmentOffsetPixels,
                                widthPixels: segmentWidthPixels,
                                intensity: intensityRatio,
                                color: baseColor,
                                isFrozen: isFrozen
                            });
                        }
                    });

                    nodes.push({
                        id: `gantt-${epic.id}`,
                        type: 'ganttBarNode',
                        position: {
                            x: COL_GANTT_START_X + (daysOffset * PIXELS_PER_DAY),
                            y: yPos
                        },
                        data: {
                            label: `${epic.name || workItem?.name || 'Task'} (${epic.effort_md} MDs)`,
                            width: visibleDuration * PIXELS_PER_DAY,
                            color: '#8b5cf6',
                            jiraKey: epic.jira_key,
                            jiraBaseUrl: data?.settings?.jira_base_url,
                            epicId: epic.id,
                            targetStart: epic.target_start!,
                            targetEnd: epic.target_end!,
                            segments: segments
                        },
                    });

                    edges.push({
                        id: `edge-team-gantt-${epic.id}`,
                        source: `team-${epic.team_id}`,
                        target: `gantt-${epic.id}`,
                        type: 'default',
                        style: {
                            strokeWidth: 1.5,
                            stroke: '#b0b0b0',
                            opacity: 0.5,
                        },
                    });
                }

                // Map Explicit Epic Dependencies
                if (epic.dependencies && showDependencies) {
                    epic.dependencies.forEach(dep => {
                        // Only draw the dependency edge if the source epic is also currently visible
                        if (!visibleEpics.has(dep.epic_id)) return;

                        const targetHandle = dep.dependency_type === 'FF' ? 'target-finish' : 'target-start';

                        edges.push({
                            id: `dep-${dep.epic_id}-to-${epic.id}-${dep.dependency_type}`,
                            source: `gantt-${dep.epic_id}`,
                            sourceHandle: 'source-finish',
                            target: `gantt-${epic.id}`,
                            targetHandle: targetHandle,
                            type: 'default',
                            animated: true,
                            style: {
                                strokeWidth: 2,
                                stroke: '#f97316', // Orange to stand out against grey structural edges
                                zIndex: 1000
                            }
                        });
                    });
                }
            });

            // Generate Sprint Capacity Nodes
            sortedTeams.forEach((team) => {
                const baseY = teamBaseY[team.id];
                const maxLanes = Math.max(teamMaxLanes[team.id] || 1, 1);
                const ganttStartY = baseY - ((maxLanes - 1) * 45) / 2;

                // Cache holiday checker for performance if country exists
                let hd: any = null;
                if (team.country) {
                    try {
                        hd = new Holidays(team.country as any);
                    } catch (e) {
                        console.error(`Invalid country code: ${team.country}`);
                    }
                }

                visibleSprints.forEach((sprint) => {
                    const usage = Math.round(teamSprintUsage[team.id][sprint.id] * 10) / 10;

                    const sprintStartDate = parseISO(sprint.start_date);
                    const sprintEndDate = parseISO(sprint.end_date);
                    
                    // Calculate holidays in this sprint range
                    let holidayCount = 0;
                    if (hd) {
                        const hList = hd.getHolidays(sprintStartDate.getFullYear());
                        // Also check next year if sprint spans across New Year
                        if (sprintEndDate.getFullYear() !== sprintStartDate.getFullYear()) {
                            hList.push(...hd.getHolidays(sprintEndDate.getFullYear()));
                        }

                        hList.forEach((h: any) => {
                            // Only count 'public' holidays, ignore 'optional', 'observance', etc.
                            if (h.type !== 'public') return;
                            
                            const hDate = new Date(h.date);
                            // Check if holiday is within sprint AND is not a weekend
                            if (hDate >= sprintStartDate && hDate <= sprintEndDate && !isWeekend(hDate)) {
                                holidayCount++;
                            }
                        });
                    }

                    // Standard capacity assumes 10 working days. Each holiday removes 10% of base capacity.
                    const holidayImpact = (team.total_capacity_mds / 10) * holidayCount;
                    const baseCapacity = team.sprint_capacity_overrides?.[sprint.id] ?? (team.total_capacity_mds - holidayImpact);
                    const isOverridden = team.sprint_capacity_overrides?.[sprint.id] !== undefined;

                    // Determine where this sprint actually starts visually from windowStartDate
                    const actualDaysOffset = differenceInDays(sprintStartDate, windowStartDate);

                    const width = sprintWidthTracker[sprint.id];

                    nodes.push({
                        id: `sprint-cap-${team.id}-${sprint.id}`,
                        type: 'sprintCapacityNode',
                        position: {
                            x: COL_GANTT_START_X + (actualDaysOffset * PIXELS_PER_DAY),
                            y: ganttStartY - 45 // Fixed gap above the top-most lane
                        },
                        data: {
                            sprintLabel: sprint.name,
                            startDate: format(sprintStartDate, 'MMM d'),
                            endDate: format(sprintEndDate, 'MMM d'),
                            usedMds: usage,
                            totalCapacityMds: Math.max(0, Math.round(baseCapacity * 10) / 10),
                            isOverridden: isOverridden,
                            holidayCount: holidayCount,
                            width: width - 10,
                        },
                        selectable: false,
                    });
                });
            });

            // Calculate extents for the Today line
            let topY = Infinity;
            let bottomY = -Infinity;
            sortedTeams.forEach(t => {
                const baseY = teamBaseY[t.id];
                const maxLanes = Math.max(teamMaxLanes[t.id] || 1, 1);
                const ganttStartY = baseY - ((maxLanes - 1) * 45) / 2;
                const ganttEndY = ganttStartY + (maxLanes * 45);
                if (ganttStartY < topY) topY = ganttStartY;
                if (ganttEndY > bottomY) bottomY = ganttEndY;
            });
            topY -= 45; // Include sprint capacity headers

            const today = new Date();
            const todayOffsetDays = differenceInDays(today, windowStartDate);

            // Render line if it fits around our viewport
            if (todayOffsetDays >= -10 && todayOffsetDays <= (visibleSprints.length * 15)) {
                nodes.push({
                    id: 'today-line',
                    type: 'todayLineNode',
                    position: {
                        x: COL_GANTT_START_X + (todayOffsetDays * PIXELS_PER_DAY),
                        y: topY
                    },
                    data: {
                        height: bottomY - topY,
                        dateStr: format(today, 'MMM d')
                    },
                    selectable: false,
                    draggable: false,
                    zIndex: 50 // ensure it sits on top of everything
                });
            }
        }

        // Apply Highlights
        const isAnyFilterActive = !!(customerFilter || workItemFilter || teamFilter || epicFilter || minTcv > 0 || minScore > 0 || selectedNodeId);

        if (hoveredNodeId || isAnyFilterActive) {
            const hNodes = new Set<string>();
            const hEdges = new Set<string>();
            const hHandles = new Map<string, Set<string>>();

            if (hoveredNodeId) {
                const markHandle = (nodeId: string, handleId: string) => {
                    if (!hHandles.has(nodeId)) hHandles.set(nodeId, new Set());
                    if (handleId) hHandles.get(nodeId)!.add(handleId);
                };

                const visitedTarget = new Set<string>();
                const traceDownstream = (currentNodeId: string, sourceEpicId?: string) => {
                    const contextKey = `${currentNodeId}-${sourceEpicId || 'none'}`;
                    if (visitedTarget.has(contextKey)) return;
                    visitedTarget.add(contextKey);

                    hNodes.add(currentNodeId);
                    let outgoingEdges = edges.filter(e => e.source === currentNodeId);

                    // If at a team node, only follow edges to the specific epic's Gantt bar
                    if (currentNodeId.startsWith('team-') && sourceEpicId) {
                        outgoingEdges = outgoingEdges.filter(e => e.target === `gantt-${sourceEpicId}`);
                    }

                    outgoingEdges.forEach(e => {
                        hEdges.add(e.id);
                        markHandle(e.source, e.sourceHandle || '');

                        let nextEpicId = sourceEpicId;
                        // Extract epic context when passing from WorkItem to Team
                        if (currentNodeId.startsWith('workitem-') && e.id.startsWith('edge-')) {
                            const parts = e.id.split('-');
                            if (parts.length >= 4) {
                                nextEpicId = parts.slice(3).join('-');
                            }
                        }

                        traceDownstream(e.target, nextEpicId);
                    });
                };

                const visitedSource = new Set<string>();
                const traceUpstream = (currentNodeId: string, sourceEpicId?: string) => {
                    const contextKey = `${currentNodeId}-${sourceEpicId || 'none'}`;
                    if (visitedSource.has(contextKey)) return;
                    visitedSource.add(contextKey);

                    hNodes.add(currentNodeId);
                    let incomingEdges = edges.filter(e => e.target === currentNodeId);

                    // If at a team node, only follow incoming edges from the workitem that owns this epic
                    if (currentNodeId.startsWith('team-') && sourceEpicId) {
                        incomingEdges = incomingEdges.filter(e => e.id.endsWith(`-${sourceEpicId}`));
                    }

                    incomingEdges.forEach(e => {
                        hEdges.add(e.id);
                        markHandle(e.source, e.sourceHandle || '');

                        let nextEpicId = sourceEpicId;
                        // Extract epic context when passing backwards from Gantt to Team
                        if (currentNodeId.startsWith('gantt-')) {
                            nextEpicId = currentNodeId.replace('gantt-', '');
                        }

                        traceUpstream(e.source, nextEpicId);
                    });
                };

                // Start traversal from hovered node in both directions
                traceDownstream(hoveredNodeId);
                traceUpstream(hoveredNodeId);
            }

            // Apply styles to all nodes and edges based on sets
            const dimStyle = { opacity: 0.15, transition: 'opacity 0.2s' };
            const highlightStyle = { opacity: 1, transition: 'opacity 0.2s' };

            nodes.forEach(n => {
                // Headers, sprint capacities, and today-line are always fully bright
                if (n.type === 'headerNode' || n.type === 'sprintCapacityNode' || n.type === 'todayLineNode') {
                    n.style = { ...n.style, ...highlightStyle };
                    return;
                }

                // Only apply dimming/highlighting if a node is actually hovered
                if (hoveredNodeId) {
                    const isHighlighted = hNodes.has(n.id);
                    n.style = { ...n.style, ...(isHighlighted ? highlightStyle : dimStyle) };

                    if (n.type === 'customerNode') {
                        let mode = 'none';
                        if (isHighlighted) {
                            if (n.id === hoveredNodeId) {
                                mode = 'all';
                            } else {
                                const handles = hHandles.get(n.id);
                                if (handles && handles.size > 0) {
                                    if (handles.has('existing') && handles.has('potential')) mode = 'all';
                                    else if (handles.has('existing')) mode = 'existing';
                                    else if (handles.has('potential')) mode = 'potential';
                                } else {
                                    mode = 'all';
                                }
                            }
                        }
                        n.data = { ...n.data, highlightMode: mode };
                    }
                }
            });

            if (hoveredNodeId) {
                edges.forEach(e => {
                    const isHighlighted = hEdges.has(e.id);
                    e.style = {
                        ...e.style,
                        opacity: isHighlighted ? 1 : 0.05,
                        stroke: isHighlighted ? '#3b82f6' : (e.style?.stroke || '#b0b0b0'), // make highlighted edges blue for visibility
                        transition: 'all 0.2s'
                    };
                });
            }
        }

        return { nodes, edges };
    }, [data, hoveredNodeId, sprintOffset, customerFilter, workItemFilter, releasedFilter, teamFilter, epicFilter, showDependencies, minTcv, minScore, selectedNodeId, baseParams]);
}
