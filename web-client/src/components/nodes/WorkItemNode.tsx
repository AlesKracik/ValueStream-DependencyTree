import { memo } from 'react';
import { Position } from '@xyflow/react';
import { BaseCircleNode } from './BaseCircleNode';

interface WorkItemNodeData {
    label: string;
    description?: string;
    effortMds: number;
    issueMds?: number;
    /** Metric value to display in the circle. null/undefined renders as "—". */
    score: number | null;
    maxScore: number;
    baseSize: number;
    isGlobal?: boolean;
    releasedInSprintId?: string;
    hasDatelessIssues?: boolean;
    hasUnestimatedEffort?: boolean;
}

export const WorkItemNode = memo(({ data }: { data: WorkItemNodeData }) => {
    // Size ranges from 60px to 140px based on metric value proportion
    const sizeRatio = data.maxScore > 0 ? (data.score || 0) / data.maxScore : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);

    const handles = [
        { type: 'target' as const, position: Position.Left },
        { type: 'source' as const, position: Position.Right }
    ];

    const formatScore = (val: number) => {
        if (val >= 1000000) {
            return `${(val / 1000000).toFixed(1)}M`;
        }
        if (val >= 1000) {
            return `${(val / 1000).toFixed(1)}k`;
        }
        return Math.round(val).toLocaleString();
    };

    const iconSize = Math.max(10, nodeSize * 0.15);
    
    // Simple regex to strip HTML for the native browser tooltip
    const cleanDescription = data.description?.replace(/<[^>]*>?/gm, '');

    return (
        <BaseCircleNode
            size={nodeSize}
            label={data.label}
            backgroundColor="var(--node-workitem-bg)"
            tooltip={cleanDescription}
            handles={handles}
        >
            <div style={{ 
                display: 'flex', 
                gap: '4px', 
                marginBottom: '-2px',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {data.isGlobal && (
                    <div title="Relates to all existing customers" style={{ fontSize: `${iconSize}px`, filter: 'var(--icon-filter)' }}>🌐</div>
                )}
                {data.releasedInSprintId && (
                    <div title={`Released in Sprint ${data.releasedInSprintId}`} style={{ fontSize: `${iconSize}px`, filter: 'var(--icon-filter)' }}>📦</div>
                )}
                {data.hasDatelessIssues && (
                    <div title="Has issues without target dates" style={{ color: 'var(--status-danger)', fontSize: `${iconSize}px`, filter: 'var(--icon-filter)' }}>🕒</div>
                )}
                {data.hasUnestimatedEffort && (
                    <div title="Effort is not estimated (0 MDs)" style={{ color: 'var(--status-warning)', fontSize: `${iconSize}px`, filter: 'var(--icon-filter)' }}>📏</div>
                )}
            </div>

            <div style={{
                fontWeight: 'bold',
                fontSize: `${Math.max(10, nodeSize * 0.22)}px`,
                color: 'var(--node-score)'
            }}>
                {data.score == null ? '—' : formatScore(data.score)}
            </div>
        </BaseCircleNode>
    );
});

export default WorkItemNode;
