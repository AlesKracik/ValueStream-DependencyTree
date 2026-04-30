/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ValueStreamViewState } from '@valuestream/shared-types';

export interface PageUiState {
    filter?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    scrollPosition?: number;
}

interface UIStateContextType {
    uiState: Record<string, PageUiState>;
    updateUiState: (key: string, value: PageUiState) => void;
    viewState: ValueStreamViewState;
    setViewState: React.Dispatch<React.SetStateAction<ValueStreamViewState>>;
}

const UIStateContext = createContext<UIStateContextType | null>(null);

export function useUIStateContext() {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIStateContext must be used within a UIStateProvider');
    }
    return context;
}

export const UIStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [uiState, setUiState] = useState<Record<string, PageUiState>>({});
    const [viewState, setViewState] = useState<ValueStreamViewState>({
        sprintOffset: 0,
        customerFilter: '',
        workItemFilter: '',
        releasedFilter: 'all',
        minTcvFilter: '',
        minScoreFilter: '',
        teamFilter: '',
        issueFilter: '',
        showDependencies: false,
        disableHoverHighlight: true,
        prioritizationMetric: 'score',
        isInitialOffsetSet: false,
        filtersCollapsed: false,
    });

    const updateUiState = useCallback((key: string, val: PageUiState) => {
        setUiState(prev => ({ ...prev, [key]: val }));
    }, []);

    const contextValue = useMemo(() => ({
        uiState,
        updateUiState,
        viewState,
        setViewState
    }), [uiState, updateUiState, viewState]);

    return (
        <UIStateContext.Provider value={contextValue}>
            {children}
        </UIStateContext.Provider>
    );
};
