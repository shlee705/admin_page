/** Real preview HTTP and WS proxy, with a disposable backend and spawned processes only. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const reservation = createServer();
await new Promise((done, reject) => { reservation.once('error', reject); reservation.listen(3001, '127.0.0.1', done); });
await new Promise(done => reservation.close(done));
const base = 'http://127.0.0.1:3001';
const server = await startAuthServer({ origins: [base] });
const preview = spawn(process.execPath, [resolve('node_modules/webpack-cli/bin/cli.js'), 'serve', '--port', '3001', '--host', '127.0.0.1'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', MINIFY: 'false', ADMINATOR_API_TARGET: server.base },
});
let output = ''; let startupError; let browser;
preview.stdout.on('data', data => { output = (output + data).slice(-10000); });
preview.stderr.on('data', data => { output = (output + data).slice(-10000); });
preview.on('error', error => { startupError = error; });
const report = { base, checks: [], errors: [] };
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (startupError) throw startupError;
    if (preview.exitCode !== null) throw Error(output);
    try { if ((await fetch(`${base}/signup.html`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* compiling */ }
    await new Promise(done => setTimeout(done, 250));
  }
  assert.ok(ready, `Preview startup failed: ${output}`);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ac = await browser.newContext(), bc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await createTestAccount(ac, base, 'preview_alice', 'Alice');
  await createTestAccount(bc, base, 'preview_bob', 'Bob');
  const a = await ac.newPage(), b = await bc.newPage();
  const frames = [];
  for (const page of [a, b]) {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('websocket', socket => {
      if (socket.url().endsWith('/api/chat/ws')) socket.on('framereceived', frame => frames.push(JSON.parse(String(frame.payload))));
    });
  }
  await Promise.all([a.goto(`${base}/chat.html`), b.goto(`${base}/chat.html`)]);
  await a.getByTestId('chat-room-name').fill('Proxy shared room'); await a.getByTestId('chat-room-create').click();
  await b.getByTestId('chat-room').filter({ hasText: 'Proxy shared room' }).waitFor();
  await a.getByTestId('chat-input').fill('WS upgrade through preview'); await a.getByTestId('chat-send').click();
  await b.getByTestId('chat-message').filter({ hasText: 'WS upgrade through preview' }).waitFor();
  assert.ok(frames.some(frame => frame.type === 'message' && frame.message.body === 'WS upgrade through preview'));
  assert.equal((await ac.request.get(`${base}/api/auth/me`)).status(), 200);
  report.checks.push('3001 Origin, cookie session, HTTP proxy, authenticated WS upgrade, shared chat delivery');

  const headers = { Origin: base, 'X-CSRF-Token': (await (await ac.request.get(`${base}/api/auth/csrf`)).json()).csrfToken };
  const otherHeaders = { Origin: base, 'X-CSRF-Token': (await (await bc.request.get(`${base}/api/auth/csrf`)).json()).csrfToken };
  const date = new Date().toISOString().slice(0, 10);
  const data = { title: 'My work', start: `${date}T09:00`, end: `${date}T10:00`, timezone: 'UTC', category: 'work' };
  assert.equal((await ac.request.post(`${base}/api/calendar/events`, { headers, data })).status(), 201);
  assert.equal((await bc.request.post(`${base}/api/calendar/events`, { headers: otherHeaders, data: { ...data, title: 'Other team', category: 'team' } })).status(), 201);
  await a.goto(`${base}/calendar.html`);
  await a.locator('[data-calendar-scope]').waitFor();
  await a.locator('[data-calendar-scope]').selectOption('owned');
  await a.getByTestId('calendar-filter').selectOption('team');
  assert.equal(await a.getByTestId('calendar-event').count(), 0);
  await a.locator('[data-calendar-scope]').selectOption('all');
  await a.getByTestId('calendar-event').filter({ hasText: 'Other team' }).first().waitFor();
  assert.equal(await a.getByTestId('calendar-event').filter({ hasText: 'My work' }).count(), 0);
  await a.getByTestId('calendar-filter').selectOption('');
  await a.locator('[data-calendar-scope]').selectOption('owned');
  await a.getByTestId('calendar-event').filter({ hasText: 'My work' }).first().waitFor();
  assert.equal(await a.getByTestId('calendar-event').filter({ hasText: 'Other team' }).count(), 0);
  const events = (await (await ac.request.get(`${base}/api/calendar/events`)).json()).events;
  assert.equal(events.find(event => event.title === 'My work').ownerId, alice.id);
  report.checks.push('Calendar scope/category independence in browser after rail rebuild');
  await mkdir('screenshots/improvements', { recursive: true });
  await a.screenshot({ path: 'screenshots/improvements/preview-calendar.png', fullPage: true });
  assert.deepEqual(report.errors, []);
  await writeFile('screenshots/improvements/preview.json', JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await mkdir('screenshots/improvements', { recursive: true });
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      const overlay = page.frameLocator('#webpack-dev-server-client-overlay').locator('body');
      if (await page.locator('#webpack-dev-server-client-overlay').count()) console.error(`Preview overlay: ${await overlay.innerText()}`);
    }
  }
  console.error(JSON.stringify(report));
  throw error;
} finally {
  await browser?.close();
  if (preview.exitCode === null && !startupError) {
    const done = new Promise(resolve => preview.once('exit', resolve));
    if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(preview.pid), '/T', '/F'], { windowsHide: true }, resolve));
    else preview.kill();
    await done;
  }
  await server.stop();
}
