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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
    },
    modal: {
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90%',
        color: '#f9fafb',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
    },
    title: {
        marginTop: 0,
        marginBottom: '16px',
        fontSize: '18px',
        borderBottom: '1px solid #374151',
        paddingBottom: '10px'
    },
    message: {
        marginBottom: '24px',
        fontSize: '14px',
        color: '#d1d5db',
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
        border: '1px solid #4b5563',
        color: '#d1d5db',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    confirmBtn: {
        padding: '8px 16px',
        backgroundColor: '#3b82f6',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500
    }
};
