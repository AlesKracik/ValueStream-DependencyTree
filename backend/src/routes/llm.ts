import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSettingsPath } from './settings';
import { unmaskSettings } from '../utils/configHelpers';

const execPromise = promisify(exec);

export const llmRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post('/api/llm/generate', async (request, reply) => {
    try {
      const { prompt, config: rawConfig } = request.body as any;
      const settingsPath = getSettingsPath();
      const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
      const config = unmaskSettings(rawConfig || {}, existing);
      
      const provider = config.ai?.provider || 'openai';
      const apiKey = config.ai?.api_key;
      
      if (!apiKey) throw new Error('LLM API key missing');
      
      let resultText = '';
      
      if (provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: config.ai?.model || 'gpt-4-turbo', messages: [{ role: 'user', content: prompt }] })
        });
        const d = await r.json() as any;
        resultText = d.choices[0].message.content;
      } else if (provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ai?.model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const d = await r.json() as any;
        resultText = d.candidates[0].content.parts[0].text;
      } else if (provider === 'augment') {
        const env = { ...process.env, AUGMENT_SESSION_AUTH: apiKey };
        const { stdout } = await execPromise(`npx --no-install auggie --print --quiet "${prompt.replace(/"/g, '\\"')}"`, { env });
        resultText = stdout.trim();
      }
      
      return reply.send({ success: true, text: resultText });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
