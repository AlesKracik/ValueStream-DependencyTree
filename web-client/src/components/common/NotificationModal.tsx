import React from 'react';

interface NotificationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
    isOpen,
    title,
    message,
    type,
    onConfirm,
    onCancel
}) => {
    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={onCancel}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 style={styles.title}>{title}</h2>
                <div style={styles.message}>{message}</div>
                <div style={styles.buttonGroup}>
                    {type === 'confirm' && (
                        <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
                    )}
                    <button onClick={onConfirm} style={styles.confirmBtn}>
                        {type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-shadow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
    },
    modal: {
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90%',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 25px -5px var(--bg-shadow)'
    },
    title: {
        marginTop: 0,
        marginBottom: '16px',
        fontSize: '18px',
        borderBottom: '1px solid var(--border-primary)',
        paddingBottom: '10px'
    },
    message: {
        marginBottom: '24px',
        fontSize: '14px',
        color: 'var(--text-secondary)',
        lineHeight: '1.5'
    },
    buttonGroup: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px'
    },
    cancelBtn: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        border: '1px solid var(--border-hover)',
        color: 'var(--text-secondary)',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    confirmBtn: {
        padding: '8px 16px',
        backgroundColor: 'var(--accent-primary)',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500
    }
};
