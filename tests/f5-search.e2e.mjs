/** Reproduce F5 through Compose and the visible Search work form. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const output = '.integration-artifacts/f5-search';
await mkdir(output, { recursive: true });
const server = await startAuthServer(); let browser;
const results = []; const requests = []; const errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const owner = await createTestAccount(context, server.base, 'f5_search_ui', 'F5 Search Tester');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/api/search?') || r.url().includes('/api/mail/emails?')) requests.push(r.url()); });
  const ready = () => page.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
  await page.goto(`${server.base}/compose.html`); await ready();
  await page.getByTestId('compose-to').fill(owner.emailAddress);
  await page.getByTestId('compose-subject').fill('f5titlemarker');
  await page.getByTestId('compose-body').fill('f5bodymarker');
  await page.getByTestId('send-email').click(); await ready();
  assert.match(await page.getByTestId('email-status').innerText(), /delivered-internal/);
  await page.locator('.topbar-actions').getByRole('link', { name: 'Search work', exact: true }).click();
  await page.locator('[data-hub-body] form').waitFor();
  for (const kind of ['mail', 'all']) {
    for (const query of ['f5bodymarker', 'f5titlemarker']) {
      await page.locator('[name="q"]').fill(query);
      await page.locator('[name="kind"]').selectOption(kind);
      const response = page.waitForResponse(r => r.url().includes('/api/search?') && new URL(r.url()).searchParams.get('q') === query);
      await page.locator('[data-hub-body] form button').click();
      const r = await response; assert.equal(r.status(), 200);
      const data = await r.json(); const count = data.results.filter(item => item.kind === 'mail').length;
      assert.equal(count, query === 'f5bodymarker' ? 0 : 2);
      if (count) assert.ok(data.results.every(item => item.text === 'f5bodymarker'));
      await page.screenshot({ path: `${output}/${kind}-${query}.png`, fullPage: true });
      results.push({ surface: 'Search work', kind, query, mailResults: count, status: r.status() });
    }
  }
  await page.locator('.nav-link').filter({ hasText: 'Email' }).click(); await ready();
  const mailboxResponse = page.waitForResponse(r => r.url().includes('/api/mail/emails?') && new URL(r.url()).searchParams.get('query') === 'f5bodymarker');
  await page.getByTestId('search-mail').fill('f5bodymarker');
  const mailbox = await mailboxResponse; assert.equal(mailbox.status(), 200);
  assert.equal((await mailbox.json()).total, 1);
  await ready(); assert.equal(await page.locator('[data-email-id]').count(), 1);
  results.push({ surface: 'Email Search mail', query: 'f5bodymarker', mailResults: 1, status: 200 });
  await page.screenshot({ path: `${output}/mailbox-body-control.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), browser: browser?.version(), results, requests, errors }, null, 2));
  await browser?.close(); await server.stop();
}
