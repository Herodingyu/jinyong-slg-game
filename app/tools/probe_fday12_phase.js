// F-Day12 P3-12a BOSS阶段机制 + P3-12b 六脉平衡 · 确定性断言探针
// ① 规则层: 打穿50%阈值 → phaseIdx=1 / 解锁yiyangc / atk+30 def+20 will=130 / 援军+2 / foes+2
// ② 防重入: 再次攻击低于阈值不重复触发(阶段只过一次)
// ③ P3-12b: 六脉真气45(池深比=200/45≈4.4, 与降龙150/35≈4.3同档) / 武器命中已接入forecast(死字段复活)
// 跑法: node tools/probe_fday12_phase.js
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);

  const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
  const ok = (m) => console.log('ok:', m);

  // ① 规则层: 阶段触发一次且只一次
  const r1 = await page.evaluate(() => {
    const att = G.units.find(u => u.key === 'xiaofeng');
    const boss = G.units.find(u => u.key === 'duanyq');
    boss.hp = Math.floor(boss.maxhp * 0.5);              // 3400 = 阈值边界(恰50%, 必须触发)
    att.x = boss.x - 1; att.y = boss.y;
    const foes0 = G.stats.foes, n0 = G.units.length, atk0 = boss.atk, def0 = boss.def;
    // 直接调规则层(演出层由 capture 脚本目验)
    const ph = checkBossPhase(boss);
    const again = checkBossPhase(boss);                  // 同一回合二次调用必须被挡
    return {
      triggered: !!ph, again: !!again,
      phaseIdx: boss.phaseIdx, weapons: boss.weapons.slice(),
      atk: boss.atk, def: boss.def, will: boss.will,
      atk0, def0,
      spawned: ph ? ph.spawned.length : 0,
      units: G.units.length, n0,
      foes: G.stats.foes, foes0,
      hpRatio: boss.hp / boss.maxhp,
      quote: ph ? ph.phase.quote : '',
      spawnTiles: ph ? ph.spawned.map(s => [s.x, s.y, s.side, s.hp]) : [],
    };
  });
  if (!r1.triggered) fail('半血阈值未触发阶段');
  if (r1.again) fail('阶段重复触发(防重入失效)');
  if (r1.phaseIdx !== 1) fail('phaseIdx=' + r1.phaseIdx);
  if (r1.weapons.indexOf('yiyangc') < 0) fail('未解锁 yiyangc: ' + r1.weapons);
  if (r1.atk !== r1.atk0 + 30 || r1.def !== r1.def0 + 20) fail(`buff 数值错 atk ${r1.atk0}→${r1.atk} def ${r1.def0}→${r1.def}`);
  if (r1.will !== 130) fail('will=' + r1.will);
  if (r1.spawned !== 2) fail('援军=' + r1.spawned);
  if (r1.units !== r1.n0 + 2) fail('units ' + r1.n0 + '→' + r1.units);
  if (r1.foes !== r1.foes0 + 2) fail('foes ' + r1.foes0 + '→' + r1.foes);
  if (!r1.quote) fail('台词缺失');
  r1.spawnTiles.forEach(t => { if (t[2] !== 'enemy' || t[3] <= 0) fail('援军状态错: ' + t); });
  ok(`阶段触发一次: hp比${(r1.hpRatio * 100).toFixed(1)}% 武器=${r1.weapons.join('/')} atk+30 def+20 will=130 援军${r1.spawned}名(${r1.spawnTiles.map(t => t[0] + ',' + t[1]).join(' ')}) foes ${r1.foes0}→${r1.foes}`);

  // ② 援军落点合法性: 在图内/可站/无重叠
  const r2 = await page.evaluate(() => {
    const spawns = G.units.filter(u => u.key.indexOf('liaobing_s') === 0);
    return spawns.map(s => ({
      x: s.x, y: s.y,
      cost: moveCost({ buffs: {} }, s.x, s.y),
      overlap: G.units.filter(v => v !== s && v.hp > 0 && v.x === s.x && v.y === s.y).length,
    }));
  });
  r2.forEach(t => {  // 图幅锁定 14×10(W/H 是页面侧常量, 这里在 node 侧断言用字面量)
    if (t.x < 0 || t.y < 0 || t.x >= 14 || t.y >= 10) fail('援军出图: ' + JSON.stringify(t));
    if (t.cost < 0) fail('援军落在不可站格: ' + JSON.stringify(t));
    if (t.overlap > 0) fail('援军重叠: ' + JSON.stringify(t));
  });
  ok('援军落点全部合法: ' + JSON.stringify(r2));

  // ③ P3-12b: 六脉代价 + 武器命中字段生效(用低身法攻击者避开97%封顶, 才能看见武器修正)
  const r3 = await page.evaluate(() => {
    const dy = G.units.find(u => u.key === 'duanyu');
    const hero = G.units.find(u => u.key === 'hero');
    const boss = G.units.find(u => u.key === 'duanyq');
    const lm = WEAPONS.liumai, cq = WEAPONS.changquan, xlo = WEAPONS.xianglong;
    // 低身法对高闪避(避开97%封顶): 辽兵(hit100)对萧峰(evd130)基础=78%, 假武器只喂hit字段
    const lb = G.units.find(u => u.key === 'liaobing');
    const xf = G.units.find(u => u.key === 'xiaofeng');
    const f90 = forecast(lb, xf, { hit: 90 }), f75 = forecast(lb, xf, { hit: 75 });
    return {
      liuCost: lm.cost, liuPool: dy.sp,
      xlCost: xlo.cost, xlPool: G.units.find(u => u.key === 'xiaofeng').sp,
      f90: f90.hitp, f75: f75.hitp,
    };
  });
  // 池深比: 六脉 200/45≈4.4 发/池 对标 降龙 150/35≈4.3 发/池
  const depthLiu = r3.liuPool / r3.liuCost, depthXl = r3.xlPool / r3.xlCost;
  if (r3.liuCost !== 45) fail('六脉真气=' + r3.liuCost);
  if (Math.abs(depthLiu - depthXl) > 0.5) fail(`池深比失衡 六脉${depthLiu.toFixed(1)} vs 降龙${depthXl.toFixed(1)}`);
  // 武器命中已接入公式: hit90 武器应比 hit75 武器恰高 (90-75)*0.6=9
  if (r3.f90 !== r3.f75 + 9) fail(`武器命中未生效: hit90=${r3.f90}% vs hit75=${r3.f75}% (应差9)`);
  ok(`六脉 cost=45(池深比${depthLiu.toFixed(1)}≈降龙${depthXl.toFixed(1)}), 武器命中接入: ${r3.f90}% = ${r3.f75}%+9`);

  // ④ 演出层: 新页面跑 animateEvent 完整链(①已消耗过阶段, 必须重载重开)
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);
  await page.evaluate(() => {
    const att = G.units.find(u => u.key === 'xiaofeng');
    const boss = G.units.find(u => u.key === 'duanyq');
    boss.hp = Math.floor(boss.maxhp * 0.25);             // 第二阶段阈值以下再打
    att.x = boss.x - 1; att.y = boss.y;
    window.__ev = { type: 'hit', att, def: boss, w: WEAPONS.changquan, dmg: 100, isCrit: false, killed: false };
    boss.hp -= 100;
    window.__p = animateEvent(window.__ev);
  });
  await page.waitForFunction(() => FIGHT.active, { timeout: 8000, polling: 60 });
  await page.waitForFunction(() => !FIGHT.active, { timeout: 20000, polling: 100 });
  // 阶段演出窗口内断言(FIGHT 结束后 phaseFx 进行中)
  const r4 = await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const probe = () => {
      const q = !!FX.phaseQuote || performance.now() - t0 > 2600;
      if (q) res({
        sawQuote: !!FX.phaseQuote,
        bigText: FX.bigText, cutinRight: FX.cutinRight,
        red: performance.now() < FX.redUntil,
        bossPhaseIdx: G.units.find(u => u.key === 'duanyq').phaseIdx,
      });
      else setTimeout(probe, 60);
    };
    probe();
  }));
  if (r4.bossPhaseIdx !== 1) fail('演出链阶段idx异常: ' + r4.bossPhaseIdx);
  ok(`演出链跑通: 台词条=${r4.sawQuote} 大字=${r4.bigText} 右入画=${r4.cutinRight} 赤闪=${r4.red}`);
  await page.evaluate(() => window.__p);
  await sleep(400);
  const settled = await page.evaluate(() => FX.phaseQuote === null && !FX.cutinRight);
  if (!settled) fail('演出状态未收敛');
  ok('演出状态已收敛');

  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
  console.log('PROBE PASS');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
