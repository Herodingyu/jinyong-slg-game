// F-Day15 P3-12 D3 道具系统 + D4 败北画面 全栈探针(Puppeteer 真实页面)
// ① 指令菜单出现「道具」 ② 道具菜单4件带库存 ③ UI路径金创药回血(库存扣/行动消耗) ④ 石灰粉UI路径挂dust+forecast降40
// ⑤ 道具栏随档走(刷新+读档恢复) ⑥ 败北画面=体面出口(读档回检查点, 非confirm+reload) ⑦ finishUnit buff到期集成
// 跑法: node tools/probe_fday15_items.js   (需 8124 端口服务)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('jy_fx', '0'); });
  await page.reload({ waitUntil: 'networkidle0' });

  const fail = m => { console.error('FAIL:', m); process.exit(1); };
  const assert = (c, m) => { if (!c) fail(m); console.log('ok:', m); };
  const clickText = (sel, txt) => page.evaluate((sel, txt) => {
    const el = Array.from(document.querySelectorAll(sel)).find(b => b.textContent.includes(txt));
    if (!el) return false; el.click(); return true;
  }, sel, txt);

  await page.click('#startBtn');
  await sleep(600);

  // ① 菜单出现「道具」
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaofeng');
    u.x = 5; u.y = 6;
    const r = document.getElementById('cv').getBoundingClientRect();
    window.__bb = { left: r.left, top: r.top };
  });
  const bb = await page.evaluate(() => window.__bb);
  await page.mouse.click(bb.left + 5 * 64 + 32, bb.top + 6 * 64 + 32);
  await sleep(300);
  const menuHas = await page.evaluate(() =>
    Array.from(document.getElementById('actionMenu').querySelectorAll('button')).map(b => b.textContent));
  assert(menuHas.some(t => t === '道具'), `指令菜单含「道具」 (${JSON.stringify(menuHas)})`);
  await page.screenshot({ path: 'evidence/fday15_after/menu.jpg', type: 'jpeg', quality: 88 });

  // ② 道具菜单: 4件带库存
  assert(await clickText('#actionMenu button', '道具'), '点开道具菜单');
  await sleep(250);
  const itemRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#fList .witem .wn')).map(d => d.textContent));
  assert(itemRows.length === 4 && itemRows.some(t => t.includes('金创药 ×2')) && itemRows.some(t => t.includes('石灰粉 ×1')),
    `道具菜单4件带库存 (${JSON.stringify(itemRows)})`);
  await page.screenshot({ path: 'evidence/fday15_after/item_menu.jpg', type: 'jpeg', quality: 88 });

  // ③ UI 金创药 → 郭靖(邻接布置): 回血+库存扣+行动消耗
  await page.evaluate(() => {
    const guo = G.units.find(v => v.key === 'guojing');
    const xf = G.units.find(v => v.key === 'xiaofeng');
    guo.x = xf.x; guo.y = xf.y + 1; // 与萧峰邻接
    guo.hp = 800;
    window.__expHeal = Math.round(guo.maxhp * 0.35);
  });
  assert(await clickText('#fList .witem', '金创药'), '选金创药');
  await sleep(250);
  const dbg1 = await page.evaluate(() => ({
    fHidden: document.getElementById('forecast').classList.contains('hidden'),
    rows: Array.from(document.querySelectorAll('#fList .witem')).map(d => d.textContent),
    guoPos: (() => { const g = G.units.find(v => v.key === 'guojing'); return [g.x, g.y]; })(),
    xfPos: (() => { const x = G.units.find(v => v.key === 'xiaofeng'); return [x.x, x.y]; })(),
  }));
  console.log('debug after 金创药:', JSON.stringify(dbg1));
  assert(await clickText('#fList .witem', '郭靖'), '选目标郭靖');
  await sleep(500);
  const heal = await page.evaluate(() => {
    const guo = G.units.find(v => v.key === 'guojing');
    const xf = G.units.find(v => v.key === 'xiaofeng');
    return { hp: guo.hp, stock: G.items.jinchuang, acted: xf.acted,
             logHas: document.getElementById('log').textContent.includes('金创药') };
  });
  assert(heal.hp === 800 + (await page.evaluate(() => window.__expHeal)), `郭靖回血 800→${heal.hp}`);
  assert(heal.stock === 1, `库存 2→1 (实得 ${heal.stock})`);
  assert(heal.acted === true, '使用道具消耗行动');
  assert(heal.logHas, '日志记录道具使用');

  // ④ 石灰粉: 韦小宝邻接辽兵 → UI使用 → dust挂敌 + forecast -40
  const dust = await page.evaluate(() => {
    const xb = G.units.find(v => v.key === 'xiaobao');
    const bing = G.units.find(v => v.key === 'liaobing' && v.hp > 0);
    // 清出邻接位
    bing.x = xb.x; bing.y = xb.y - 1;
    const f0 = forecast(bing, xb, WEAPONS.wandao);
    return { f0: f0.hitp };
  });
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaobao');
    Sel.unit = null;
    openMenu(u); // 直接开菜单(测试聚焦道具链, 不走选中移动)
  });
  await sleep(250);
  assert(await clickText('#actionMenu button', '道具'), '韦小宝菜单点道具');
  await sleep(200);
  assert(await clickText('#fList .witem', '石灰粉'), '选石灰粉');
  await sleep(200);
  assert(await clickText('#fList .witem', '辽兵'), '选目标辽兵');
  await sleep(500);
  const dust2 = await page.evaluate(() => {
    const bing = G.units.find(v => v.key === 'liaobing' && v.buffs.dust);
    const xb = G.units.find(v => v.key === 'xiaobao');
    return bing ? { dust: bing.buffs.dust, f1: forecast(bing, xb, WEAPONS.wandao).hitp, stock: G.items.shihui } : null;
  });
  assert(dust2 && dust2.dust === 40, '石灰粉挂 dust=40');
  assert(dust2.f1 === Math.max(5, dust.f0 - 40), `forecast 命中 ${dust.f0}→${dust2.f1}`);
  assert(dust2.stock === 0, '石灰粉库存 1→0');

  // ⑤ 道具栏随档走: 存(当前 金创药1/九花1/女儿红1/石灰粉0) → 污染 → 读档 → 恢复
  await page.evaluate(() => { G.items.jiuhua = 1; saveGame(true); }); // 用掉一件九花再存
  const savedItems = await page.evaluate(() => JSON.parse(localStorage.getItem('jy_save')).state.items);
  await page.evaluate(() => { G.items.jinchuang = 99; G.items.shihui = 7; }); // 污染
  await page.evaluate(() => loadGame());
  await sleep(400);
  const loadedItems = await page.evaluate(() => G.items);
  assert(JSON.stringify(loadedItems) === JSON.stringify(savedItems),
    `读档恢复道具栏 ${JSON.stringify(loadedItems)}`);

  // ⑥ 败北画面: 全灭 → 体面出口(无confirm) → 读档回检查点
  let dialogShown = false;
  page.on('dialog', () => { dialogShown = true; });
  await page.evaluate(() => {
    G.units.filter(v => v.side === 'player').forEach(v => { v.hp = 0; });
    checkEnd();
  });
  await sleep(1800);
  const loseShown = await page.evaluate(() =>
    !document.getElementById('loseModal').classList.contains('hidden'));
  assert(loseShown && !dialogShown, '败北画面出现(体面出口, 无原生confirm)');
  await page.screenshot({ path: 'evidence/fday15_after/lose.jpg', type: 'jpeg', quality: 88 });
  const turnBefore = await page.evaluate(() => G.turn);
  await page.click('#loseLoadBtn');
  await sleep(500);
  const revived = await page.evaluate(() => ({
    over: G.over, alive: G.units.filter(v => v.side === 'player' && v.hp > 0).length,
    modalHidden: document.getElementById('loseModal').classList.contains('hidden'),
    turn: G.turn,
  }));
  assert(revived.modalHidden && revived.over === false && revived.alive === 5,
    `读档回检查点: 我方${revived.alive}人复活 over=${revived.over}`);
  await page.screenshot({ path: 'evidence/fday15_after/loaddone.jpg', type: 'jpeg', quality: 88 });

  // ⑦ finishUnit buff到期集成: 给萧峰挂上回合buff+上一回合标记 → finishUnit → 清除
  const exp = await page.evaluate(() => {
    const xf = G.units.find(v => v.key === 'xiaofeng');
    xf.buffs.dmg2 = true; xf.buffs._castTurn = G.turn - 1;
    finishUnit(xf, true);
    return { gone: xf.buffs.dmg2 === undefined, acted: xf.acted };
  });
  assert(exp.gone, 'finishUnit 集成 buff 到期(AUDIT#46)');

  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
  if (errs.length) process.exit(1);
  console.log('F-Day15 道具系统+败北画面 全栈探针全部通过');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
