import React from 'react';
import styles from './PageWrapper.module.css';

interface PageWrapperProps {
    loading?: boolean;
    error?: Error | null;
    data?: any;
    loadingMessage?: string;
    errorMessage?: string;
    emptyMessage?: string;
    children: React.ReactNode;
}

/**
 * Reusable layout component that handles standard loading, error, and empty states.
 * Wraps page content in a consistent container.
 */
export const PageWrapper: React.FC<PageWrapperProps> = ({
    loading,
    error,
    data,
    loadingMessage = "Loading detail...",
    errorMessage,
    emptyMessage = "No data available.",
    children
}) => {
    if (loading) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.loading}>{loadingMessage}</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.error}>{errorMessage || `Error: ${error.message}`}</div>
            </div>
        );
    }

    if (data === null) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.empty}>{emptyMessage}</div>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            {children}
        </div>
    );
};
