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
            expect(result.statusCode).toBe(200);
            expect(result.response).toEqual({ required: false, authenticated: true });
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
        });

        it('allows requests if admin secret is set and correctly provided via Authorization: Bearer', () => {
            const result = checkAuth('/api/loadData', { 'authorization': 'Bearer my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
        });

        it('returns required: true, authenticated: true for auth status if secret is set and correct via Bearer', () => {
            const result = checkAuth('/api/auth/status', { 'authorization': 'Bearer my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.response).toEqual({ required: true, authenticated: true });
        });

        it('is case-insensitive for headers if they are processed by Node middleware (passed as lowercase)', () => {
            const result = checkAuth('/api/loadData', { 'x-admin-secret': 'my-secret' }, 'my-secret');
            expect(result.authorized).toBe(true);
        });
    });
});
