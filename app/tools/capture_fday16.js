// P1-16(AUDIT#41/#42/#43/#44) 特效返工改后截帧——复用 capture_cinema.js 钉帧管线与时间戳
// 截帧时间戳与 evidence/fday14_accept(改前) 完全一致, 同时间戳逐对目验
// 跑法: node tools/capture_fday16.js [案例名...]  (服务须先在 8157 起好)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const ONLY = process.argv.slice(2);
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday16_after');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!ONLY.length) fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 时间轴与 capture_cinema.js 相同: cut1=1560 / strike=2320 / cut2=2580 / impact=2760, 黑场各 170ms
// 1250=镜1起手定格峰 / 2400=镜2出招峰 / 3000=镜3命中受击峰 / 2330=FT.strike 出招瞬峰
const KINDS = [
  ['dash',   'xiaofeng', 'liaobing', 'changquan', { type:'hit', dmg:980,  isCrit:false, killed:false }],
  ['sweep',  'xiaofeng', 'liaobing', 'dagou',     { type:'hit', dmg:1100, isCrit:false, killed:false }],
  ['dragon', 'xiaofeng', 'duanyq',   'xianglong', { type:'hit', dmg:2100, isCrit:false, killed:false }],
  ['wave',   'guojing',  'liaobing', 'kongming',  { type:'hit', dmg:900,  isCrit:false, killed:false }],
  ['beam',   'duanyu',   'liaobing', 'liumai',    { type:'hit', dmg:1400, isCrit:false, killed:false }],
  ['bullet', 'xiaobao',  'liaobing', 'huoqiang',  { type:'hit', dmg:1600, isCrit:false, killed:false }],
  ['stab',   'xiaobao',  'liaobing', 'bishou',    { type:'hit', dmg:700,  isCrit:false, killed:false }],
  ['smash',  'duanyq',   'guojing',  'tiezhang',  { type:'hit', dmg:1800, isCrit:false, killed:false }],
  ['slashx', 'hero',     'liaobing', 'canpu',     { type:'hit', dmg:1200, isCrit:false, killed:false }],
];
const KILL = ['kill', 'xiaofeng', 'liaobing', 'xianglong', { type:'hit', dmg:2600, isCrit:false, killed:true }];
// bullet 附加 2550/2700=弹丸飞行中读弹道; smash 附加 2900=碎石滞空(镜3 初)
const SHOTS = {
  kill: [3200, 3500, 4100],
  bullet: [1250, 2400, 3000, 2330, 2550, 2700],
  smash: [1250, 2400, 3000, 2330, 1650, 2660, 2900],
  beam: [1250, 2400, 3000, 2330, 1000, 1700],
  slashx: [1250, 2400, 3000, 2330, 1650],
  dash: [1250, 2400, 3000, 2330, 1650],
};

(async () => {
  for (const [name, ak, dk, wid, patch] of [...KINDS, KILL]) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const shots = SHOTS[name] || [1250, 2400, 3000, 2330];
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 920, height: 700 });
    page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));
    await page.goto('http://localhost:8157', { waitUntil: 'networkidle0', timeout: 30000 });
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
      await page.evaluate(o => {
        window.__pinT = setInterval(() => {
          if (typeof FIGHT !== 'undefined' && FIGHT.active) FIGHT.t0 = performance.now() - o;
        }, 16);
      }, off);
      await sleep(180);
      const label = String(off).padStart(4, '0');
      await page.screenshot({ path: `${DIR}/${name}_${label}.jpg`, type: 'jpeg', quality: 85 });
      await page.evaluate(() => clearInterval(window.__pinT));
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
