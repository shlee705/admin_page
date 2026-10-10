import { chromium } from 'playwright';
import { createTestAccount } from './auth-server.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:8000';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await createTestAccount(context, base, `explore_${Date.now()}`, 'Site Explorer');
const page = await context.newPage();
const report = { errors: [], consoleErrors: [], httpErrors: [], failures: [], pages: {} };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
page.on('requestfailed', request => report.failures.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() }); });
await mkdir('screenshots', { recursive: true });
for (const name of ['index', 'calendar', 'chat']) {
  await page.goto(`${base}/${name}.html`); await page.getByTestId('current-user-name').waitFor();
  await page.waitForTimeout(1200);
  const before = await page.locator('main').innerText();
  const buttons = await page.locator('main button').allTextContents();
  const results = [];
  if (name === 'index') {
    for (const label of ['Export', 'New report']) {
      const button = page.getByRole('button', { name: label, exact: true });
      if (await button.count()) { await button.click(); results.push({ action: label, changed: before !== await page.locator('main').innerText(), dialogs: await page.locator('dialog[open]').count() }); }
      if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
    }
  }
  if (name === 'calendar') {
    await page.getByRole('button', { name: 'New event', exact: true }).last().click();
    results.push({ action: 'New event', dialogs: await page.locator('dialog[open]').count(), changed: before !== await page.locator('main').innerText() });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
    const title = await page.locator('.cal-month').innerText();
    await page.locator('.cal-main .cal-nav-btn').nth(1).click();
    results.push({ action: 'Next month', before: title, after: await page.locator('.cal-month').innerText() });
    await page.locator('.cal-today-btn').click();
    results.push({ action: 'Today', title: await page.locator('.cal-month').innerText() });
    await page.locator('[data-fc]').click({ position: { x: 100, y: 160 } });
    results.push({ action: 'Date click', dialogs: await page.locator('dialog[open]').count() });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  }
  if (name === 'chat') {
    const head = await page.locator('.chat-pane-head').innerText();
    await page.locator('.chat-conv').nth(1).click();
    if (await page.getByTestId('chat-status').count()) await page.getByTestId('chat-status').filter({ hasText: 'opened' }).waitFor();
    results.push({ action: 'Select second room', changed: head !== await page.locator('.chat-pane-head').innerText() });
    await page.locator('.chat-composer textarea').fill('Browser exploration message');
    await page.locator('.chat-composer textarea').press('Enter');
    if (await page.getByTestId('chat-status').count()) await page.getByTestId('chat-status').filter({ hasText: 'Message saved' }).waitFor();
    results.push({ action: 'Enter send', visible: (await page.locator('.chat-thread').innerText()).includes('Browser exploration message') });
    await page.locator('.chat-composer textarea').fill('Browser exploration button message');
    const send = page.locator('.chat-composer button').last(); await send.click();
    if (await page.getByTestId('chat-status').count()) await page.getByTestId('chat-status').filter({ hasText: 'Message saved' }).waitFor();
    results.push({ action: 'Send button', visible: (await page.locator('.chat-thread').innerText()).includes('Browser exploration message') });
  }
  await page.screenshot({ path: `screenshots/site-explored-${name}.png`, fullPage: true });
  report.pages[name] = { buttons, results, text: before };
}
await writeFile('screenshots/site-exploration-current.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pages: Object.fromEntries(Object.entries(report.pages).map(([name, data]) => [name, data.results])), errors: report.errors, consoleErrors: report.consoleErrors, httpErrors: report.httpErrors, failures: report.failures }, null, 2));
await browser.close();

