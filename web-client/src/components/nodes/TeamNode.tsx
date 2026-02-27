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
    const isSmall = nodeSize < 100;

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
                padding: isSmall ? '8px' : '12px',
                textAlign: 'center',
                position: 'relative',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
            title={data.label}
        >
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

            <div style={{ 
                fontWeight: 'bold', 
                fontSize: `${Math.max(10, nodeSize * 0.12)}px`,
                lineHeight: '1.1',
                maxHeight: '3.3em',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word'
            }}>
                {data.label}
            </div>
            <div style={{ 
                fontSize: `${Math.max(9, nodeSize * 0.1)}px`, 
                opacity: 0.9,
                marginTop: isSmall ? '2px' : '4px'
            }}>
                {isSmall ? `${data.capacityMds} MDs` : `Capacity: ${data.capacityMds} MDs`}
            </div>

            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
});

export default TeamNode;
