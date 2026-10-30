// P1-14 演出分镜与节奏重排 · 三镜截帧工具(复用 P1-12 管线)
// 全 10 种 anim kind 逐一合成确定性事件, 同时间戳截帧(镜1起手定格/镜2出招峰/镜3命中峰), 输出 evidence/fday14_<mode>/
// 跑法: node tools/capture_fday9.js <before|after> [案例名...]
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'before';
const ONLY = process.argv.slice(3);
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday14_' + MODE);
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!ONLY.length) fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// P1-14 帧位(相对 FIGHT.t0): 1250=镜1起手定格峰 2400=镜2出招峰 3000=镜3命中受击峰
const CASES = [
  ['dash',    'xiaofeng', 'liaobing', 'changquan', { type:'hit', dmg:980,  isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['sweep',   'xiaofeng', 'liaobing', 'dagou',     { type:'hit', dmg:1100, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['dragon',  'xiaofeng', 'duanyq',   'xianglong', { type:'hit', dmg:2100, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['wave',    'guojing',  'liaobing', 'kongming',  { type:'hit', dmg:900,  isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['beam6',   'duanyu',   'liaobing', 'liumai',    { type:'hit', dmg:1400, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['bullet',  'xiaobao',  'liaobing', 'huoqiang',  { type:'hit', dmg:1600, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['stab',    'xiaobao',  'liaobing', 'bishou',    { type:'hit', dmg:700,  isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['smash',   'duanyq',   'guojing',  'tiezhang',  { type:'hit', dmg:1800, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['beam1',   'duanyq',   'guojing',  'yiyang',    { type:'hit', dmg:2200, isCrit:false, killed:false }, [1250, 2400, 3000]],
  ['slashx',  'hero',     'liaobing', 'canpu',     { type:'hit', dmg:1200, isCrit:false, killed:false }, [1250, 2400, 3000]],
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
