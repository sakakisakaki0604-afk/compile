import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', 'public'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const out = process.argv[2] || '/tmp';
let fail = 0;
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.route('**/harness.html*', (r) => r.fulfill({ path: 'tests/ui/harness.html', contentType: 'text/html' }));
  for (const s of ['section', 'top']) {
    await pg.goto(`http://localhost:8765/harness.html?s=${s}`); await pg.waitForFunction('window.__ready');
    await pg.screenshot({ path: `${out}/ui_${s}.png` });
  }
  if (errs.length) { console.log('ERR', errs); fail = 1; }
  console.log(await pg.locator('.matbg').count() ? 'matbg ok' : 'matbg missing');
} finally { await b.close(); srv.kill(); }
process.exit(fail);
