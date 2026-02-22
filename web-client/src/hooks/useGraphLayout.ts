import { useMemo } from 'react';
import { differenceInDays, parseISO, min, max, format } from 'date-fns';
import type { Node, Edge } from '@xyflow/react';
import type { DashboardData } from '../types/models';

export function useGraphLayout(
    data: DashboardData | null,
    hoveredNodeId: string | null = null,
    sprintOffset: number = 0,
    customerFilter: string = '',
    featureFilter: string = '',
    teamFilter: string = '',
    epicFilter: string = '',
    showDependencies: boolean = true
) {
    return useMemo(() => {
        if (!data) return { nodes: [], edges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // Column X coordinates
        const COL_CUSTOMER_X = 0;
        const COL_FEATURE_X = 350;
        const COL_TEAM_X = 700;

        // Calculate visible sets based on filters
        const cf = customerFilter.toLowerCase();
        const ff = featureFilter.toLowerCase();
        const tf = teamFilter.toLowerCase();
        const ef = epicFilter.toLowerCase();
        const isFilterActive = cf || ff || tf || ef;

        const visibleCustomers = new Set<string>();
        const visibleFeatures = new Set<string>();
        const visibleTeams = new Set<string>();
        const visibleEpics = new Set<string>();

        if (!isFilterActive) {
            data.customers.forEach(c => visibleCustomers.add(c.id));
            data.features.forEach(f => visibleFeatures.add(f.id));
            data.teams.forEach(t => visibleTeams.add(t.id));
            data.epics.forEach(e => visibleEpics.add(e.id));
        } else {
            data.features.forEach(f => {
                const fMatches = !ff || f.name.toLowerCase().includes(ff);
                if (!fMatches) return;

                const c_links = f.customer_targets.map(ct => data.customers.find(c => c.id === ct.customer_id)).filter(Boolean) as any[];
                const epics = data.epics.filter(e => e.feature_id === f.id);

                const validC = c_links.filter(c => !cf || c.name.toLowerCase().includes(cf));
                const validEpics = epics.filter(e => {
                    const team = data.teams.find(t => t.id === e.team_id);
                    const teamMatches = team && (!tf || team.name.toLowerCase().includes(tf));
                    const epicName = e.name || f.name || 'Task';
                    const epicMatches = !ef || epicName.toLowerCase().includes(ef);
                    return teamMatches && epicMatches;
                });

                if (cf && validC.length === 0) return;
                if ((tf || ef) && validEpics.length === 0) return;

                visibleFeatures.add(f.id);
                validC.forEach(c => visibleCustomers.add(c.id));
                validEpics.forEach(e => {
                    visibleEpics.add(e.id);
                    visibleTeams.add(e.team_id);
                });
            });
        }

        // 1. Process Customers (Column 1)
        // Sort Highest TCV to Lowest
        const maxTcv = Math.max(...data.customers.map(c => c.potential_tcv), 1);
        const sortedCustomers = [...data.customers]
            .filter(c => visibleCustomers.has(c.id))
            .sort((a, b) => b.potential_tcv - a.potential_tcv);

        // Inject the "Add Customer" button node at the top of the column
        if (!cf) { // Only show if not aggressively filtering
            nodes.push({
                id: 'add-customer-btn',
                type: 'default',
                position: { x: COL_CUSTOMER_X - 60, y: -20 },
                data: { label: '+ Add Customer' },
                style: {
                    backgroundColor: '#374151',
                    color: '#e5e7eb',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    width: 120,
                    textAlign: 'center',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }
            });
        }

        sortedCustomers.forEach((customer, index) => {
            const sizeRatio = maxTcv > 0 ? customer.potential_tcv / maxTcv : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `customer-${customer.id}`,
                type: 'customerNode',
                position: { x: COL_CUSTOMER_X - (nodeSize / 2), y: index * 180 + 160 - (nodeSize / 2) }, // Shifted down 60px to clear Add button
                data: {
                    label: customer.name,
                    existingTcv: customer.existing_tcv,
                    potentialTcv: customer.potential_tcv,
                    maxTcv: maxTcv,
                    baseSize: 100, // base px size
                    highlightMode: 'all', // Default mode
                },
            });
        });

        // 2. Process Features (Column 2)
        // Implement RICE Feature Prioritization
        const featuresWithScores = [...data.features]
            .filter(f => visibleFeatures.has(f.id))
            .map(f => {
                const epicsForFeature = data.epics.filter(e => e.feature_id === f.id && visibleEpics.has(e.id));
                const epicMdsSum = epicsForFeature.reduce((sum, e) => sum + e.remaining_md, 0);
                const displayEffort = Math.max(f.total_effort_mds || 0, epicMdsSum) || 1; // Prevent div by 0

                let impact = 0;

                f.customer_targets.forEach(target => {
                    const customer = data.customers.find(c => c.id === target.customer_id);
                    if (!customer) return;

                    const priority = target.priority || 'Must-have';
                    const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;

                    if (priority === 'Must-have') {
                        impact += targetTcv;
                    } else if (priority === 'Should-have') {
                        // Find how many Should-haves this customer has across ALL features globally
                        let shouldHaveCount = 0;
                        data.features.forEach(globalF => {
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

                const score = impact / displayEffort;

                return {
                    ...f,
                    epicMdsSum,
                    displayEffort,
                    impact,
                    score
                };
            });

        const maxScore = Math.max(...featuresWithScores.map(f => f.score), 1);
        const sortedFeatures = featuresWithScores.sort((a, b) => b.score - a.score); // Descending by Score

        sortedFeatures.forEach((feature, index) => {
            const sizeRatio = maxScore > 0 ? feature.score / maxScore : 0.5;
            const nodeSize = 100 * 0.6 + (100 * 0.8 * sizeRatio);

            nodes.push({
                id: `feature-${feature.id}`,
                type: 'featureNode',
                position: { x: COL_FEATURE_X - (nodeSize / 2), y: index * 180 + 100 - (nodeSize / 2) },
                data: {
                    label: feature.name,
                    effortMds: feature.total_effort_mds,
                    epicMds: feature.epicMdsSum,
                    score: feature.score,
                    maxScore: maxScore,
                    baseSize: 100,
                },
            });

            // 3. Create Edges (Customer -> Feature)
            // Thickness proportional to ROI: Potential_TCV / Total_Effort_MDs
            feature.customer_targets.forEach((target) => {
                if (!visibleCustomers.has(target.customer_id)) return;
                const customer = data.customers.find(c => c.id === target.customer_id);
                if (customer) {
                    const targetTcv = target.tcv_type === 'existing' ? customer.existing_tcv : customer.potential_tcv;
                    const roi = targetTcv / feature.total_effort_mds;
                    // Normalize stroke width between 2px and 8px based on some arbitrary high ROI value (e.g., 20k/MD)
                    const normalizedStrokeWidth = Math.min(8, Math.max(2, (roi / 20000) * 8));

                    edges.push({
                        id: `edge-${target.customer_id}-${feature.id}-${target.tcv_type}`,
                        source: `customer-${target.customer_id}`,
                        sourceHandle: target.tcv_type, // 'existing' or 'potential'
                        target: `feature-${feature.id}`,
                        type: 'default',
                        style: {
                            strokeWidth: normalizedStrokeWidth,
                            stroke: '#b0b0b0',
                        },
                    });
                }
            });
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

        const sortedEpics = [...(data.epics || [])].sort((a, b) => parseISO(a.target_start).getTime() - parseISO(b.target_start).getTime());
        const epicLanes: Record<string, number> = {};

        sortedEpics.forEach(epic => {
            const team = data.teams.find(t => t.id === epic.team_id);
            if (!team) return;

            const start = parseISO(epic.target_start);
            const end = parseISO(epic.target_end);
            const duration = differenceInDays(end, start) + 1;

            const lanes = teamLanes[team.id].endDates;
            let laneIdx = 0;
            while (laneIdx < lanes.length && start <= lanes[laneIdx]) {
                laneIdx++;
            }
            lanes[laneIdx] = end;

            epicLanes[epic.id] = laneIdx;
            if (laneIdx + 1 > teamMaxLanes[team.id]) {
                teamMaxLanes[team.id] = laneIdx + 1;
            }

            let totalOverrideMd = 0;
            let overrideDays = 0;

            // Pre-calculate overrides to determine remaining MDs
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

            const remainingDefaultMd = Math.max(0, epic.remaining_md - totalOverrideMd);
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
                        // User manually provided raw MD effort for this intersection
                        teamSprintUsage[team.id][sprint.id] += overrideVal;
                    } else {
                        // Default proportional spread from REMAINING pool
                        const proportion = remainingDefaultDays > 0 ? (overlapDays / remainingDefaultDays) : 0;
                        teamSprintUsage[team.id][sprint.id] += (remainingDefaultMd * proportion);
                    }
                }
            });
        });

        const teamBaseY: Record<string, number> = {};
        let currentLaneTop = 10; // start a bit down

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

        // 5. Create Edges (Feature -> Team)
        data.epics.forEach(epic => {
            if (!visibleFeatures.has(epic.feature_id) || !visibleTeams.has(epic.team_id) || !visibleEpics.has(epic.id)) return;

            const normalizedStrokeWidth = Math.min(8, Math.max(2, (epic.remaining_md / 20) * 8));
            edges.push({
                id: `edge-${epic.feature_id}-${epic.team_id}-${epic.id}`,
                source: `feature-${epic.feature_id}`,
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
                const start = parseISO(epic.target_start);
                const end = parseISO(epic.target_end);

                // Only render if it overlaps the visible window
                if (end < windowStartDate || start > windowEndDate) return;

                const renderStart = max([start, windowStartDate]);
                const renderEnd = min([end, windowEndDate]);

                const daysOffset = Math.max(0, differenceInDays(renderStart, windowStartDate));
                // Ensure duration doesn't go negative or 0 if start == end
                const duration = Math.max(1, differenceInDays(renderEnd, renderStart) + 1);

                const laneIdx = epicLanes[epic.id];
                const maxLanes = Math.max(teamMaxLanes[team.id] || 1, 1);

                // Center vertically around baseY
                const ganttStartY = baseY - ((maxLanes - 1) * 45) / 2;
                const yPos = ganttStartY + (laneIdx * 45);

                const feature = data.features.find(f => f.id === epic.feature_id);

                // Build the segments for heat/intensity mapping
                const segments: { startOffsetPixels: number, widthPixels: number, intensity: number }[] = [];
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
                        if (segmentOffsetPixels + segmentWidthPixels > duration * PIXELS_PER_DAY) {
                            segmentWidthPixels = (duration * PIXELS_PER_DAY) - segmentOffsetPixels;
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
                        const remainingDefaultMd = Math.max(0, epic.remaining_md - totalOverrideMd);
                        const remainingDefaultDays = Math.max(0, duration - overrideDays);

                        if (overrideVal !== undefined) {
                            segmentEffort = overrideVal;
                        } else {
                            const proportion = remainingDefaultDays > 0 ? (overlapDays / remainingDefaultDays) : 0;
                            segmentEffort = remainingDefaultMd * proportion;
                        }

                        // Calculate mathematical strictly uniform proportion for the baseline:
                        const baselineProportion = overlapDays / duration;
                        const baselineEffort = epic.remaining_md * baselineProportion;

                        let intensityRatio = 1;
                        if (baselineEffort > 0) {
                            intensityRatio = segmentEffort / baselineEffort;
                        } else if (segmentEffort > 0) {
                            intensityRatio = 2; // if baseline is 0 but we threw effort on it, glow white
                        }

                        segments.push({
                            startOffsetPixels: segmentOffsetPixels,
                            widthPixels: segmentWidthPixels,
                            intensity: intensityRatio
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
                        label: `${epic.name || feature?.name || 'Task'} (${epic.remaining_md} MDs)`,
                        width: duration * PIXELS_PER_DAY,
                        color: '#8b5cf6',
                        jiraKey: epic.jira_key,
                        jiraBaseUrl: data?.settings?.jira_base_url,
                        epicId: epic.id,
                        targetStart: epic.target_start,
                        targetEnd: epic.target_end,
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

                let sprintXOffset = 0;

                visibleSprints.forEach((sprint) => {
                    const usage = Math.round(teamSprintUsage[team.id][sprint.id] * 10) / 10;

                    const sprintStartDate = parseISO(sprint.start_date);
                    const sprintEndDate = parseISO(sprint.end_date);
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
                            totalCapacityMds: team.sprint_capacity_overrides?.[sprint.id] ?? team.total_capacity_mds, // Use override if present
                            isOverridden: team.sprint_capacity_overrides?.[sprint.id] !== undefined,
                            width: width - 10,
                        },
                        selectable: false,
                    });

                    sprintXOffset += width;
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
        if (hoveredNodeId) {
            const hNodes = new Set<string>();
            const hEdges = new Set<string>();
            const hHandles = new Map<string, Set<string>>();

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
                    // Extract epic context when passing from Feature to Team
                    if (currentNodeId.startsWith('feature-') && e.id.startsWith('edge-')) {
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

                // If at a team node, only follow incoming edges from the feature that owns this epic
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

            // Apply styles to all nodes and edges based on sets
            const dimStyle = { opacity: 0.15, transition: 'opacity 0.2s' };
            const highlightStyle = { opacity: 1, transition: 'opacity 0.2s' };

            nodes.forEach(n => {
                // Sprint headers are ignored from dimming for nicer UX
                if (n.type !== 'sprintCapacityNode') {
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
            edges.forEach(e => {
                e.style = {
                    ...e.style,
                    opacity: hEdges.has(e.id) ? 1 : 0.05,
                    stroke: hEdges.has(e.id) ? '#3b82f6' : (e.style?.stroke || '#b0b0b0'), // make highlighted edges blue for visibility
                    transition: 'all 0.2s'
                };
            });
        }

        return { nodes, edges };
    }, [data, hoveredNodeId, sprintOffset, customerFilter, featureFilter, teamFilter, epicFilter, showDependencies]);
}
