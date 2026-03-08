import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authorizedFetch } from '../api';

describe('SSH Tunnel API Integration', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ success: true, message: 'Mock Success' })
            })
        ));
        // Mock sessionStorage for authorizedFetch
        const store: Record<string, string> = { 'ADMIN_SECRET': 'test-secret' };
        vi.stubGlobal('sessionStorage', {
            getItem: (key: string) => store[key],
            setItem: (key: string, value: string) => { store[key] = value; },
            removeItem: (key: string) => { delete store[key]; }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sends SSH configuration for application mongo test', async () => {
        const sshConfig = {
            mongo_uri: 'mongodb://localhost:27017',
            mongo_use_ssh: true,
            mongo_ssh_host: 'ssh.example.com',
            mongo_ssh_port: 22,
            mongo_ssh_user: 'testuser',
            mongo_ssh_key: 'test-key'
        };

        await authorizedFetch('/api/mongo/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sshConfig)
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"mongo_ssh_host":"ssh.example.com"'),
        }));
        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"mongo_use_ssh":true'),
        }));
    });

    it('sends SSH configuration for customer mongo test', async () => {
        const sshConfig = {
            customer_mongo_uri: 'mongodb://customer-db:27017',
            customer_mongo_use_ssh: true,
            customer_mongo_ssh_host: 'ssh.customer.com',
            customer_mongo_ssh_port: 2222,
            customer_mongo_ssh_user: 'custuser',
            customer_mongo_ssh_key: 'cust-key'
        };

        await authorizedFetch('/api/mongo/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sshConfig)
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"customer_mongo_ssh_host":"ssh.customer.com"'),
        }));
        expect(fetch).toHaveBeenCalledWith('/api/mongo/test', expect.objectContaining({
            body: expect.stringContaining('"customer_mongo_ssh_port":2222'),
        }));
    });

    it('includes SSH config when testing databases', async () => {
        const config = {
            mongo_uri: 'mongodb://localhost:27017',
            mongo_use_ssh: true,
            mongo_ssh_host: 'jump.example.com',
            mongo_ssh_user: 'admin',
            mongo_ssh_key: 'pvt-key'
        };

        await authorizedFetch('/api/mongo/databases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/databases', expect.objectContaining({
            body: expect.stringContaining('"mongo_ssh_host":"jump.example.com"'),
        }));
    });
});
