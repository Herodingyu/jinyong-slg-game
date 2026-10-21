// F-Day4 取证: P1-7 合体技(改前单人) / P1-8 开场(改前静态) → 改后双立绘/扫场
// 跑法: node tools/capture_day4.js <before|after>
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const MODE = process.argv[2] || 'before';
const DIR = '/tmp/fday4_' + MODE;
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 940, height: 700 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));

  // ---- P1-8 开场: 点开始按钮后的前 3.6s ----
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(400);
  await page.screenshot({ path: `${DIR}/intro_0000_modal.jpg`, type: 'jpeg', quality: 85 });
  await page.click('#startBtn'); // t=0
  for (const off of [350, 1000, 1700, 2500, 3300]) {
    const wait = off - (await page.evaluate(() => 0));
    await sleep(off === 350 ? 350 : (off - [350, 1000, 1700, 2500, 3300][[350, 1000, 1700, 2500, 3300].indexOf(off) - 1]));
    await page.screenshot({ path: `${DIR}/intro_${String(off).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 85 });
  }
  console.log('captured intro ->', DIR);

  // ---- P1-7 合体技: 布景后走真实 doCombo 前半(演出管线), 截关键帧 ----
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaofeng');
    const p = G.units.find(v => v.key === 'guojing');
    const foe = G.units.find(v => v.key === 'liaobing' && v.hp > 0);
    // 布景: 双侠相邻, 气势拉满, 单独一个敌人在合体范围中心
    u.x = 5; u.y = 6; p.x = 4; p.y = 6;
    u.will = 130; p.will = 130;
    foe.x = 6; foe.y = 5;
    G.units.filter(v => v.side === 'enemy' && v !== foe)
      .forEach(v => { v.x = 13; v.y = 9; }); // 其余敌人挪出范围
    G.comboUsed = false;
    const fakeW = { name: '双侠镇襄阳', pow: 3400, hit: 100, crit: 25, rng: [1, 1], cost: 0, will: 0, type: '外',
                    anim: { kind: 'dragon', color: '#ffd24a' } };
    const ev = resolveAttack(u, foe, fakeW, { buffs: { mustHit: true }, atkBonus: p.atk });
    ev.partner = p; // P1-7: 双立绘同框(改后 startFight 消费此字段)
    window.__ev = ev;
  });
  await page.evaluate(() => { window.__t0 = performance.now(); animateEvent(window.__ev, true); });
  for (const off of [250, 750, 1050, 1200, 1350, 1600, 2000, 2500, 3000, 3600]) {
    await page.waitForFunction(o => typeof FIGHT !== 'undefined' && FIGHT.active && (performance.now() - FIGHT.t0) >= o,
      { timeout: 15000, polling: 40 }, off).catch(() => {});
    await page.screenshot({ path: `${DIR}/combo_${String(off).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 85 });
  }
  await page.waitForFunction(() => typeof FIGHT === 'undefined' || !FIGHT.active, { timeout: 15000, polling: 60 }).catch(() => {});
  await sleep(250);
  console.log('captured combo ->', DIR);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
