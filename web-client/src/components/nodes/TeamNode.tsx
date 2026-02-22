import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

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

    return (
        <div
            style={{
                width: `${nodeSize}px`,
                height: `${nodeSize}px`,
                borderRadius: '50%',
                backgroundColor: '#4b5563', // Dark Gray (Tertiary)
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                border: '3px solid rgba(255, 255, 255, 0.2)',
                transition: 'all 0.2s',
                padding: '10px',
                textAlign: 'center',
                position: 'relative'
            }}
        >
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

            <div style={{ fontWeight: 'bold', fontSize: `${Math.max(11, nodeSize * 0.12)}px` }}>
                {data.label}
            </div>
            <div style={{ fontSize: `${Math.max(10, nodeSize * 0.1)}px`, opacity: 0.9 }}>
                Capacity: {data.capacityMds} MDs
            </div>

            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
});

export default TeamNode;
