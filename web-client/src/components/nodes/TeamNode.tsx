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
        <div style={{ position: 'relative', width: nodeSize, height: nodeSize + 40 }}>
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
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                }}
            >
                <Handle type="target" position={Position.Left} style={{ top: nodeSize / 2, opacity: 0 }} />

                <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: `${Math.max(10, nodeSize * 0.18)}px`,
                    opacity: 1
                }}>
                    {data.capacityMds}
                </div>
                <div style={{ fontSize: `${Math.max(8, nodeSize * 0.1)}px`, opacity: 0.8 }}>MDs</div>

                <Handle type="source" position={Position.Right} style={{ top: nodeSize / 2, opacity: 0 }} />
            </div>

            {/* External Label */}
            <div style={{
                position: 'absolute',
                top: `${nodeSize + 8}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '220px',
                textAlign: 'center',
                color: '#f9fafb',
                fontSize: '18px',
                fontWeight: 'bold',
                lineHeight: '1.2',
                textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                pointerEvents: 'none'
            }}>
                {data.label}
            </div>
        </div>
    );
});

export default TeamNode;
