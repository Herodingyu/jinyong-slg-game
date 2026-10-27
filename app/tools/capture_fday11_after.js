// F-Day11 改后证据: P3-11b 评价结算画面分期截帧 + 计数真实性核对 + 点击重开
// 场景布置: 先真实击破1敌(resolveAttack) + 说得1将(doSpeak) + G.turn=7(S档线内) → 再击破BOSS
// 跑法: node tools/capture_fday11_after.js
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday11_after');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('dialog', async d => { errs.push('意外原生弹窗: ' + d.message().slice(0, 60)); await d.accept(); });
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('intro').classList.add('hidden');
    if (typeof INTRO !== 'undefined') INTRO.active = false;
  });
  await sleep(400);

  // 布置真实战绩: 击破辽兵1(我方攻击) + 说得辽将(韦小宝) + 回合7
  const setup = await page.evaluate(async () => {
    const att = G.units.find(v => v.key === 'xiaofeng');
    const b1 = G.units.find(v => v.key === 'liaobing');
    att.x = b1.x - 1; att.y = b1.y; b1.hp = 10;
    const ev1 = resolveAttack(att, b1, WEAPONS.changquan, { buffs: { mustHit: true } });
    const xb = G.units.find(v => v.key === 'xiaobao');
    const lj = G.units.find(v => v.key === 'liaojiang');
    lj.hp = Math.round(lj.maxhp * 0.25); xb.x = lj.x - 1; xb.y = lj.y;
    await doSpeak(xb, lj);
    G.turn = 7;
    return { ev1Killed: ev1.killed === true, stats: { ...G.stats } };
  });
  console.log('布置: 击破1敌 killed =', setup.ev1Killed, 'stats =', JSON.stringify(setup.stats));

  // 击破 BOSS 触发结算
  await page.evaluate(() => {
    const att = G.units.find(v => v.key === 'xiaofeng');
    const boss = G.units.find(v => v.boss);
    att.x = boss.x - 1; att.y = boss.y; boss.hp = 30;
    window.__ev = resolveAttack(att, boss, WEAPONS.changquan, { buffs: { mustHit: true } });
    animateEvent(window.__ev, true);
  });
  await page.waitForFunction(() => RESULT.active === true, { timeout: 15000, polling: 100 });
  console.log('结算画面已激活, stats =', await page.evaluate(() => JSON.stringify(G.stats)));

  // 分期截帧: 章名入场 / 战绩三行 / 评价大字弹入 / 完全落定
  await sleep(350);
  await page.screenshot({ path: `${DIR}/result_0300_chapter.jpg`, type: 'jpeg', quality: 85 });
  await sleep(900);
  await page.screenshot({ path: `${DIR}/result_1200_stats.jpg`, type: 'jpeg', quality: 85 });
  await sleep(1100);
  await page.screenshot({ path: `${DIR}/result_2300_rank.jpg`, type: 'jpeg', quality: 85 });
  await sleep(2000);
  await page.screenshot({ path: `${DIR}/result_4300_settled.jpg`, type: 'jpeg', quality: 85 });

  // 点击重开: RESULT.active → location.reload
  await page.mouse.click(450, 400);
  await sleep(1500);
  const re = await page.evaluate(() => ({ turn: G.turn, result: RESULT.active, stats: JSON.stringify(G.stats) }));
  console.log('点击重开:', re.turn === 1 && re.result === false ? 'OK' : 'FAIL', JSON.stringify(re));
  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
