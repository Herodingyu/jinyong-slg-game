// P1-11 机战式出招流程(攻方独占→守方登场→退场) · 改前/改后对比截帧工具
// 与 capture_fight.js 同管线(真实 animateEvent + 确定性合成事件), 输出到 evidence/fday8_<mode>/
// 跑法: node tools/capture_fday8.js <before|after> [案例名...]
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'before';
const ONLY = process.argv.slice(3);
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday8_' + MODE);
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!ONLY.length) fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 帧位说明(相对 FIGHT.t0, tStrike=1030): 800=蓄力期(改前双人在屏/改后攻方独占)
// 1010=命中前夜 1150=白闪命中帧(改后守方登场瞬间) 1300=受击峰值 1700=受击完毕(改后守方已退场)
// 2200/2900=击破定格与台词(kill案例)
const CASES = [
  ['hit',   'xiaofeng', 'liaobing', 'changquan', { type:'hit', dmg:980,  isCrit:false, killed:false },
    [800, 1010, 1150, 1300, 1700]],
  ['crit',  'xiaofeng', 'duanyq',   'dagou',     { type:'hit', dmg:1560, isCrit:true,  killed:false },
    [850, 1180, 1400, 1750]],
  ['miss',  'xiaofeng', 'liaobing', 'changquan', { type:'miss' },
    [800, 1150, 1400, 1700]],
  ['kill',  'xiaofeng', 'liaobing', 'xianglong', { type:'hit', dmg:2600, isCrit:false, killed:true },
    [900, 1150, 1700, 2200, 2900]],
];

(async () => {
  for (const [name, ak, dk, wid, patch, shots] of CASES) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 920, height: 700 });
    page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));
    await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
    await sleep(400);
    await page.evaluate(([ak, dk, wid, patch]) => {
      const att = G.units.find(u => u.key === ak && u.hp > 0);
      const def = G.units.find(u => u.key === dk && u.hp > 0);
      att.x = Math.max(0, def.x - 1); att.y = def.y;
      const ev = { att, def, w: WEAPONS[wid], ...patch };
      if (patch.killed) def.hp = 0;
      window.__ev = ev;
    }, [ak, dk, wid, patch]);
    await page.evaluate(() => { window.__p0 = performance.now(); animateEvent(window.__ev); });
    for (const off of shots) {
      await page.waitForFunction(o => typeof FIGHT !== 'undefined' && FIGHT.active && (performance.now() - FIGHT.t0) >= o,
        { timeout: 15000, polling: 40 }, off).catch(() => {});
      const label = String(off).padStart(4, '0');
      await page.screenshot({ path: `${DIR}/${name}_${label}.jpg`, type: 'jpeg', quality: 85 });
    }
    await page.waitForFunction(() => typeof FIGHT === 'undefined' || !FIGHT.active, { timeout: 15000, polling: 60 }).catch(() => {});
    await sleep(250);
    await page.evaluate(([dk, patch]) => {
      if (patch.killed) {
        const def = G.units.find(u => u.key === dk);
        def.hp = def.maxhp; G.over = false; G.result = null;
      }
    }, [dk, patch]);
    console.log('captured', name, '->', DIR);
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
