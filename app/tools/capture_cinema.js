// P1-14 三镜分镜对照验收截帧工具(Agent 3, 复用 capture_fday9/capture_fight 成熟管线)
// 9 种 anim kind × 三镜各 1 帧(镜1起手定格/镜2出招/镜3命中) + 击破 3 张 = 30 张
// 附加: beam(六脉) 凝气双帧验证光球≥0.5s 且人物完整在画; dash/smash/beam 切镜黑场帧验证 170ms 黑场存在
// 判定线=不看 HP 条能认出这是哪一招。跑法: node tools/capture_cinema.js [案例名...]  (服务须先在 8157 起好)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const ONLY = process.argv.slice(2);
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday14_accept');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!ONLY.length) fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// P1-14 时间轴(相对 FIGHT.t0): FT.cut1=1560 / strike=2320 / cut2=2580 / impact=2760, 黑场各 170ms
// 截帧: 1250=镜1起手定格峰(FT_READY=1240, 定格≥320ms) / 2400=镜2出招峰 / 3000=镜3命中受击峰
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
// 击破 3 张: killAt≈2760+扣血动画≈3160 起定格 500ms → 3200击破定格+大字 / 3500定格尾 / 4100倒下淡出
const KILL = ['kill', 'xiaofeng', 'liaobing', 'xianglong', { type:'hit', dmg:2600, isCrit:false, killed:true }];
const SHOTS = {
  kill: [3200, 3500, 4100],
  beam: [1250, 2400, 3000, 2330, 1000, 1700], // 附加 2330=FT.strike 出招瞬峰; 1000/1700: 凝气光球两帧相距 700ms≥0.5s, 验证人物完整在画
  dash: [1250, 2400, 3000, 2330, 1650, 2660], // 附加切镜黑场帧(cut1 1560-1730 / cut2 2580-2750)
  smash: [1250, 2400, 3000, 2330, 1650, 2660],
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
      // 等时间轴自然走到目标偏移, 然后用 setInterval 持续把 FIGHT.t0 钉在"当前-off",
      // 使 p≈off 冻结(纯截帧手段, 不改游戏代码), 黑场等短窗口也能稳定截到
      await page.waitForFunction(o => typeof FIGHT !== 'undefined' && FIGHT.active && (performance.now() - FIGHT.t0) >= o,
        { timeout: 15000, polling: 40 }, off).catch(() => {});
      await page.evaluate(o => {
        window.__pinT = setInterval(() => {
          if (typeof FIGHT !== 'undefined' && FIGHT.active) FIGHT.t0 = performance.now() - o;
        }, 16);
      }, off);
      await sleep(180); // 让钉住后的帧渲染几帧(rAF 节奏)
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
