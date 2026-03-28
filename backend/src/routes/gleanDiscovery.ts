import { FastifyBaseLogger } from 'fastify';
import {
  getGleanSettings,
  saveGleanSettings
} from '../utils/gleanHelpers';

export interface GleanClientCredentials {
  client_id: string;
  client_secret: string;
  registration_client_uri?: string;
  registration_access_token?: string;
}

export interface GleanDiscoveryData {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

export interface GleanClientWithEndpoints extends GleanClientCredentials {
  registration_endpoint: string;
  token_endpoint: string;
  authorization_endpoint: string;
}

/**
 * Fetches the OAuth protected resource metadata to find the authorization server URL.
 */
export async function fetchAuthServerUrl(normalizedUrl: string, log: FastifyBaseLogger): Promise<string> {
  const resourceRes = await fetch(`${normalizedUrl}/.well-known/oauth-protected-resource`);
  if (!resourceRes.ok) throw new Error(`Failed to fetch oauth-protected-resource from ${normalizedUrl}: ${resourceRes.status} ${resourceRes.statusText}`);

  let resourceData: { authorization_servers?: string[] };
  try {
    resourceData = await resourceRes.json() as any;
  } catch (e) {
    const text = await resourceRes.text().catch(() => 'unavailable');
    log.error(`Failed to parse oauth-protected-resource from ${normalizedUrl}. Response: ${text.substring(0, 500)}`);
    throw new Error(`Glean discovery failed: expected JSON but received ${resourceRes.headers.get('content-type')}`);
  }

  const authServerUrl = resourceData.authorization_servers?.[0];
  if (!authServerUrl) throw new Error('No authorization server found in discovery data');

  return authServerUrl.replace(/\/$/, '');
}

/**
 * Discovers OAuth/OIDC metadata by trying multiple well-known endpoints.
 */
export async function discoverAuthMetadata(
  authServerBase: string,
  normalizedUrl: string,
  log: FastifyBaseLogger
): Promise<GleanDiscoveryData> {
  const discoveryBases = [authServerBase, normalizedUrl];
  const discoveryPaths = [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration'
  ];

  let discoveryRes: any;
  let discoveryUrl = '';

  for (const base of discoveryBases) {
    for (const path of discoveryPaths) {
      discoveryUrl = `${base}${path}`;
      log.info(`Trying discovery at ${discoveryUrl}`);
      try {
        const res = await fetch(discoveryUrl);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            discoveryRes = res;
            break;
          }
          log.warn(`Discovery at ${discoveryUrl} returned success but wrong content-type: ${contentType}`);
        } else {
          log.warn(`Discovery at ${discoveryUrl} returned ${res.status} ${res.statusText}`);
        }
      } catch (e: any) {
        log.warn(`Discovery at ${discoveryUrl} failed: ${e.message}`);
      }
    }
    if (discoveryRes) break;
  }

  if (!discoveryRes) {
    throw new Error(`Glean discovery failed: No valid JSON metadata found at ${authServerBase} or ${normalizedUrl}`);
  }

  try {
    return await discoveryRes.json() as GleanDiscoveryData;
  } catch (e) {
    const text = await discoveryRes.text().catch(() => 'unavailable');
    log.error(`Failed to parse discovery response from ${discoveryUrl}. Response: ${text.substring(0, 500)}`);
    throw new Error(`Glean discovery failed at ${discoveryUrl}: expected JSON but received ${discoveryRes.headers.get('content-type')}`);
  }
}

/**
 * Performs Dynamic Client Registration if no client exists for the given URL.
 * Returns the client (existing or newly registered) with endpoint metadata.
 */
export async function ensureClient(
  normalizedUrl: string,
  discoveryData: GleanDiscoveryData,
  log: FastifyBaseLogger
): Promise<GleanClientWithEndpoints> {
  const gleanState = await getGleanSettings();
  let client = gleanState.clients[normalizedUrl];

  if (!client) {
    const redirectBase = process.env.GLEAN_REDIRECT_BASE_URL || 'http://localhost:4000';
    const registrationRes = await fetch(discoveryData.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ValueStream DependencyTree',
        redirect_uris: [`${redirectBase}/api/glean/auth/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      })
    });

    if (!registrationRes.ok) {
      const err = await registrationRes.text().catch(() => 'unknown error');
      throw new Error(`Registration failed: ${registrationRes.status} ${registrationRes.statusText} - ${err}`);
    }

    let registrationData: GleanClientCredentials;
    try {
      registrationData = await registrationRes.json() as any;
    } catch (e) {
      const text = await registrationRes.text().catch(() => 'unavailable');
      log.error(`Failed to parse registration response from ${discoveryData.registration_endpoint}. Response: ${text.substring(0, 500)}`);
      throw new Error(`Registration failed: expected JSON but received ${registrationRes.headers.get('content-type')}`);
    }

    client = {
      ...registrationData,
      registration_endpoint: discoveryData.registration_endpoint,
      token_endpoint: discoveryData.token_endpoint,
      authorization_endpoint: discoveryData.authorization_endpoint
    };
    gleanState.clients[normalizedUrl] = client;
    await saveGleanSettings(gleanState);
  }

  return client as GleanClientWithEndpoints;
}
