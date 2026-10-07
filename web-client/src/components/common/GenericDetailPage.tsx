import React, { useState } from 'react';
import { PageWrapper } from '../layout/PageWrapper';
import styles from './GenericDetailPage.module.css';

export type DetailTab = {
    id: string;
    label: React.ReactNode;
    content: React.ReactNode;
};

interface GenericDetailPageProps {
    entityTitle: string;
    onBack: () => void;
    mainDetails: React.ReactNode;
    tabs?: DetailTab[];
    loading?: boolean;
    error?: Error | null;
    data?: unknown;
    actions?: React.ReactNode;
    initialTabId?: string;
    onTabChange?: (tabId: string) => void;
}

export const GenericDetailPage: React.FC<GenericDetailPageProps> = ({
    entityTitle,
    onBack,
    mainDetails,
    tabs = [],
    loading = false,
    error = null,
    data = null,
    actions,
    initialTabId,
    onTabChange
}) => {
    const [activeTabId, setActiveTabId] = useState(initialTabId || (tabs.length > 0 ? tabs[0].id : ''));

    // Follow a new initialTabId (e.g. from the URL). Adjusted during render
    // rather than in an effect; a tab click still wins until it changes again.
    const [followedTabId, setFollowedTabId] = useState(initialTabId);
    if (initialTabId !== followedTabId) {
        setFollowedTabId(initialTabId);
        if (initialTabId) setActiveTabId(initialTabId);
    }

    // Scroll to top on mount
    React.useEffect(() => {
        const main = document.querySelector('main');
        if (main) {
            main.scrollTop = 0;
        }
    }, []);

    const handleTabClick = (id: string) => {
        setActiveTabId(id);
        if (onTabChange) onTabChange(id);
    };

    const currentTab = tabs.find(t => t.id === activeTabId);

    return (
        <PageWrapper loading={loading} error={error} data={data}>
            <div className={styles.pageContainer}>
                <header className={styles.header}>
                    <h1>{entityTitle}</h1>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-secondary" onClick={onBack}>Back</button>
                        {actions}
                    </div>
                </header>

                <div className={styles.content}>
                    <section className={styles.card}>
                        <h2>Main Details</h2>
                        <div className={styles.formGrid}>
                            {mainDetails}
                        </div>
                    </section>

                    {tabs.length > 0 && (
                        <div className={styles.tabContainer}>
                            <nav className={styles.tabHeader}>
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        className={`${styles.tabButton} ${activeTabId === tab.id ? styles.activeTab : ''}`}
                                        onClick={() => handleTabClick(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>
                            <div className={styles.tabContent}>
                                {currentTab?.content}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageWrapper>
    );
};
