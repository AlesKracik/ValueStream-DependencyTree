/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useMemo } from 'react';
import type { ValueStreamData, Epic, ValueStreamViewState } from '../types/models';
import { NotificationModal } from '../components/common/NotificationModal';

interface NotificationConfig {
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel?: () => void;
}

interface NotificationContextType {
    showAlert: (title: string, message: string) => Promise<void>;
    showConfirm: (title: string, message: string) => Promise<boolean>;
}

interface ValueStreamContextType extends NotificationContextType {
    data: ValueStreamData | null;
    updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
    addEpic: (epic: Epic) => void;
    deleteEpic: (id: string) => void;
    uiState: Record<string, { filter?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; scrollPosition?: number }>;
    updateUiState: (key: string, value: { filter?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; scrollPosition?: number }) => void;
    viewState: ValueStreamViewState;
    setViewState: React.Dispatch<React.SetStateAction<ValueStreamViewState>>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);
const ValueStreamContext = createContext<ValueStreamContextType | null>(null);

export function useNotificationContext() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotificationContext must be used within a NotificationProvider');
    }
    return context;
}

export function useValueStreamContext() {
    const context = useContext(ValueStreamContext);
    if (!context) {
        throw new Error('useValueStreamContext must be used within a ValueStreamProvider');
    }
    return context;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notification, setNotification] = useState<NotificationConfig | null>(null);

    const notificationActions = useMemo(() => ({
        showAlert: (title: string, message: string): Promise<void> => {
            return new Promise((resolve) => {
                setNotification({
                    title,
                    message,
                    type: 'alert',
                    onConfirm: () => {
                        setNotification(null);
                        resolve();
                    }
                });
            });
        },
        showConfirm: (title: string, message: string): Promise<boolean> => {
            return new Promise((resolve) => {
                setNotification({
                    title,
                    message,
                    type: 'confirm',
                    onConfirm: () => {
                        setNotification(null);
                        resolve(true);
                    },
                    onCancel: () => {
                        setNotification(null);
                        resolve(false);
                    }
                });
            });
        }
    }), []);

    return (
        <NotificationContext.Provider value={notificationActions}>
            {children}
            {notification && (
                <NotificationModal
                    isOpen={true}
                    title={notification.title}
                    message={notification.message}
                    type={notification.type}
                    onConfirm={notification.onConfirm}
                    onCancel={notification.onCancel || (() => setNotification(null))}
                />
            )}
        </NotificationContext.Provider>
    );
};

export const ValueStreamProvider: React.FC<{
    children: React.ReactNode;
    value: { 
        data: ValueStreamData | null; 
        updateEpic: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
        addEpic: (epic: Epic) => void;
        deleteEpic: (id: string) => void;
    };
}> = ({ children, value }) => {
    const { showAlert, showConfirm } = useNotificationContext();
    const [uiState, setUiState] = useState<Record<string, { filter?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; scrollPosition?: number }>>({});
    const [viewState, setViewState] = useState<ValueStreamViewState>({
        sprintOffset: 0,
        customerFilter: '',
        workItemFilter: '',
        releasedFilter: 'all',
        minTcvFilter: '',
        minScoreFilter: '',
        teamFilter: '',
        epicFilter: '',
        showDependencies: false,
        disableHoverHighlight: true,
        isInitialOffsetSet: false,
    });

    const updateUiState = React.useCallback((key: string, val: { filter?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; scrollPosition?: number }) => {
        setUiState(prev => ({ ...prev, [key]: val }));
    }, []);

    const contextValue = useMemo(() => ({
        ...value,
        showAlert,
        showConfirm,
        uiState,
        updateUiState,
        viewState,
        setViewState
    }), [value, showAlert, showConfirm, uiState, updateUiState, viewState]);

    return (
        <ValueStreamContext.Provider value={contextValue}>
            {children}
        </ValueStreamContext.Provider>
    );
};



