// 水墨关节人样片截帧: puppet_demo.html 确定性钉帧 0~2500ms 每 100ms 一张
// 跑法: node tools/capture_puppet.js   （自带 8156 静态服务, 用完即关）
'use strict';
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const PORT = 8156;
const ROOT = path.join(__dirname, '..');
const DIR = path.join(__dirname, '..', '..', 'evidence', 'puppet_demo');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}
(async () => {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
  const srv = await serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 940, height: 580 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (let t = 0; t <= 2500; t += 100) {
    await page.goto(`http://127.0.0.1:${PORT}/tools/puppet_demo.html?t=${t}`, { waitUntil: 'networkidle0' });
    const label = String(t).padStart(4, '0');
    await page.screenshot({ path: `${DIR}/p${label}.jpg`, type: 'jpeg', quality: 85 });
  }
  console.log('captured ->', DIR, errors.length ? ('PAGEERR: ' + errors.join('; ')) : 'no pageerror');
  await browser.close();
  srv.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
