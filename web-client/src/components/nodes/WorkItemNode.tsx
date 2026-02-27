import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface WorkItemNodeData {
    label: string;
    effortMds: number;
    epicMds?: number;
    score: number;
    maxScore: number;
    baseSize: number;
    isGlobal?: boolean;
    releasedInSprintId?: string;
}

export const WorkItemNode = memo(({ data }: { data: WorkItemNodeData }) => {
    // Size ranges from 60px to 140px based on RICE Score proportion
    const sizeRatio = data.maxScore > 0 ? (data.score || 0) / data.maxScore : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);

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
                    border: data.isGlobal ? '3px solid #fcd34d' : '3px solid rgba(255, 255, 255, 0.2)',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                }}
            >
                <Handle type="target" position={Position.Left} style={{ top: nodeSize / 2, opacity: 0 }} />

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
                </div>

                <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: `${Math.max(10, nodeSize * 0.22)}px`, 
                    color: '#fcd34d' 
                }}>
                    {Math.round(data.score)}
                </div>

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

export default WorkItemNode;
