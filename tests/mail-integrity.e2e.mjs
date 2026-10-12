/** Real browser + isolated backend: two editors, conflict recovery, lost send response. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createTestAccount, startAuthServer } from './auth-server.mjs';

const server = await startAuthServer();
const evidence = resolve(process.env.QA_EVIDENCE_DIR || 'screenshots/mail-integrity');
const results = []; const errors = []; let browser;
try {
  await mkdir(evidence, {recursive:true});
  const channel=process.env.EMAIL_BROWSER_CHANNEL || (process.platform==='win32' && existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'chrome' : undefined);
  browser=await chromium.launch({headless:true,channel});
  for (const [name,viewport] of [['desktop',{width:1600,height:1000}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport});
    const user=await createTestAccount(context,server.base,`mailcas_${name}`);
    const token=(await (await context.request.get(`${server.base}/api/auth/csrf`)).json()).csrfToken;
    const headers={Origin:server.base,'X-CSRF-Token':token};
    const input={to:[{address:user.emailAddress}],subject:'Concurrent draft',bodyText:'Original body',labels:['Work'],category:'promotions'};
    const first=await context.request.post(`${server.base}/api/mail/drafts`,{headers,data:input});
    assert.equal(first.status(),201); const draft=await first.json(); assert.equal(draft.revision,1);
    const a=await context.newPage(); const b=await context.newPage();
    for (const page of [a,b]) {
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**',route=>route.abort());
      await page.route('https://fonts.gstatic.com/**',route=>route.abort());
    }
    const ready=page=>page.waitForFunction(()=>document.querySelector('[data-email-app]')?.getAttribute('aria-busy')==='false');
    const open=async page=>{await page.goto(`${server.base}/email.html?mail=${draft.id}`);await ready(page);await page.getByTestId('edit-draft').click();await ready(page);};
    await open(a);await open(b);
    await a.getByTestId('compose-body').fill('Latest from editor A');
    await a.getByTestId('save-draft').click();await ready(a);
    assert.match(await a.getByTestId('email-status').textContent(),/Draft saved/);
    await b.getByTestId('compose-body').fill('Input from editor B must survive');
    await b.getByTestId('save-draft').click();await ready(b);
    assert.match(await b.getByTestId('compose-error').textContent(),/changed in another editor/);
    assert.equal(await b.getByTestId('compose-body').inputValue(),'Input from editor B must survive');
    assert.equal(await b.getByTestId('reload-draft').isVisible(),true);
    await b.screenshot({path:resolve(evidence,`draft-conflict-${name}.png`),fullPage:true});
    await b.getByTestId('keep-draft-input').click();await b.getByTestId('save-draft').click();await ready(b);
    let mails=(await (await context.request.get(`${server.base}/api/mail/emails`)).json()).items;
    assert.equal(mails.filter(m=>m.folderId==='drafts').length,2);
    assert.equal(mails.find(m=>m.id===draft.id).bodyText,'Latest from editor A');
    assert.equal(mails.filter(m=>m.bodyText==='Input from editor B must survive').length,1);
    await a.getByTestId('compose-body').fill('Unsaved input before reload');
    const external=await context.request.post(`${server.base}/api/mail/drafts`,{headers,data:{...input,id:draft.id,expectedRevision:2,bodyText:'Server revision 3'}});
    assert.equal(external.status(),201);
    await a.getByTestId('save-draft').click();await ready(a);
    assert.equal(await a.getByTestId('compose-body').inputValue(),'Unsaved input before reload');
    await a.getByTestId('reload-draft').click();await ready(a);
    assert.equal(await a.getByTestId('compose-body').inputValue(),'Server revision 3');
    let lostResult;
    await a.route('**/api/mail/send',async route=>{
      if (!lostResult) {const response=await route.fetch();assert.equal(response.status(),201);lostResult=await response.json();await route.abort('failed');}
      else await route.continue();
    });
    await a.getByTestId('send-email').click();await ready(a);
    assert.equal(await a.getByTestId('compose-body').inputValue(),'Server revision 3');
    assert.ok((await a.getByTestId('compose-error').textContent()).length>0);
    await a.getByTestId('send-email').click();await ready(a);
    assert.equal(await a.getByTestId('compose-dialog').evaluate(el=>el.open),false);
    mails=(await (await context.request.get(`${server.base}/api/mail/emails`)).json()).items;
    assert.equal(mails.filter(m=>m.folderId==='sent').length,1);
    const receipt=mails.filter(m=>m.folderId==='inbox');assert.equal(receipt.length,1);
    assert.deepEqual(receipt[0].labels,[]);assert.equal(receipt[0].category,'primary');assert.deepEqual(receipt[0].bcc,[]);
    assert.equal(mails.find(m=>m.folderId==='sent').id,lostResult.email.id);
    results.push({viewport:name,conflict:'PASS',inputRetention:'PASS',keepAsNew:'PASS',reloadLatest:'PASS',draftSendRetry:'PASS',selfReceiptClassification:'PASS'});
    await context.close();
  }
  assert.deepEqual(errors,[]); await writeFile(resolve(evidence,'mail-integrity.json'),JSON.stringify({results,pageErrors:errors},null,2));
  console.log(JSON.stringify({results,pageErrors:errors}));
} finally {await browser?.close();await server.stop();}
