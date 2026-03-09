import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import styles from './Layout.module.css';

export const Layout: React.FC = () => {
    return (
        <div className={styles.layoutContainer}>
            <nav className={styles.sidebar}>
                <div className={styles.logo}>
                    <h2>Value Stream</h2>
                </div>
                <div className={styles.navLinks}>
                    <NavLink to="/valueStreams" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Value Streams
                    </NavLink>
                    <NavLink to="/support" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Support
                    </NavLink>
                    <NavLink to="/customers" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Customers
                    </NavLink>
                    <NavLink to="/workitems" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Work Items
                    </NavLink>
                    <NavLink to="/teams" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Teams
                    </NavLink>
                    <NavLink to="/sprints" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Sprints
                    </NavLink>
                </div>
                <div className={styles.bottomLinks}>
                    <NavLink to="/settings" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Settings
                    </NavLink>
                    <NavLink to="/documentation" className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}>
                        Documentation
                    </NavLink>
                </div>
            </nav>
            <main className={styles.mainContent}>
                <Outlet />
            </main>
        </div>
    );
};




