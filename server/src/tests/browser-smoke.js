const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await assert.doesNotReject(() => page.getByText('VORTEX ONE').first().waitFor());
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Name').fill('Browser QA');
    await page.getByLabel('Email').fill(`browser-${crypto.randomUUID()}@example.test`);
    await page.getByLabel('Password').fill('Browser-test-123!');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await page.getByText('LIVE DATA').waitFor();

    for (const label of ['Properties', 'Owners', 'Leads', 'Contacts', 'Tasks', 'Campaigns', 'Dialer', 'Imports', 'Reports', 'Data Quality', 'Activity', 'Settings', 'Admin']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
    }

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
    console.log('Browser smoke QA passed: authentication, dashboard, all primary modules, and sign-out.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
