import React, { createContext, useContext, useState } from 'react';
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
    updateEpic: (id: string, updates: Partial<Epic>) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);
const ValueStreamContext = createContext<ValueStreamContextType | null>(null);

export const useNotificationContext = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotificationContext must be used within a NotificationProvider');
    }
    return context;
};

export const useValueStreamContext = () => {
    const context = useContext(ValueStreamContext);
    if (!context) {
        throw new Error('useValueStreamContext must be used within a ValueStreamProvider');
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notification, setNotification] = useState<NotificationConfig | null>(null);

    const showAlert = (title: string, message: string): Promise<void> => {
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
    };

    const showConfirm = (title: string, message: string): Promise<boolean> => {
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
    };

    return (
        <NotificationContext.Provider value={{ showAlert, showConfirm }}>
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
    value: { data: ValueStreamData | null; updateEpic: (id: string, updates: Partial<Epic>) => void };
}> = ({ children, value }) => {
    const { showAlert, showConfirm } = useNotificationContext();

    return (
        <ValueStreamContext.Provider value={{ ...value, showAlert, showConfirm }}>
            {children}
        </ValueStreamContext.Provider>
    );
};



