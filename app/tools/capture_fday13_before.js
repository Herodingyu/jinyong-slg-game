// F-Day13 改前证据: 面板无等级/经验、顶栏无存档/读档(P3-12 D1/D2 落地前现状)
// 跑法: node tools/capture_fday13_before.js (需 localhost:8124 服务)
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = path.join(__dirname, '../evidence/fday13_before');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);
  // 顶栏: 无 存档/读档 按钮
  await page.screenshot({ path: path.join(dir, 'topbar.jpg') });
  // 选中面板: 无 Lv/经验 行
  await page.evaluate(() => showInfo(G.units.find(u => u.key === 'xiaofeng')));
  await sleep(200);
  await page.screenshot({ path: path.join(dir, 'panel.jpg') });
  await browser.close();
  console.log('before shots ->', dir);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
