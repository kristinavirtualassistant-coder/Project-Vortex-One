const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
async function request(path, options = {}) {
  return fetch(baseUrl + path, {
    ...options,
    headers: { 'content-type': 'application/json', origin: baseUrl, ...(options.headers || {}) }
  });
}
function cookieFrom(response) {
  const value = response.headers.get('set-cookie') || '';
  return value.split(/,(?=[^;]+?=)/).map(v => v.trim().split(';')[0]).filter(Boolean).join('; ');
}
async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await request('/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become healthy');
}

(async () => {
  const server = spawn(process.execPath, ['server/src/index.js'], {
    env: {
      ...process.env,
      PORT: '8080',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: baseUrl,
      JWT_SECRET: process.env.JWT_SECRET
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer();
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Vortex One/i);

    const ready = await request('/api/ready');
    assert.equal(ready.status, 200, await ready.text());
    const readyBody = await ready.json();
    assert.equal(readyBody.ready, true);
    assert.equal(readyBody.migrations.expected, readyBody.migrations.applied);

    const email = `smoke-${crypto.randomUUID()}@example.test`;
    const signup = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name: 'Smoke Test', email, password: 'Smoke-test-123!' })
    });
    assert.equal(signup.status, 200, await signup.text());
    const cookie = cookieFrom(signup);
    assert.ok(cookie, 'authentication session cookie was not returned');

    const dashboard = await request('/api/foundation/dashboard', { headers: { Cookie: cookie } });
    assert.equal(dashboard.status, 200);
    const dashboardBody = await dashboard.json();
    assert.deepEqual(Object.keys(dashboardBody.counts).sort(), ['calls', 'leads', 'members', 'owners', 'properties']);

    const reports = await request('/api/reports/overview', { headers: { Cookie: cookie } });
    assert.equal(reports.status, 200);
    const reportsBody = await reports.json();
    assert.ok(reportsBody.totals);

    const quality = await request('/api/data-quality/summary', { headers: { Cookie: cookie } });
    assert.equal(quality.status, 200);
    const qualityBody = await quality.json();
    assert.equal(typeof qualityBody.issue_count, 'number');

    const signout = await request('/api/auth/sign-out', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(signout.status, 200, await signout.text());
    const protectedAfterSignout = await request('/api/foundation/dashboard', { headers: { Cookie: cookie } });
    assert.equal(protectedAfterSignout.status, 401);

    console.log('Production smoke checks passed.');
  } finally {
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
