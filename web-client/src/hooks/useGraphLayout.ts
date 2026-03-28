import type { ValueStreamData, ValueStreamParameters } from '@valuestream/shared-types';
import { useGraphFilters } from './useGraphFilters';
import { useGraphBuilder } from './useGraphBuilder';

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
    const filters = useGraphFilters(
        data,
        customerFilter,
        workItemFilter,
        releasedFilter,
        teamFilter,
        issueFilter,
        minTcv,
        minScore,
        selectedNodeId,
        baseParams,
        showDependencies
    );

    return useGraphBuilder(data, filters, hoveredNodeId, sprintOffset, showDependencies);
}
