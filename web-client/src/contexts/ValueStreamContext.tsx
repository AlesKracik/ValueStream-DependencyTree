import React, { createContext, useContext, useState, useMemo } from 'react';
import type { ValueStreamData, Epic } from '../types/models';
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

    const contextValue = useMemo(() => ({
        ...value,
        showAlert,
        showConfirm
    }), [value, showAlert, showConfirm]);

    return (
        <ValueStreamContext.Provider value={contextValue}>
            {children}
        </ValueStreamContext.Provider>
    );
};



