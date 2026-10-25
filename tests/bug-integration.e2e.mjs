/** All 14 defects coexist in one build and isolated database, with real browser/API readback. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const out = '.integration-artifacts/browser';
await mkdir(out, { recursive: true });
const server = await startAuthServer();
const results = []; const errors = []; let browser;
const pause = ms => new Promise(done => setTimeout(done, ms));
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Seoul' });
    const peer = await browser.newContext({ viewport, timezoneId: 'Asia/Seoul' });
    for (const c of [context, peer]) {
      await c.route('https://fonts.googleapis.com/**', r => r.abort());
      await c.route('https://fonts.gstatic.com/**', r => r.abort());
    }
    const user = await createTestAccount(context, server.base, `integrated_${viewport.width}`, '검증 사용자 ABC 123');
    const other = await createTestAccount(peer, server.base, `peer_${viewport.width}`, 'Peer ABC');
    const page = await context.newPage(); const otherPage = await peer.newPage();
    for (const p of [page, otherPage]) { p.setDefaultTimeout(12000); p.on('pageerror', e => errors.push({ width: viewport.width, error: e.message })); p.on('dialog', d => d.accept()); }
    const api = async (path, method = 'GET', data, c = context) => {
      const csrf = (await (await c.request.get(`${server.base}/api/auth/csrf`)).json()).csrfToken;
      const response = await c.request.fetch(`${server.base}${path}`, { method, ...(data ? { data } : {}), headers: { Origin: server.base, 'X-CSRF-Token': csrf } });
      assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
      return response.status() === 204 ? null : response.json();
    };
    const ready = () => page.waitForFunction(() => document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    const go = async path => { await page.goto(`${server.base}/${path}`); };
    const shot = id => page.screenshot({ path: `${out}/${viewport.width}-${id}.png`, fullPage: true });
    const test = async (id, action) => {
      try { const detail = await action(); results.push({ id, width: viewport.width, passed: true, detail }); console.log(`PASS ${viewport.width} ${id}`); }
      catch (e) { results.push({ id, width: viewport.width, passed: false, error: e.stack }); console.log(`FAIL ${viewport.width} ${id}: ${e.message}`); await shot(`${id}-failure`).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); }
      await writeFile(`${out}/results.json`, JSON.stringify({ browser: browser.version(), results, errors }, null, 2));
    };
    const mail = changes => ({ to: [{ address: user.emailAddress }], cc: [], bcc: [], subject: '한글 회의 안내 ABC 123', bodyText: '동적 본문 ABC 123', ...changes });
    await api('/api/mail/send', 'POST', mail({ clientId: 'unicode' }));
    const inbox = (await api('/api/mail/emails')).items.find(m => m.folderId === 'inbox');
    await api('/api/mail/send', 'POST', mail({ subject: 'Trash searchtarget', bodyText: 'trash bodyneedle', clientId: 'trash' }));
    const trash = (await api('/api/mail/emails')).items.find(m => m.folderId === 'inbox' && m.subject === 'Trash searchtarget');
    await api(`/api/mail/emails/${trash.id}`, 'PATCH', { folderId: 'trash' });
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const nextDay = new Date(`${day}T12:00:00+09:00`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(nextDay);
    const calendarDay = new Date().toISOString().slice(0, 10);
    for (const [title, hour] of [['First event ABC', '10'], ['Second event ABC', '15']]) await api('/api/calendar/events', 'POST', { title, start: `${calendarDay}T${hour}:00`, end: `${calendarDay}T${hour}:30`, timezone: 'Asia/Seoul' });
    const room = await api('/api/chat/rooms', 'POST', { userId: other.id });

    await test('N2', async () => {
      await go('index.html'); await page.locator('.nav-link').filter({ hasText: 'Calendar' }).click();
      await page.waitForURL('**/chat.html'); await page.getByTestId('chat-input').waitFor();
      assert.equal((await page.locator('.nav-link.is-active').innerText()).trim(), 'Chat');
      await shot('N2'); await page.reload(); await page.getByTestId('chat-input').waitFor();
      assert.ok(page.url().endsWith('/chat.html'));
      await page.goBack(); assert.ok(page.url().endsWith('/index.html'));
      await page.locator('[data-palette-open]').first().click();
      await page.locator('.palette-input').fill('Calendar');
      await page.locator('.palette-results [data-index]').first().click(); await page.waitForURL('**/chat.html'); const destination = new URL(page.url()).pathname.slice(1);
      assert.equal(destination, 'chat.html'); await page.keyboard.press('Escape');
      return { destination, reload: 'chat', back: 'index', directCalendar: 'checked by U3/V1/N3' };
    });
    await test('N4', async () => {
      await go('people.html'); const links = page.locator('[data-directory-list] a'); await links.nth(1).waitFor();
      assert.ok((await links.evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))).every(href => href === 'compose.html'));
      await links.first().click(); await page.getByTestId('compose-to').waitFor();
      assert.equal(await page.getByTestId('compose-to').inputValue(), ''); await shot('N4');
      await page.reload(); await page.getByTestId('compose-to').waitFor(); assert.equal(await page.getByTestId('compose-to').inputValue(), '');
      await go(`compose.html?to=${encodeURIComponent(other.emailAddress)}`); await page.getByTestId('compose-to').waitFor();
      assert.equal(await page.getByTestId('compose-to').inputValue(), other.emailAddress);
    });
    await test('U3', async () => {
      await go('calendar.html'); await page.getByTestId('calendar-add').click();
      const box = await page.getByTestId('event-dialog').boundingBox();
      assert.ok(Math.abs(box.width - 220) < 1);
      assert.ok(Math.abs(box.height - 160) < 1); await shot('U3-create');
      const sizes = await page.getByTestId('event-dialog').evaluate(el => ({ title: parseFloat(getComputedStyle(el.querySelector('h2')).fontSize), label: parseFloat(getComputedStyle(el.querySelector('label')).fontSize), input: el.querySelector('[name="title"]').getBoundingClientRect().height, description: el.querySelector('textarea').getBoundingClientRect().height, scrolls: el.scrollHeight > el.clientHeight }));
      assert.ok(sizes.title <= 12 && sizes.label <= 9 && sizes.input <= 21 && sizes.description <= 33 && sizes.scrolls, JSON.stringify(sizes));
      await page.getByTestId('event-title').fill('한글 일정 ABC 123'); await page.getByTestId('event-save').click();
      await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
      await page.getByTestId('calendar-event').filter({ hasText: '한글 일정 ABC 123' }).first().click();
      assert.equal(await page.getByTestId('event-title').inputValue(), '한글 일정 ABC 123');
      await page.getByTestId('event-description').fill('Edited normally'); await shot('U3-edit');
      await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
      await page.getByTestId('calendar-add').click(); await page.getByTestId('event-cancel').click();
      await page.getByTestId('calendar-add').click(); await page.keyboard.press('Escape');
      await page.getByTestId('event-dialog').waitFor({ state: 'hidden' }); return { ...box, sizes };
    });
    await test('V1', async () => {
      await go('calendar.html'); await page.getByTestId('calendar-add').click();
      await page.getByTestId('event-title').fill('Negative ABC'); await page.getByTestId('event-repeat').selectOption('daily');
      await page.locator('[name="interval"]').fill('-2'); await page.getByTestId('event-repeat-count').fill('3');
      await page.getByTestId('event-save').click(); await page.getByTestId('event-dialog').waitFor({ state: 'hidden' });
      const series = (await api('/api/calendar/events')).events.find(e => e.title === 'Negative ABC');
      assert.equal(series.recurrence.interval, -2);
      const expanded = (await api('/api/calendar/events?expand=true')).events.filter(e => e.id === series.id);
      assert.equal(expanded.length, 3); assert.ok(expanded[0].start > expanded[1].start);
      await page.getByTestId('calendar-event').filter({ hasText: 'Negative ABC' }).first().click();
      assert.equal(await page.locator('[name="interval"]').inputValue(), '-2'); await shot('V1');
      await page.keyboard.press('Escape'); await page.reload(); await page.getByTestId('calendar-event').filter({ hasText: 'Negative ABC' }).first().click();
      assert.equal(await page.locator('[name="interval"]').inputValue(), '-2'); await page.keyboard.press('Escape');
      return { interval: series.recurrence.interval, starts: expanded.map(e => e.start) };
    });
    await test('N3', async () => {
      await go('index.html'); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
      const events = (await api('/api/calendar/events')).events; const first = events[0]; const second = events.find(e => e.id !== first.id && ['First event ABC', 'Second event ABC'].includes(e.title));
      const link = page.locator(`a[href="calendar.html?event=${second.id}"]`); await link.click();
      await page.getByTestId('event-dialog').waitFor(); assert.ok(page.url().includes(second.id));
      assert.equal(await page.getByTestId('event-title').inputValue(), first.title); await shot('N3');
      await page.keyboard.press('Escape'); await page.reload(); await page.getByTestId('event-dialog').waitFor();
      assert.equal(await page.getByTestId('event-title').inputValue(), first.title); await page.keyboard.press('Escape');
      await page.goBack(); assert.ok(page.url().endsWith('/index.html'));
      return { requested: second.title, opened: first.title };
    });
    await test('U2', async () => {
      await go('email.html'); await ready(); await page.locator(`[data-open="${inbox.id}"]`).click(); await ready();
      const work = page.locator('[data-email-label="Work"]'); const team = page.locator('[data-email-label="Team"]');
      await work.check(); await page.getByTestId('apply-labels').click(); await ready();
      assert.ok((await api(`/api/mail/emails/${inbox.id}`)).labels.includes('Work'));
      assert.equal(await work.isChecked(), true); assert.equal(await team.isChecked(), false);
      const style = locator => locator.evaluate(el => { const s = getComputedStyle(el); return [s.appearance, s.backgroundColor, s.border, s.width, s.height, s.backgroundImage]; });
      assert.deepEqual(await style(work), await style(team)); assert.equal((await style(work))[0], 'none'); await shot('U2-checkbox');
      await page.reload(); await ready(); await page.locator(`[data-open="${inbox.id}"]`).click(); await ready(); assert.equal(await work.isChecked(), true);
      await page.getByTestId('label-Work').click(); await ready();
      assert.equal(await page.getByTestId('label-Work').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByTestId('label-Work').evaluate(el => el.classList.contains('is-active')), false); await shot('U2-filter');
      await page.getByTestId('label-Work').click(); await ready();
      await page.locator(`[data-open="${inbox.id}"]`).click(); await ready(); await work.uncheck(); await page.getByTestId('apply-labels').click(); await ready();
      assert.deepEqual((await api(`/api/mail/emails/${inbox.id}`)).labels, []);
      await page.getByTestId('compose').click(); const composeBox = await page.getByTestId('compose-dialog').boundingBox(); assert.ok(composeBox.width <= 721); await page.keyboard.press('Escape');
    });
    await test('N5', async () => {
      await go('search.html?q=searchtarget&kind=mail'); const link = page.locator(`a[href*="mail=${trash.id}"]`); await link.click(); await ready();
      assert.equal(await page.locator('.reader-subject').innerText(), trash.subject);
      assert.equal(await page.getByTestId('folder-inbox').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator(`[data-open="${trash.id}"]`).count(), 0); await shot('N5');
      await page.getByTestId('back-list').click(); await ready(); assert.equal(await page.locator(`[data-open="${trash.id}"]`).count(), 0);
      assert.equal((await api(`/api/mail/emails/${trash.id}`)).folderId, 'trash');
      await page.reload(); await ready(); assert.equal(await page.getByTestId('folder-inbox').getAttribute('aria-pressed'), 'true');
      await page.goBack(); assert.ok(page.url().includes('/search.html'));
    });
    await test('V2', async () => {
      await go('compose.html'); await ready(); await page.getByTestId('compose-to').fill('user@');
      await page.getByTestId('compose-subject').fill('Address draft'); await page.getByTestId('compose-body').fill('Body');
      await page.getByTestId('save-draft').click(); await ready();
      const saved = (await api('/api/mail/emails')).items.find(m => m.subject === 'Address draft'); assert.equal(saved.to[0].address, 'user@');
      await go('email.html'); await ready(); await page.getByTestId('folder-drafts').click(); await ready();
      await page.locator(`[data-open="${saved.id}"]`).click(); await ready(); await page.getByTestId('edit-draft').click(); await ready();
      assert.equal(await page.getByTestId('compose-to').inputValue(), 'user@'); await shot('V2');
      await page.getByTestId('send-email').click(); await ready(); assert.match(await page.getByTestId('compose-error').innerText(), /registered/); await page.keyboard.press('Escape');
    });
    await test('V3', async () => {
      for (const length of [199, 200, 201]) {
        await go('compose.html'); await ready(); await page.getByTestId('compose-to').fill(user.emailAddress);
        await page.getByTestId('compose-subject').fill('S'.repeat(length)); await page.getByTestId('compose-body').fill('Boundary body');
        let sends = 0; const observe = r => { if (r.method() === 'POST' && r.url().endsWith('/api/mail/send')) sends++; }; page.on('request', observe);
        await page.getByTestId('send-email').click(); await ready();
        if (length === 199) { assert.equal(sends, 1); assert.match(await page.getByTestId('email-status').innerText(), /delivered-internal/); }
        else { assert.equal(sends, 0); assert.match(await page.getByTestId('compose-error').innerText(), /at most 200/); }
        if (length === 200) await shot('V3'); page.off('request', observe);
        await page.getByTestId('cancel-compose').click(); await ready();
      }
      const direct = await api('/api/mail/send', 'POST', mail({ subject: 'S'.repeat(200), clientId: '200-direct' })); assert.equal(direct.email.subject.length, 200);
    });
    await test('F2', async () => {
      await go('compose.html'); await ready(); await page.getByTestId('compose-to').fill(other.emailAddress);
      await page.getByTestId('compose-subject').fill('Peer delivery'); await page.getByTestId('compose-body').fill('Should arrive');
      await page.getByTestId('send-email').click(); await ready(); assert.match(await page.getByTestId('email-status').innerText(), /delivered-internal/);
      assert.ok((await api('/api/mail/emails')).items.some(m => m.folderId === 'sent' && m.subject === 'Peer delivery'));
      await otherPage.goto(`${server.base}/email.html`); await otherPage.getByTestId('empty-mailbox').waitFor();
      assert.equal((await api('/api/mail/emails', 'GET', null, peer)).items.length, 0);
      await otherPage.screenshot({ path: `${out}/${viewport.width}-F2-peer.png`, fullPage: true });
    });
    await test('F3', async () => {
      await go(`chat.html?room=${room.id}`); await page.getByTestId('chat-input').waitFor();
      await otherPage.goto(`${server.base}/chat.html?room=${room.id}`); await otherPage.getByTestId('chat-input').waitFor();
      await page.getByTestId('chat-input').fill('한글 채팅 ABC 123'); await page.getByTestId('chat-send').click();
      await page.getByTestId('chat-message').filter({ hasText: '한글 채팅 ABC 123' }).waitFor();
      await otherPage.getByTestId('chat-input').fill('Peer own message'); await otherPage.getByTestId('chat-send').click();
      await otherPage.getByTestId('chat-message').filter({ hasText: 'Peer own message' }).waitFor(); await pause(500);
      assert.equal(await page.getByTestId('chat-message').count(), 1); assert.equal(await otherPage.getByTestId('chat-message').count(), 1);
      await shot('F3'); await page.reload(); await page.getByTestId('chat-message').waitFor(); assert.equal(await page.getByTestId('chat-message').count(), 1);
      const a = await api(`/api/chat/rooms/${room.id}/messages`); const b = await api(`/api/chat/rooms/${room.id}/messages`, 'GET', null, peer);
      assert.equal(a.messages[0].senderId, user.id); assert.equal(b.messages[0].senderId, other.id);
    });
    await test('F4', async () => {
      // A wall-clock independent fixture: UTC noon today always splits the KST dawn pair.
      // At runtime choose the KST date corresponding to the current UTC day's noon.
      const utcDay = new Date().toISOString().slice(0, 10);
      const dawnDay = new Date(`${utcDay}T12:00:00Z`); dawnDay.setUTCDate(dawnDay.getUTCDate() + 1);
      const next = dawnDay.toISOString().slice(0, 10);
      const outsideLocalDay = utcDay !== day ? utcDay : next;
      const hour = utcDay !== day ? '12' : '01';
      const e = await api('/api/calendar/events', 'POST', { title: 'UTC boundary dawn', start: `${outsideLocalDay}T${hour}:00`, end: `${outsideLocalDay}T${hour}:30`, timezone: 'Asia/Seoul' });
      const snapshot = await api('/api/dashboard?timezoneName=Asia/Seoul'); assert.ok(snapshot.todayEvents.some(v => v.id === e.id));
      const currentLocalDay = day; const eventLocalDay = outsideLocalDay;
      assert.notEqual(currentLocalDay, eventLocalDay);
      const utcWindowStart = `${utcDay}T00:00:00.000Z`;
      assert.ok(new Date(e.start) >= new Date(utcWindowStart));
      await go('index.html'); await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor(); await shot('F4');
      return { currentLocalDay, eventLocalDay, requestedTimezone: snapshot.timezone, includedByUtcDay: true, tomorrowFixture: tomorrow };
    });
    await test('F5', async () => {
      await go('search.html?q=bodyneedle&kind=mail'); await page.locator('[data-results]').getByText('No results in accessible resources.').waitFor();
      await shot('F5-body'); await page.locator('[name="q"]').fill('searchtarget'); await page.locator('[name="kind"]').selectOption('mail');
      await page.locator('[data-hub-body] form button').click(); await page.locator(`a[href*="mail=${trash.id}"]`).waitFor();
      assert.match(await page.locator('[data-results]').innerText(), /bodyneedle/); await shot('F5-title');
      assert.equal((await api('/api/mail/emails?summary=true&limit=25&query=bodyneedle')).total, 2);
    });
    await test('U1', async () => {
      const details = [];
      for (const path of ['index.html', 'settings.html', `email.html?mail=${inbox.id}`, 'calendar.html', `chat.html?room=${room.id}`]) {
        await go(path);
        if (path.startsWith('email')) { await ready(); await page.locator('.reader-subject').waitFor(); }
        else if (path.startsWith('calendar')) await page.getByTestId('calendar-add').waitFor();
        else if (path.startsWith('chat')) await page.getByTestId('chat-message').waitFor();
        else if (path === 'settings.html') await page.locator('[data-profile-form]').waitFor();
        else await page.getByTestId('dashboard-status').filter({ hasText: 'Updated' }).waitFor();
        const glyphs = await page.evaluate(async () => {
          const same = [];
          for (const family of ['Inter', 'Inter Tight', 'JetBrains Mono']) {
            await document.fonts.load(`400 32px "${family}"`, '한글');
            const render = value => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50; const ctx = canvas.getContext('2d'); ctx.font = `400 32px "${family}"`; ctx.fillText(value, 2, 35); return canvas.toDataURL(); };
            same.push({ family, hangulSame: render('한') === render('글'), asciiDifferent: render('A') !== render('B'), nonempty: render('한') !== render(' ') });
          }
          return same;
        });
        assert.ok(glyphs.every(g => g.hangulSame && g.asciiDifferent && g.nonempty), JSON.stringify(glyphs));
        assert.match(await page.locator('body').textContent(), /검증 사용자/); await shot(`U1-${path.split('.')[0]}`); details.push({ path, glyphs });
      }
      await go('compose.html'); await ready(); await page.getByTestId('compose-body').fill('한글 직접 입력 ABC 123');
      assert.equal(await page.getByTestId('compose-body').inputValue(), '한글 직접 입력 ABC 123'); await shot('U1-input');
      await page.getByTestId('cancel-compose').click(); await ready(); await page.reload(); await ready();
      assert.equal((await api(`/api/mail/emails/${inbox.id}`)).bodyText, '동적 본문 ABC 123');
      const css = await page.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(n => n.href).find(href => href.startsWith(location.origin)));
      await page.setContent(`<link rel="stylesheet" href="${css}"><main><h1>정적 한국어 ABC 123</h1><input value="직접 입력 ABC 123"></main>`);
      assert.equal(await page.locator('input').inputValue(), '직접 입력 ABC 123');
      const staticGlyph = await page.evaluate(async () => {
        await document.fonts.load('400 32px Inter', '한글');
        const render = value => { const c = document.createElement('canvas'); c.width = 80; c.height = 50; const ctx = c.getContext('2d'); ctx.font = '400 32px Inter'; ctx.fillText(value, 2, 35); return c.toDataURL(); };
        return render('한') === render('글') && render('A') !== render('B') && render('한') !== render(' ');
      });
      assert.ok(staticGlyph); await shot('U1-static');
      return details;
    });
    await test('controls', async () => {
      for (const path of ['/api/bugs', '/gt.json', '/docs/bugs/ui.md']) assert.equal((await context.request.get(`${server.base}${path}`)).status(), 404);
      await go('calendar.html'); await page.getByTestId('calendar-add').waitFor();
      await page.setViewportSize({ width: 800, height: 900 }); await page.getByTestId('calendar-add').click();
      assert.ok((await page.getByTestId('event-dialog').boundingBox()).width <= 561); await page.keyboard.press('Escape');
      await page.setViewportSize(viewport); return { privateDocs: '404', calendarBelowDesktop: '560px' };
    });
    for (const e of (await api('/api/calendar/events')).events.filter(e => e.ownerId === user.id)) await api(`/api/calendar/events/${e.id}?revision=${e.revision}`, 'DELETE');
    await context.close(); await peer.close();
  }
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), browser: browser?.version(), results, errors }, null, 2));
  await browser?.close(); await server.stop();
}
assert.equal(results.filter(r => !r.passed).length, 0, 'See browser/results.json for failed scenarios');
assert.deepEqual(errors, []);
console.log(`${results.length} browser scenarios passed`);
