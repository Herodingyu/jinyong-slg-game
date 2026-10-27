// F-Day11 P3-11 验证: 演出/反击开关刷新后持久化(localStorage)
// 跑法: node tools/probe_fday11_store.js
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);

  // 初始态(全新 profile): 三开关默认
  const init = await page.evaluate(() => ({
    fx: fxOn, bgm: bgmOn, counter: AUTO_COUNTER,
    fxBtn: document.getElementById('fxBtn').textContent,
  }));
  console.log('初始:', JSON.stringify(init));

  // 关掉演出与反击, 保持音乐开
  await page.click('#fxBtn');
  await page.click('#counterBtn');
  await sleep(200);
  const stored = await page.evaluate(() => ({
    jy_fx: localStorage.getItem('jy_fx'), jy_counter: localStorage.getItem('jy_counter'),
    jy_bgm: localStorage.getItem('jy_bgm'),
    fxBtn: document.getElementById('fxBtn').textContent,
    counterBtn: document.getElementById('counterBtn').textContent,
  }));
  console.log('点击后存储:', JSON.stringify(stored));

  // 刷新 → 应从 localStorage 恢复
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const restored = await page.evaluate(() => ({
    fx: fxOn, counter: AUTO_COUNTER,
    fxBtn: document.getElementById('fxBtn').textContent,
    counterBtn: document.getElementById('counterBtn').textContent,
    bgmBtn: document.getElementById('bgmBtn').textContent,
  }));
  console.log('刷新后:', JSON.stringify(restored));
  const pass = restored.fx === false && restored.counter === false &&
    restored.fxBtn === '演出:关' && restored.counterBtn === '反击:手动' && restored.bgmBtn === '音乐:开';
  console.log(pass ? 'PERSIST PASS' : 'PERSIST FAIL');
  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
  process.exit(pass && !errs.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
