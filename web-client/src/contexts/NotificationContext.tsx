/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useMemo } from 'react';
import { NotificationModal } from '../components/common/NotificationModal';

interface NotificationConfig {
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel?: () => void;
}

export interface NotificationContextType {
    showAlert: (title: string, message: string) => Promise<void>;
    showConfirm: (title: string, message: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotificationContext() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotificationContext must be used within a NotificationProvider');
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
