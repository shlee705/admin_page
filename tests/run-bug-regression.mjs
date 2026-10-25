/** Execute each existing browser suite independently; retain failures and their full logs. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const suites = Object.entries(pkg.scripts).filter(([name]) => name.startsWith('test:') && name.endsWith(':e2e') && name !== 'test:bugs:e2e');
const folder = '.integration-artifacts/regression'; await mkdir(folder, { recursive: true });
const results = [];
for (const [name, command] of suites) {
  const file = command.replace(/^node /, ''); const start = Date.now(); let output = '';
  const child = spawn(process.execPath, [resolve(file)], { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
  await writeFile(`${folder}/${name.replaceAll(':', '-')}.log`, output);
  results.push({ name, code, seconds: Math.round((Date.now() - start) / 1000), log: `${folder}/${name.replaceAll(':', '-')}.log` });
  await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${name} (${results.at(-1).seconds}s)`);
}
console.log(JSON.stringify({ passed: results.filter(r => r.code === 0).length, failed: results.filter(r => r.code !== 0).length }));
process.exitCode = results.some(r => r.code !== 0) ? 1 : 0;
