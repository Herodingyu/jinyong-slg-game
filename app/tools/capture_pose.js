// PosePlayer 演示截帧工具（B方案验收，2026-10-30）
// 独立 demo 页(tools/pose_demo.html)确定性播放 萧峰 idle→ready→strike→hit 序列，
// 按 200ms 间隔截 12 帧存 evidence/pose_player/*.jpg，供逐张目验"姿势可辨"。
// 跑法: node tools/capture_pose.js   （在 app/ 目录下运行；端口 8156，用完即关）
'use strict';
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8156; // 铁律: 8156 起，不许占 8123/8124
const ROOT = path.join(__dirname, '..');
const DIR = path.join(__dirname, '..', '..', 'evidence', 'pose_player');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

// 零依赖静态服务（只读项目文件，不联网）
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        rsp.writeHead(404); rsp.end('404'); return;
      }
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
  await page.setViewport({ width: 700, height: 560 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // poses/ 前置目录探测必然产生 404（设计内的回退探测），404 资源加载不视为失败；
  // 真正的加载结果由下方 __poseInfo 明细呈现。其余 console 错误照常收。
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text()))
      errors.push('console: ' + m.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/tools/pose_demo.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.__demoReady', { timeout: 15000 });
    await page.evaluate('window.__demoReady'); // 等姿势图全部落定
    const info = await page.evaluate('window.__poseInfo');
    console.log('姿势图加载明细:', JSON.stringify(info));
    const canvas = await page.$('#cv');
    for (let i = 0; i < 12; i++) {
      const t = i * 200; // 0,200,…,2200ms
      await page.evaluate(tt => window.__seek(tt), t);
      const f = path.join(DIR, `f${String(i + 1).padStart(2, '0')}_t${String(t).padStart(4, '0')}ms.jpg`);
      await canvas.screenshot({ path: f, type: 'jpeg', quality: 92 });
      console.log('OK', f);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length) {
    console.error('页面错误:'); errors.forEach(e => console.error(' ', e));
    process.exit(1);
  }
  console.log('12 帧截图完成，无 pageerror。目验: evidence/pose_player/');
})().catch(e => { console.error(e); process.exit(1); });
