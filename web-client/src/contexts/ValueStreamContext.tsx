/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from 'react';
import type { ValueStreamData, Issue } from '@valuestream/shared-types';

// Re-export from dedicated context files so existing imports keep working
export { NotificationProvider, useNotificationContext } from './NotificationContext';
export type { NotificationContextType } from './NotificationContext';
export { UIStateProvider, useUIStateContext } from './UIStateContext';
export type { PageUiState } from './UIStateContext';

interface ValueStreamContextType {
    data: ValueStreamData | null;
    updateIssue: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
    addIssue: (issue: Issue) => void;
    deleteIssue: (id: string) => void;
}

const ValueStreamContext = createContext<ValueStreamContextType | null>(null);

export function useValueStreamContext() {
    const context = useContext(ValueStreamContext);
    if (!context) {
        throw new Error('useValueStreamContext must be used within a ValueStreamProvider');
    }
    return context;
}

export const ValueStreamProvider: React.FC<{
    children: React.ReactNode;
    value: {
        data?: ValueStreamData | null;
        updateIssue?: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
        addIssue?: (issue: Issue) => void;
        deleteIssue?: (id: string) => void;
    };
}> = ({ children, value }) => {
    const noop = async () => {};
    const contextValue = useMemo(() => ({
        data: value.data ?? null,
        updateIssue: value.updateIssue ?? noop,
        addIssue: value.addIssue ?? (() => {}),
        deleteIssue: value.deleteIssue ?? (() => {}),
    }), [value]);

    return (
        <ValueStreamContext.Provider value={contextValue}>
            {children}
        </ValueStreamContext.Provider>
    );
};
