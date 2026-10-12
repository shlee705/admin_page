/** Real commit/lost-response retry and cross-zone FullCalendar mouse gestures. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const server = process.env.ADMINATOR_CALENDAR_BASE ? { base: process.env.ADMINATOR_CALENDAR_BASE, stop: async () => {} } : await startAuthServer();
const artifactRoot = resolve(process.env.ADMINATOR_CALENDAR_ARTIFACTS || 'screenshots/calendar-integrity');
const evidence = { checks: [], errors: [], requests: [] }; let browser;
try {
  await mkdir(artifactRoot, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'chrome' : undefined });
  for (const [index, timezoneId] of ['Asia/Seoul', 'UTC'].entries()) {
    const context = await browser.newContext({ viewport: { width: index ? 390 : 1600, height: index ? 844 : 1000 }, timezoneId });
    const account = await createTestAccount(context, server.base, `cal_integrity_${index}_${Date.now()}`, 'Calendar Tester');
    const csrf = async () => (await (await context.request.get(`${server.base}/api/auth/csrf`)).json()).csrfToken;
    const request = async (path, method = 'GET', data) => {
      const result = await context.request.fetch(`${server.base}/api${path}`, { method, data, headers: { Origin: server.base, 'X-CSRF-Token': await csrf() } });
      assert.ok(result.ok(), await result.text()); return result.json();
    };
    const page = await context.newPage(); page.on('pageerror', error => evidence.errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort()); await page.route('https://fonts.gstatic.com/**', route => route.abort());
    await page.goto(`${server.base}/calendar.html`); await page.getByTestId('calendar-status').filter({ hasText: 'ready' }).waitFor();
    let lostBody; let committed; let intercepted = false;
    await page.route('**/api/calendar/events', async route => {
      if (route.request().method() !== 'POST' || intercepted) return route.continue();
      intercepted = true; lostBody = route.request().postDataJSON();
      const result = await route.fetch(); assert.equal(result.status(), 201); committed = await result.json();
      await route.abort('failed');
    });
    await page.getByTestId('calendar-add').click(); await page.getByTestId('event-title').fill(`Lost create ${timezoneId}`); await page.getByTestId('event-save').click();
    await page.getByTestId('event-retry-create').waitFor();
    assert.ok(lostBody.clientId); assert.equal(await page.getByTestId('event-title').inputValue(), `Lost create ${timezoneId}`);
    // Retry deliberately uses the frozen original request while preserving typed changes.
    await page.getByTestId('event-title').fill('Changed after uncertain response');
    const retry = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/calendar/events'));
    await page.getByTestId('event-retry-create').click(); assert.deepEqual((await retry).postDataJSON(), lostBody);
    await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
    const stored = (await request('/calendar/events')).events.filter(event => event.ownerId === account.id && event.title === lostBody.title);
    assert.equal(stored.length, 1); assert.equal(stored[0].id, committed.id);
    evidence.checks.push(`${timezoneId}: server201 then responseabort, unchanged original retry returns one event`);
    await page.unroute('**/api/calendar/events');

    // The New York DST fallback hour is intentionally different from both browser zones.
    const seed = await request('/calendar/events', 'POST', { clientId: `zone-${index}`, title: `DST gesture ${timezoneId}`, start: '2026-11-01T05:30:00Z', end: '2026-11-01T06:30:00Z', category: 'work', timezone: 'America/New_York', attendeeIds: [] });
    await page.goto(`${server.base}/calendar.html?event=${seed.id}`); await page.getByTestId('event-cancel').click();
    await page.locator('.cal-view-tab').filter({ hasText: /^Day$/ }).click();
    const event = page.getByTestId('calendar-event').filter({ hasText: seed.title }); await event.waitFor(); await event.scrollIntoViewIfNeeded();
    await writeFile(resolve(artifactRoot, `gesture-dom-${index}.html`), await page.locator('[data-fc]').innerHTML());
    const slot = await page.locator('[data-fc] [data-time]').first().boundingBox(); assert.ok(slot?.height);
    const bounds = await event.boundingBox(); assert.ok(bounds);
    const moved = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith(`/api/calendar/events/${seed.id}`));
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(12, bounds.height / 3)); await page.mouse.down();
    await page.waitForTimeout(180); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(12, bounds.height / 3) + slot.height * 2, { steps: 12 }); await page.mouse.up();
    const moveBody = (await moved).postDataJSON(); assert.equal(moveBody.timezone, 'America/New_York');
    assert.equal(Date.parse(moveBody.start) - Date.parse(seed.start), 3600000); assert.equal(Date.parse(moveBody.end) - Date.parse(seed.end), 3600000);
    await page.getByTestId('calendar-status').filter({ hasText: 'Event updated.' }).waitFor();
    const afterMove = await request(`/calendar/events/${seed.id}`); assert.equal(afterMove.timezone, 'America/New_York'); assert.equal(Date.parse(afterMove.start), Date.parse(moveBody.start));
    evidence.requests.push({ browserZone: timezoneId, owner: account.id, moveBody });

    await event.scrollIntoViewIfNeeded();
    await event.evaluate(el => {
      for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.scrollHeight > ancestor.clientHeight && ['auto','scroll'].includes(getComputedStyle(ancestor).overflowY)) {
          ancestor.scrollTop += el.getBoundingClientRect().top - ancestor.getBoundingClientRect().top - 100; break;
        }
      }
    });
    await event.hover();
    // FullCalendar v7 obfuscates structural classes; the displayed resize cursor
    // is the observable control contract rather than a v6 CSS class name.
    await page.screenshot({ path: resolve(artifactRoot, `resize-before-${index}.png`) });
    const resizeBounds = await event.evaluate(el => {
      const handle = [...el.querySelectorAll('*')].find(node => ['s-resize','ns-resize'].includes(getComputedStyle(node).cursor));
      if (!handle) return null; const { x, y, width, height } = handle.getBoundingClientRect(); return { x, y, width, height };
    }); assert.ok(resizeBounds);
    await writeFile(resolve(artifactRoot, `resize-bounds-${index}.json`), JSON.stringify({ resizeBounds, slot }, null, 2));
    const resized = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith(`/api/calendar/events/${seed.id}`));
    await page.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y + resizeBounds.height / 2); await page.mouse.down();
    await page.waitForTimeout(180); await page.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y + resizeBounds.height / 2 + slot.height * 2, { steps: 12 }); await page.mouse.up();
    const resizeBody = (await resized).postDataJSON(); assert.equal(resizeBody.timezone, 'America/New_York'); assert.equal(Date.parse(resizeBody.start), Date.parse(moveBody.start)); assert.equal(Date.parse(resizeBody.end) - Date.parse(moveBody.end), 3600000);
    await page.getByTestId('calendar-status').filter({ hasText: 'Event updated.' }).waitFor();
    evidence.requests.push({ browserZone: timezoneId, resizeBody }); evidence.checks.push(`${timezoneId}: actual FullCalendar DST-hour drag and resize preserve New York zone and UTC instants`);
    await page.screenshot({ path: resolve(artifactRoot, `calendar-${index}.png`), fullPage: true }); await context.close();
  }
  assert.deepEqual(evidence.errors, []); console.log(evidence.checks);
} finally { await writeFile(resolve(artifactRoot, 'results.json'), JSON.stringify(evidence, null, 2)); await browser?.close(); await server.stop(); }
