const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const email = `browser-${crypto.randomUUID()}@example.test`;
const password = 'Browser-test-123!';

async function apiRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', origin: baseUrl, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async () => {
  const signup = await apiRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: 'Browser QA', email, password })
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.body));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('VORTEX ONE').first().waitFor();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByText('LIVE DATA').waitFor();

    for (const label of ['Properties', 'Owners', 'Leads', 'Contacts', 'Tasks', 'Campaigns', 'Dialer', 'Imports', 'Reports', 'Data Quality', 'Activity', 'Settings', 'Admin']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
    }

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
    console.log('Browser smoke QA passed: authenticated sign-in, dashboard, all primary modules, and sign-out.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
