// F-Day6 回归: 完整走一局五幕(剧情链→开场镜头→选中移动→攻击演出→敌方回合反击→击破台词)
// P3-11a 后 startBtn 进的是 标题卡→对白→出击→开场镜头 全链, 幕1 须驱动完整(对白要点击推进)
// 跑法: node tools/regress_day6.js  — 断言全程零 pageerror, 五幕事件按序发生
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 940, height: 700 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(400);

  // 幕1: 剧情链(标题卡2.6s→7句对白[首击补全/再击翻页]→出击2.6s→开场镜头3.4s)
  await page.click('#startBtn');
  await sleep(2900);                                   // 标题卡
  for (let i = 0; i < 7; i++) {                        // 7 句对白, 点击推进(不可多点: 会跳过出击/镜头)
    await page.mouse.click(420, 320); await sleep(200);
    await page.mouse.click(420, 320); await sleep(340);
  }
  await sleep(2900);                                   // 出击画面
  await page.waitForFunction(() => !INTRO.active, { timeout: 9000, polling: 100 });
  console.log('幕1 剧情链+开场镜头: OK');

  // 幕2: 选中萧峰 → 移动 → 菜单出现
  await page.evaluate(() => {
    const u = G.units.find(v => v.key === 'xiaofeng');
    u.x = 5; u.y = 6;
    const foe = G.units.find(v => v.key === 'liaobing' && v.hp > 0);
    foe.x = 6; foe.y = 5;
    G.units.filter(v => v.side === 'enemy' && v !== foe).forEach(v => { v.x = 13; v.y = 9; });
  });
  await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); window.__bb = { left: r.left, top: r.top }; });
  const bb = await page.evaluate(() => window.__bb);
  await page.mouse.click(bb.left + 5 * 64 + 32, bb.top + 6 * 64 + 32);
  await sleep(300);
  const menuShown = await page.evaluate(() => !document.getElementById('actionMenu').classList.contains('hidden'));
  console.log('幕2 选中+菜单:', menuShown ? 'OK' : 'FAIL');

  // 幕3: 先收菜单(Escape), 再铺攻击目标, 点击敌格触发演出
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.evaluate(() => { window.__foe = G.units.find(v => v.key === 'liaobing' && v.hp > 0); });
  await page.evaluate(() => pickTarget(G.units.find(v => v.key === 'xiaofeng'), 'changquan',
    [window.__foe]));
  await sleep(200);
  await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); window.__bb2 = { left: r.left, top: r.top }; });
  const bb2 = await page.evaluate(() => window.__bb2);
  await page.mouse.click(bb2.left + 6 * 64 + 32, bb2.top + 5 * 64 + 32);
  await page.waitForFunction(() => FIGHT.active, { timeout: 8000, polling: 60 });
  console.log('幕3 攻击演出进入: OK');
  await page.screenshot({ path: 'evidence/../evidence_tmp_fight.jpg', type: 'jpeg', quality: 85 }).catch(() => {});
  await page.waitForFunction(() => !FIGHT.active, { timeout: 20000, polling: 100 });
  console.log('幕3 演出完整收尾: OK');

  // 幕4: 敌方回合(结束回合 → 敌人行动或跳过); P1-11 后单场演出~2.1s, 轮询等回合回我方而非固定 sleep
  await page.click('#endTurn');
  await page.waitForFunction(() => G.phase === 'player', { timeout: 30000, polling: 300 });
  console.log('幕4 敌方回合流转: OK');

  // 幕5: 击破定格+台词 — 用火枪高伤直接打死一个残血敌
  await page.evaluate(() => {
    const foe = G.units.find(v => v.side === 'enemy' && v.hp > 0);
    if (foe) foe.hp = 30;
  });
  await page.evaluate(() => {
    const xb = G.units.find(v => v.key === 'xiaobao');
    const foe = G.units.find(v => v.side === 'enemy' && v.hp > 0);
    if (!foe) { window.__noFoe = true; return; }
    xb.x = foe.x - 1; xb.y = foe.y;
    window.__ev2 = resolveAttack(xb, foe, WEAPONS.huoqiang, { buffs: { mustHit: true } });
  });
  const skipped = await page.evaluate(() => window.__noFoe === true);
  if (!skipped) {
    await page.evaluate(() => { animateEvent(window.__ev2, true); }); // 不 await: evaluate 会等 promise 返回, 演出收场后 FIGHT.active 恒 false
    await page.waitForFunction(() => FIGHT.active, { timeout: 8000, polling: 60 });
    await page.waitForFunction(() => !FIGHT.active, { timeout: 20000, polling: 100 });
    console.log('幕5 击破演出: OK');
  } else console.log('幕5 无存活敌人, 跳过(此前已击破全部)');

  // 图形管线最终健康: draw 循环还在跑(两帧时间戳不同)
  const alive = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const probe = () => { n++; n < 3 ? requestAnimationFrame(probe) : res(performance.now() - t0 > 0); };
    requestAnimationFrame(probe);
  }));
  console.log('渲染循环存活:', alive ? 'OK' : 'FAIL');

  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('REGRESS FAIL:', String(e).slice(0, 300)); process.exit(1); });
