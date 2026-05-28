import { createContext, useContext } from 'react';
import type React from 'react';

export interface NodeHoverAction {
    /** Short label, shown as title/aria-label and beside the icon. */
    label: string;
    /** Single-character glyph or emoji rendered inside the chip. */
    icon: string;
    /** Click handler — receives no args; bind the node id at the call site. */
    onClick: (event: React.MouseEvent) => void;
    /** Optional toggled-on state for two-state actions (e.g. focused / unfocused). */
    active?: boolean;
}

interface NodeHoverActionsContextValue {
    /** Toggle focus on a given node id (same gesture as right-click). */
    onFocusNode: (nodeId: string) => void;
    /** Id of the currently focused (subtree-pinned) node, or null. */
    focusedNodeId: string | null;
}

export const NodeHoverActionsContext = createContext<NodeHoverActionsContextValue | null>(null);

export const NodeHoverActionsProvider = NodeHoverActionsContext.Provider;

export function useNodeHoverActions(): NodeHoverActionsContextValue | null {
    return useContext(NodeHoverActionsContext);
}
