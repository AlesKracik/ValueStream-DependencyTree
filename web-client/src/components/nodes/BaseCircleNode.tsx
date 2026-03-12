import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export interface BaseCircleNodeHandle {
    type: 'source' | 'target';
    position: Position;
    id?: string;
    style?: React.CSSProperties;
}

interface BaseCircleNodeProps {
    size: number;
    label?: string;
    backgroundColor: string;
    borderColor?: string;
    borderStyle?: string;
    borderWidth?: number;
    tooltip?: string;
    handles?: BaseCircleNodeHandle[];
    children?: React.ReactNode;
    style?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
    containerStyle?: React.CSSProperties;
    onClick?: (event: React.MouseEvent) => void;
    opacity?: number;
}

/**
 * A reusable base component for circular React Flow nodes.
 * Standardizes styling, labels, and handles to reduce duplication.
 */
export const BaseCircleNode = memo(({
    size,
    label,
    backgroundColor,
    borderColor = 'rgba(255, 255, 255, 0.2)',
    borderStyle = 'solid',
    borderWidth = 3,
    tooltip,
    handles = [],
    children,
    style,
    labelStyle,
    containerStyle,
    onClick,
    opacity = 1
}: BaseCircleNodeProps) => {
    return (
        <div 
            style={{ 
                position: 'relative', 
                width: size, 
                height: label ? size + 40 : size,
                opacity,
                cursor: onClick ? 'pointer' : 'default',
                ...containerStyle 
            }} 
            title={tooltip}
            onClick={onClick}
        >
            <div
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '50%',
                    backgroundColor,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-highlight)',
                    boxShadow: '0 4px 6px -1px var(--bg-primary)',
                    border: borderWidth > 0 ? `${borderWidth}px ${borderStyle} ${borderColor}` : 'none',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    ...style
                }}
            >
                {handles.map((h, i) => (
                    <Handle
                        key={h.id || i}
                        type={h.type}
                        position={h.position}
                        id={h.id}
                        style={{ 
                            top: size / 2, 
                            opacity: 0,
                            ...h.style 
                        }}
                    />
                ))}

                {children}
            </div>

            {/* External Label */}
            {label && (
                <div style={{
                    position: 'absolute',
                    top: `${size + 8}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '220px',
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    lineHeight: '1.2',
                    textShadow: '0 2px 4px var(--bg-primary)',
                    pointerEvents: 'none',
                    ...labelStyle
                }}>
                    {label}
                </div>
            )}
        </div>
    );
});
