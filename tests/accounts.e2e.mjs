import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuthServer, createTestAccount, TEST_PASSWORD } from './auth-server.mjs';

const server = process.env.ADMINATOR_ACCOUNTS_BASE ? { base: process.env.ADMINATOR_ACCOUNTS_BASE, stop: async () => {} } : await startAuthServer();
let browser;
const report = { scenarios: [], errors: [], checkedAt: new Date().toISOString() };
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  await mkdir('screenshots', { recursive: true });
  for (const [name, viewport] of [['desktop', { width: 1600, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const bobBrowser = await browser.newContext(); const charlieBrowser = await browser.newContext();
    const suffix = `${name}_${Date.now()}`;
    const alice = await createTestAccount(context, server.base, `ma_alice_${suffix}`, 'Alice');
    const bob = await createTestAccount(bobBrowser, server.base, `ma_bob_${suffix}`, 'Bob');
    const charlie = await createTestAccount(charlieBrowser, server.base, `ma_charlie_${suffix}`, 'Charlie');
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    const csrf = async (browserContext = context) => ({ Origin: server.base, 'X-CSRF-Token': (await (await browserContext.request.get(`${server.base}/api/auth/csrf`)).json()).csrfToken });
    const identity = async () => (await (await context.request.get(`${server.base}/api/auth/me`)).json()).user;
    const open = async () => {
      await page.getByTestId('switch-account').waitFor();
      if (name === 'mobile') await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByTestId('switch-account').click();
      await page.getByTestId('account-row').first().waitFor();
    };
    const add = async (person, password = TEST_PASSWORD) => {
      await open(); await page.getByTestId('add-account').click();
      await page.getByTestId('account-add-identifier').fill(person.emailAddress);
      await page.getByTestId('account-add-password').fill(password);
      await page.getByTestId('account-add-submit').click();
      if (password === TEST_PASSWORD) {
        await page.getByTestId('account-dialog').waitFor({ state: 'hidden' });
        await page.getByTestId('current-user-name').filter({ hasText: person.displayName }).waitFor();
        assert.equal((await identity()).id, person.id);
      }
    };
    const choose = async (person) => {
      await open(); await page.getByTestId(`account-switch-${person.id}`).click();
      await page.getByTestId('account-dialog').waitFor({ state: 'hidden' });
      await page.getByTestId('current-user-name').filter({ hasText: person.displayName }).waitFor();
      assert.equal((await identity()).id, person.id);
    };
    await page.goto(`${server.base}/email.html`); await page.getByTestId('compose').waitFor();
    const privateDraft = await context.request.post(`${server.base}/api/mail/drafts`, { headers: await csrf(), data: { to: [{ address: bob.emailAddress }], subject: `Alice private ${suffix}`, bodyText: 'Private draft' } });
    assert.equal(privateDraft.status(), 201);
    await page.reload(); await page.getByTestId('folder-drafts').click(); await page.getByText(`Alice private ${suffix}`, { exact: true }).first().waitFor();
    const oldToken = (await context.cookies()).find(cookie => cookie.name === 'adminator_session').value;
    await add(bob, 'Wrong password'); await page.getByTestId('account-error').filter({ hasText: 'Invalid' }).waitFor();
    assert.equal((await identity()).id, alice.id); assert.equal(await page.getByTestId('account-add-password').inputValue(), '');
    await page.getByTestId('account-close').click();
    // Closing the modal leaves the mobile drawer open; navigation resets it before the next open.
    await page.goto(`${server.base}/email.html`);
    await add(bob); assert.equal(new URL(page.url()).pathname, '/email.html');
    await page.getByTestId('folder-drafts').click(); await page.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.getByText(`Alice private ${suffix}`, { exact: true }).count(), 0);
    assert.equal((await context.request.get(`${server.base}/api/mail/emails/${(await privateDraft.json()).id}`)).status(), 404);
    const cookies = await context.cookies();
    assert.notEqual(cookies.find(cookie => cookie.name === 'adminator_session').value, oldToken);
    for (const cookie of cookies.filter(cookie => cookie.name.startsWith('adminator_'))) { assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax'); }
    await choose(alice); await page.getByTestId('folder-drafts').click(); await page.getByText(`Alice private ${suffix}`, { exact: true }).first().waitFor();
    await page.reload(); await open(); assert.equal(await page.getByTestId('account-row').count(), 2); await page.getByTestId('account-close').click();
    await page.goto(`${server.base}/email.html`); await add(charlie); await choose(alice);
    // A failed Remove leaves both the list and active identity intact.
    await page.route(`**/api/auth/accounts/${bob.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Simulated removal failure' } }) }));
    await open(); await page.getByTestId(`account-remove-${bob.id}`).click(); await page.getByTestId('account-error').filter({ hasText: 'Simulated removal failure' }).waitFor();
    assert.equal(await page.getByTestId('account-row').count(), 3); assert.equal((await identity()).id, alice.id);
    await page.unroute(`**/api/auth/accounts/${bob.id}`); await page.getByTestId(`account-remove-${bob.id}`).click(); await page.getByTestId('account-dialog').waitFor({ state: 'hidden' });
    await page.getByTestId('current-user-name').filter({ hasText: 'Alice' }).waitFor();
    assert.equal((await context.request.post(`${server.base}/api/auth/accounts/switch`, { headers: await csrf(), data: { accountId: bob.id } })).status(), 403);
    assert.equal((await (await bobBrowser.request.get(`${server.base}/api/auth/me`)).json()).user.id, bob.id);
    await add(bob); await choose(alice);
    await page.goto(`${server.base}/chat.html`); await page.getByTestId('chat-room-name').fill(`Account room ${suffix}`); await page.getByTestId('chat-room-create').click();
    await page.getByTestId('chat-status').filter({ hasText: 'created' }).waitFor();
    await choose(bob); await page.getByTestId('chat-room').filter({ hasText: `Account room ${suffix}` }).first().click();
    await page.getByTestId('chat-input').fill('Bob after switching'); await page.getByTestId('chat-send').click(); await page.getByTestId('chat-message').filter({ hasText: 'Bob after switching' }).waitFor();
    const rooms = (await (await context.request.get(`${server.base}/api/chat/rooms`)).json()).rooms;
    const room = rooms.find(item => item.name === `Account room ${suffix}`);
    assert.equal((await (await context.request.get(`${server.base}/api/chat/rooms/${room.id}/messages`)).json()).messages[0].senderId, bob.id);
    await choose(alice); await page.getByTestId('chat-message').filter({ hasText: 'Bob after switching' }).waitFor();
    await page.goto(`${server.base}/calendar.html`); await page.getByTestId('calendar-add').click(); await page.getByTestId('event-title').fill(`Account calendar ${suffix}`); await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    await choose(bob); await page.getByTestId('calendar-event').filter({ hasText: `Account calendar ${suffix}` }).first().click(); await page.getByTestId('event-title').fill(`Bob calendar ${suffix}`); await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    const event = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events.find(item => item.title === `Bob calendar ${suffix}`);
    assert.equal(event.createdBy, alice.id); assert.equal(event.updatedBy, bob.id);
    await page.goto(`${server.base}/index.html`); await page.getByTestId('dashboard-status').filter({ hasText: 'loaded' }).waitFor(); assert.match(await page.locator('.hero-title').innerText(), /Bob/);
    // Another tab discards its old account view on the broadcast and reloads as Alice.
    const tab = await context.newPage(); await tab.goto(`${server.base}/email.html`); await tab.getByTestId('current-user-name').filter({ hasText: 'Bob' }).waitFor();
    await choose(alice); await tab.getByTestId('current-user-name').filter({ hasText: 'Alice' }).waitFor(); await tab.close();
    await open(); await page.screenshot({ path: `screenshots/accounts-${name}.png`, fullPage: true });
    const storage = await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage), cookies: document.cookie }));
    const browserTokens = (await context.cookies()).filter(cookie => cookie.name.startsWith('adminator_')).map(cookie => cookie.value);
    const serialized = JSON.stringify(storage); assert.equal(serialized.includes(TEST_PASSWORD), false); assert.ok(browserTokens.every(token => !serialized.includes(token))); assert.equal(storage.cookies.includes('adminator_'), false);
    await page.getByTestId(`account-remove-${alice.id}`).click(); await page.getByTestId('account-dialog').waitFor({ state: 'hidden' }); await page.getByTestId('current-user-name').filter({ hasText: /Bob|Charlie/ }).waitFor();
    assert.notEqual((await identity()).id, alice.id);
    const active = await identity();
    if (name === 'mobile') await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByTestId('logout').click(); await page.getByTestId('current-user-name').filter({ hasText: active.id === bob.id ? 'Charlie' : 'Bob' }).waitFor(); assert.notEqual((await identity()).id, active.id);
    const last = await identity(); await open(); assert.equal(await page.getByTestId('account-row').count(), 1);
    await page.getByTestId(`account-remove-${last.id}`).click(); await page.waitForURL('**/signin.html?reason=logout');
    assert.equal((await context.request.get(`${server.base}/api/auth/me`)).status(), 401);
    assert.equal((await bobBrowser.request.get(`${server.base}/api/auth/me`)).status(), 200);
    report.scenarios.push(`${name}: add/password failure, switch/reload, independent mailbox, remove/re-add/failure, active fallback/logout/last removal, Chat sender, Calendar authors, Dashboard, cross-tab reload, HttpOnly/storage`);
    await context.close(); await bobBrowser.close(); await charlieBrowser.close();
  }
  assert.deepEqual(report.errors, []); console.log(report.scenarios);
} finally {
  await writeFile(process.env.ADMINATOR_ACCOUNTS_BASE ? 'screenshots/accounts-current-site.json' : 'screenshots/accounts-e2e.json', JSON.stringify(report, null, 2));
  await browser?.close(); await server.stop();
}
