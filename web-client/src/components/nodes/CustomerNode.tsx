import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseCircleNode } from './BaseCircleNode';

interface CustomerNodeData {
    label: string;
    existingTcv: number;
    potentialTcv: number;
    totalTcv: number;
    maxTcv: number;
    baseSize: number;
    highlightMode?: 'all' | 'existing' | 'potential' | 'none';
}

export const CustomerNode = memo(({ data }: { data: CustomerNodeData }) => {
    // We assume data.maxTcv is the maximum TOTAL TCV across all customers
    const totalRatio = data.maxTcv > 0 ? data.totalTcv / data.maxTcv : 0.5;
    
    // Calculate sizes
    // The outer circle represents the Total (Existing + Potential)
    const outerSize = data.baseSize * 0.6 + (data.baseSize * 0.8 * totalRatio);
    
    // The inner circle represents Existing TCV. 
    const innerSize = data.totalTcv > 0 
        ? (data.existingTcv / data.totalTcv) * outerSize 
        : 0;

    const hlMode = data.highlightMode || 'all';
    const potentialOpacity = (hlMode === 'all' || hlMode === 'potential' || hlMode === 'none') ? 1 : 0.15;
    const existingOpacity = (hlMode === 'all' || hlMode === 'existing' || hlMode === 'none') ? 1 : 0.15;

    // Use proportional font sizes for each metric
    const outerFontSize = `${Math.max(10, outerSize * 0.16)}px`;
    const innerFontSize = `${Math.max(10, innerSize * 0.22)}px`;

    const handles = [
        { type: 'target' as const, position: Position.Left, style: { top: outerSize / 2 } },
        { 
            type: 'source' as const, 
            position: Position.Right, 
            id: 'potential', 
            style: { background: '#60a5fa', width: '6px', height: '6px', right: '-3px', top: outerSize / 2 } 
        }
    ];

    return (
        <BaseCircleNode
            size={outerSize}
            label={data.label}
            backgroundColor="rgba(59, 130, 246, 0.15)"
            borderColor="rgba(59, 130, 246, 0.6)"
            borderStyle="dashed"
            borderWidth={2}
            handles={handles}
            style={{ 
                opacity: potentialOpacity,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '6px',
                overflow: 'visible' // Important to see inner circle and its handle
            }}
        >
            {/* Total Text */}
            <span style={{ 
                fontSize: outerFontSize, 
                color: '#60a5fa', 
                fontWeight: 'bold',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                zIndex: 1
            }}>
                ${(data.totalTcv / 1000).toFixed(0)}k
            </span>

            {/* Inner Circle (Existing TCV) */}
            <div
                style={{
                    position: 'absolute',
                    top: outerSize / 2,
                    left: outerSize / 2,
                    transform: 'translate(-50%, -50%)',
                    width: `${innerSize}px`,
                    height: `${innerSize}px`,
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6', // Solid Light Blue
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    border: innerSize > 0 ? '2px solid rgba(255, 255, 255, 0.3)' : 'none',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    opacity: existingOpacity,
                    overflow: 'hidden'
                }}
            >
                {innerSize > 25 && (
                    <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: innerFontSize, 
                        opacity: 1,
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                    }}>
                        ${(data.existingTcv / 1000).toFixed(0)}k
                    </div>
                )}

                {/* Target Handle for Existing Connections */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="existing"
                    style={{ background: '#fff', width: '6px', height: '6px', right: '-3px', top: innerSize / 2, opacity: 0 }}
                />
            </div>
        </BaseCircleNode>
    );
});

export default CustomerNode;
