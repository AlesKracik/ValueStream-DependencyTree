import { useMemo } from 'react';
import { parseISO } from 'date-fns';
import type { ValueStreamData, ValueStreamParameters, WorkItemPriorityMetric } from '@valuestream/shared-types';

export interface GraphFilterResult {
    visibleCustomers: ReadonlySet<string>;
    visibleWorkItems: ReadonlySet<string>;
    visibleTeams: ReadonlySet<string>;
    visibleIssues: ReadonlySet<string>;
    combinedMinTcv: number;
    combinedMinScore: number;
    /** True when any transient filter or selectedNodeId is active — used by builder to gate highlight logic */
    isAnyFilterActive: boolean;
}

/**
 * Extra dashboard filters added on top of the legacy positional ones, mirroring
 * the WorkItems list page filter set. Passed as a single object so the hook's
 * signature doesn't grow another seven positional params.
 *
 * All ranges are post-coerced to numbers; pass NaN (or omit) for "no bound".
 */
export interface DashboardFilters {
    /** Upper bound for combined customer TCV (existing + potential). */
    maxTcv?: number;
    /** Range against the field selected by `priorityMetric`. */
    minPriority?: number;
    maxPriority?: number;
    /** Range against work-item `calculated_effort`. */
    minEffort?: number;
    maxEffort?: number;
    /** Work-item status multi-select. Selecting "Backlog" also matches docs with
     *  missing/empty status (mirrors the WorkItems list page semantics). */
    statuses?: string[];
    /** Multi-select of sprint IDs that the work item was released in. The literal
     *  'unreleased' is a sentinel that matches docs with no `released_in_sprint_id`. */
    releasedSprintIds?: string[];
    /** Drives which field the `minPriority`/`maxPriority` range targets. */
    priorityMetric?: WorkItemPriorityMetric;
}

const PRIORITY_FIELD = (metric: WorkItemPriorityMetric | undefined): 'calculated_score' | 'aha_synced_data.score' | 'stackrank' => {
    if (metric === 'aha_score') return 'aha_synced_data.score';
    if (metric === 'stackrank') return 'stackrank';
    return 'calculated_score';
};

const STANDARD_STATUSES = new Set(['Backlog', 'Planning', 'Development', 'Done']);

export function useGraphFilters(
    data: ValueStreamData | null,
    customerFilter: string,
    workItemFilter: string,
    releasedFilter: 'all' | 'released' | 'unreleased',
    teamFilter: string,
    issueFilter: string,
    minTcv: number,
    minScore: number,
    selectedNodeId: string | null,
    baseParams: ValueStreamParameters | null,
    showDependencies: boolean,
    dashboardFilters?: DashboardFilters
): GraphFilterResult {
    return useMemo(() => {
        if (!data) return {
            visibleCustomers: new Set<string>(),
            visibleWorkItems: new Set<string>(),
            visibleTeams: new Set<string>(),
            visibleIssues: new Set<string>(),
            combinedMinTcv: 0,
            combinedMinScore: 0,
            isAnyFilterActive: false,
        };

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

        // Dashboard filters (the WorkItems list-style additions). All optional —
        // missing or NaN bounds mean "no constraint". `getPriorityValue` reads the
        // field that matches the active metric so a single range applies to
        // calculated_score / aha_synced_data.score / stackrank consistently.
        const df = dashboardFilters || {};
        const maxTcv = (df.maxTcv !== undefined && Number.isFinite(df.maxTcv)) ? df.maxTcv : Infinity;
        const minEffort = (df.minEffort !== undefined && Number.isFinite(df.minEffort)) ? df.minEffort : -Infinity;
        const maxEffort = (df.maxEffort !== undefined && Number.isFinite(df.maxEffort)) ? df.maxEffort : Infinity;
        const minPriority = (df.minPriority !== undefined && Number.isFinite(df.minPriority)) ? df.minPriority : -Infinity;
        const maxPriority = (df.maxPriority !== undefined && Number.isFinite(df.maxPriority)) ? df.maxPriority : Infinity;
        const priorityField = PRIORITY_FIELD(df.priorityMetric);
        const statusList = df.statuses && df.statuses.length > 0 ? df.statuses : null;
        const statusSet = statusList ? new Set(statusList) : null;
        const includesBacklog = !!statusSet?.has('Backlog');
        const releasedSprintList = df.releasedSprintIds && df.releasedSprintIds.length > 0 ? df.releasedSprintIds : null;
        const releasedSprintSet = releasedSprintList ? new Set(releasedSprintList.filter(s => s !== 'unreleased')) : null;
        const includesUnreleased = !!releasedSprintList?.includes('unreleased');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getPriorityValue = (workItem: any): number => {
            if (priorityField === 'calculated_score') return Number(workItem.calculated_score) || 0;
            if (priorityField === 'stackrank') return Number(workItem.stackrank) || 0;
            return Number(workItem.aha_synced_data?.score) || 0;
        };

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

        const hasDashboardConstraint =
            Number.isFinite(maxTcv) ||
            Number.isFinite(minPriority) || Number.isFinite(maxPriority) ||
            Number.isFinite(minEffort) || Number.isFinite(maxEffort) ||
            !!statusSet || !!releasedSprintList;

        const isFilterActive = cf || bcf || ff || bff || tf || btf || ef || bef ||
                             releasedFilter !== 'all' || bRel !== 'all' ||
                             combinedMinTcv > 0 || combinedMinScore > 0 ||
                             hasDashboardConstraint ||
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

                // Min TCV for standalone visibility, plus the new Max TCV bound.
                const totalTcv = (c.existing_tcv || 0) + (c.potential_tcv || 0);
                if (totalTcv < combinedMinTcv) return false;
                if (totalTcv > maxTcv) return false;
                return true;
            }).map(c => c.id)
        );

        // For workitems, use the pre-calculated score from the server
        const validWorkItems = new Set(
            data.workItems.filter(workItem => {
                const transientTextMatch = !ff || workItem.name.toLowerCase().includes(ff);
                const baseTextMatch = !bff || workItem.name.toLowerCase().includes(bff);
                if (!transientTextMatch || !baseTextMatch) return false;

                if (!passRelease(!!workItem.released_in_sprint_id)) return false;

                // Score lower bound merged from transient minScore + base param.
                // The dashboard exposes a metric-aware Priority range instead of
                // a raw score range, so there's no upper-bound on calculated_score.
                const score = workItem.calculated_score !== undefined ? workItem.calculated_score : 0;
                if (score < combinedMinScore) return false;

                // Effort range (calculated_effort).
                const effort = workItem.calculated_effort !== undefined ? workItem.calculated_effort : 0;
                if (effort < minEffort || effort > maxEffort) return false;

                // Priority range against whichever metric the user selected.
                const priorityVal = getPriorityValue(workItem);
                if (priorityVal < minPriority || priorityVal > maxPriority) return false;

                // Status multi-select. Selecting "Backlog" also includes docs
                // with missing/empty status — matches the WorkItems list UI's
                // `w.status || 'Backlog'` rendering.
                if (statusSet) {
                    const ws = workItem.status || '';
                    const inSet = statusSet.has(ws);
                    const treatedAsBacklog = includesBacklog && (!ws || !STANDARD_STATUSES.has(ws));
                    if (!inSet && !treatedAsBacklog) return false;
                }

                // Released-sprint multi-select. The 'unreleased' sentinel matches
                // work items with no released_in_sprint_id; explicit IDs match a
                // direct equality on the field.
                if (releasedSprintList) {
                    const rid = workItem.released_in_sprint_id;
                    const isReleasedToSelected = !!rid && releasedSprintSet?.has(rid);
                    const isUnreleasedAndAllowed = !rid && includesUnreleased;
                    if (!isReleasedToSelected && !isUnreleasedAndAllowed) return false;
                }

                return true;
            }).map(workItem => workItem.id)
        );

        const validIssues = new Set(
            (data.issues || []).filter(issue => {
                const team = data.teams.find(t => t.id === issue.team_id);
                const transientTeamMatch = !tf || (team && team.name.toLowerCase().includes(tf));
                const baseTeamMatch = !btf || (team && team.name.toLowerCase().includes(btf));

                const workItem = data.workItems.find(wi => wi.id === issue.work_item_id);
                const issueName = issue.name || workItem?.name || 'Task';
                const transientIssueMatch = !ef || issueName.toLowerCase().includes(ef);
                const baseIssueMatch = !bef || issueName.toLowerCase().includes(bef);

                // Sprint Range Filter: Proper overlap check
                let rangeMatch = true;
                if (rangeStartDate || rangeEndDate) {
                    if (!issue.target_start || !issue.target_end) {
                        rangeMatch = false;
                    } else {
                        const start = parseISO(issue.target_start);
                        const end = parseISO(issue.target_end);

                        const overlapStart = rangeStartDate ? (end >= rangeStartDate) : true;
                        const overlapEnd = rangeEndDate ? (start <= rangeEndDate) : true;

                        rangeMatch = overlapStart && overlapEnd;
                    }
                }

                return transientTeamMatch && baseTeamMatch && transientIssueMatch && baseIssueMatch && rangeMatch;
            }).map(issue => issue.id)
        );

        const hasCustomerFilter = cf !== '' || bcf !== '' || combinedMinTcv > 0 || Number.isFinite(maxTcv);
        const hasWorkItemFilter =
            ff !== '' || bff !== '' || combinedMinScore > 0 ||
            releasedFilter !== 'all' || bRel !== 'all' ||
            Number.isFinite(minEffort) || Number.isFinite(maxEffort) ||
            Number.isFinite(minPriority) || Number.isFinite(maxPriority) ||
            !!statusSet || !!releasedSprintList;
        const hasTeamIssueFilter = tf !== '' || btf !== '' || ef !== '' || bef !== '' || hasRangeFilter;

        if (!isFilterActive && !selectedNodeId) {
            data.customers.forEach(c => visibleCustomers.add(c.id));
            data.workItems.forEach(workItem => visibleWorkItems.add(workItem.id));
            data.teams.forEach(team => visibleTeams.add(team.id));
            (data.issues || []).forEach(issue => visibleIssues.add(issue.id));
        } else {
            // Build intersection graph
            data.workItems.forEach(workItem => {
                if (!validWorkItems.has(workItem.id)) return; // WorkItem intrinsically fails

                // Find connected valid Customers
                let connectedValidCustomers: string[] = [];
                if (workItem.all_customers_target) {
                    const type = workItem.all_customers_target.tcv_type;
                    // All valid customers who match combinedMinTcv
                    connectedValidCustomers = data.customers
                        .filter(c => validCustomers.has(c.id))
                        .filter(c => {
                            const val = (type === 'existing' ? (c.existing_tcv || 0) : (c.potential_tcv || 0));
                            return val >= combinedMinTcv && val > 0;
                        })
                        .map(c => c.id);
                } else {
                    connectedValidCustomers = workItem.customer_targets
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
                    .filter(issue => issue.work_item_id === workItem.id && validIssues.has(issue.id));

                // Strict intersection rules:
                // If a customer filter is active (transient or base), we MUST have a valid connected customer,
                // UNLESS it is a global work item which is shown regardless of customer matches.
                if (hasCustomerFilter && connectedValidCustomers.length === 0 && !workItem.all_customers_target) return;

                // If a team/issue filter is active (transient or base), we MUST have a valid connected issue.
                if (hasTeamIssueFilter && connectedValidIssues.length === 0) return;

                // If it survives to here, this workitem path is fully viable!
                visibleWorkItems.add(workItem.id);
                connectedValidCustomers.forEach(cId => visibleCustomers.add(cId));
                connectedValidIssues.forEach(issue => {
                    visibleIssues.add(issue.id);
                    visibleTeams.add(issue.team_id);
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
                (data.issues || []).forEach(issue => {
                    if ((!issue.work_item_id || issue.work_item_id === 'UNASSIGNED') && validIssues.has(issue.id)) {
                        visibleIssues.add(issue.id);
                        visibleTeams.add(issue.team_id);
                    }
                });
            }

            // Special case: Standalone Teams
            // If a team filter is active, ensure matching teams are visible even if they have no issues or workitems
            if (tf || btf) {
                data.teams.forEach(team => {
                    const transientTeamMatch = !tf || team.name.toLowerCase().includes(tf);
                    const baseTeamMatch = !btf || team.name.toLowerCase().includes(btf);
                    if (transientTeamMatch && baseTeamMatch) {
                        visibleTeams.add(team.id);
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
                let outgoingEdges = logicalEdges.filter(edge => edge.source === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceIssueId) {
                    outgoingEdges = outgoingEdges.filter(edge => edge.target === `gantt-${sourceIssueId}`);
                }

                outgoingEdges.forEach(edge => {
                    let nextIssueId = sourceIssueId;
                    if (currentNodeId.startsWith('workitem-') && edge.id.startsWith('edge__')) {
                        const parts = edge.id.split('__');
                        if (parts.length >= 4) {
                            nextIssueId = parts[3];
                        }
                    }
                    traceDownstream(edge.target, nextIssueId);
                });
            };

            const visitedSource = new Set<string>();
            const traceUpstream = (currentNodeId: string, sourceIssueId?: string) => {
                const contextKey = `${currentNodeId}-${sourceIssueId || 'none'}`;
                if (visitedSource.has(contextKey)) return;
                visitedSource.add(contextKey);

                hNodes.add(currentNodeId);
                let incomingEdges = logicalEdges.filter(edge => edge.target === currentNodeId);

                if (currentNodeId.startsWith('team-') && sourceIssueId) {
                    incomingEdges = incomingEdges.filter(edge => edge.id.endsWith(`__${sourceIssueId}`));
                }

                incomingEdges.forEach(edge => {
                    let nextIssueId = sourceIssueId;
                    if (currentNodeId.startsWith('gantt-')) {
                        nextIssueId = currentNodeId.replace('gantt-', '');
                    }
                    traceUpstream(edge.source, nextIssueId);
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

        const isAnyFilterActive = !!(customerFilter || workItemFilter || teamFilter || issueFilter ||
            minTcv > 0 || minScore > 0 || selectedNodeId || hasDashboardConstraint);

        return { visibleCustomers, visibleWorkItems, visibleTeams, visibleIssues, combinedMinTcv, combinedMinScore, isAnyFilterActive };
    // dashboardFilters is the only object dep — the caller is expected to memoize
    // it so re-renders don't trigger spurious recompute. Stringifying is overkill.
    }, [data, customerFilter, workItemFilter, releasedFilter, teamFilter, issueFilter, minTcv, minScore, selectedNodeId, baseParams, showDependencies, dashboardFilters]);
}
