// 探针: 点击开始后每 300ms 采样演出状态, 定位标题卡提前消失原因
const path = require('path');
const puppeteer = require(path.join('/usr/lib/node_modules/url-to-markdown-cli-tool', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 920, height: 700 });
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);
  await page.click('#startBtn');
  const t0 = Date.now();
  for (let i = 0; i < 14; i++) {
    const st = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      TITLE: TITLE.active, DLG: DLG.active, INTRO: INTRO.active, SORTIE: SORTIE.active,
      pulse: inputPulse, idx: DLG.idx,
    }));
    console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(st));
    await sleep(300);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
