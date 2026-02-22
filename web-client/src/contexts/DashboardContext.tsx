import React, { createContext, useContext } from 'react';
import type { Epic } from '../types/models';

interface DashboardContextType {
    updateEpic: (id: string, updates: Partial<Epic>) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export const useDashboardContext = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboardContext must be used within a DashboardProvider');
    }
    return context;
};

export const DashboardProvider: React.FC<{
    children: React.ReactNode;
    value: DashboardContextType;
}> = ({ children, value }) => {
    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};
