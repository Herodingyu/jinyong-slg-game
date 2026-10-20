// P1-9 立绘 puppet 动画 · 改前/改后对比截帧工具
// 驱动真实演出管线(animateEvent), 用确定性合成事件固定时间轴, 按 FIGHT 相对时刻截关键帧
// 跑法: node tools/capture_fight.js <before|after> [案例名...]   (缺省全部, 每个案例独立起浏览器防内存膨胀)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const MODE = process.argv[2] || 'before';
const ONLY = process.argv.slice(3);
const DIR = '/tmp/fday3_' + MODE;
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!ONLY.length) fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 各案例: [名称, 攻方key, 守方key, 武器id, 事件补丁, 截帧偏移(ms, 相对FIGHT.t0)]
const CASES = [
  ['hit',   'xiaofeng', 'liaobing', 'changquan', { type:'hit', dmg:980,  isCrit:false, killed:false },
    [150, 800, 1000, 1100, 1180, 1260, 1900]],
  ['crit',  'xiaofeng', 'duanyq',   'dagou',     { type:'hit', dmg:1560, isCrit:true,  killed:false },
    [200, 850, 1150, 1300, 1550, 1950]],
  ['miss',  'xiaofeng', 'liaobing', 'changquan', { type:'miss' },
    [150, 800, 1080, 1250, 1500]],
  ['kill',  'xiaofeng', 'liaobing', 'xianglong', { type:'hit', dmg:2600, isCrit:false, killed:true },
    [150, 900, 1100, 1300, 1750, 2100, 2500, 3000]],
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
    // 布景: 攻方挪到守方邻格, 合成确定性事件(形状与 resolveAttack 产出一致)
    await page.evaluate(([ak, dk, wid, patch]) => {
      const att = G.units.find(u => u.key === ak && u.hp > 0);
      const def = G.units.find(u => u.key === dk && u.hp > 0);
      att.x = Math.max(0, def.x - 1); att.y = def.y;
      const ev = { att, def, w: WEAPONS[wid], ...patch };
      if (patch.killed) def.hp = 0;
      window.__ev = ev;
    }, [ak, dk, wid, patch]);
    // 启动演出(不 await, 并行截帧)
    await page.evaluate(() => { window.__p0 = performance.now(); animateEvent(window.__ev); });
    for (const off of shots) {
      // 等 FIGHT 时间轴走到目标偏移
      await page.waitForFunction(o => typeof FIGHT !== 'undefined' && FIGHT.active && (performance.now() - FIGHT.t0) >= o,
        { timeout: 15000, polling: 40 }, off).catch(() => {});
      const label = String(off).padStart(4, '0');
      await page.screenshot({ path: `${DIR}/${name}_${label}.jpg`, type: 'jpeg', quality: 85 });
    }
    await page.waitForFunction(() => typeof FIGHT === 'undefined' || !FIGHT.active, { timeout: 15000, polling: 60 }).catch(() => {});
    await sleep(250);
    // 复活被击杀的守方, 恢复血量供下一案例
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
