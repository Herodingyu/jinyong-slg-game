// P1-10 功能验证: 演出中点击画面 → FIGHT 提前收尾
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 920, height: 700 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 200)));
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(300);
  await page.evaluate(() => {
    const att = G.units.find(u => u.key === 'xiaofeng');
    const def = G.units.find(u => u.key === 'liaobing');
    att.x = Math.max(0, def.x - 1); att.y = def.y;
    window.__p = animateEvent({ att, def, w: WEAPONS.xianglong, type: 'hit', dmg: 500, killed: false, isCrit: false });
  });
  await sleep(900);                       // 演出中段(已进入战斗场景)
  const before = await page.evaluate(() => ({ active: FIGHT.active, p: Math.round(performance.now() - FIGHT.t0), dur: FIGHT.durOut }));
  await page.mouse.click(460, 350);       // 点击画面任意处 → 跳过
  await sleep(300);
  const after = await page.evaluate(() => ({ active: FIGHT.active }));
  await page.evaluate(() => { const def = G.units.find(u => u.key === 'liaobing'); def.hp = def.maxhp; });
  console.log(`点击前: active=${before.active} p=${before.p}ms/${before.dur}ms`);
  console.log(`点击后300ms: active=${after.active} (期望false=已跳过)`);
  console.log(after.active === false && before.p < before.dur ? 'PASS: 点击成功跳过演出' : 'FAIL');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
