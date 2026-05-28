import React, { memo, useMemo, useState } from 'react';
import { Handle, Position, useNodeId } from '@xyflow/react';
import { NodeHoverChips } from './NodeHoverActions';
import { useNodeHoverActions, type NodeHoverAction } from './nodeHoverActionsContext';

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
    /** Optional action chips shown when the node is hovered. */
    hoverActions?: NodeHoverAction[];
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
    opacity = 1,
    hoverActions,
}: BaseCircleNodeProps) => {
    const [chipsVisible, setChipsVisible] = useState(false);
    const nodeId = useNodeId();
    const nodeActions = useNodeHoverActions();

    const resolvedActions = useMemo<NodeHoverAction[]>(() => {
        if (hoverActions !== undefined) return hoverActions;
        if (!nodeId || !nodeActions) return [];
        const isFocused = nodeActions.focusedNodeId === nodeId;
        return [
            {
                label: isFocused ? 'Clear focus' : 'Focus subtree',
                icon: isFocused ? '✕' : '🎯',
                active: isFocused,
                onClick: () => nodeActions.onFocusNode(nodeId),
            },
        ];
    }, [hoverActions, nodeId, nodeActions]);

    const showChips = chipsVisible && resolvedActions.length > 0;

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
            onMouseEnter={() => setChipsVisible(true)}
            onMouseLeave={() => setChipsVisible(false)}
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

            {showChips && (
                <NodeHoverChips actions={resolvedActions} />
            )}

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
