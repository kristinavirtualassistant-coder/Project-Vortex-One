const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const suffix = crypto.randomUUID();
const email1 = `m1-owner-${suffix}@example.test`;
const email2 = `m1-owner2-${suffix}@example.test`;
const password = 'M1-test-password-123!';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const { response } = await request('/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vortex One server did not become healthy');
}

(async () => {
  const server = spawn(process.execPath, ['server/src/index.js'], {
    env: { ...process.env, PORT: '8080', JWT_SECRET: 'm1-ci-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    await waitForHealth();

    const register1 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ organization: `M1 Org ${suffix}`, name: 'M1 Owner', email: email1, password })
    });
    assert.equal(register1.response.status, 201, JSON.stringify(register1.body));
    assert.equal(register1.body.user.role, 'owner');

    const token1 = register1.body.token;
    const auth1 = { Authorization: `Bearer ${token1}` };

    const dashboard1 = await request('/api/foundation/dashboard', { headers: auth1 });
    assert.equal(dashboard1.response.status, 200, JSON.stringify(dashboard1.body));
    assert.deepEqual(dashboard1.body.counts, { properties: 0, owners: 0, leads: 0, calls: 0, members: 1 });

    const members1 = await request('/api/foundation/members', { headers: auth1 });
    assert.equal(members1.response.status, 200, JSON.stringify(members1.body));
    assert.equal(members1.body.items.length, 1);
    assert.equal(members1.body.items[0].role, 'owner');

    const settings1 = await request('/api/foundation/settings', { headers: auth1 });
    assert.equal(settings1.response.status, 200, JSON.stringify(settings1.body));
    assert.deepEqual(settings1.body.settings, {});

    const audit1 = await request('/api/foundation/audit', { headers: auth1 });
    assert.equal(audit1.response.status, 200, JSON.stringify(audit1.body));
    assert.ok(audit1.body.items.some(item => item.action === 'organization.created'));

    const signedOut = await request('/api/foundation/dashboard');
    assert.equal(signedOut.response.status, 401);

    const register2 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ organization: `M1 Org 2 ${suffix}`, name: 'M1 Owner 2', email: email2, password })
    });
    assert.equal(register2.response.status, 201, JSON.stringify(register2.body));
    const token2 = register2.body.token;

    const dashboard2 = await request('/api/foundation/dashboard', {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert.equal(dashboard2.response.status, 200, JSON.stringify(dashboard2.body));
    assert.deepEqual(dashboard2.body.counts, { properties: 0, owners: 0, leads: 0, calls: 0, members: 1 });

    const crossOrgMembers = await request('/api/foundation/members', { headers: auth1 });
    assert.equal(crossOrgMembers.body.items.length, 1);
    assert.notEqual(crossOrgMembers.body.items[0].email, email2);

    console.log('M1 foundation integration checks passed.');
  } finally {
    server.kill('SIGTERM');
    if (stderr) process.stderr.write(stderr);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
