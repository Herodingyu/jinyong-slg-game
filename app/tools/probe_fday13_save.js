// F-Day13 P3-12 D1+D2 全栈确定性探针(Puppeteer 真实页面, 共用一个浏览器实例)
// ① 顶栏出现「存档」「读档」按钮
// ② 自动存档: 演出关闭时开场即写 jy_save(8单位/第1回合)
// ③ 手动存档按钮: 空闲时可用且写档
// ④ 升级演出: hero 经验设98 → 必中攻击辽兵 → 命中+2 升级 → 大字「升 级 ！」+ Lv 1→2 + 属性成长入档
// ⑤ 读档: 污染状态(移走单位/扣血/改lv/加伪单位) → 读档恢复 → 单位数/位置/HP/Lv 全对
// 跑法: node tools/probe_fday13_save.js
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // 演出开关走 localStorage(jy_fx), 刷新即生效 —— startBtn 后开场链直接收束进 beginPlay
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('jy_fx', '0'); });
  await page.reload({ waitUntil: 'networkidle0' });

  const fail = m => { console.error('FAIL:', m); process.exit(1); };
  const assert = (c, m) => { if (!c) fail(m); console.log('ok:', m); };

  await page.click('#startBtn');
  await sleep(600);

  // ① 顶栏按钮
  const hasBtns = await page.evaluate(() =>
    !!document.getElementById('saveBtn') && !!document.getElementById('loadBtn') &&
    document.getElementById('saveBtn').textContent === '存档' &&
    document.getElementById('loadBtn').textContent === '读档');
  assert(hasBtns, '顶栏出现「存档」「读档」按钮');

  // ② 自动存档: 开场即写
  const autoSaved = await page.evaluate(() => {
    const raw = localStorage.getItem('jy_save');
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { units: p.state.units.length, turn: p.state.turn, lv: p.state.units.find(u => u.key === 'hero').lv };
  });
  assert(autoSaved && autoSaved.units === 11 && autoSaved.turn === 1 && autoSaved.lv === 1,
    `开场自动存档 11单位/第1回合 (实得 ${JSON.stringify(autoSaved)})`);

  // ③ 手动存档: 空闲可用(演出关状态下 saveLoadIdle 为真)
  await page.click('#saveBtn');
  await sleep(200);
  const manualOk = await page.evaluate(() => {
    const raw = localStorage.getItem('jy_save');
    return !!raw && JSON.parse(raw).state.turn === 1;
  });
  assert(manualOk, '空闲时手动存档落档');

  // ④ 升级演出: 通过 fxBtn 把演出打开(真实UI路径), hero 经验98 必中攻击 → 命中+2 升级
  await page.evaluate(() => {
    const hero = G.units.find(u => u.key === 'hero');
    const bing = G.units.find(u => u.key === 'liaobing');
    bing.hp = 20000; // 确保打不死(锁0后必会心), 只拿命中经验
    hero.x = bing.x - 1; hero.y = bing.y;
    hero.exp = 98; // 98+2=100 → 升级
  });
  await page.click('#fxBtn'); // 演出:关 → 开
  const pre = await page.evaluate(() => {
    const hero = G.units.find(u => u.key === 'hero');
    const bing = G.units.find(u => u.key === 'liaobing');
    Math.random = () => 0; // 锁RNG: 成长全roll中 + 必中(与 node 台同款约定)
    window.__ev = resolveAttack(hero, bing, WEAPONS[hero.weapons[0]], { buffs: { mustHit: true } });
    window.__p = animateEvent(window.__ev); // 不await, 先去看大字
    return { hit: window.__ev.type, lvUps: (window.__ev.levelUps || []).length, gains: window.__ev.levelUps[0].gains };
  });
  assert(pre.hit === 'hit' && pre.lvUps === 1 && pre.gains.hp === 150 && pre.gains.atk === 6,
    `攻击事件挂升级摘要(levelUps=${pre.lvUps}, 成长全中)`);
  await page.waitForFunction(() => LVUP.active === true, { timeout: 20000 });
  await sleep(450); // 大字渐显+弹跳后定格
  await page.screenshot({ path: 'evidence/fday13/lvup_fx.png' });
  const mid = await page.evaluate(() => {
    const hero = G.units.find(u => u.key === 'hero');
    return { lv: hero.lv, exp: hero.exp, maxhp: hero.maxhp, atk: hero.atk, big: LVUP.active, bigText: LVUP.gains && Object.keys(LVUP.gains).length };
  });
  assert(mid.big && mid.bigText > 0, '升级大字「升 级 ！」演出进行中且有成长明细');
  assert(mid.lv === 2 && mid.exp === 0, `升级落账 Lv.${mid.lv} exp=${mid.exp}`);
  assert(mid.maxhp === 3150 && mid.atk === 146, `属性成长落账 maxhp=${mid.maxhp} atk=${mid.atk}`);
  await page.evaluate(() => window.__p); // 等 animateEvent 全链收尾
  await sleep(400);
  const done = await page.evaluate(() => LVUP.active);
  assert(done === false, '升级大字演出按时收场');
  await page.click('#fxBtn'); // 演出关回来, 缩短后续链路
  await page.evaluate(() => saveGame(true)); // 补存一档(带 Lv.2)
  const savedLv = await page.evaluate(() => JSON.parse(localStorage.getItem('jy_save')).state.units.find(u => u.key === 'hero').lv);
  assert(savedLv === 2, `升级后存档 hero.lv=2 (实得 ${savedLv})`);

  // ⑤ 读档: 污染 → 读档 → 恢复
  await page.evaluate(() => {
    const hero = G.units.find(u => u.key === 'hero');
    hero.hp = 1; hero.x = 0; hero.y = 0; hero.lv = 99;
    G.units.push(makeUnit({ key: 'fake_x', tpl: 'liaobing', x: 2, y: 2 }));
    G.turn = 42;
    loadGame();
  });
  await sleep(300);
  const restored = await page.evaluate(() => {
    const hero = G.units.find(u => u.key === 'hero');
    return { n: G.units.length, turn: G.turn, hp: hero.hp, x: hero.x, y: hero.y, lv: hero.lv };
  });
  assert(restored.n === 11 && restored.turn === 1, `读档后单位数=${restored.n} 回合=${restored.turn}(伪单位被清)`);
  assert(restored.lv === 2 && restored.hp === 3150 && restored.x !== 0, `读档后 hero.lv=${restored.lv} hp=${restored.hp}(升级保留, 污染清除)`);

  await browser.close();
  console.log('F-Day13 D1+D2 探针全部通过');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
