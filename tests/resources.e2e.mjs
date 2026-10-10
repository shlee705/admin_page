import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuthServer, createTestAccount } from './auth-server.mjs';
const server = process.env.ADMINATOR_EXPLORE_BASE ? { base: process.env.ADMINATOR_EXPLORE_BASE, stop: async () => {} } : await startAuthServer(); let browser;
const report = { base: server.base, checkedAt: new Date().toISOString(), pages: {}, scenarios: [], errors: [] };
const waitText = async (locator, text) => locator.filter({ hasText: text }).waitFor();
try {
  browser = await chromium.launch({ headless:true, channel:'chrome' });
  await mkdir('screenshots', { recursive:true });
  const alice = await browser.newContext({viewport:{width:1600,height:1000}});
  const bob = await browser.newContext({viewport:{width:390,height:844}});
  const eve = await browser.newContext();
  const suffix = String(Date.now()); const bobUsername = `real_bob_${suffix}`;
  await createTestAccount(alice,server.base,`real_alice_${suffix}`,'Alice');
  const bu = await createTestAccount(bob,server.base,bobUsername,'Bob');
  await createTestAccount(eve,server.base,`real_eve_${suffix}`,'Eve');
  const a = await alice.newPage(), b = await bob.newPage();
  for (const page of [a,b]) page.on('pageerror', e => report.errors.push(e.message));
  for (const page of [a,b]) {
    await page.goto(`${server.base}/chat.html?chatMode=mock`); await waitText(page.getByTestId('chat-status'),'ready'); await page.getByTestId('chat-mode').click(); await page.getByTestId('chat-user-search').waitFor();
  }
  await a.getByTestId('chat-user-search').fill(bobUsername); await a.getByTestId('chat-user-results').getByRole('button').click();
  await waitText(a.getByTestId('chat-status'),'opened');
  await b.getByTestId('chat-room').first().waitFor(); await b.getByTestId('chat-room').first().click(); await waitText(b.getByTestId('chat-status'),'opened');
  await a.getByTestId('chat-input').fill('Alice to Bob live'); await a.getByTestId('chat-send').click();
  await b.getByTestId('chat-message').filter({hasText:'Alice to Bob live'}).waitFor();
  await b.getByTestId('chat-input').fill('Bob replies live'); await b.getByTestId('chat-input').press('Enter');
  await a.getByTestId('chat-message').filter({hasText:'Bob replies live'}).waitFor();
  await a.getByTestId('chat-message').filter({hasText:'Read by recipient'}).waitFor();
  const rooms = (await (await alice.request.get(`${server.base}/api/chat/rooms`)).json()).rooms;
  assert.equal((await eve.request.get(`${server.base}/api/chat/rooms/${rooms[0].id}/messages`)).status(),404);
  await a.reload(); await waitText(a.getByTestId('chat-status'),'ready'); await a.getByTestId('chat-mode').click(); await a.getByTestId('chat-room').first().click(); await a.getByTestId('chat-message').filter({hasText:'Bob replies live'}).waitFor();
  // Drop the socket by offline/online, then recover persisted history and unread counts.
  await bob.setOffline(true); await bob.setOffline(false); await b.reload(); await waitText(b.getByTestId('chat-status'),'ready'); await b.getByTestId('chat-mode').click(); await b.getByTestId('chat-room').first().click(); await b.getByTestId('chat-message').filter({hasText:'Alice to Bob live'}).waitFor();
  await a.screenshot({path:'screenshots/resource-chat-desktop.png',fullPage:true}); await b.screenshot({path:'screenshots/resource-chat-mobile.png',fullPage:true});
  report.scenarios.push('Alice/Bob live send + reply + read receipts + reload + socket recovery + Eve denied');
  await a.goto(`${server.base}/calendar.html`); await a.getByTestId('calendar-add').waitFor(); await a.getByTestId('calendar-add').click();
  await a.getByTestId('event-title').fill('Shared recurring planning'); await a.getByTestId('event-repeat').selectOption('weekly'); await a.getByTestId('event-repeat-count').fill('3');
  await a.getByTestId('event-attendee-search').fill(bobUsername); await a.getByRole('button',{name:`Bob (${bobUsername})`,exact:true}).click();
  await a.getByTestId('event-location').fill('Seoul'); await a.getByTestId('event-save').click(); await a.getByTestId('event-dialog').waitFor({state:'hidden'});
  await b.goto(`${server.base}/calendar.html`); await b.getByTestId('calendar-add').waitFor(); await b.getByTestId('calendar-event').filter({hasText:'Shared recurring planning'}).first().click();
  assert.equal(await b.getByTestId('event-save').isVisible(),true); await b.getByTestId('event-cancel').click(); await b.getByTestId('event-dialog').waitFor({state:'hidden'});
  const events = (await (await alice.request.get(`${server.base}/api/calendar/events`)).json()).events;
  const shared = events.find(e=>e.title==='Shared recurring planning'); assert.equal(shared.attendees[0].status,'pending');
  assert.equal((await eve.request.get(`${server.base}/api/calendar/events/${shared.id}`)).status(),200);
  await a.getByTestId('calendar-search').fill('Shared recurring'); assert.ok(await a.getByTestId('calendar-event').count() >= 1);
  await a.screenshot({path:'screenshots/resource-calendar-desktop.png',fullPage:true}); await b.screenshot({path:'screenshots/resource-calendar-mobile.png',fullPage:true});
  report.scenarios.push('Calendar recurring shared event + attendee search + global access + search');
  // Exercise the internal mailbox through the existing composition and reader UI.
  await a.goto(`${server.base}/email.html?mailMode=internal`); await a.getByTestId('email-mode').waitFor();
  const hooks = await a.locator('[data-testid]').evaluateAll(nodes=>nodes.map(n=>n.dataset.testid));
  report.mailHooks = hooks;
  await a.getByTestId('compose').click(); await a.getByTestId('compose-to').fill(bu.emailAddress); await a.getByTestId('compose-subject').fill('Browser internal mail'); await a.getByTestId('compose-body').fill('Delivered from Alice'); await a.getByTestId('send-email').click(); await a.getByTestId('compose-dialog').waitFor({state:'hidden'}); await waitText(a.getByTestId('email-status'),'delivered-internal');
  await b.goto(`${server.base}/email.html?mailMode=internal`); await b.getByText('Browser internal mail',{exact:true}).first().waitFor(); await b.getByText('Browser internal mail',{exact:true}).first().click(); await b.getByText('Delivered from Alice',{exact:true}).first().waitFor();
  report.scenarios.push('Internal email browser composition + real delivery + Bob inbox and reader');
  await a.goto(`${server.base}/index.html`); await waitText(a.getByTestId('dashboard-status'),'loaded'); await a.getByTestId('dashboard-account-summary').waitFor();
  await a.screenshot({path:'screenshots/resource-dashboard.png',fullPage:true});
  for (const name of ['index','email','compose','calendar','chat','charts','forms','buttons','ui','basic-table','datatable','google-maps','vector-maps','blank','404','500','signin','signup']) {
    await a.goto(`${server.base}/${name}.html`); await a.waitForTimeout(400);
    report.pages[name] = {title:await a.title(), text:(await a.locator('body').innerText()).slice(0,18000), buttons:await a.locator('main button').allTextContents(), placeholderLinks:await a.locator('main a[href="#"]').allTextContents()};
    if (name==='datatable') { const before = await a.locator('tbody tr').count(); const search = a.locator('main input[type="search"]'); if (await search.count()) { await search.first().fill('no-matching-row-2026'); report.pages[name].searchEvidence = {before,after:await a.locator('tbody tr:visible').count()}; } }
    const inactiveAction = {charts:'New chart',datatable:'Invite user','google-maps':'Add location','vector-maps':'Add region',blank:'Add section'}[name];
    if (inactiveAction) { const before = await a.locator('main').innerText(); await a.getByRole('button',{name:inactiveAction,exact:true}).click(); report.pages[name].actionEvidence = { action:inactiveAction, textChanged:before !== await a.locator('main').innerText(), openDialogs:await a.locator('dialog[open]').count() }; }
    if (name==='ui') { const accordion = a.getByRole('button',{name:'How does the dark mode work?',exact:true}); await accordion.click(); report.pages[name].accordionOpened = await accordion.evaluate(el=>el.closest('[data-accordion]').classList.contains('is-open')); }
    if (['basic-table','datatable','charts','vector-maps'].includes(name)) { if(name==='charts') await a.locator('canvas').first().waitFor(); if(name==='vector-maps') await a.locator('[data-vmap] svg').waitFor(); const download = a.waitForEvent('download'); await a.locator('.hero-actions button').first().click(); report.pages[name].download = (await download).suggestedFilename(); }
    if (name==='forms') { const first = a.locator('main form'); if(await first.count()) report.pages[name].formCount = await first.count(); }
  }
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify({scenarios:report.scenarios,pages:Object.keys(report.pages),errors:report.errors},null,2));
} finally { await writeFile(process.env.ADMINATOR_EXPLORE_BASE ? 'screenshots/resources-current-site.json' : 'screenshots/resources-e2e.json',JSON.stringify(report,null,2)); await browser?.close(); await server.stop(); }
