import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startAuthServer, createTestAccount, TEST_PASSWORD } from './auth-server.mjs';

const server = process.env.ADMINATOR_STABILITY_BASE ? { base: process.env.ADMINATOR_STABILITY_BASE, stop: async () => {} } : await startAuthServer();
const artifacts = resolve(process.env.STABILITY_ARTIFACTS || 'screenshots/stability');
const results = []; const errors = []; let browser;
async function check(id, action) {
  try { const detail = await action(); results.push({ id, status: 'PASS', detail }); }
  catch (error) { results.push({ id, status: 'FAIL', error: error.message }); }
}

try {
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await createTestAccount(context, server.base, `stability_${name}_${Date.now()}`, 'Stability User');
    const auth = await (await context.request.get(`${server.base}/api/auth/me`)).json();
    const stored = { timezone: 'UTC', theme: 'dark', calendarScope: 'owned', mailAutoRefresh: false, homeCards: ['mail'], favoriteRooms: [] };
    const seed = await context.request.put(`${server.base}/api/preferences`, { headers: { Origin: server.base, 'X-CSRF-Token': auth.csrfToken }, data: { preferences: stored, expectedRevision: 0 } });
    assert.equal(seed.status(), 200);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());

    await check(`${name}: QA-005 palette/topbar single toggle, event, persisted account theme`, async () => {
      await page.goto(`${server.base}/index.html`); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.evaluate(() => { window.themeActions = []; window.addEventListener('adminator-theme-changed', event => window.themeActions.push(event.detail)); });
      await page.locator('[data-palette-open]').click(); await page.locator('.palette-input').fill('Toggle theme'); await page.locator('.palette-result').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.evaluate(() => window.themeActions.filter(action => action.userInitiated).length), 1);
      await page.waitForFunction(async () => (await (await fetch('/api/preferences')).json()).preferences.theme === 'light');
      await page.reload(); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.locator('#themeToggle').click(); await page.waitForFunction(async () => (await (await fetch('/api/preferences')).json()).preferences.theme === 'dark');
      await page.reload(); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    });

    await check(`${name}: QA-005 accountA/accountB switch restores isolated themes/settings`, async () => {
      const other = await browser.newContext();
      try {
        const username = `theme_${name}_${Date.now()}`; const user = await createTestAccount(other, server.base, username, 'Theme Other');
        const otherAuth = await (await other.request.get(`${server.base}/api/auth/me`)).json();
        const preference = await other.request.put(`${server.base}/api/preferences`, { headers: { Origin: server.base, 'X-CSRF-Token': otherAuth.csrfToken }, data: { preferences: { ...stored, theme: 'light', timezone: 'Asia/Seoul', homeCards: ['calendar', 'tasks', 'mail', 'chat'] }, expectedRevision: 0 } }); assert.equal(preference.status(), 200);
        const activeAuth = await (await context.request.get(`${server.base}/api/auth/me`)).json();
        const add = await context.request.post(`${server.base}/api/auth/accounts/add`, { headers: { Origin: server.base, 'X-CSRF-Token': activeAuth.csrfToken }, data: { identifier: username, password: TEST_PASSWORD } }); assert.equal(add.status(), 200);
        const added = await add.json(); assert.equal(added.user.id, user.id);
        await page.reload(); await page.getByTestId('dashboard-status').filter({ hasText: 'Asia/Seoul' }).waitFor();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light'); assert.equal(await page.locator('[data-home-card]').count(), 4);
        const back = await context.request.post(`${server.base}/api/auth/accounts/switch`, { headers: { Origin: server.base, 'X-CSRF-Token': added.csrfToken }, data: { accountId: auth.user.id } }); assert.equal(back.status(), 200);
        await page.reload(); await page.getByTestId('dashboard-status').filter({ hasText: 'UTC' }).waitFor(); await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark'); assert.equal(await page.locator('[data-home-card]').count(), 1);
        assert.equal((await (await other.request.get(`${server.base}/api/preferences`)).json()).preferences.theme, 'light');
      } finally { await other.close(); }
    });

    let unavailable = true; let puts = 0;
    await page.route('**/api/preferences', async route => {
      if (route.request().method() === 'PUT') puts++;
      if (unavailable && route.request().method() === 'GET') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'QA preferences unavailable' } }) });
      else await route.continue();
    });
    await check(`${name}: QA-006 Email mounts during503, safe save block, explicit retry recovery`, async () => {
      await page.goto(`${server.base}/email.html`); await page.getByRole('alert').filter({ hasText: 'QA preferences unavailable' }).first().waitFor();
      await page.getByTestId('email-status').filter({ hasText: 'Ready' }).waitFor();
      assert.equal(await page.locator('[data-email-app]').getAttribute('data-mounted'), 'true');
      await page.locator('#themeToggle').click(); assert.equal(puts, 0, 'Temporary defaults must never overwrite stored settings');
      unavailable = false; await page.getByTestId('preferences-retry').click(); await page.getByTestId('preferences-status').filter({ hasText: 'recovered' }).waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.deepEqual((await (await context.request.get(`${server.base}/api/preferences`)).json()).preferences, stored);
    });
    unavailable = true;
    await check(`${name}: QA-006 Settings blocks temporary defaults, recovery updates mounted fields`, async () => {
      await page.goto(`${server.base}/settings.html`); await page.locator('[data-preference-form]').waitFor();
      assert.equal(await page.locator('[data-preference-form] [name="timezone"]').isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Save preferences', exact: true }).isDisabled(), true);
      unavailable = false; await page.getByTestId('preferences-retry').click(); await page.getByTestId('preferences-status').filter({ hasText: 'recovered' }).waitFor();
      assert.equal(await page.locator('[data-preference-form] [name="timezone"]').inputValue(), 'UTC');
      assert.equal(await page.locator('[data-preference-form] [name="mailAutoRefresh"]').isChecked(), false);
      assert.equal(await page.getByRole('button', { name: 'Save preferences', exact: true }).isEnabled(), true);
    });
    unavailable = true;
    await check(`${name}: QA-006 Home defaults then recovered timezone/cards`, async () => {
      await page.goto(`${server.base}/index.html`); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
      assert.equal(await page.locator('[data-home-card]').count(), 4);
      unavailable = false; await page.getByTestId('preferences-retry').click();
      await page.getByTestId('dashboard-status').filter({ hasText: 'UTC' }).waitFor();
      assert.equal(await page.locator('[data-home-card]').count(), 1); assert.equal(await page.locator('[data-home-card]').getAttribute('data-home-card'), 'mail');
    });
    await page.unroute('**/api/preferences');
    if (name === 'desktop') await check('QA-006 actual15second request timeout still permits Email initialization/retry', async () => {
      let hang = true;
      await page.route('**/api/preferences', async route => {
        if (hang && route.request().method() === 'GET') { await new Promise(done => setTimeout(done, 16000)); await route.continue().catch(() => {}); }
        else await route.continue();
      });
      try {
        await page.goto(`${server.base}/email.html`); await page.getByTestId('email-status').filter({ hasText: 'Ready' }).waitFor();
        assert.equal(await page.locator('[data-email-app]').getAttribute('data-mounted'), 'true');
        assert.match(await page.getByTestId('preferences-status').innerText(), /Loading account preferences/);
        await page.getByTestId('preferences-status').filter({ hasText: 'timed out' }).waitFor();
        hang = false; await page.getByTestId('preferences-retry').click(); await page.getByTestId('preferences-status').filter({ hasText: 'recovered' }).waitFor();
      } finally { hang = false; await page.unroute('**/api/preferences'); }
    });

    await check(`${name}: QA-010/013 charts alias Reports active/history and table aliases retained`, async () => {
      await page.goto(`${server.base}/index.html`); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
      await page.goto(`${server.base}/charts.html`); await page.locator('[data-report] tbody tr').first().waitFor();
      assert.ok(page.url().endsWith('/charts.html')); assert.equal(await page.locator('.nav-link.is-active').getAttribute('href'), 'reports.html');
      assert.equal(await page.locator('.crumbs .current').innerText(), 'Work report'); assert.equal(await page.getByTestId('template-mode').count(), 0);
      await page.goBack(); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor(); assert.ok(page.url().endsWith('/index.html'));
      await page.goto(`${server.base}/basic-table.html`); await page.getByTestId('calendar-status').filter({ hasText: 'ready' }).waitFor(); assert.ok(page.url().includes('/calendar.html?view=agenda'));
      await page.goto(`${server.base}/datatable.html`); await page.locator('[data-task-editor]').waitFor(); assert.ok(page.url().endsWith('/tasks.html'));
    });
    await check(`${name}: QA-011 UI gallery viewport/popover bounds`, async () => {
      await page.goto(`${server.base}/ui.html`); await page.getByTestId('template-mode').waitFor();
      const bounds = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, popovers: [...document.querySelectorAll('.popover-demo .pop')].map(pop => { const r = pop.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height, text: pop.textContent }; }) }));
      await page.screenshot({ path: resolve(artifacts, `ui-${name}.png`), fullPage: true, animations: 'disabled' });
      assert.ok(bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds));
      assert.ok(bounds.popovers.every(pop => pop.left >= 0 && pop.right <= bounds.width + 1 && pop.height < 60), JSON.stringify(bounds)); return bounds;
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(artifacts, 'validation.json'), JSON.stringify({ testedAt: new Date().toISOString(), results, errors }, null, 2));
  await browser?.close(); await server.stop();
}
console.log(JSON.stringify({ results, errors }, null, 2));
assert.ok(results.every(result => result.status === 'PASS'), 'Stability regression failure; see validation.json');
