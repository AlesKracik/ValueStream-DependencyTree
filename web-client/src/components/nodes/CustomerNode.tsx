import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

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
    // To make Potential "fully visible" and "additive", the inner circle 
    // should be a direct proportion of the outer circle's diameter.
    const innerSize = data.totalTcv > 0 
        ? (data.existingTcv / data.totalTcv) * outerSize 
        : 0;

    const hlMode = data.highlightMode || 'all';
    // If hlMode is 'none', the entire node is dimmed via its parent wrapper container, so we leave it 100% visible relative to the dim.
    const potentialOpacity = (hlMode === 'all' || hlMode === 'potential' || hlMode === 'none') ? 1 : 0.15;
    const existingOpacity = (hlMode === 'all' || hlMode === 'existing' || hlMode === 'none') ? 1 : 0.15;

    // Use proportional font sizes for each metric
    const outerFontSize = `${Math.max(10, outerSize * 0.16)}px`;
    const innerFontSize = `${Math.max(10, innerSize * 0.22)}px`;

    return (
        <div style={{ position: 'relative', width: outerSize, height: outerSize + 40 }}>
            {/* Outer Circle (Total TCV: Existing + Potential) */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${outerSize}px`,
                    height: `${outerSize}px`,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)', // Slightly lighter
                    border: '2px dashed rgba(59, 130, 246, 0.6)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: '6px', 
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                    opacity: potentialOpacity
                }}
            >
                {/* Total Text */}
                <span style={{ 
                    fontSize: outerFontSize, 
                    color: '#60a5fa', 
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                }}>
                    ${(data.totalTcv / 1000).toFixed(0)}k
                </span>

                {/* Target Handle for Potential Connections */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="potential"
                    style={{ background: '#60a5fa', width: '6px', height: '6px', right: '-3px', top: outerSize / 2, opacity: 0 }}
                />
            </div>

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

            {/* External Label */}
            <div style={{
                position: 'absolute',
                top: `${outerSize + 8}px`,
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

            {/* Input handle (just in case) */}
            <Handle type="target" position={Position.Left} style={{ top: outerSize / 2, opacity: 0 }} />
        </div>
    );
});

export default CustomerNode;
