import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../app';
import fs from 'fs';
import { invalidateSettingsCache } from '../../services/secretManager';

vi.mock('fs');

const baseSettings = {
  auth: {
    method: 'aws-sts',
    default_role: 'viewer',
    session_expiry_hours: 24,
    aws_sts: {
      region: 'us-west-2',
      account_id: '123456789012',
      role_name: 'DeveloperAccess',
      default_profile: 'vst',
      max_request_age_seconds: 300,
    },
  },
  persistence: {},
};

const buildSignedRequest = (overrides: Partial<Record<string, string>> = {}) => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const amzDate = overrides.amzDate ?? `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
  return {
    url: overrides.url ?? 'https://sts.us-west-2.amazonaws.com/',
    method: 'POST',
    headers: {
      'Authorization': 'AWS4-HMAC-SHA256 Credential=AKIAFAKE/20990101/us-west-2/sts/aws4_request, SignedHeaders=host;x-amz-date, Signature=ffff',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'sts.us-west-2.amazonaws.com',
      'X-Amz-Date': amzDate,
    },
    body: 'Action=GetCallerIdentity&Version=2011-06-15',
  };
};

const stsSuccessXml = (arn: string, account = '123456789012') => `<?xml version="1.0"?>
<GetCallerIdentityResponse>
  <GetCallerIdentityResult>
    <Arn>${arn}</Arn>
    <UserId>AROAEXAMPLE:user@example.com</UserId>
    <Account>${account}</Account>
  </GetCallerIdentityResult>
</GetCallerIdentityResponse>`;

describe('AWS STS Auth Routes', () => {
  let app: any;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.VITE_ADMIN_SECRET;
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();

    app = await buildApp();
    invalidateSettingsCache();
    app.getSettings = vi.fn().mockResolvedValue(baseSettings);
    (fs.existsSync as any)?.mockReturnValue?.(true);
    (fs.readFileSync as any)?.mockReturnValue?.('#!/usr/bin/env python3\nDEFAULT_PROFILE = "{{DEFAULT_PROFILE}}"\nDEFAULT_REGION = "{{DEFAULT_REGION}}"\n');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/auth/aws-sts/helper-script substitutes baked-in defaults', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/aws-sts/helper-script',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('sts-sign.py');
    expect(response.payload).toContain('DEFAULT_PROFILE = "vst"');
    expect(response.payload).toContain('DEFAULT_REGION = "us-west-2"');
  });

  it('POST /api/auth/aws-sts/verify rejects wrong-host URLs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest({ url: 'https://evil.example.com/' }),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toMatch(/sts\.us-west-2\.amazonaws\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST /api/auth/aws-sts/verify rejects stale X-Amz-Date', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest({ amzDate: '20200101T000000Z' }),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toMatch(/time window/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST /api/auth/aws-sts/verify rejects when STS returns 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '<ErrorResponse><Error><Message>Invalid signature</Message></Error></ErrorResponse>',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.payload).error).toMatch(/Invalid signature/);
  });

  it('POST /api/auth/aws-sts/verify rejects ARN from a disallowed role', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::123456789012:assumed-role/OtherRole/user@example.com'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toMatch(/OtherRole/);
  });

  it('POST /api/auth/aws-sts/verify rejects ARN from a disallowed account', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::999999999999:assumed-role/DeveloperAccess/user@example.com', '999999999999'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toMatch(/999999999999/);
  });

  it('POST /api/auth/aws-sts/verify accepts SSO-wrapped role via permission-set name', async () => {
    // Admin configures permission-set name; STS returns AWSReservedSSO_<name>_<hash>
    app.getSettings = vi.fn().mockResolvedValue({
      ...baseSettings,
      auth: { ...baseSettings.auth, aws_sts: { ...baseSettings.auth.aws_sts, role_name: 'CustomPowerUserAccess' } },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_CustomPowerUserAccess_a1b2c3d4e5f67890/alice@example.com'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.user.username).toBe('alice@example.com');
    expect(json.aws_identity.role).toBe('AWSReservedSSO_CustomPowerUserAccess_a1b2c3d4e5f67890');
  });

  it('POST /api/auth/aws-sts/verify handles permission-set names containing underscores', async () => {
    app.getSettings = vi.fn().mockResolvedValue({
      ...baseSettings,
      auth: { ...baseSettings.auth, aws_sts: { ...baseSettings.auth.aws_sts, role_name: 'Custom_Power_User_Access' } },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Custom_Power_User_Access_a1b2c3d4e5f67890/alice@example.com'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(200);
  });

  it('POST /api/auth/aws-sts/verify rejects SSO-wrapped role whose permission set differs from config', async () => {
    app.getSettings = vi.fn().mockResolvedValue({
      ...baseSettings,
      auth: { ...baseSettings.auth, aws_sts: { ...baseSettings.auth.aws_sts, role_name: 'CustomPowerUserAccess' } },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_ReadOnlyAccess_a1b2c3d4e5f67890/alice@example.com'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toMatch(/permission set: ReadOnlyAccess/);
  });

  it('POST /api/auth/aws-sts/verify issues a JWT for a matching ARN', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => stsSuccessXml('arn:aws:sts::123456789012:assumed-role/DeveloperAccess/alice@example.com'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.token).toBeTruthy();
    expect(json.user.username).toBe('alice@example.com');
    expect(json.user.display_name).toBe('alice');
    expect(json.aws_identity.role).toBe('DeveloperAccess');
  });

  it('POST /api/auth/aws-sts/verify returns 400 when config is missing', async () => {
    app.getSettings = vi.fn().mockResolvedValue({ auth: { method: 'aws-sts' }, persistence: {} });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/aws-sts/verify',
      payload: buildSignedRequest(),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toMatch(/not configured/);
  });
});
