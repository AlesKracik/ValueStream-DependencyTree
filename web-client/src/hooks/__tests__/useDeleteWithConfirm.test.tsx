import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeleteWithConfirm } from '../useDeleteWithConfirm';
import { useNotificationContext } from '../../contexts/NotificationContext';

vi.mock('../../contexts/NotificationContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../contexts/NotificationContext')>();
    return {
        ...actual,
        useNotificationContext: vi.fn()
    };
});

describe('useDeleteWithConfirm', () => {
    const mockShowConfirm = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useNotificationContext as ReturnType<typeof vi.fn>).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: vi.fn()
        });
    });

    it('calls deleteFn and afterDelete when user confirms', async () => {
        mockShowConfirm.mockResolvedValue(true);
        const deleteFn = vi.fn();
        const afterDelete = vi.fn();

        const { result } = renderHook(() => useDeleteWithConfirm());

        await act(async () => {
            await result.current('Delete Item', 'Are you sure?', deleteFn, afterDelete);
        });

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Item', 'Are you sure?');
        expect(deleteFn).toHaveBeenCalledOnce();
        expect(afterDelete).toHaveBeenCalledOnce();
    });

    it('does not call deleteFn when user cancels', async () => {
        mockShowConfirm.mockResolvedValue(false);
        const deleteFn = vi.fn();
        const afterDelete = vi.fn();

        const { result } = renderHook(() => useDeleteWithConfirm());

        await act(async () => {
            await result.current('Delete Item', 'Are you sure?', deleteFn, afterDelete);
        });

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Item', 'Are you sure?');
        expect(deleteFn).not.toHaveBeenCalled();
        expect(afterDelete).not.toHaveBeenCalled();
    });

    it('works without afterDelete callback', async () => {
        mockShowConfirm.mockResolvedValue(true);
        const deleteFn = vi.fn();

        const { result } = renderHook(() => useDeleteWithConfirm());

        await act(async () => {
            await result.current('Delete Sprint', 'Remove sprint?', deleteFn);
        });

        expect(deleteFn).toHaveBeenCalledOnce();
    });

    it('catches and logs errors from deleteFn', async () => {
        mockShowConfirm.mockResolvedValue(true);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const deleteFn = vi.fn(() => { throw new Error('Delete failed'); });
        const afterDelete = vi.fn();

        const { result } = renderHook(() => useDeleteWithConfirm());

        await act(async () => {
            await result.current('Delete Item', 'Sure?', deleteFn, afterDelete);
        });

        expect(consoleSpy).toHaveBeenCalledWith('Delete failed', expect.any(Error));
        expect(afterDelete).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
