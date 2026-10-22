// F-Day6 取证: P2-9 地块微动效(水波/雪闪/选中呼吸) + P2-10 单位占比(64→78px)
// 跑法: node tools/capture_day6.js <before|after>
// 证据点: 选中态三帧(相位差证明呼吸/水波动效) + 全景帧(单位占比)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const MODE = process.argv[2] || 'before';
const DIR = '/tmp/fday6_' + MODE;
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 940, height: 700 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));

  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(500);

  // 全景帧: 单位占比(64 vs 78) — 以主角/萧峰为标尺, 水泽/雪地在同屏
  await page.screenshot({ path: `${DIR}/full_0000.jpg`, type: 'jpeg', quality: 85 });

  // 选中态: 选中韦小宝(靠近水泽), 开移动范围 — 呼吸高亮 + 水波动效相位差
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaobao');
    Sel.moveTiles = moveRange(u);
    Sel.unit = u;
    openMenu(u);
  });
  for (const [i, off] of [0, 350, 700].entries()) {
    if (off) await sleep(off - [0, 350, 700][i - 1]);
    await page.screenshot({ path: `${DIR}/sel_${String(off).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 85 });
  }

  // 攻击范围帧(红色高亮同走呼吸) — 菜单选攻击后点敌人预测, 这里直接铺 atkTiles 取证
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaobao');
    Sel.atkTiles = {};
    Object.keys(attackTiles(u, WEAPONS.bishou, u.x, u.y))
      .forEach(k => { Sel.atkTiles[k] = true; });
  });
  await sleep(350);
  await page.screenshot({ path: `${DIR}/atk_0350.jpg`, type: 'jpeg', quality: 85 });

  console.log('captured ->', DIR);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
