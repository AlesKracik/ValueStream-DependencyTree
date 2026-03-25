import { useMemo } from 'react';
import { differenceInDays, parseISO, min, max, format, isWeekend } from 'date-fns';
import type { Node, Edge } from '@xyflow/react';
import type { ValueStreamData, ValueStreamParameters } from '../types/models';
import Holidays from 'date-holidays';
import { calculateWorkItemEffort, calculateIssueEffortPerSprint, calculateIssueIntensityRatio } from '../utils/businessLogic';

interface Holiday {
    date: string;
    type: string;
}

interface HolidayInput {
    getHolidays: (year: number) => Holiday[];
}

export function useGraphLayout(
    data: ValueStreamData | null,
    hoveredNodeId: string | null = null,
    sprintOffset: number = 0,
    customerFilter: string = '',
    workItemFilter: string = '',
    releasedFilter: 'all' | 'released' | 'unreleased' = 'all',
    teamFilter: string = '',
    issueFilter: string = '',
    showDependencies: boolean = true,
    minTcv: number = 0,
    minScore: number = 0,
    selectedNodeId: string | null = null,
    baseParams: ValueStreamParameters | null = null
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
        nodes.push({
            id: 'header-timeline',
            type: 'headerNode',
            position: { x: COL_TEAM_X + 250, y: HEADER_Y },
            data: { label: 'Timeline' },
            selectable: false,
            draggable: false,
        });

        // Calculate visible sets based on combined filters (Logical AND)
        const bcf = (baseParams?.customerFilter || '').toLowerCase();
        const bff = (baseParams?.workItemFilter || '').toLowerCase();
        const btf = (baseParams?.teamFilter || '').toLowerCase();
        const bef = (baseParams?.issueFilter || '').toLowerCase();
        const bMinTcv = Number(baseParams?.minTcvFilter) || 0;
        const bMinScore = Number(baseParams?.minScoreFilter) || 0;

        const cf = customerFilter.toLowerCase();
        const ff = workItemFilter.toLowerCase();
        const tf = teamFilter.toLowerCase();
        const ef = issueFilter.toLowerCase();

        const combinedMinScore = Math.max(minScore, bMinScore);
        const combinedMinTcv = Math.max(minTcv, bMinTcv);

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
                             combinedMinTcv > 0 || combinedMinScore > 0 ||
                             !!baseParams?.startSprintId || !!baseParams?.endSprintId;

        const visibleCustomers = new Set<string>();
        const visibleWorkItems = new Set<string>();
        const visibleTeams = new Set<string>();
        const visibleIssues = new Set<string>();

        const hasRangeFilter = !!rangeStartDate || !!rangeEndDate;

        // Identify intrinsically valid items based on text + number filters
        const validCustomers = new Set(
            data.customers.filter(c => {
                const transientTextMatch = !cf || c.name.toLowerCase().includes(cf);
                const baseTextMatch = !bcf || c.name.toLowerCase().includes(bcf);
                if (!transientTextMatch || !baseTextMatch) return false;

                // Also respect Min TCV for standalone visibility
                const totalTcv = (c.existing_tcv || 0) + (c.potential_tcv || 0);
                return totalTcv >= combinedMinTcv;
            }).map(c => c.id)
        );

        // For workitems, use the pre-calculated score from the server
        const validWorkItems = new Set(
            data.workItems.filter(f => {
                const transientTextMatch = !ff || f.name.toLowerCase().includes(ff);
                const baseTextMatch = !bff || f.name.toLowerCase().includes(bff);
                if (!transientTextMatch || !baseTextMatch) return false;

                if (!passRelease(!!f.released_in_sprint_id)) return false;

                // Use pre-computed RICE score for filtering
                const score = f.calculated_score !== undefined ? f.calculated_score : 0;
                return score >= combinedMinScore;
            }).map(f => f.id)
        );

        const validIssues = new Set(
            (data.issues || []).filter(e => {
                const team = data.teams.find(t => t.id === e.team_id);
                const transientTeamMatch = !tf || (team && team.name.toLowerCase().includes(tf));
                const baseTeamMatch = !btf || (team && team.name.toLowerCase().includes(btf));
                
                const workItem = data.workItems.find(f => f.id === e.work_item_id);
                const issueName = e.name || workItem?.name || 'Task';
                const transientIssueMatch = !ef || issueName.toLowerCase().includes(ef);
                const baseIssueMatch = !bef || issueName.toLowerCase().includes(bef);

                // Sprint Range Filter: Proper overlap check
                let rangeMatch = true;
                if (rangeStartDate || rangeEndDate) {
                    if (!e.target_start || !e.target_end) {
                        rangeMatch = false; 
                    } else {
                        const start = parseISO(e.target_start);
                        const end = parseISO(e.target_end);
                        
                        const overlapStart = rangeStartDate ? (end >= rangeStartDate) : true;
                        const overlapEnd = rangeEndDate ? (start <= rangeEndDate) : true;

                        rangeMatch = overlapStart && overlapEnd;
                    }
                }

                return transientTeamMatch && baseTeamMatch && transientIssueMatch && baseIssueMatch && rangeMatch;
            }).map(e => e.id)
        );

        const hasCustomerFilter = cf !== '' || bcf !== '' || combinedMinTcv > 0;
        const hasWorkItemFilter = ff !== '' || bff !== '' || combinedMinScore > 0 || releasedFilter !== 'all' || bRel !== 'all';
        const hasTeamIssueFilter = tf !== '' || btf !== '' || ef !== '' || bef !== '' || hasRangeFilter;

        if (!isFilterActive && !selectedNodeId) {
            data.customers.forEach(c => visibleCustomers.add(c.id));
            data.workItems.forEach(f => visibleWorkItems.add(f.id));
            data.teams.forEach(t => visibleTeams.add(t.id));
            (data.issues || []).forEach(e => visibleIssues.add(e.id));
        } else {
            // Build intersection graph
            data.workItems.forEach(f => {
                if (!validWorkItems.has(f.id)) return; // WorkItem intrinsically fails

                // Find connected valid Customers
                let connectedValidCustomers: string[] = [];
                if (f.all_customers_target) {
                    const type = f.all_customers_target.tcv_type;
                    // All valid customers who match combinedMinTcv
                    connectedValidCustomers = data.customers
                        .filter(c => validCustomers.has(c.id))
                        .filter(c => {
                            const val = (type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0));
                            return val >= combinedMinTcv && val > 0;
                        })
                        .map(c => c.id);
                } else {
                    connectedValidCustomers = f.customer_targets
                        .filter(ct => {
                            if (!validCustomers.has(ct.customer_id)) return false;
                            const c = data.customers.find(cust => cust.id === ct.customer_id);
                            if (!c) return false;
                            const val = (ct.tcv_type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0));
                            return val >= combinedMinTcv;
                        })
                        .map(ct => ct.customer_id);
                }

                // Find connected valid Issues
                const connectedValidIssues = (data.issues || [])
                    .filter(e => e.work_item_id === f.id && validIssues.has(e.id));

                // Strict intersection rules:
                // If a customer filter is active (transient or base), we MUST have a valid connected customer,
                // UNLESS it is a global work item which is shown regardless of customer matches.
                if (hasCustomerFilter && connectedValidCustomers.length === 0 && !f.all_customers_target) return;

                // If a team/issue filter is active (transient or base), we MUST have a valid connected issue.
                if (hasTeamIssueFilter && connectedValidIssues.length === 0) return;

                // If it survives to here, this workitem path is fully viable!
                visibleWorkItems.add(f.id);
                connectedValidCustomers.forEach(cId => visibleCustomers.add(cId));
                connectedValidIssues.forEach(e => {
                    visibleIssues.add(e.id);
                    visibleTeams.add(e.team_id);
                });
            });

            // Special case: WorkItemless Customers
            // If ONLY customer filters are applied, standalone valid customers should appear.
            // If a range filter is active, we don't show standalone customers (they must be in a connection tree of an in-range issue)
            if (!hasTeamIssueFilter && !hasWorkItemFilter && !hasRangeFilter) {
                validCustomers.forEach(cId => {
                    visibleCustomers.add(cId);
                });
            }

            // Special case: WorkItemless Issues
            // If NO customer/workitem filters are applied, standalone valid issues should appear.
            if (!hasCustomerFilter && !hasWorkItemFilter) {
                (data.issues || []).forEach(e => {
                    if ((!e.work_item_id || e.work_item_id === 'UNASSIGNED') && validIssues.has(e.id)) {
                        visibleIssues.add(e.id);
                        visibleTeams.add(e.team_id);
                    }
                });
            }

            // Special case: Standalone Teams
            // If a team filter is active, ensure matching teams are visible even if they have no issues or workitems
            if (tf || btf) {
                data.teams.forEach(t => {
                    const transientTeamMatch = !tf || t.name.toLowerCase().includes(tf);
                    const baseTeamMatch = !btf || t.name.toLowerCase().includes(btf);
                    if (transientTeamMatch && baseTeamMatch) {
                        visibleTeams.add(t.id);
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

            (data.issues || []).forEach(issue => {
                logicalEdges.push({
                    id: `edge__${issue.work_item_id}__${issue.team_id}__${issue.id}`,
                    source: `workitem-${issue.work_item_id}`,
                    target: `team-${issue.team_id}`
                });
                logicalEdges.push({
                    id: `edge-team-gantt-${issue.id}`,
                    source: `team-${issue.team_id}`,
                    target: `gantt-${issue.id}`
                });
                if (issue.dependencies && showDependencies) {
                    issue.dependencies.forEach(dep => {
                        logicalEdges.push({
                            id: `dep-${dep.issue_id}-to-${issue.id}-${dep.dependency_type}`,
                            source: `gantt-${dep.issue_id}`,
                            target: `gantt-${issue.id}`,
                        });
                    });
                }
            });

            const hNodes = new Set<string>();
            const visitedTarget = new Set<string>();
            const traceDownstream = (currentNodeId: string, sourceIssueId?: string) => {
                const contextKey = `${currentNodeId}-${sourceIssueId || 'none'}`;
                if (visitedTarget.has(contextKey)) return;
                visitedTarget.add(contextKey);

                hNodes.add(currentNodeId);
                let outgoingEdges = logicalEdges.filter(e => e.source === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceIssueId) {
                    outgoingEdges = outgoingEdges.filter(e => e.target === `gantt-${sourceIssueId}`);
                }

                outgoingEdges.forEach(e => {
                    let nextIssueId = sourceIssueId;
                    if (currentNodeId.startsWith('workitem-') && e.id.startsWith('edge__')) {
                        const parts = e.id.split('__');
                        if (parts.length >= 4) {
                            nextIssueId = parts[3];
                        }
                    }
                    traceDownstream(e.target, nextIssueId);
                });
            };

            const visitedSource = new Set<string>();
            const traceUpstream = (currentNodeId: string, sourceIssueId?: string) => {
                const contextKey = `${currentNodeId}-${sourceIssueId || 'none'}`;
                if (visitedSource.has(contextKey)) return;
                visitedSource.add(contextKey);

                hNodes.add(currentNodeId);
                let incomingEdges = logicalEdges.filter(e => e.target === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceIssueId) {
                    incomingEdges = incomingEdges.filter(e => e.id.endsWith(`__${sourceIssueId}`));
                }

                incomingEdges.forEach(e => {
                    let nextIssueId = sourceIssueId;
                    if (currentNodeId.startsWith('gantt-')) {
                        nextIssueId = currentNodeId.replace('gantt-', '');
                    }
                    traceUpstream(e.source, nextIssueId);
                });
            };

            traceDownstream(selectedNodeId);
            traceUpstream(selectedNodeId);

            // Keep only elements that are both already visible and in the highlighted set
            const newVisibleCustomers = new Set<string>();
            const newVisibleWorkItems = new Set<string>();
            const newVisibleTeams = new Set<string>();
            const newVisibleIssues = new Set<string>();

            visibleCustomers.forEach(id => { if (hNodes.has(`customer-${id}`)) newVisibleCustomers.add(id); });
            visibleWorkItems.forEach(id => { if (hNodes.has(`workitem-${id}`)) newVisibleWorkItems.add(id); });
            visibleTeams.forEach(id => { if (hNodes.has(`team-${id}`)) newVisibleTeams.add(id); });
            visibleIssues.forEach(id => { if (hNodes.has(`gantt-${id}`)) newVisibleIssues.add(id); });

            visibleCustomers.clear(); newVisibleCustomers.forEach(id => visibleCustomers.add(id));
            visibleWorkItems.clear(); newVisibleWorkItems.forEach(id => visibleWorkItems.add(id));
            visibleTeams.clear(); newVisibleTeams.forEach(id => visibleTeams.add(id));
            visibleIssues.clear(); newVisibleIssues.forEach(id => visibleIssues.add(id));
        }

        // 1. Process Customers (Column 1)
        // Sort Highest Total TCV to Lowest, apply Min TCV filter
        const maxTcv = data.customers.reduce((max, c) => Math.max(max, c.existing_tcv + c.potential_tcv), 1);
        const sortedCustomers = [...data.customers]
            .filter(c => visibleCustomers.has(c.id) && (c.existing_tcv + c.potential_tcv) >= combinedMinTcv)
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
                    existingTcvDuration: customer.existing_tcv_duration_months,
                    potentialTcv: customer.potential_tcv,
                    potentialTcvDuration: customer.potential_tcv_duration_months,
                    totalTcv: totalTcv,
                    maxTcv: maxTcv,
                    baseSize: 100, // base px size
                    highlightMode: 'all', // Default mode
                },
            });
        });

        // 2. Process WorkItems (Column 2)
        // Implement RICE WorkItem Prioritization using server-provided scores
        const workItemsToProcess = [...data.workItems]
            .filter(f => visibleWorkItems.has(f.id))
            .map(f => {
                const issuesForWorkItem = (data.issues || []).filter(e => e.work_item_id === f.id && visibleIssues.has(e.id));
                const issueMdsSum = issuesForWorkItem.reduce((sum, e) => sum + e.effort_md, 0);
                const hasDatelessIssues = issuesForWorkItem.some(e => !e.target_start || !e.target_end);
                
                // Use centralized logic for effort warning
                const totalEffort = calculateWorkItemEffort(f, data.issues);
                const hasUnestimatedEffort = totalEffort === 0 || issuesForWorkItem.some(e => (e.effort_md || 0) === 0);

                return {
                    ...f,
                    issueMdsSum,
                    hasDatelessIssues,
                    hasUnestimatedEffort,
                    calculatedEffort: totalEffort
                };
            });

        // Use global metrics from server for consistent scaling across filters
        const maxScore = data.metrics?.maxScore || 1;
        const maxRoi = data.metrics?.maxRoi || 0.0001;
        const sortedWorkItems = workItemsToProcess.sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0)); // Descending by RICE Score

        sortedWorkItems.forEach((workItem, index) => {
            const score = workItem.calculated_score || 0;
            const sizeRatio = maxScore > 0 ? score / maxScore : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `workitem-${workItem.id}`,
                type: 'workItemNode',
                position: { x: COL_WORKITEM_X - (nodeSize / 2), y: index * 180 + START_Y - (nodeSize / 2) },
                data: {
                    label: workItem.name,
                    description: workItem.description,
                    effortMds: workItem.calculatedEffort,
                    issueMds: workItem.issueMdsSum,
                    score: score,
                    maxScore: maxScore,
                    baseSize: 100,
                    isGlobal: !!workItem.all_customers_target,
                    releasedInSprintId: workItem.released_in_sprint_id,
                    hasDatelessIssues: workItem.hasDatelessIssues,
                    hasUnestimatedEffort: workItem.hasUnestimatedEffort,
                },
            });

            // 3. Create Edges (Customer -> WorkItem)
            if (!workItem.all_customers_target) {
                workItem.customer_targets.forEach((target) => {
                    if (!visibleCustomers.has(target.customer_id)) return;
                    const customer = data.customers.find(c => c.id === target.customer_id);
                    if (customer) {
                        const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;
                        const roi = targetTcv / (workItem.calculatedEffort || 1);
                        const normalizedStrokeWidth = Math.min(10, Math.max(2, (roi / maxRoi) * 10));

                        edges.push({
                            id: `edge-${target.customer_id}-${workItem.id}-${target.tcv_type}`,
                            source: `customer-${target.customer_id}`,
                            sourceHandle: target.tcv_type,
                            target: `workitem-${workItem.id}`,
                            type: 'default',
                            style: {
                                strokeWidth: normalizedStrokeWidth,
                                stroke: 'var(--edge-color)',
                            },
                        });
                    }
                });
            }
        });

        // 4. Pre-process Gantt Lanes and Sprints to calculate Team Y positions
        // Compute capacities over ALL teams
        const maxCapacity = data.teams.reduce((max, t) => Math.max(max, t.total_capacity_mds), 1);
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
        (data.issues || []).forEach(issue => {
            const team = data.teams.find(t => t.id === issue.team_id);
            if (!team) return;

            const issueSprintEffort = calculateIssueEffortPerSprint(issue, sprints);
            Object.entries(issueSprintEffort).forEach(([sprintId, effort]) => {
                if (teamSprintUsage[team.id][sprintId] !== undefined) {
                    teamSprintUsage[team.id][sprintId] += effort;
                }
            });
        });

        const visibleIssueIds = new Set(visibleIssues);
        const allIssuesToShow = (data.issues || []).filter(e => visibleIssueIds.has(e.id));
        
        // Build work item score lookup for Gantt lane ordering
        const workItemScoreMap: Record<string, number> = {};
        (data.workItems || []).forEach(wi => {
            workItemScoreMap[wi.id] = wi.calculated_score || 0;
        });

        // Sort issues: by related work item score (descending) so highest-scored items get top lanes,
        // then by start date as tiebreaker. Issues without dates go last.
        const sortedIssues = [...allIssuesToShow].sort((a, b) => {
            const hasDateA = !!(a.target_start && a.target_end);
            const hasDateB = !!(b.target_start && b.target_end);

            if (hasDateA && hasDateB) {
                const scoreA = workItemScoreMap[a.work_item_id || ''] || 0;
                const scoreB = workItemScoreMap[b.work_item_id || ''] || 0;
                if (scoreA !== scoreB) return scoreB - scoreA; // Higher score = top lane
                return parseISO(a.target_start!).getTime() - parseISO(b.target_start!).getTime();
            }
            if (hasDateA) return -1;
            if (hasDateB) return 1;
            return 0;
        });

        const issueLanes: Record<string, number> = {};

        sortedIssues.forEach(issue => {
            const team = data.teams.find(t => t.id === issue.team_id);
            if (!team) return;

            const lanes = teamLanes[team.id].endDates;
            let laneIdx = 0;

            if (issue.target_start && issue.target_end) {
                const start = parseISO(issue.target_start);
                const end = parseISO(issue.target_end);

                // Skip issues completely outside the visible window so they don't occupy lanes
                if (end < windowStartDate || start > windowEndDate) return;

                while (laneIdx < lanes.length && start <= lanes[laneIdx]) {
                    laneIdx++;
                }
                lanes[laneIdx] = end;

                issueLanes[issue.id] = laneIdx;
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
        (data.issues || []).forEach(issue => {
            if (!issue.work_item_id || !visibleWorkItems.has(issue.work_item_id) || !visibleTeams.has(issue.team_id) || !visibleIssues.has(issue.id)) return;
            if (issue.effort_md > maxRemainingMd) maxRemainingMd = issue.effort_md;
        });

        (data.issues || []).forEach(issue => {
            if (!issue.work_item_id || !visibleWorkItems.has(issue.work_item_id) || !visibleTeams.has(issue.team_id) || !visibleIssues.has(issue.id)) return;

            // Scale width based on remaining MDs, keeping min 2px and max 10px
            const normalizedStrokeWidth = Math.min(10, Math.max(2, (issue.effort_md / maxRemainingMd) * 10));
            edges.push({
                id: `edge__${issue.work_item_id}__${issue.team_id}__${issue.id}`,
                source: `workitem-${issue.work_item_id}`,
                target: `team-${issue.team_id}`,
                type: 'default',
                style: {
                    strokeWidth: normalizedStrokeWidth,
                    stroke: 'var(--edge-color)',
                },
            });
        });

        // 6. Process Timeline and Gantt Bars
        if (data.issues && data.issues.length > 0) {
            sortedIssues.forEach(issue => {
                if (!visibleIssues.has(issue.id)) return;

                const team = data.teams.find(t => t.id === issue.team_id);
                if (!team) return;

                const baseY = teamBaseY[team.id];

                if (issue.target_start && issue.target_end) {
                    const start = parseISO(issue.target_start);
                    const end = parseISO(issue.target_end);

                    // Only render if it overlaps the visible window
                    if (end < windowStartDate || start > windowEndDate) return;

                    const renderStart = max([start, windowStartDate]);
                    const renderEnd = min([end, windowEndDate]);

                    const daysOffset = Math.max(0, differenceInDays(renderStart, windowStartDate));
                    // Ensure duration doesn't go negative or 0 if start == end
                    const visibleDuration = Math.max(1, differenceInDays(renderEnd, renderStart) + 1);

                    const laneIdx = issueLanes[issue.id];
                    const maxLanes = Math.max(teamMaxLanes[team.id] || 1, 1);

                    // Center vertically around baseY
                    const ganttStartY = baseY - ((maxLanes - 1) * 45) / 2;
                    const yPos = ganttStartY + (laneIdx * 45);

                    const workItem = data.workItems.find(f => f.id === issue.work_item_id);

                    // Build the segments for heat/intensity mapping using centralized logic
                    const segments: { startOffsetPixels: number, widthPixels: number, intensity: number, color: string, isFrozen: boolean }[] = [];
                    const issueSprintEffort = calculateIssueEffortPerSprint(issue, sprints);

                    sprints.forEach(sprint => {
                        const sprintStart = parseISO(sprint.start_date);
                        const sprintEnd = parseISO(sprint.end_date);
                        const overlapStart = max([start, sprintStart]);
                        const overlapEnd = min([end, sprintEnd]);

                        if (overlapStart <= overlapEnd) {
                            const overlapStartOffsetDays = differenceInDays(overlapStart, windowStartDate);
                            const segmentOffsetPixels = Math.max(0, (overlapStartOffsetDays - daysOffset) * PIXELS_PER_DAY);

                            const overlapCalendarDays = differenceInDays(overlapEnd, overlapStart) + 1;
                            let segmentWidthPixels = overlapCalendarDays * PIXELS_PER_DAY;

                            // Crop segments so they don't draw outside the main rendering bar boundary
                            if (segmentOffsetPixels + segmentWidthPixels > visibleDuration * PIXELS_PER_DAY) {
                                segmentWidthPixels = (visibleDuration * PIXELS_PER_DAY) - segmentOffsetPixels;
                            }

                            const segmentEffort = issueSprintEffort[sprint.id] || 0;
                            const totalIssueDuration = Math.max(1, differenceInDays(end, start) + 1);

                            // Calculate mathematical strictly uniform proportion for the baseline:
                            const baselineProportion = overlapCalendarDays / totalIssueDuration;
                            const baselineEffort = (issue.effort_md || 0) * baselineProportion;
                            const intensityRatio = calculateIssueIntensityRatio(segmentEffort, baselineEffort);

                            // Progress-Aware Color Logic: Sprints older than Active Sprint are frozen
                            const isFrozen = sprintEnd < activeSprintStartDate;
                            const baseColor = isFrozen ? 'var(--node-frozen-bg)' : 'var(--node-workitem-bg)'; // Slate Blue for past, Purple for future

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
                        id: `gantt-${issue.id}`,
                        type: 'ganttBarNode',
                        position: {
                            x: COL_GANTT_START_X + (daysOffset * PIXELS_PER_DAY),
                            y: yPos
                        },
                        data: {
                            label: `${issue.name || workItem?.name || 'Task'} (${issue.effort_md} MDs)`,
                            width: visibleDuration * PIXELS_PER_DAY,
                            color: 'var(--node-workitem-bg)',
                            jiraKey: issue.jira_key,
                            jiraBaseUrl: data?.settings?.jira?.base_url,
                            issueId: issue.id,
                            targetStart: issue.target_start!,
                            targetEnd: issue.target_end!,
                            segments: segments
                        },
                    });

                    edges.push({
                        id: `edge-team-gantt-${issue.id}`,
                        source: `team-${issue.team_id}`,
                        target: `gantt-${issue.id}`,
                        type: 'default',
                        style: {
                            strokeWidth: 1.5,
                            stroke: 'var(--edge-color)',
                            opacity: 0.5,
                        },
                    });
                }

                // Map Explicit Issue Dependencies
                if (issue.dependencies && showDependencies) {
                    issue.dependencies.forEach(dep => {
                        // Only draw the dependency edge if the source issue is also currently visible
                        if (!visibleIssues.has(dep.issue_id)) return;

                        const targetHandle = dep.dependency_type === 'FF' ? 'target-finish' : 'target-start';

                        edges.push({
                            id: `dep-${dep.issue_id}-to-${issue.id}-${dep.dependency_type}`,
                            source: `gantt-${dep.issue_id}`,
                            sourceHandle: 'source-finish',
                            target: `gantt-${issue.id}`,
                            targetHandle: targetHandle,
                            type: 'default',
                            animated: true,
                            style: {
                                strokeWidth: 2,
                                stroke: 'var(--status-warning)', // Orange to stand out against grey structural edges
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
                let hd: HolidayInput | null = null;
                if (team.country) {
                    try {
                        hd = new Holidays(team.country) as unknown as HolidayInput;
                    } catch (err: unknown) {
                        console.error(`Invalid country code: ${team.country}`, err);
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

                        hList.forEach((h: Holiday) => {
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
                            teamId: team.id,
                            sprintId: sprint.id,
                            sprintLabel: sprint.name,
                            startDate: format(sprintStartDate, 'MMM d'),
                            endDate: format(sprintEndDate, 'MMM d'),
                            usedMds: usage,
                            totalCapacityMds: Math.max(0, Math.round(baseCapacity * 10) / 10),
                            isOverridden: isOverridden,
                            holidayCount: holidayCount,
                            width: width,
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
        const isAnyFilterActive = !!(customerFilter || workItemFilter || teamFilter || issueFilter || minTcv > 0 || minScore > 0 || selectedNodeId);

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
                const traceDownstream = (currentNodeId: string, sourceIssueId?: string) => {
                    const contextKey = `${currentNodeId}-${sourceIssueId || 'none'}`;
                    if (visitedTarget.has(contextKey)) return;
                    visitedTarget.add(contextKey);

                    hNodes.add(currentNodeId);
                    let outgoingEdges = edges.filter(e => e.source === currentNodeId);

                    // If at a team node, only follow edges to the specific issue's Gantt bar
                    if (currentNodeId.startsWith('team-') && sourceIssueId) {
                        outgoingEdges = outgoingEdges.filter(e => e.target === `gantt-${sourceIssueId}`);
                    }

                    outgoingEdges.forEach(e => {
                        hEdges.add(e.id);
                        markHandle(e.source, e.sourceHandle || '');

                        let nextIssueId = sourceIssueId;
                        // Extract issue context when passing from WorkItem to Team
                        if (currentNodeId.startsWith('workitem-') && e.id.startsWith('edge__')) {
                            const parts = e.id.split('__');
                            if (parts.length >= 4) {
                                nextIssueId = parts[3];
                            }
                        }

                        traceDownstream(e.target, nextIssueId);
                    });
                };

                const visitedSource = new Set<string>();
                const traceUpstream = (currentNodeId: string, sourceIssueId?: string) => {
                    const contextKey = `${currentNodeId}-${sourceIssueId || 'none'}`;
                    if (visitedSource.has(contextKey)) return;
                    visitedSource.add(contextKey);

                    hNodes.add(currentNodeId);
                    let incomingEdges = edges.filter(e => e.target === currentNodeId);

                    // If at a team node, only follow incoming edges from the workitem that owns this issue
                    if (currentNodeId.startsWith('team-') && sourceIssueId) {
                        incomingEdges = incomingEdges.filter(e => e.id.endsWith(`__${sourceIssueId}`));
                    }

                    incomingEdges.forEach(e => {
                        hEdges.add(e.id);
                        markHandle(e.source, e.sourceHandle || '');

                        let nextIssueId = sourceIssueId;
                        // Extract issue context when passing backwards from Gantt to Team
                        if (currentNodeId.startsWith('gantt-')) {
                            nextIssueId = currentNodeId.replace('gantt-', '');
                        }

                        traceUpstream(e.source, nextIssueId);
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
                        stroke: isHighlighted ? 'var(--accent-primary)' : (e.style?.stroke || 'var(--border-hover)'), // make highlighted edges blue for visibility
                        transition: 'all 0.2s'
                    };
                });
            }
        }

        return { nodes, edges };
    }, [data, hoveredNodeId, sprintOffset, customerFilter, workItemFilter, releasedFilter, teamFilter, issueFilter, showDependencies, minTcv, minScore, selectedNodeId, baseParams]);
}



