// 探针2: 演出开关关闭时, 点开始应直接开战(无标题卡/对白/出击)
const path = require('path');
const puppeteer = require(path.join('/usr/lib/node_modules/url-to-markdown-cli-tool', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewport({ width: 920, height: 700 });
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(600);
  // 开场模态框会挡住顶栏按钮, 直接改开关变量验证 fxOff 路径
  await page.evaluate(() => { fxOn = false; });
  await page.click('#startBtn');
  await sleep(400);
  const st = await page.evaluate(() => ({ TITLE: TITLE.active, DLG: DLG.active, SORTIE: SORTIE.active, INTRO: INTRO.active, fxOn }));
  console.log('fxOff 开局状态:', JSON.stringify(st));
  await page.screenshot({ path: '/root/.openclaw/workspace/projects/jinyong-tactics/extracted/evidence/fday7_after/09_fxoff_direct.jpg', type: 'jpeg', quality: 88 });
  await page.evaluate(() => { fxOn = true; });
  await sleep(200);
  const st2 = await page.evaluate(() => ({ fxOn }));
  console.log('恢复演出开关:', JSON.stringify(st2));
  console.log(errors.length ? 'WITH PAGE ERRORS: ' + errors.join('; ') : 'no pageerror');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
