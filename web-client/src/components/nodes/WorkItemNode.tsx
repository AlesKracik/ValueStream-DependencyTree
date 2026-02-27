import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface WorkItemNodeData {
    label: string;
    effortMds: number;
    epicMds?: number;
    score: number;
    maxScore: number;
    baseSize: number;
}

export const WorkItemNode = memo(({ data }: { data: WorkItemNodeData }) => {
    // Size ranges from 60px to 140px based on RICE Score proportion
    const sizeRatio = data.maxScore > 0 ? (data.score || 0) / data.maxScore : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);
    const isSmall = nodeSize < 100;

    return (
        <div style={{ position: 'relative', width: nodeSize, height: nodeSize + 40 }}>
            <div
                style={{
                    width: `${nodeSize}px`,
                    height: `${nodeSize}px`,
                    borderRadius: '50%',
                    backgroundColor: '#8b5cf6',
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
                <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

                <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: `${Math.max(10, nodeSize * 0.22)}px`, 
                    color: '#fcd34d' 
                }}>
                    {Math.round(data.score)}
                </div>

                <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
            </div>

            {/* External Label */}
            <div style={{
                position: 'absolute',
                top: `${nodeSize + 4}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '160px',
                textAlign: 'center',
                color: '#e5e7eb',
                fontSize: '12px',
                fontWeight: '500',
                lineHeight: '1.2',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                pointerEvents: 'none'
            }}>
                {data.label}
            </div>
        </div>
    );
});

export default WorkItemNode;
