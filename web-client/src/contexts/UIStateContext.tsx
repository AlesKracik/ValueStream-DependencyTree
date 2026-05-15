/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ValueStreamViewState } from '@valuestream/shared-types';

export interface PageUiState {
    filter?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    scrollPosition?: number;
    /**
     * Whether the list page's filter bar is collapsed. Pages that pass
     * `collapsible` to GenericListPage persist this here so the choice
     * survives in-app navigation (it resets on a full page refresh).
     */
    filtersCollapsed?: boolean;
    /**
     * 1-based page index for paginated list pages. Stored here (in-memory)
     * so that returning to a list (e.g. via the back button from a detail
     * page) restores the user's spot. Resets on browser refresh / new tab.
     */
    page?: number;
    /**
     * Page-specific filter state object — shape is owned by each list page
     * (e.g. WorkItemFilters, CustomerFilters, SupportFilters). Same in-memory
     * persistence rules as the rest of PageUiState.
     */
    pageFilters?: unknown;
}

interface UIStateContextType {
    uiState: Record<string, PageUiState>;
    /**
     * Merge `value` into the existing `uiState[key]` entry. Callers may pass
     * just the fields they own (e.g. GenericListPage writes filter/sort/scroll;
     * the list page itself writes pageFilters/page) without stomping each
     * other's slots.
     */
    updateUiState: (key: string, value: Partial<PageUiState>) => void;
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
        // Default to all active statuses (everything except Done) so the dashboard
        // opens focused on in-flight work. Users can still tick Done back on.
        statusFilter: ['Backlog', 'Planning', 'Development'],
    });

    const updateUiState = useCallback((key: string, val: Partial<PageUiState>) => {
        setUiState(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...val } }));
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
