const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const email = `browser-${crypto.randomUUID()}@example.test`;
const password = `B${crypto.randomBytes(24).toString('base64url')}!`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', message => console.log('[browser console]', message.type(), message.text()));
  page.on('pageerror', error => console.log('[browser pageerror]', error.message));
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('VORTEX ONE').first().waitFor();
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByLabel('Name').fill('Browser QA');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/sign-up/email')),
      page.getByRole('button', { name: 'Create account', exact: true }).click()
    ]);

    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session', { credentials: 'include' });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
    assert.equal(session.status, 200, JSON.stringify(session));
    assert.ok(session.body?.user, `Authenticated browser session missing user: ${JSON.stringify(session.body)}`);
    try {
      await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    } catch (error) {
      console.log('[browser diagnostic] url=' + page.url());
      console.log('[browser diagnostic] title=' + await page.title());
      console.log('[browser diagnostic] body=' + (await page.locator('body').innerText()).slice(0, 5000));
      throw error;
    }
    await page.getByText('LIVE DATA', { exact: true }).waitFor();

    for (const label of ['Properties', 'Owners', 'Leads', 'Contacts', 'Tasks', 'Campaigns', 'Dialer', 'Imports', 'Reports', 'Data Quality', 'Activity', 'Settings', 'Admin']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await page.locator('h1').filter({ hasText: label }).waitFor();
    }

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
    console.log('Browser smoke QA passed: authenticated account creation, dashboard, all primary modules, and sign-out.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
