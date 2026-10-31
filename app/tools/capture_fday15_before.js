// F-Day15 改前留证: 指令菜单(无道具项) + 旧败北出口(confirm 弹窗)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('jy_fx', '0'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#startBtn');
  await sleep(600);

  // 改前①: 选中萧峰 → 指令菜单只有 攻击/运功/待机(无道具)
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaofeng');
    u.x = 5; u.y = 6;
  });
  await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); window.__bb = { left: r.left, top: r.top }; });
  const bb = await page.evaluate(() => window.__bb);
  await page.mouse.click(bb.left + 5 * 64 + 32, bb.top + 6 * 64 + 32);
  await sleep(300);
  const menuBefore = await page.evaluate(() =>
    Array.from(document.getElementById('actionMenu').querySelectorAll('button')).map(b => b.textContent));
  console.log('改前菜单项:', JSON.stringify(menuBefore));
  await page.screenshot({ path: 'evidence/fday15_before/menu.jpg', type: 'jpeg', quality: 88 });
  await page.keyboard.press('Escape');
  await page.mouse.click(bb.left + 0 * 64 + 10, bb.top + 9 * 64 + 10); // 点空白取消选中
  await sleep(200);

  // 改前②: 败北出口 = 原生 confirm + 整页刷新(AUDIT#39 不体面出口)
  page.on('dialog', d => { console.log('改前败北弹窗:', d.message()); d.accept(); });
  await page.evaluate(() => {
    G.units.filter(v => v.side === 'player').forEach(v => { v.hp = 0; });
    checkEnd();
  });
  await sleep(1600); // confirm 弹出窗口(accept 后整页刷新)
  await sleep(800);
  const reloaded = await page.evaluate(() => !document.getElementById('intro').classList.contains('hidden'));
  console.log('改前败北后整页刷新回开场模态:', reloaded ? 'OK(=旧闭环)' : 'FAIL');

  await browser.close();
  console.log('改前留证完成');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
