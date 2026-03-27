import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';
import { invalidateSettingsCache } from '../../services/secretManager';

vi.mock('fs');

const mockBind = vi.fn();
const mockSearch = vi.fn();
const mockUnbind = vi.fn();

vi.mock('ldapts', () => {
    return {
        Client: class MockClient {
            bind = mockBind;
            search = mockSearch;
            unbind = mockUnbind;
        }
    };
});

const mockLdapSettings = {
    ldap: {
        url: 'ldap://localhost:389',
        bind_dn: 'cn=admin,dc=example,dc=com',
        bind_password: 'secret',
        team: {
            base_dn: 'ou=groups,dc=example,dc=com',
            search_filter: '(cn={{LDAP_TEAM_NAME}})'
        }
    }
};

describe('LDAP Routes', () => {
    let app: any;

    beforeEach(async () => {
        delete process.env.ADMIN_SECRET;
        delete process.env.VITE_ADMIN_SECRET;
        app = await buildApp();
        vi.clearAllMocks();
        invalidateSettingsCache();
        app.getSettings = vi.fn().mockResolvedValue(mockLdapSettings);
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockLdapSettings));
    });

    it('POST /api/ldap/sync-members should return members from LDAP group', async () => {
        mockSearch
            .mockResolvedValueOnce({
                searchEntries: [{
                    member: [
                        'cn=Alice,ou=users,dc=example,dc=com',
                        'cn=Bob,ou=users,dc=example,dc=com'
                    ]
                }]
            })
            .mockResolvedValueOnce({
                searchEntries: [{ displayName: 'Alice Smith', sAMAccountName: 'asmith' }]
            })
            .mockResolvedValueOnce({
                searchEntries: [{ cn: 'Bob Jones', uid: 'bjones' }]
            });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: { ldap_team_name: 'engineering' }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.members).toHaveLength(2);
        expect(body.members[0]).toEqual({ name: 'Alice Smith', username: 'asmith' });
        expect(body.members[1]).toEqual({ name: 'Bob Jones', username: 'bjones' });

        expect(mockBind).toHaveBeenCalledWith('cn=admin,dc=example,dc=com', 'secret');

        expect(mockSearch).toHaveBeenCalledWith(
            'ou=groups,dc=example,dc=com',
            expect.objectContaining({ filter: '(cn=engineering)' })
        );
    });

    it('POST /api/ldap/sync-members should return error when no group found', async () => {
        mockSearch.mockResolvedValueOnce({ searchEntries: [] });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: { ldap_team_name: 'nonexistent' }
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toContain('No LDAP group found');
    });

    it('POST /api/ldap/sync-members should return error when team name is missing', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: {}
        });

        // Schema validation now catches missing 'ldap_team_name' before the handler runs
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.message).toContain("required property 'ldap_team_name'");
    });

    it('POST /api/ldap/sync-members should handle single member (not array)', async () => {
        mockSearch
            .mockResolvedValueOnce({
                searchEntries: [{
                    member: 'cn=Solo,ou=users,dc=example,dc=com'
                }]
            })
            .mockResolvedValueOnce({
                searchEntries: [{ displayName: 'Solo Dev', sAMAccountName: 'solo' }]
            });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: { ldap_team_name: 'small-team' }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.members).toHaveLength(1);
        expect(body.members[0]).toEqual({ name: 'Solo Dev', username: 'solo' });
    });

    it('POST /api/ldap/sync-members should skip unresolvable members', async () => {
        mockSearch
            .mockResolvedValueOnce({
                searchEntries: [{
                    member: ['cn=Good,ou=users,dc=example,dc=com', 'cn=Bad,ou=users,dc=example,dc=com']
                }]
            })
            .mockResolvedValueOnce({
                searchEntries: [{ displayName: 'Good User', sAMAccountName: 'good' }]
            })
            .mockRejectedValueOnce(new Error('Cannot resolve'));

        const response = await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: { ldap_team_name: 'team' }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.members).toHaveLength(1);
        expect(body.members[0].username).toBe('good');
    });

    it('POST /api/ldap/sync-members should always unbind even on error', async () => {
        mockSearch.mockRejectedValueOnce(new Error('Connection failed'));

        await app.inject({
            method: 'POST',
            url: '/api/ldap/sync-members',
            payload: { ldap_team_name: 'team' }
        });

        expect(mockUnbind).toHaveBeenCalled();
    });
});
