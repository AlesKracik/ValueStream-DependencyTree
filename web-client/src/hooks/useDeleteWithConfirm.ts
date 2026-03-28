import { useCallback } from 'react';
import { useNotificationContext } from '../contexts/NotificationContext';

/**
 * Encapsulates the repeated confirm-then-delete pattern.
 * Returns a function that shows a confirmation dialog and, on accept,
 * runs the supplied delete callback followed by an optional afterDelete action.
 */
export function useDeleteWithConfirm() {
    const { showConfirm } = useNotificationContext();

    const deleteWithConfirm = useCallback(
        async (
            title: string,
            message: string,
            deleteFn: () => void,
            afterDelete?: () => void
        ) => {
            const confirmed = await showConfirm(title, message);
            if (!confirmed) return;
            try {
                deleteFn();
                afterDelete?.();
            } catch (err) {
                console.error('Delete failed', err);
            }
        },
        [showConfirm]
    );

    return deleteWithConfirm;
}
