import React from 'react';
import type { NodeHoverAction } from './nodeHoverActionsContext';

interface NodeHoverChipsProps {
    actions: NodeHoverAction[];
    /** Render position relative to the node's bounding box. Default top-right. */
    position?: 'top-right' | 'top-left';
}

/**
 * Renders a horizontal row of small action chips, intended to be absolutely
 * positioned over a graph node. Visibility is the caller's responsibility
 * (e.g. driven by node-level hover state).
 */
export const NodeHoverChips: React.FC<NodeHoverChipsProps> = ({ actions, position = 'top-right' }) => {
    if (actions.length === 0) return null;

    const positionStyle: React.CSSProperties = position === 'top-right'
        ? { top: -10, right: -10 }
        : { top: -10, left: -10 };

    return (
        <div
            style={{
                position: 'absolute',
                ...positionStyle,
                display: 'flex',
                gap: '4px',
                zIndex: 20,
                pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
        >
            {actions.map(action => (
                <button
                    key={action.label}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        action.onClick(e);
                    }}
                    title={action.label}
                    aria-label={action.label}
                    aria-pressed={action.active ?? undefined}
                    style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: `1px solid ${action.active ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                        backgroundColor: action.active ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: action.active ? 'var(--text-on-accent, #fff)' : 'var(--text-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        boxShadow: '0 1px 3px var(--bg-shadow, rgba(0,0,0,0.4))',
                        transition: 'transform 0.1s, background-color 0.15s',
                    }}
                >
                    {action.icon}
                </button>
            ))}
        </div>
    );
};
