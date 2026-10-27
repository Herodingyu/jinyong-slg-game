// F-Day11 改前证据: 当前过关流程(banner + 原生 alert, 无评价结算画面)
// 跑法: node tools/capture_fday11_before.js
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'evidence', 'fday11_before');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  // 原生 alert 出现时记录文本即接受(dialog 打开时截图会挂起, 不截);
  // 接受后战场没有任何结算画面=改前体验断裂的核心证据
  let dialogInfo = '';
  page.on('dialog', async d => {
    dialogInfo = d.type() + ': ' + d.message().slice(0, 80).replace(/\n/g, ' / ');
    await d.accept();
  });
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('intro').classList.add('hidden');
    if (typeof INTRO !== 'undefined') INTRO.active = false;
  });
  await sleep(400);

  // 直接布置一场击破: 萧峰贴身段延庆, 残血, 必中一拳
  await page.evaluate(() => {
    const att = G.units.find(v => v.key === 'xiaofeng');
    const boss = G.units.find(v => v.boss);
    att.x = boss.x - 1; att.y = boss.y;
    boss.hp = 30;
    window.__ev = resolveAttack(att, boss, WEAPONS.changquan, { buffs: { mustHit: true } });
  });
  const killed = await page.evaluate(() => window.__ev.killed === true);
  console.log('布置击破 killed =', killed);
  await page.evaluate(() => { animateEvent(window.__ev, true); });
  await sleep(1300); // 击破定格帧(banner 将出)
  await page.screenshot({ path: `${DIR}/victory_killfreeze.jpg`, type: 'jpeg', quality: 85 });
  await sleep(1200);
  await page.screenshot({ path: `${DIR}/victory_banner.jpg`, type: 'jpeg', quality: 85 }); // 击破 banner 帧
  await sleep(1900); // banner 后 1.5s 弹 alert, 事件回调接受
  await page.screenshot({ path: `${DIR}/after_alert.jpg`, type: 'jpeg', quality: 85 }); // alert 已接受: 战场无结算画面
  await sleep(400);
  console.log('dialog =', dialogInfo || '(未捕获)');
  console.log('RESULT state =', await page.evaluate(() => typeof RESULT !== 'undefined' ? RESULT.active : 'N/A'));
  console.log(errs.length ? `PAGEERROR ×${errs.length}: ${errs.join(' | ')}` : '零页面异常');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
