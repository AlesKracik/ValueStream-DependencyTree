import fs from 'fs';
import { getSettingsPath } from '../routes/settings';

export interface GleanTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

export function getGleanSettings() {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return data.ai?.glean_state || { tokens: {}, clients: {} };
    } catch (e) {
      console.error('Error reading settings for Glean state', e);
    }
  }
  return { tokens: {}, clients: {} };
}

export function saveGleanSettings(state: any) {
  const settingsPath = getSettingsPath();
  let data: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {}
  }
  if (!data.ai) data.ai = {};
  data.ai.glean_state = state;
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
}

export async function refreshGleanToken(normalizedUrl: string, token: any, gleanState: any) {
  if (!token.refresh_token) {
    throw new Error('No refresh token available');
  }

  const refreshRes = await fetch(token.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: token.client_id,
      client_secret: token.client_secret
    })
  });

  if (!refreshRes.ok) {
    const err = await refreshRes.text().catch(() => 'unknown error');
    delete gleanState.tokens[normalizedUrl];
    saveGleanSettings(gleanState);
    throw new Error(`Failed to refresh Glean token: ${refreshRes.status} ${refreshRes.statusText} - ${err}`);
  }

  let tokenData: GleanTokenResponse;
  try {
    tokenData = await refreshRes.json() as any;
  } catch (e) {
    const text = await refreshRes.text().catch(() => 'unavailable');
    console.error(`Failed to parse refresh token response from ${token.token_endpoint}. Response: ${text.substring(0, 500)}`);
    throw new Error(`Refresh token failed: expected JSON but received ${refreshRes.headers.get('content-type')}`);
  }
  const newToken = {
    ...token,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || token.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000
  };
  gleanState.tokens[normalizedUrl] = newToken;
  saveGleanSettings(gleanState);
  return newToken;
}

export async function gleanChatRequest(normalizedUrl: string, accessToken: string, messages: any[], stream: boolean = false) {
  const chatRes = await fetch(`${normalizedUrl}/rest/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      stream,
      messages
    })
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Glean API error: ${errText}`);
  }

  return chatRes;
}
