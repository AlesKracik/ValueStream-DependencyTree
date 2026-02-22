import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface FeatureNodeData {
    label: string;
    effortMds: number;
    epicMds?: number;
    score: number;
    maxScore: number;
    baseSize: number;
}

export const FeatureNode = memo(({ data }: { data: FeatureNodeData }) => {
    // Size ranges from 60px to 140px based on RICE Score proportion
    const sizeRatio = data.maxScore > 0 ? (data.score || 0) / data.maxScore : 0.5;
    const nodeSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * sizeRatio);

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
                padding: '10px',
                textAlign: 'center',
                position: 'relative'
            }}
        >
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

            <div style={{ fontWeight: 'bold', fontSize: `${Math.max(11, nodeSize * 0.12)}px` }}>
                {data.label}
            </div>

            <div style={{ marginTop: '4px', fontSize: `${Math.max(10, nodeSize * 0.1)}px`, opacity: 0.9 }}>
                {data.epicMds !== undefined && data.epicMds > 0 && <div>Epics: {data.epicMds} MDs</div>}
                {data.effortMds > 0 && <div>Est: {data.effortMds} MDs</div>}
                <div style={{ marginTop: '2px', fontWeight: 'bold', color: '#fcd34d' }}>Score: {Math.round(data.score || 0).toLocaleString()}</div>
            </div>

            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
});

export default FeatureNode;
