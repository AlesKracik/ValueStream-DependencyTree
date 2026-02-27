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
                padding: isSmall ? '8px' : '12px',
                textAlign: 'center',
                position: 'relative',
                boxSizing: 'border-box'
            }}
            title={data.label}
        >
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

            <div style={{ 
                fontWeight: 'bold', 
                fontSize: `${Math.max(10, nodeSize * 0.12)}px`,
                lineHeight: '1.1',
                maxHeight: '3.3em', // roughly 3 lines
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
                padding: '0 2px'
            }}>
                {data.label}
            </div>

            <div style={{ 
                marginTop: isSmall ? '2px' : '4px', 
                fontSize: `${Math.max(9, nodeSize * 0.09)}px`, 
                opacity: 0.9,
                display: 'flex',
                flexDirection: 'column',
                gap: '1px'
            }}>
                {!isSmall && data.epicMds !== undefined && data.epicMds > 0 && <div>Epics: {data.epicMds} MDs</div>}
                {!isSmall && data.effortMds > 0 && <div>Est: {data.effortMds} MDs</div>}
                <div style={{ 
                    marginTop: isSmall ? '0' : '2px', 
                    fontWeight: 'bold', 
                    color: '#fcd34d' 
                }}>
                    {isSmall ? `S:${Math.round(data.score)}` : `Score: ${Math.round(data.score || 0).toLocaleString()}`}
                </div>
            </div>

            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
});

export default WorkItemNode;
