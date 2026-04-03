import { describe, it, expect } from 'vitest';
import { checkAuth } from '../authServer';

describe('authServer utility', () => {
    describe('checkAuth', () => {
        it('allows non-API routes unconditionally (e.g. static assets, index.html)', () => {
            const result = checkAuth('/', {}, 'my-secret');
            expect(result.authorized).toBe(true);
            const assetResult = checkAuth('/src/main.tsx', {}, 'my-secret');
            expect(assetResult.authorized).toBe(true);
        });

        it('allows everything if no admin secret is set', () => {
            const result = checkAuth('/api/loadData', {}, undefined);
            expect(result.authorized).toBe(true);
        });

        it('returns required: false for auth status if no secret is set', () => {
            const result = checkAuth('/api/auth/status', {}, undefined);
            expect(result.authorized).toBe(true);
            expect(result.response.required).toBe(false);
            expect(result.response.authenticated).toBe(true);
        });

        it('blocks requests if admin secret is set and not provided', () => {
            const result = checkAuth('/api/loadData', {}, 'my-secret');
            expect(result.authorized).toBe(false);
            expect(result.statusCode).toBe(401);
            expect(result.response.error).toBe('Unauthorized');
        });

        it('allows requests if admin secret is set and correctly provided via x-admin-secret', () => {
            const result = checkAuth('/api/loadData', { 'x-admin-secret': 'my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
            expect(result.user?.isAdmin).toBe(true);
        });

        it('allows requests if admin secret is set and correctly provided via Authorization: Bearer', () => {
            const result = checkAuth('/api/loadData', { 'authorization': 'Bearer my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
            expect(result.user?.isAdmin).toBe(true);
        });

        it('returns required: true, authenticated: true for auth status if secret is set and correct via Bearer', () => {
            const result = checkAuth('/api/auth/status', { 'authorization': 'Bearer my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
            expect(result.response.required).toBe(true);
            expect(result.response.authenticated).toBe(true);
            expect(result.response.user.username).toBe('admin');
        });

        it('allows /api/auth/login unconditionally to pass through to the server for body parsing', () => {
            const result = checkAuth('/api/auth/login', {}, 'my-secret');
            expect(result.authorized).toBe(true);
        });

        it('allows public endpoints without auth', () => {
            expect(checkAuth('/api/auth/methods', {}, 'my-secret').authorized).toBe(true);
            expect(checkAuth('/api/auth/setup', {}, 'my-secret').authorized).toBe(true);
            expect(checkAuth('/api/auth/aws-sso/start', {}, 'my-secret').authorized).toBe(true);
            expect(checkAuth('/api/health', {}, 'my-secret').authorized).toBe(true);
        });
    });
});
