const DEFAULT_SERVER_URL = 'https://platform.ringcentral.com';
const JWT_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
let tokenCache = null;

function configured() {
  return Boolean(process.env.RC_APP_CLIENT_ID && process.env.RC_APP_CLIENT_SECRET && process.env.RC_USER_JWT);
}

function serverUrl() {
  return String(process.env.RC_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/$/, '');
}

async function getAccessToken() {
  if (!configured()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;
  const credentials = Buffer.from(`${process.env.RC_APP_CLIENT_ID}:${process.env.RC_APP_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: JWT_GRANT, assertion: process.env.RC_USER_JWT });
  const response = await fetch(`${serverUrl()}/restapi/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  if (!response.ok) throw new Error(`RingCentral authentication failed (${response.status})`);
  const data = await response.json();
  if (!data.access_token) throw new Error('RingCentral authentication returned no access token');
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return tokenCache.accessToken;
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(`RingCentral API request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function request(path, options = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(options.headers || {}) };
  let response = await fetch(`${serverUrl()}${path}`, { ...options, headers });
  if (response.status === 401) {
    tokenCache = null;
    const retryToken = await getAccessToken();
    if (!retryToken) return null;
    response = await fetch(`${serverUrl()}${path}`, { ...options, headers: { ...headers, Authorization: `Bearer ${retryToken}` } });
  }
  return parseResponse(response);
}

async function placeRingOut({ toNumber, fromNumber }) {
  if (!configured()) return { configured: false, provider: 'ringcentral' };
  const payload = { to: { phoneNumber: toNumber }, playPrompt: false };
  if (fromNumber) payload.from = { phoneNumber: fromNumber };
  const body = await request('/restapi/v1.0/account/~/extension/~/ring-out', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return { configured: true, provider: 'ringcentral', providerCallId: body?.id ? String(body.id) : null, callStatus: body?.status?.callStatus || null };
}

async function getRingOut(providerCallId) {
  if (!configured()) return { configured: false, provider: 'ringcentral' };
  const body = await request(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(providerCallId)}`);
  return { configured: true, provider: 'ringcentral', providerCallId: String(providerCallId), callStatus: body?.status?.callStatus || null };
}

module.exports = { configured, placeRingOut, getRingOut };
