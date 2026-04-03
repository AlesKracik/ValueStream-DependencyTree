import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from '../LoginPage';
import { renderWithProviders } from '../../test/testUtils';
import * as api from '../../utils/api';

vi.mock('../../utils/api', () => ({
    setAdminSecret: vi.fn(),
    authorizedFetch: vi.fn(),
}));

/** Helper: mock fetch to return auth method then handle login calls */
function mockFetchForMethod(method: string = 'local') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fetch as any).mockImplementation((url: string, opts?: any) => {
        if (url === '/api/auth/methods') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ method }),
            });
        }
        // Default: return the opts for login endpoint testing
        return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({}),
        });
    });
}

describe('LoginPage', () => {
    const mockOnLogin = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('renders username/password form for local method', async () => {
        mockFetchForMethod('local');
        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Username')).toBeDefined();
            expect(screen.getByPlaceholderText('Password')).toBeDefined();
        });
    });

    it('submits username/password and calls onLogin on success', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fetch as any).mockImplementation((url: string) => {
            if (url === '/api/auth/methods') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ method: 'local' }) });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ success: true, token: 'jwt-token-123' }),
            });
        });

        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        await waitFor(() => screen.getByPlaceholderText('Username'));

        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'testuser' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ username: 'testuser', password: 'secret' }),
            }));
            expect(api.setAdminSecret).toHaveBeenCalledWith('jwt-token-123');
            expect(mockOnLogin).toHaveBeenCalled();
        });
    });

    it('shows error message on invalid credentials', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fetch as any).mockImplementation((url: string) => {
            if (url === '/api/auth/methods') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ method: 'local' }) });
            }
            return Promise.resolve({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: 'Invalid username or password' }),
            });
        });

        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        await waitFor(() => screen.getByPlaceholderText('Username'));

        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'bad' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

        await waitFor(() => {
            expect(screen.getByText('Invalid username or password')).toBeDefined();
            expect(mockOnLogin).not.toHaveBeenCalled();
        });
    });

    it('renders AWS SSO button for aws-sso method', async () => {
        mockFetchForMethod('aws-sso');
        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Login via AWS SSO/i })).toBeDefined();
        });
    });

    it('shows admin password fallback for non-local methods', async () => {
        mockFetchForMethod('aws-sso');
        renderWithProviders(<LoginPage onLogin={mockOnLogin} />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Admin password')).toBeDefined();
        });
    });
});
