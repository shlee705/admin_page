/** U1 must survive exact-weight external fonts, late CSS and reloads. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startAuthServer, createTestAccount } from './auth-server.mjs';

const output = '.integration-artifacts/u1-font';
await mkdir(output, { recursive: true });
const server = await startAuthServer(); let browser;
const results = []; const errors = [];
const families = ['Inter', 'Inter Tight', 'JetBrains Mono'];
const weights = [400, 500, 600, 700];
// The same font-face descriptors as the network response, without a network
// dependency. An exact-weight Latin face must coexist with the Hangul subset.
const externalCss = families.flatMap(family => weights.map(weight => `@font-face {font-family:'${family}';font-style:normal;font-weight:${weight};src:local('Arial');unicode-range:U+0000-00FF;}`)).join('\n');
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const mode of ['external-static-weights', 'network', 'blocked']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    if (mode === 'external-static-weights') await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: externalCss }));
    if (mode === 'blocked') await context.route('https://fonts.googleapis.com/**', r => r.abort());
    const user = await createTestAccount(context, server.base, `u1_font_${mode.replaceAll('-', '_')}`, '한국어 테스트 ABC 123');
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const externalStylesheets = [];
    page.on('response', r => { if (r.url().includes('fonts.googleapis.com')) externalStylesheets.push({ url: r.url(), status: r.status() }); });
    const inspect = () => page.evaluate(async () => {
      await document.fonts.ready;
      const readings = [];
      for (const family of ['Inter', 'Inter Tight', 'JetBrains Mono']) for (const weight of [400, 500, 600, 700]) {
        await document.fonts.load(`${weight} 32px "${family}"`, '한글');
        const render = value => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50; const ctx = canvas.getContext('2d'); ctx.font = `${weight} 32px "${family}"`; ctx.fillText(value, 2, 35); return canvas.toDataURL(); };
        readings.push({ family, weight, hangulSame: render('한') === render('글'), asciiDifferent: render('A') !== render('B'), nonempty: render('한') !== render(' ') });
      }
      return { readings, inputValue: document.querySelector('[name="displayName"]').value, inputFont: getComputedStyle(document.querySelector('[name="displayName"]')).fontFamily };
    });
    await page.goto(`${server.base}/settings.html`); await page.locator('[data-profile-form]').waitFor();
    if (mode !== 'blocked') assert.ok(externalStylesheets.some(r => r.status === 200), 'External stylesheet must actually load');
    for (const phase of ['initial', 'late-css', 'reload']) {
      if (phase === 'late-css') await page.addStyleTag({ content: externalCss });
      if (phase === 'reload') { await page.reload(); await page.locator('[data-profile-form]').waitFor(); }
      const sample = await inspect();
      assert.ok(sample.readings.every(r => r.hangulSame && r.asciiDifferent && r.nonempty), JSON.stringify({ mode, phase, sample }));
      assert.equal(sample.inputValue, '한국어 테스트 ABC 123');
      assert.equal((await (await context.request.get(`${server.base}/api/auth/me`)).json()).user.displayName, user.displayName);
      results.push({ mode, phase, passed: true, externalStylesheets: [...externalStylesheets], ...sample });
    }
    await page.screenshot({ path: `${output}/${mode}.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${results.length} scenarios / ${results.reduce((n, r) => n + r.readings.length, 0)} glyph checks passed`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: browser?.version(), checkedAt: new Date().toISOString(), results, errors }, null, 2));
  await browser?.close(); await server.stop();
}
