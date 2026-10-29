// F-Day13 改后定妆: 顶栏新按钮 + 信息面板 Lv/经验行
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('jy_fx', '0'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#startBtn');
  await sleep(700);
  // 点萧峰看面板(带 Lv/经验)
  await page.evaluate(() => showInfo(G.units.find(u => u.key === 'xiaofeng')));
  await sleep(300);
  const el = await page.$('#unitInfo');
  await el.screenshot({ path: 'evidence/fday13/after_panel.png' });
  // 手动存档横幅
  await page.click('#saveBtn');
  await sleep(350);
  await page.screenshot({ path: 'evidence/fday13/after_save_banner.png' });
  await browser.close();
  console.log('after shots ok');
})();
