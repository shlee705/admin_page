import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startAuthServer, createTestAccount } from './auth-server.mjs';
const server = await startAuthServer(); let browser;
const errors = []; const failed = [];
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); await mkdir('screenshots', { recursive: true });
  for (const [name, viewport] of [['desktop', { width: 1600, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }); await createTestAccount(context, server.base, `workspace_${name}`, `Workspace ${name}`);
    await context.route('https://fonts.googleapis.com/**',route=>route.abort()); await context.route('https://fonts.gstatic.com/**',route=>route.abort());
    const page = await context.newPage(); page.on('dialog',dialog=>dialog.accept()); page.on('pageerror', error => errors.push(error.message)); page.on('requestfailed', request => { if (request.url().startsWith(server.base)) failed.push(request.url()); });
    page.on('console', message => { if (message.type() === 'error' && !/status of (422|503)|net::ERR_FAILED/.test(message.text())) errors.push(`Console: ${message.text()}`); });
    await page.goto(`${server.base}/calendar.html`); await page.getByTestId('calendar-add').waitFor();
    assert.match(await page.locator('.cal-month').innerText(), new RegExp(new Date().toLocaleDateString('en-US', { month: 'long' })));
    const month = await page.locator('.cal-month').innerText(); await page.locator('.cal-main [aria-label="Next"]').click(); assert.notEqual(await page.locator('.cal-month').innerText(), month);
    await page.locator('.cal-today-btn').click(); assert.equal(await page.locator('.cal-month').innerText(), month);
    await page.getByTestId('calendar-add').click(); await page.getByTestId('event-save').click(); await page.getByTestId('event-error').filter({ hasText: 'Title' }).waitFor();
    await page.getByTestId('event-title').fill(`Test event ${name}`); await page.getByTestId('event-description').fill('Persisted description');
    const date = await page.getByTestId('event-start').inputValue(); await page.getByTestId('event-end').fill(`${date.slice(0, 10)}T08:00`); await page.getByTestId('event-save').click(); await page.getByTestId('event-error').filter({ hasText: 'End must' }).waitFor();
    await page.getByTestId('event-end').fill(`${date.slice(0, 10)}T10:30`); await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    await page.reload(); await page.getByTestId('calendar-add').waitFor();
    const saved = page.getByTestId('calendar-event').filter({ hasText: `Test event ${name}` }); await saved.first().click(); assert.equal(await page.getByTestId('event-description').inputValue(), 'Persisted description');
    await page.getByTestId('event-title').fill(`Edited event ${name}`); await page.getByTestId('event-all-day').check(); await page.getByTestId('event-category').selectOption('travel'); await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    await page.getByTestId('calendar-filter').selectOption('travel'); await page.getByTestId('calendar-event').filter({ hasText: `Edited event ${name}` }).first().click(); assert.equal(await page.getByTestId('event-all-day').isChecked(), true); await page.getByTestId('event-cancel').click();
    if (name === 'desktop') {
      const edited = page.getByTestId('calendar-event').filter({ hasText: `Edited event ${name}` }).first(); const id = (await edited.getAttribute('data-event-id')).split('::')[0];
      const old = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events.find(event => event.id === id);
      const tomorrow = new Date(`${old.start}T12:00`); tomorrow.setDate(tomorrow.getDate() + 1); const targetDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
      const source = await edited.boundingBox();
      const dest = await page.locator(`[data-testid="calendar-day"][data-date="${targetDate}"]`).first().boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down(); await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 20 }); await page.waitForTimeout(300); await page.mouse.up();
      await page.getByTestId('calendar-status').filter({ hasText: 'Event updated' }).waitFor();
      const moved = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events.find(event => event.id === id); assert.equal(moved.start, targetDate);
      // Resize the all-day pill by its end handle, then verify the exclusive end.
      const movedBox = await edited.boundingBox(); const next = new Date(`${targetDate}T12:00`); next.setDate(next.getDate() + 1); const nextDate = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
      const nextBox = await page.locator(`[data-testid="calendar-day"][data-date="${nextDate}"]`).first().boundingBox();
      const oldRevision = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events.find(event => event.id === id).revision;
      await page.mouse.move(movedBox.x + movedBox.width - 2, movedBox.y + movedBox.height / 2); await page.mouse.down(); await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { steps: 20 }); await page.waitForTimeout(300); await page.mouse.up();
      await page.waitForFunction(async ({ base, revision, id }) => (await (await fetch(`${base}/api/calendar/events`)).json()).events.find(event => event.id === id).revision > revision, { base: server.base, revision: oldRevision, id });
      const resized = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events.find(event => event.id === id); assert.ok(resized.end > moved.end);
    }
    await page.getByRole('button', { name: 'Week', exact: true }).click(); await page.getByRole('button', { name: 'Day', exact: true }).click(); await page.getByRole('button', { name: 'Agenda', exact: true }).click(); await page.getByRole('button', { name: 'Month', exact: true }).click();
    await page.getByTestId('calendar-filter').selectOption('');
    await page.screenshot({ path: `screenshots/site-calendar-${name}.png`, fullPage: true });
    await page.getByTestId('calendar-event').filter({ hasText: `Edited event ${name}` }).first().click(); await page.getByTestId('event-delete').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    await page.reload(); await page.getByTestId('calendar-add').waitFor(); assert.equal(await page.getByTestId('calendar-event').filter({ hasText: `Edited event ${name}` }).count(), 0);
    await page.locator('.mini-cal-day').nth(14).click(); await page.getByTestId('event-dialog').waitFor(); await page.keyboard.press('Escape'); assert.equal(await page.getByTestId('event-dialog').isVisible(), false);
    const download = page.waitForEvent('download'); await page.getByTestId('calendar-export').click(); assert.equal((await download).suggestedFilename(), 'calendar.json');
    await page.getByTestId('calendar-reset').click(); await page.getByTestId('calendar-status').filter({ hasText: 'restored' }).waitFor();
    await page.goto(`${server.base}/chat.html?chatMode=mock`); await page.getByTestId('chat-status').filter({ hasText: 'ready' }).waitFor();
    assert.equal(await page.getByTestId('chat-room').count(), 3); assert.equal(await page.getByTestId('chat-unread').count(), 1);
    await page.getByTestId('chat-room').nth(1).click(); await page.getByTestId('chat-status').filter({ hasText: 'opened' }).waitFor(); assert.match(await page.getByTestId('chat-room-heading').innerText(), /planning/); assert.equal(await page.getByTestId('chat-unread').count(), 0);
    await page.getByTestId('chat-send').click(); assert.match(await page.getByTestId('chat-error').innerText(), /Enter a message/);
    await page.getByTestId('chat-input').fill('First line'); await page.getByTestId('chat-input').press('Shift+Enter'); await page.getByTestId('chat-input').press('End'); await page.getByTestId('chat-input').type('Second line'); assert.match(await page.getByTestId('chat-input').inputValue(), /\n/);
    await page.getByTestId('chat-input').press('Enter'); await page.getByTestId('chat-status').filter({ hasText: 'Message saved' }).waitFor(); assert.match(await page.getByTestId('chat-messages').innerText(), /First line\nSecond line/);
    await page.getByTestId('chat-input').fill('Button message'); await page.getByTestId('chat-send').click(); await page.getByTestId('chat-status').filter({ hasText: 'Message saved' }).waitFor();
    await page.reload(); await page.getByTestId('chat-status').filter({ hasText: 'ready' }).waitFor(); await page.getByTestId('chat-room').nth(1).click(); await page.getByTestId('chat-status').filter({ hasText: 'opened' }).waitFor(); assert.match(await page.getByTestId('chat-messages').innerText(), /Button message/);
    await page.getByTestId('chat-room-name').fill('Test private room'); await page.getByTestId('chat-room-create').click(); await page.getByTestId('chat-status').filter({ hasText: 'created' }).waitFor(); assert.match(await page.getByTestId('chat-room-heading').innerText(), /Test private room/);
    await page.getByTestId('chat-search').fill('private'); assert.equal(await page.getByTestId('chat-room').count(), 2); await page.getByTestId('chat-search').fill('');
    await page.screenshot({ path: `screenshots/site-chat-${name}.png`, fullPage: true });
    // Failed persistence must preserve text and show a recoverable error.
    await page.route('**/api/workspace/chat', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Simulated save failure' } }) }) : route.continue());
    await page.getByTestId('chat-input').fill('Retain on failure'); await page.getByTestId('chat-send').click(); await page.getByTestId('chat-error').filter({ hasText: 'Simulated save failure' }).waitFor(); assert.equal(await page.getByTestId('chat-input').inputValue(), 'Retain on failure'); await page.unroute('**/api/workspace/chat');
    await page.goto(`${server.base}/index.html`); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
    const summary = await (await context.request.get(`${server.base}/api/dashboard?timezoneName=Asia%2FSeoul&scope=related`)).json();
    assert.equal(Number(await page.getByTestId('dashboard-metric-0').innerText()), summary.todayEvents.length);
    assert.equal(await page.getByTestId('dashboard-metric-1').innerText(), '0');
    assert.match(await page.locator('.hero-title').innerText(), new RegExp(`Workspace ${name}`));
    await page.getByTestId('dashboard-task-title').fill('Persistent task'); await page.getByTestId('dashboard-task-add').click();
    await page.getByTestId('dashboard-metric-1').filter({hasText:'1'}).waitFor();
    const taskId = await page.getByTestId('dashboard-task-toggle').locator('..').getAttribute('data-task-id');
    await page.getByTestId('dashboard-task-toggle').check(); await page.getByTestId('dashboard-metric-1').filter({hasText:'0'}).waitFor();
    await page.reload(); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
    const persisted = (await (await context.request.get(`${server.base}/api/workspace/tasks`)).json()).state.tasks.find(t=>t.id===taskId);
    assert.equal(persisted.done, true); assert.ok(persisted.completedAt); assert.equal(await page.getByTestId('dashboard-task-toggle').count(), 0);
    await page.screenshot({ path: `screenshots/site-dashboard-${name}.png`, fullPage: true });
    if (name === 'mobile') await page.locator('[data-drawer-open]').click();
    await page.locator('a[href="reports.html"]').first().click(); await page.locator('[data-report] tbody tr').last().waitFor();
    const taskReport = await (await context.request.get(`${server.base}/api/reports/tasks?days=7`)).json();
    assert.equal(taskReport.completed.reduce((a,b)=>a+b,0), 1);
    assert.equal(await page.locator('[data-report] tbody tr').count(), 7);
    assert.equal(Number(await page.locator('[data-report] meter').last().getAttribute('value')), taskReport.completed.at(-1));
    await page.goto(`${server.base}/tasks.html?task=${encodeURIComponent(taskId)}`); await page.locator('[data-task-editor] [name="done"]:checked').waitFor();
    await page.locator('[data-delete-task]').click(); await page.locator('[data-hub-status]').filter({hasText:'Saved'}).waitFor();
    assert.equal((await (await context.request.get(`${server.base}/api/workspace/tasks`)).json()).state.tasks.length, 0);
    const bob = await browser.newContext(); await createTestAccount(bob, server.base, `workspace_bob_${name}`, 'Bob'); const bobState = await (await bob.request.get(`${server.base}/api/workspace/chat`)).json(); assert.equal(bobState.state, null); await bob.close(); await context.close();
    console.log(`${name}: Calendar CRUD/views/export/reset, Chat rooms/send/persistence/failure, Home task persistence/completion, Reports, Tasks deletion and account isolation passed`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(failed, []); console.log('No browser page errors or failed local requests.');
} finally { await browser?.close(); await server.stop(); }

