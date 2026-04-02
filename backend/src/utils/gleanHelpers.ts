import { getFullSettingsAsync, saveFullSettingsAsync } from '../services/secretManager';
import logger from './logger';

export interface GleanTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

export async function getGleanSettings() {
  try {
    const data = await getFullSettingsAsync();
    return data.ai?.glean_state || { tokens: {}, clients: {} };
  } catch (e) {
    logger.error(e, 'Error reading settings for Glean state');
    return { tokens: {}, clients: {} };
  }
}

export async function saveGleanSettings(state: any) {
  let data: any;
  try {
    data = await getFullSettingsAsync();
  } catch (e) {
    logger.error(e, 'Failed to read current settings before saving Glean state — aborting save to prevent data loss');
    throw e;
  }
  if (!data.ai) data.ai = {};
  data.ai.glean_state = state;
  await saveFullSettingsAsync(data);
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
    await saveGleanSettings(gleanState);
    throw new Error(`Failed to refresh Glean token: ${refreshRes.status} ${refreshRes.statusText} - ${err}`);
  }

  let tokenData: GleanTokenResponse;
  try {
    tokenData = await refreshRes.json() as any;
  } catch (e) {
    const text = await refreshRes.text().catch(() => 'unavailable');
    logger.error(`Failed to parse refresh token response from ${token.token_endpoint}. Response: ${text.substring(0, 500)}`);
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
  const url = `${normalizedUrl}/rest/api/v1/chat`;
  const body = JSON.stringify({
    stream,
    messages
  });

  const chatRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Glean-Auth-Type': 'OAUTH'
    },
    body
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Glean API error: ${errText}`);
  }

  return chatRes;
}
