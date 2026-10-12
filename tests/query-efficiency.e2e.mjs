/** Bounded reads preserve older messages, deep links, preference recovery and failed mail filters. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const server = await startAuthServer(); let browser;
const results = []; const errors = [];
try {
  browser = await chromium.launch({channel:'chrome',headless:true});
  for (const width of [1600,390]) {
    const context = await browser.newContext({viewport:{width,height:1000}});
    const owner = await createTestAccount(context,server.base,`query_${width}`,'Query Owner');
    const me = await (await context.request.get(`${server.base}/api/auth/me`)).json();
    const headers = {Origin:server.base,'X-CSRF-Token':me.csrfToken};
    const post = async (path, data) => {const response=await context.request.post(`${server.base}${path}`,{headers,data});assert.ok(response.ok(),await response.text());return response.json();};
    const room = await post('/api/chat/rooms',{name:'Bounded history'});
    const messages = [];
    for (let n=0;n<120;n++) messages.push(await post(`/api/chat/rooms/${room.id}/messages`,{body:`History ${n}`,clientId:`history-${n}`}));
    assert.equal((await context.request.put(`${server.base}/api/preferences`,{headers,data:{expectedRevision:0,preferences:{timezone:'UTC',theme:'light',calendarScope:'all',mailAutoRefresh:false,homeCards:['mail'],favoriteRooms:[room.id]}}})).status(),200);
    await context.route('https://fonts.googleapis.com/**',route=>route.abort());
    await context.route('https://fonts.gstatic.com/**',route=>route.abort());
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/preferences',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Preferences unavailable'}})}):route.continue());
    const historyRequests=[]; page.on('request',request=>{if(request.url().includes('/messages?')) historyRequests.push(request.url());});
    await page.goto(`${server.base}/chat.html?room=${room.id}`);
    await page.getByTestId('chat-message').nth(99).waitFor();
    assert.equal(await page.getByTestId('chat-message').count(),100);
    assert.equal(await page.getByTestId('chat-message').first().locator('.chat-bub').innerText(),'History 20');
    await page.getByTestId('chat-input').fill('Unsaved chat input');
    await page.unroute('**/api/preferences'); await page.getByTestId('preferences-retry').click();
    await page.locator('.chat-conv-name').filter({hasText:'★ Bounded history'}).waitFor();
    assert.equal(await page.getByTestId('chat-input').inputValue(),'Unsaved chat input');
    await page.getByTestId('chat-load-older').click(); await page.getByTestId('chat-message').nth(119).waitFor();
    assert.equal(await page.getByTestId('chat-message').first().locator('.chat-bub').innerText(),'History 0');
    assert.equal(await page.getByTestId('chat-load-older').count(),0);
    await page.getByTestId('chat-send').click(); await page.getByTestId('chat-message').filter({hasText:'Unsaved chat input'}).waitFor();
    assert.equal(await page.getByTestId('chat-message').count(),121);
    assert.equal(historyRequests.filter(url=>url.includes('latest=true')).length,1);
    assert.ok(historyRequests.some(url=>url.includes('before=')));
    await page.goto(`${server.base}/chat.html?room=${room.id}&message=${messages[0].id}`);
    await page.locator(`[data-message-id="${messages[0].id}"].hub-highlight`).waitFor();
    assert.equal(await page.getByTestId('chat-message').count(),121);
    const sent = await post('/api/mail/send',{clientId:`mail-${width}`,to:[{address:owner.emailAddress}],subject:'Bounded mail',bodyText:'Preserve filter'});
    await post(`/api/mail/emails/${sent.email.id}/star`,{});
    await page.goto(`${server.base}/email.html`);
    const ready=()=>page.waitForFunction(()=>document.querySelector('[data-email-app]')?.getAttribute('aria-busy')==='false'); await ready();
    const rows=await page.getByTestId('email-list').locator('[data-email-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.emailId));
    await page.route('**/api/mail/emails?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Snapshot unavailable'}})}));
    await page.getByTestId('label-Work').click(); await ready();
    assert.equal(await page.getByTestId('label-filter').inputValue(),'');
    assert.equal(await page.getByTestId('label-Work').getAttribute('aria-pressed'),'false');
    assert.deepEqual(await page.getByTestId('email-list').locator('[data-email-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.emailId)),rows);
    await page.unroute('**/api/mail/emails?**');
    results.push({width,status:'PASS',recent:100,allHistory:121,deepLink:true,preferencesRecovery:true,failedSnapshotRollback:true});
    await context.close();
  }
  assert.deepEqual(errors,[]); console.log(JSON.stringify({results,errors},null,2));
} finally {
  await mkdir('screenshots/query-efficiency',{recursive:true});
  await writeFile('screenshots/query-efficiency/results.json',JSON.stringify({results,errors},null,2));
  await browser?.close(); await server.stop();
}
