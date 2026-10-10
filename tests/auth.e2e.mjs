import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startAuthServer, TEST_PASSWORD } from './auth-server.mjs';

const server = await startAuthServer();
const { base, devToken } = server;
let browser;
const errors = [];
try {
  const channel = process.env.EMAIL_BROWSER_CHANNEL || (process.platform === 'win32' && existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'chrome' : undefined);
  browser = await chromium.launch({ headless: true, channel });
  await mkdir('screenshots', { recursive: true });
  for (const [name, viewport] of [['desktop', { width: 1600, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const alice = await browser.newContext({ viewport }); const bob = await browser.newContext({ viewport });
    const unauth = await browser.newContext({ viewport });
    for (const context of [alice, bob, unauth]) {
      await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
      await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
    }
    const a = await alice.newPage(); const b = await bob.newPage(); const duplicate = await unauth.newPage();
    for (const page of [a, b, duplicate]) page.on('pageerror', (error) => errors.push(error.message));
    const register = async (page, username, displayName) => {
      await page.goto(`${base}/signup.html`);
      await page.getByTestId('register-username').fill(username); await page.getByTestId('register-display-name').fill(displayName);
      await page.getByTestId('register-password').fill(TEST_PASSWORD); await page.getByTestId('register-confirm-password').fill(TEST_PASSWORD);
      await page.getByTestId('register-submit').click();
    };
    const login = async (page, identifier, password = TEST_PASSWORD) => {
      await page.getByTestId('login-identifier').fill(identifier); await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click();
    };
    const dashboard = async (page, displayName) => {
      await page.waitForURL('**/index.html'); await page.getByTestId('current-user-name').waitFor();
      assert.equal(await page.getByTestId('current-user-name').textContent(), displayName);
    };
    await duplicate.goto(`${base}/index.html`); await duplicate.waitForURL('**/signin.html?reason=session');
    assert.equal((await unauth.request.get(`${base}/api/users/me`)).status(), 401);
    await register(a, `alice_${name}`, 'Alice');
    try { await a.waitForURL('**/signin.html?registered=1'); }
    catch (error) {
      await a.screenshot({ path: 'screenshots/auth-failure.png', fullPage: true });
      throw Error(`${error.message}; UI error: ${await a.getByTestId('auth-error').textContent()}; status: ${await a.getByTestId('auth-status').textContent()}; browser errors: ${errors.join(', ')}`, { cause: error });
    }
    assert.match(await a.getByTestId('auth-status').textContent(), /Account created/);
    await register(b, `bob_${name}`, 'Bob'); await b.waitForURL('**/signin.html?registered=1');
    await register(duplicate, `ALICE_${name.toUpperCase()}`, 'Duplicate');
    await duplicate.getByTestId('auth-error').filter({ hasText: 'already registered' }).waitFor();
    await login(a, `alice_${name}`, 'Wrong password'); await a.getByTestId('auth-error').filter({ hasText: 'Invalid username' }).waitFor();
    await login(a, `ALICE_${name.toUpperCase()}`); await dashboard(a, 'Alice');
    await login(b, `BOB_${name.toUpperCase()}@ADMINATOR.TEST`); await dashboard(b, 'Bob');
    const aliceUser = (await (await alice.request.get(`${base}/api/auth/me`)).json()).user;
    assert.equal(await a.getByTestId('current-user-email').textContent(), `alice_${name}@adminator.test`);
    assert.equal((await bob.request.get(`${base}/api/users/${aliceUser.id}`)).status(), 403);
    assert.equal((await bob.request.get(`${base}/api/users/me?userId=${aliceUser.id}`)).status(), 200);
    await a.reload(); await a.getByTestId('current-user-name').waitFor(); assert.equal(await a.getByTestId('current-user-name').textContent(), 'Alice');
    const cookie = (await alice.cookies()).find((cookie) => cookie.name === 'adminator_session');
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax');
    assert.equal(await a.evaluate(() => document.cookie.includes('adminator_session')), false);
    await a.goto(`${base}/email.html?mailMode=mock`); await a.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    await a.getByTestId('compose').click(); await a.getByTestId('compose-to').fill(`bob_${name}@adminator.test`);
    await a.getByTestId('compose-subject').fill('Alice private mock'); await a.getByTestId('compose-body').fill('Only Alice can see this fixture.');
    await a.getByTestId('send-email').click(); await a.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    await a.getByTestId('folder-sent').click(); await a.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await a.getByTestId('email-list').locator('.mail-row').filter({ hasText: 'Alice private mock' }).count(), 1);
    await b.goto(`${base}/email.html?mailMode=mock`); await b.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    await b.getByTestId('folder-sent').click(); await b.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await b.getByTestId('email-list').locator('.mail-row').filter({ hasText: 'Alice private mock' }).count(), 0);
    const bobMailbox = await (await bob.request.get(`${base}/api/mock-mailbox?userId=${aliceUser.id}`)).json();
    assert.notEqual(bobMailbox.ownerId, aliceUser.id);
    const csrf = (await (await bob.request.get(`${base}/api/auth/csrf`)).json()).csrfToken;
    assert.equal((await bob.request.delete(`${base}/api/mock-mailbox?userId=${aliceUser.id}`, { headers: { Origin: base, 'X-CSRF-Token': csrf } })).status(), 204);
    await a.reload(); await a.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    await a.getByTestId('folder-sent').click(); await a.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await a.getByTestId('email-list').locator('.mail-row').filter({ hasText: 'Alice private mock' }).count(), 1);
    const missingCsrf = await alice.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); assert.equal(missingCsrf.status(), 403);
    if (name === 'mobile') await a.getByRole('button', { name: 'Open navigation' }).click();
    await a.getByTestId('logout').click(); await a.waitForURL('**/signin.html?reason=logout');
    assert.equal((await alice.request.get(`${base}/api/auth/me`)).status(), 401);
    await a.goto(`${base}/index.html`); await a.waitForURL('**/signin.html?reason=session');
    assert.equal((await bob.request.get(`${base}/api/auth/me`)).status(), 200);
    assert.equal((await bob.request.post(`${base}/api/dev/expire-session`, { headers: { Origin: base, 'X-Dev-Token': devToken } })).status(), 200);
    assert.equal((await bob.request.get(`${base}/api/users/me`)).status(), 401);
    await b.getByTestId('refresh').click(); await b.waitForURL('**/signin.html?reason=session');
    await b.screenshot({ path: `screenshots/auth-signin-${name}.png`, fullPage: true });
    await duplicate.goto(`${base}/signup.html`); await duplicate.getByTestId('register-username').fill('bad');
    await duplicate.getByTestId('register-display-name').fill('Test'); await duplicate.getByTestId('register-password').fill(TEST_PASSWORD); await duplicate.getByTestId('register-confirm-password').fill('Different password');
    await duplicate.getByTestId('register-submit').click(); assert.match(await duplicate.getByTestId('auth-error').textContent(), /Passwords do not match/);
    await duplicate.screenshot({ path: `screenshots/auth-signup-${name}.png`, fullPage: true });
    assert.equal(await duplicate.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log(`${name}: Alice/Bob register and concurrent login, duplicate/case rules, invalid credentials, protected Dashboard, profile, reload, cookie/CSRF, mailbox isolation, logout/revocation, expiry and validation passed`);
    await alice.close(); await bob.close(); await unauth.close();
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally { await browser?.close(); await server.stop(); }
