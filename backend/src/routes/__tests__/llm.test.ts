import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { llmRoutes } from '../llm';
import fastify from 'fastify';
import fs from 'fs';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
}));

describe('llmRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();
    await app.register(llmRoutes);
    vi.clearAllMocks();
  });

  it('calls glean CLI when glean provider is selected', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ai: { provider: 'glean', api_key: 'test-session-token' }
    }));
    
    (exec as any).mockImplementation((cmd: string, options: any, cb: any) => {
      cb(null, { stdout: 'Glean response' });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/generate',
      payload: {
        prompt: 'Hello AI',
        config: { ai: { provider: 'glean', api_key: 'test-session-token' } }
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.success).toBe(true);
    expect(data.text).toBe('Glean response');
    
    expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('npx --no-install glean'),
        expect.objectContaining({
            env: expect.objectContaining({ GLEAN_SESSION_TOKEN: 'test-session-token' })
        }),
        expect.any(Function)
    );
  });
});
