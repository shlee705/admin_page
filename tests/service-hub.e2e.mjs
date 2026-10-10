import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const server = await startAuthServer();
let browser;
const errors = [];
const checks = [];
try {
  browser = await chromium.launch({ headless:true, channel:'chrome' });
  await mkdir('screenshots/service-hub', {recursive:true});
  for (const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
    const context = await browser.newContext({viewport});
    const other = await browser.newContext();
    await createTestAccount(context,server.base,`hub_${name}`,'Hub User');
    const colleague = await createTestAccount(other,server.base,`member_${name}`,'Colleague');
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    let dismissNext = false; page.on('dialog',dialog=> { if(dismissNext) {dismissNext=false; return dialog.dismiss();} return dialog.accept(); });
    await page.goto(`${server.base}/index.html`);
    await page.getByTestId('dashboard-status').filter({hasText:'Updated'}).waitFor();
    assert.equal(await page.locator('[data-home-card]').count(),4);
    assert.equal(await page.getByText('Sales report',{exact:true}).count(),0);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`screenshots/service-hub/home-${name}.png`,fullPage:true});

    await page.goto(`${server.base}/tasks.html`);
    await page.locator('[data-task-editor]').waitFor();
    await page.locator('[data-task-editor] [name="title"]').fill(`Follow up ${name}`);
    dismissNext=true; await page.locator('main').getByRole('link',{name:'Back to Home',exact:true}).click();
    assert.ok(page.url().includes('tasks.html'));
    assert.equal(await page.locator('[name="title"]').inputValue(),`Follow up ${name}`);
    await page.locator('[data-task-editor] [name="dueDate"]').fill('2026-10-10');
    await page.locator('[data-task-editor] [name="priority"]').selectOption('high');
    await page.getByRole('button',{name:'Save task',exact:true}).click();
    await page.locator('[data-hub-status]').filter({hasText:'Saved'}).waitFor();
    await page.reload();
    await page.locator('[data-edit-task]').filter({hasText:`Follow up ${name}`}).click();
    assert.equal(await page.locator('[name="dueDate"]').inputValue(),'2026-10-10');
    await page.locator('[name="done"]').check();
    await page.getByRole('button',{name:'Save task',exact:true}).click();
    await page.locator('[data-hub-status]').filter({hasText:'Saved'}).waitFor();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`screenshots/service-hub/tasks-${name}.png`,fullPage:true});

    await page.goto(`${server.base}/settings.html`);
    await page.locator('[data-profile-form]').waitFor();
    await page.locator('[name="displayName"]').fill(`Updated ${name}`);
    await page.getByRole('button',{name:'Save profile',exact:true}).click();
    await page.locator('[data-hub-status]').filter({hasText:'Saved'}).waitFor();
    await page.locator('[name="timezone"]').fill('UTC');
    await page.locator('[name="homeCard"][value="chat"]').uncheck();
    await page.getByRole('button',{name:'Save preferences',exact:true}).click();
    await page.locator('[data-hub-status]').filter({hasText:'Saved'}).waitFor();
    await page.goto(`${server.base}/index.html`);
    await page.getByTestId('dashboard-status').filter({hasText:'Updated'}).waitFor();
    assert.equal(await page.locator('[data-home-card]').count(),3);
    assert.match(await page.locator('.hero-title').innerText(),new RegExp(`Updated ${name}`));

    await page.goto(`${server.base}/people.html`);
    await page.locator('[data-hub-status]').filter({hasText:'Active members'}).waitFor();
    await page.locator('[data-directory-query]').fill(`member_${name}`);
    await page.locator('[data-directory-list]').getByText(colleague.emailAddress,{exact:false}).waitFor();
    await page.locator('[data-directory-list] article').filter({hasText:colleague.emailAddress}).getByRole('link',{name:'Email',exact:true}).click();
    await page.getByTestId('compose-to').waitFor();
    assert.equal(await page.getByTestId('compose-to').inputValue(),colleague.emailAddress);
    await page.locator('[data-recipient-search]').fill(`member_${name}`);
    await page.locator('[data-recipient-address]').first().click();
    assert.equal(await page.getByTestId('compose-to').inputValue(),colleague.emailAddress);
    await page.getByTestId('compose-subject').fill(`Linked mail ${name}`);
    await page.getByTestId('compose-body').fill('A real internal delivery.');
    await page.getByTestId('send-email').click();
    await page.getByTestId('email-status').filter({hasText:'delivered-internal'}).waitFor();
    const mails = (await (await context.request.get(`${server.base}/api/mail/emails`)).json()).items;
    const mail = mails.find(m=>m.subject===`Linked mail ${name}`);
    assert.ok(mail);
    await page.goto(`${server.base}/email.html?mailMode=internal&mail=${mail.id}`);
    await page.getByTestId('email-status').filter({hasText:'Message opened'}).waitFor();
    await page.getByTestId('followup-task').click();
    const follow = page.locator('dialog.workspace-dialog:not(.account-dialog):not([data-testid="event-dialog"])');
    await follow.getByRole('button',{name:'Create task',exact:true}).click();
    await follow.waitFor({state:'hidden'});
    const tasks = (await (await context.request.get(`${server.base}/api/workspace/tasks`)).json()).state.tasks;
    assert.ok(tasks.some(t=>t.source?.id===mail.id));
    assert.equal((await (await other.request.get(`${server.base}/api/workspace/tasks`)).json()).state,null);

    await page.goto(`${server.base}/calendar.html?new=1`);
    await page.getByTestId('event-dialog').waitFor();
    await page.getByTestId('event-title').fill(`Linked event ${name}`);
    await page.getByTestId('event-save').click();
    await page.getByTestId('event-dialog').waitFor({state:'hidden'});
    const events = (await (await context.request.get(`${server.base}/api/calendar/events`)).json()).events;
    const event = events.find(e=>e.title===`Linked event ${name}`);
    await page.goto(`${server.base}/calendar.html?event=${event.id}`);
    await page.getByTestId('event-dialog').waitFor();
    assert.equal(await page.getByTestId('event-title').inputValue(),event.title);
    await page.locator('[data-event-task]').click();
    await page.locator('dialog.workspace-dialog:not(.account-dialog):not([data-testid="event-dialog"])').filter({hasText:'Create follow-up task'}).getByRole('button',{name:'Create task',exact:true}).click();
    await page.locator('dialog.workspace-dialog:not(.account-dialog):not([data-testid="event-dialog"])').filter({hasText:'Create follow-up task'}).waitFor({state:'hidden'});
    await page.getByTestId('event-cancel').click();

    await page.goto(`${server.base}/people.html`);
    await page.locator('[data-directory-query]').waitFor();
    await page.locator('[data-directory-query]').fill(`member_${name}`);
    await page.locator('[data-directory-list] article').filter({hasText:colleague.emailAddress}).getByRole('button',{name:'Chat',exact:true}).click();
    await page.getByTestId('chat-status').filter({hasText:'ready'}).waitFor();
    await page.getByTestId('chat-input').fill(`Linked message ${name}`);
    await page.getByTestId('chat-send').click();
    await page.getByTestId('chat-message').filter({hasText:`Linked message ${name}`}).waitFor();
    await page.locator('[data-room-favorite]').click();
    await page.getByTestId('chat-status').filter({hasText:'Favorites saved'}).waitFor();
    await page.locator('[data-followup]').first().click();
    await page.locator('dialog.workspace-dialog:not(.account-dialog):not([data-testid="event-dialog"])').getByRole('button',{name:'Create task',exact:true}).click();
    await page.locator('dialog.workspace-dialog:not(.account-dialog):not([data-testid="event-dialog"])').waitFor({state:'hidden'});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`screenshots/service-hub/chat-${name}.png`,fullPage:true});

    await page.goto(`${server.base}/search.html?q=Linked&kind=all`);
    await page.locator('[data-hub-status]').filter({hasText:'Search complete'}).waitFor();
    assert.ok(await page.locator('[data-results] a').count()>=3);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`screenshots/service-hub/search-${name}.png`,fullPage:true});
    await page.goto(`${server.base}/reports.html`);
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(),7);
    for (const route of ['index.html','tasks.html','settings.html','people.html','attention.html','reports.html']) {
      await page.goto(`${server.base}/${route}`);
      await page.waitForFunction(()=>!document.querySelector('[data-hub-status]')?.textContent.includes('Loading') && !document.querySelector('[data-testid="dashboard-status"]')?.textContent.includes('Loading'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,`${name} ${route} overflows`);
    }
    checks.push(`${name}: home, tasks persistence/completion, settings, directory, recipient picker, mail/event/chat source tasks, favorite, search, report, responsive layout, owner isolation`);
    await context.close(); await other.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile('screenshots/service-hub/validation.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
} finally { await browser?.close(); await server.stop(); }
