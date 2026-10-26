// P2-13 FE 式地图单位动画 · 改前/改后对比截帧工具
// 五个案例: 待机呼吸A/B(同相位差帧) / 选中踏步A/B / 敌入射程架势 / 移动步伐+扬尘三连帧 / 朝向左翻转
// 跑法: node tools/capture_fday10.js <before|after>
// before 模式兼容旧码(无 animUnitMove/Sel 驱动时用直改坐标兜底)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'before';
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday10_' + MODE);
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 920, height: 700 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('intro').classList.add('hidden');
    // 关掉开场演出干扰, 直接战场状态
    if (typeof INTRO !== 'undefined') INTRO.active = false;
  });
  await sleep(500);

  // 案例1: 待机呼吸 — 同单位两帧间隔 ~550ms(约半呼吸周期), squash 差异可读
  await page.screenshot({ path: `${DIR}/idle_A.jpg`, type: 'jpeg', quality: 85 });
  await sleep(550);
  await page.screenshot({ path: `${DIR}/idle_B.jpg`, type: 'jpeg', quality: 85 });

  // 案例2: 选中快节奏踏步 — 选中萧峰(5,8), 两帧间隔 ~120ms(半踏步周期)
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaofeng');
    Sel.unit = u; Sel.moveTiles = moveRange(u);
    hideMenus && hideMenus();
  });
  await sleep(300);
  await page.screenshot({ path: `${DIR}/sel_A.jpg`, type: 'jpeg', quality: 85 });
  await sleep(120);
  await page.screenshot({ path: `${DIR}/sel_B.jpg`, type: 'jpeg', quality: 85 });
  await page.evaluate(() => { Sel.unit = null; Sel.moveTiles = null; });

  // 案例3: 敌入射程攻击架势 — 把郭靖摆到辽兵(5,2)正下方邻格(5,3)
  await page.evaluate(() => {
    const g = G.units.find(v => v.key === 'guojing');
    g.x = 5; g.y = 3;
  });
  await sleep(400);
  await page.screenshot({ path: `${DIR}/stance.jpg`, type: 'jpeg', quality: 85 });

  // 案例4: 移动步伐+扬尘 — 郭靖(5,3)→(5,5) 走两格(after 走 animUnitMove, before 瞬移后截等价位置)
  const hasAnim = await page.evaluate(() => typeof animUnitMove === 'function');
  if (hasAnim) {
    await page.evaluate(() => {
      const g = G.units.find(v => v.key === 'guojing');
      window.__mv = animUnitMove(g, 5, 5);
    });
    await sleep(160);  // 行进中(约第1格中段)
    await page.screenshot({ path: `${DIR}/move_01.jpg`, type: 'jpeg', quality: 85 });
    await sleep(130);  // 换步点
    await page.screenshot({ path: `${DIR}/move_02.jpg`, type: 'jpeg', quality: 85 });
    await sleep(130);
    await page.screenshot({ path: `${DIR}/move_03.jpg`, type: 'jpeg', quality: 85 });
    await page.evaluate(() => window.__mv);
    await sleep(120);
    await page.screenshot({ path: `${DIR}/move_land.jpg`, type: 'jpeg', quality: 85 });
  } else {
    await page.evaluate(() => {
      const g = G.units.find(v => v.key === 'guojing');
      g.x = 5; g.y = 5;
    });
    await sleep(150);
    await page.screenshot({ path: `${DIR}/move_01.jpg`, type: 'jpeg', quality: 85 });
  }

  // 案例5: 朝向左翻转 — 萧峰向左走一格(4,8), 与朝右的郭靖(5,5)同框对比
  await page.evaluate(() => {
    const x = G.units.find(v => v.key === 'xiaofeng');
    x.x = 4; x.y = 6;
  });
  if (hasAnim) {
    await page.evaluate(() => {
      const x = G.units.find(v => v.key === 'xiaofeng');
      window.__mv2 = animUnitMove(x, 3, 6); // 向左一格
    });
    await page.evaluate(() => window.__mv2);
    await sleep(150);
  }
  await page.screenshot({ path: `${DIR}/flip.jpg`, type: 'jpeg', quality: 85 });

  // 复位
  await page.evaluate(() => {
    const g = G.units.find(v => v.key === 'guojing');
    g.x = 4; g.y = 8;
    const x = G.units.find(v => v.key === 'xiaofeng');
    x.x = 5; x.y = 8;
  });
  console.log('captured ->', DIR, 'hasAnim =', hasAnim);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
