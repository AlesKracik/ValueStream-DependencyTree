import { memo } from 'react';
import { Position } from '@xyflow/react';
import { BaseCircleNode } from './BaseCircleNode';

interface TeamNodeData {
    label: string;
    capacityMds: number;
    maxCapacity: number;
    baseSize: number;
}

export const TeamNode = memo(({ data }: { data: TeamNodeData }) => {
    // Size ranges from 60px to 140px based on Capacity proportion
    const sizeRatio = data.maxCapacity > 0 ? data.capacityMds / data.maxCapacity : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);

    const handles = [
        { type: 'target' as const, position: Position.Left },
        { type: 'source' as const, position: Position.Right }
    ];

    return (
        <BaseCircleNode
            size={nodeSize}
            label={data.label}
            backgroundColor="var(--node-team-bg)"
            handles={handles}
        >
            <div style={{ 
                fontWeight: 'bold', 
                fontSize: `${Math.max(10, nodeSize * 0.18)}px`,
                color: 'var(--text-highlight)'
            }}>
                {data.capacityMds}
            </div>
            <div style={{ fontSize: `${Math.max(8, nodeSize * 0.1)}px`, color: 'var(--text-primary)', fontWeight: 'bold' }}>MDs</div>
        </BaseCircleNode>
    );
});

export default TeamNode;
