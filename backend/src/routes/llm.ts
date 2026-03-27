import { FastifyPluginAsync } from 'fastify';
import { exec } from 'child_process';
import { promisify } from 'util';
import { unmaskSettings } from '../utils/configHelpers';
import { getGleanSettings, refreshGleanToken, gleanChatRequest } from '../utils/gleanHelpers';
import { LlmGenerateBody, LlmGenerateBodyType } from './schemas';

const execPromise = promisify(exec);

export const llmRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post<{ Body: LlmGenerateBodyType }>('/api/llm/generate', { schema: { body: LlmGenerateBody } }, async (request, reply) => {
    try {
      const { prompt, config: rawConfig } = request.body;
      const existing = await fastify.getSettings();
      const config = unmaskSettings(rawConfig || {}, existing);

      const provider = config.ai?.provider || 'openai';
      const apiKey = config.ai?.api_key;

      let resultText = '';

      if (provider === 'openai') {
        if (!apiKey) throw new Error('OpenAI API key missing');
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: config.ai?.model || 'gpt-4-turbo', messages: [{ role: 'user', content: prompt }] })
        });
        const d = await r.json() as any;
        resultText = d.choices[0].message.content;
      } else if (provider === 'gemini') {
        if (!apiKey) throw new Error('Gemini API key missing');
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ai?.model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const d = await r.json() as any;
        resultText = d.candidates[0].content.parts[0].text;
      } else if (provider === 'augment') {
        if (!apiKey) throw new Error('Augment session auth missing');
        const env = { ...process.env, AUGMENT_SESSION_AUTH: apiKey };
        const { stdout } = await execPromise(`npx --no-install auggie --print --quiet "${prompt.replace(/"/g, '\\"')}"`, { env });
        resultText = stdout.trim();
      } else if (provider === 'glean') {
        const gleanUrl = config.ai?.glean_url;
        if (!gleanUrl) throw new Error('Glean URL missing');

        const normalizedUrl = gleanUrl.replace(/\/$/, '');
        const gleanState = await getGleanSettings();
        let token = gleanState.tokens[normalizedUrl];

        if (!token) {
          throw new Error('Glean not authenticated. Please connect Glean in Support page.');
        }

        // Refresh if needed
        if (Date.now() > token.expires_at - 60000) {
          token = await refreshGleanToken(normalizedUrl, token, gleanState);
        }

        const res = await gleanChatRequest(normalizedUrl, token.access_token, [
          { author: 'USER', fragments: [{ text: prompt }] }
        ]);
        const d = await res.json() as any;

        const aiMessage = d.messages?.reverse().find((m: any) => m.author === 'GLEAN_AI');
        resultText = aiMessage?.fragments?.map((f: any) => f.text || '').join('') || aiMessage?.text || '';
      }

      return reply.send({ success: true, text: resultText });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
