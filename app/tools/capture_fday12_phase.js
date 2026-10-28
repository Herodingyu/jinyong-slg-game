// F-Day12 P3-12a BOSS阶段机制 · 改前/改后对比截帧
// 合成确定性事件: 萧峰把段延庆打到半血以下 → 截改前(无演出,游戏继续) / 改后(阶段演出)
// 跑法: node tools/capture_fday12_phase.js <before|after>
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const MODE = process.argv[2] || 'before';
const DIR = __dirname + '/../evidence/fday12_' + MODE;
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);

  // 布景: 段延庆半血+1(3501/6800), 萧峰贴脸; 一击打穿 50% 阈值
  await page.evaluate(() => {
    const att = G.units.find(u => u.key === 'xiaofeng');
    const boss = G.units.find(u => u.key === 'duanyq');
    boss.hp = Math.floor(boss.maxhp * 0.5) + 1;   // 3501, 阈值=3400
    att.x = boss.x - 1; att.y = boss.y;
    G.units.filter(v => v.side === 'enemy' && v !== boss).forEach(v => { v.x = 13; v.y = 9; });
    window.__boss = boss;
  });
  await page.screenshot({ path: DIR + '/0000_boss_half_hp.jpg', type: 'jpeg', quality: 85 });

  const nFoes0 = await page.evaluate(() => G.units.filter(u => u.side === 'enemy').length);

  // 确定性合成命中事件(必中 3600 伤害: 3501-3600 → 跨阈值但未死)
  await page.evaluate(() => {
    const att = G.units.find(u => u.key === 'xiaofeng');
    const boss = window.__boss;
    const ev = { type: 'hit', att, def: boss, w: WEAPONS.xianglong, dmg: 200, isCrit: false, killed: false };
    boss.hp = boss.hp - ev.dmg;   // 3501→3301(48.5%): 跨50%阈值但未死
    window.__n0 = G.units.length;
    animateEvent(ev);             // 不 await: evaluate 会等 promise
  });
  await page.waitForFunction(() => FIGHT.active, { timeout: 8000, polling: 60 });
  await page.waitForFunction(() => !FIGHT.active, { timeout: 20000, polling: 100 });
  await sleep(300);
  await page.screenshot({ path: DIR + '/0100_after_hit.jpg', type: 'jpeg', quality: 85 });

  // 命中后 0.6s: 改前此处游戏平静继续; 改后此处阶段演出应正酣
  await sleep(600);
  await page.screenshot({ path: DIR + '/0200_phase_window.jpg', type: 'jpeg', quality: 85 });
  await sleep(900);
  await page.screenshot({ path: DIR + '/0300_phase_late.jpg', type: 'jpeg', quality: 85 });
  await sleep(1200);
  await page.screenshot({ path: DIR + '/0400_settled.jpg', type: 'jpeg', quality: 85 });

  // 状态断言(改后应全为真)
  const st = await page.evaluate(() => {
    const boss = window.__boss;
    return {
      hp: boss.hp, maxhp: boss.maxhp,
      phaseIdx: boss.phaseIdx || 0,
      weapons: boss.weapons.slice(),
      units: G.units.length,
      n0: window.__n0,
      foes: G.stats.foes,
      atk: boss.atk, def: boss.def, will: boss.will,
    };
  });
  console.log('状态:', JSON.stringify(st));
  console.log('敌方数 布景前:', nFoes0);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
