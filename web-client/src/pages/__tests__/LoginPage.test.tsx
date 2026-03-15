import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from '../LoginPage';
import { renderWithProviders } from '../../test/testUtils';
import * as api from '../../utils/api';

vi.mock('../../utils/api', () => ({
    setAdminSecret: vi.fn()
}));

describe('LoginPage', () => {
    const mockOnLogin = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('submits form with password and calls onLogin on success', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true })
        });

        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        const input = screen.getByPlaceholderText('Password');
        const button = screen.getByRole('button', { name: /Login/i });

        fireEvent.change(input, { target: { value: 'secret' } });
        fireEvent.click(button);

        expect(button.textContent).toBe('Logging in...');
        expect(button.hasAttribute('disabled')).toBe(true);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ password: 'secret' })
            }));
            expect(api.setAdminSecret).toHaveBeenCalledWith('secret');
            expect(mockOnLogin).toHaveBeenCalled();
        });
    });

    it('shows error message on invalid password', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 401
        });

        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        const input = screen.getByPlaceholderText('Password');
        const button = screen.getByRole('button', { name: /Login/i });

        fireEvent.change(input, { target: { value: 'wrong' } });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Invalid password')).toBeDefined();
            expect(mockOnLogin).not.toHaveBeenCalled();
        });
    });

    it('shows connection error on fetch failure', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fetch as any).mockRejectedValue(new Error('Network error'));

        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        const input = screen.getByPlaceholderText('Password');
        const button = screen.getByRole('button', { name: /Login/i });

        fireEvent.change(input, { target: { value: 'secret' } });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Connection error')).toBeDefined();
        });
    });
});
