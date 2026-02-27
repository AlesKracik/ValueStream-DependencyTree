import React, { createContext, useContext, useState } from 'react';
import type { DashboardData, Epic } from '../types/models';
import { NotificationModal } from '../components/common/NotificationModal';

interface NotificationConfig {
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel?: () => void;
}

interface DashboardContextType {
    data: DashboardData | null;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
    showAlert: (title: string, message: string) => Promise<void>;
    showConfirm: (title: string, message: string) => Promise<boolean>;
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
    value: { data: DashboardData | null; updateEpic: (id: string, updates: Partial<Epic>) => void };
}> = ({ children, value }) => {
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
        <DashboardContext.Provider value={{ ...value, showAlert, showConfirm }}>
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
        </DashboardContext.Provider>
    );
};
