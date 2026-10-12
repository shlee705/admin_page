import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { startAuthServer, createTestAccount } from './auth-server.mjs';
const server = await startAuthServer(); let browser;
try {
  browser = await chromium.launch({headless:true,channel:process.platform === 'win32' ? 'chrome' : undefined});
  for (const viewport of [{width:1600,height:1000},{width:390,height:844}]) {
    const context = await browser.newContext({viewport});
    const username = `labels_${viewport.width}`;
    const owner = await createTestAccount(context,server.base,username);
    const csrf = async () => (await (await context.request.get(`${server.base}/api/auth/csrf`)).json()).csrfToken;
    const request = async (path, method, data) => {
      const response = await context.request.fetch(`${server.base}/api/mail${path}`,{method,data,headers:{Origin:server.base,'X-CSRF-Token':await csrf()}});
      assert.ok(response.ok(),await response.text()); return response.json();
    };
    const make = async (subject,folderId,labels) => {
      await request('/send','POST',{subject,bodyText:'Label test',to:[{name:'',address:owner.emailAddress}],cc:[],bcc:[],clientId:subject});
      const mails = (await request('/emails','GET')).items.filter(m=>m.subject === subject);
      const mail = mails.find(m=>m.folderId === folderId);
      for (const extra of mails.filter(m=>m.id !== mail.id)) await request(`/emails/${extra.id}`,'PATCH',{folderId:'trash'});
      await request(`/emails/${mail.id}`,'PATCH',{labels}); return mail.id;
    };
    const work = await make('Work message','inbox',['Work']);
    const plain = await make('Plain message','inbox',[]);
    const finance = await make('Finance message','sent',['Finance']);
    const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.abort()); await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    const ready = () => page.waitForFunction(()=>document.querySelector('[data-email-app]')?.getAttribute('aria-busy') === 'false');
    const click = async id => {
      if (viewport.width === 390 && !await page.getByTestId(id).isVisible() && await page.getByTestId('back-list').isVisible()) {await page.getByTestId('back-list').click();await ready();}
      await page.getByTestId(id).click();await ready();
    };
    const ids = async () => (await page.getByTestId('email-list').locator('[data-email-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.emailId))).sort();
    const count = id => page.getByTestId(`label-${id}`).locator('.mail-folder-count').textContent();
    await page.goto(`${server.base}/email.html`); await ready();
    assert.deepEqual(await ids(),[work,plain].sort()); assert.equal(await count('Work'),'1'); assert.equal(await count('Travel'),'0');
    await click('label-Work'); assert.deepEqual(await ids(),[work]);
    await click('label-Work'); assert.deepEqual(await ids(),[work,plain].sort());
    await click('label-Work'); await click('label-Team'); assert.deepEqual(await ids(),[]);
    assert.equal(await page.getByTestId('empty-mailbox').count(),1);
    await click('clear-label'); await click('label-Work'); await click('folder-sent'); assert.deepEqual(await ids(),[finance]);
    assert.equal(await page.getByTestId('label-filter').inputValue(),'');
    await click('label-Finance'); assert.deepEqual(await ids(),[finance]); await click('folder-inbox'); assert.deepEqual(await ids(),[work,plain].sort());
    await page.locator(`[data-open="${plain}"]`).click(); await ready();
    await page.locator('[data-email-label="Work"]').check(); await click('apply-labels');
    if (viewport.width === 390) await click('back-list');
    assert.equal(await count('Work'),'2');
    await page.locator(`[data-open="${work}"]`).click(); await ready();
    await page.locator('[data-email-label="Work"]').uncheck(); await click('apply-labels');
    if (viewport.width === 390) await click('back-list');
    assert.equal(await count('Work'),'1');
    await request(`/emails/${plain}`,'PATCH',{folderId:'trash'}); await click('refresh'); assert.equal(await count('Work'),'1'); assert.deepEqual(await ids(),[work]);
    await request(`/emails/${plain}`,'PATCH',{folderId:'inbox'}); await click('refresh'); assert.deepEqual(await ids(),[work,plain].sort());
    await request('/send','POST',{to:[{name:'',address:owner.emailAddress}],cc:[],bcc:[],subject:'Self receive',bodyText:'Receive and send',clientId:`label-${viewport.width}`});
    await click('refresh'); assert.equal((await ids()).length,3); assert.equal(await count('Work'),'1');
    await click('label-Work');
    await createTestAccount(context,server.base,`${username}_other`); await page.reload(); await ready();
    assert.deepEqual(await ids(),[]); assert.equal(await count('Work'),'0'); assert.equal(await page.getByTestId('label-filter').inputValue(),'');
    assert.deepEqual(errors,[]); await context.close();
    console.log(`Internal labels ${viewport.width}: real owner data, filter rows, counts, edits, trash/restore, send/receive and account change passed`);
  }
} finally {await browser?.close();await server.stop();}
