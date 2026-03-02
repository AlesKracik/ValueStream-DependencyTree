import { memo } from 'react';
import { Position } from '@xyflow/react';
import { BaseCircleNode } from './BaseCircleNode';

interface WorkItemNodeData {
    label: string;
    description?: string;
    effortMds: number;
    epicMds?: number;
    score: number;
    maxScore: number;
    baseSize: number;
    isGlobal?: boolean;
    releasedInSprintId?: string;
    hasDatelessEpics?: boolean;
    hasUnestimatedEffort?: boolean;
}

export const WorkItemNode = memo(({ data }: { data: WorkItemNodeData }) => {
    // Size ranges from 60px to 140px based on RICE Score proportion
    const sizeRatio = data.maxScore > 0 ? (data.score || 0) / data.maxScore : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);

    const handles = [
        { type: 'target' as const, position: Position.Left },
        { type: 'source' as const, position: Position.Right }
    ];

    return (
        <BaseCircleNode
            size={nodeSize}
            label={data.label}
            backgroundColor="#8b5cf6"
            tooltip={data.description}
            handles={handles}
        >
            <div style={{ 
                display: 'flex', 
                gap: '4px', 
                marginBottom: '-2px',
                fontSize: `${Math.max(10, nodeSize * 0.15)}px`
            }}>
                {data.isGlobal && (
                    <div title="Relates to all existing customers">🌐</div>
                )}
                {data.releasedInSprintId && (
                    <div title={`Released in Sprint ${data.releasedInSprintId}`}>📦</div>
                )}
                {data.hasDatelessEpics && (
                    <div title="Has epics without target dates" style={{ color: '#f87171' }}>🕒</div>
                )}
                {data.hasUnestimatedEffort && (
                    <div title="Effort is not estimated (0 MDs)" style={{ color: '#fbbf24' }}>📏</div>
                )}
            </div>

            <div style={{ 
                fontWeight: 'bold', 
                fontSize: `${Math.max(10, nodeSize * 0.22)}px`, 
                color: '#fcd34d' 
            }}>
                {Math.round(data.score)}
            </div>
        </BaseCircleNode>
    );
});

export default WorkItemNode;
