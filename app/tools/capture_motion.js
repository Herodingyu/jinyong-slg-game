// 战斗动作加密截帧（200ms 步进 flipbook，诊断"人物不会动"用）
// 跑法: node tools/capture_motion.js <案例名>   （需 8124 静态服务；端口 8156 起，用完即关）
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const CASES = {
  // 名称: [攻方key, 守方key, 武器id, 事件补丁, 截帧终点ms]
  xianglong: ['xiaofeng', 'duanyq',   'xianglong', { type: 'hit', dmg: 400, isCrit: false, killed: false }, 3800],
  liuzmai:   ['xiaofeng', 'liaojiang','liumai',    { type: 'hit', dmg: 400, isCrit: false, killed: false }, 3800],
  dagou:     ['xiaofeng', 'guojing',  'dagou',     { type: 'hit', dmg: 400, isCrit: false, killed: false }, 3800],
};
const NAME = process.argv[2] || 'xianglong';
const [ak, dk, wid, patch, END] = CASES[NAME];
const PORT = 8156;
const ROOT = path.join(__dirname, '..');
const DIR = path.join(__dirname, '..', '..', 'evidence', 'motion_' + NAME);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 920, height: 700 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.getElementById('intro').classList.add('hidden'));
  await sleep(400);
  await page.evaluate(([ak, dk, wid, patch]) => {
    const att = G.units.find(u => u.key === ak && u.hp > 0);
    const def = G.units.find(u => u.key === dk && u.hp > 0);
    att.x = Math.max(0, def.x - 1); att.y = def.y;
    window.__ev = { att, def, w: WEAPONS[wid], ...patch };
  }, [ak, dk, wid, patch]);
  await page.evaluate(() => { animateEvent(window.__ev); });
  for (let off = 200; off <= END; off += 200) {
    await page.waitForFunction(o => typeof FIGHT !== 'undefined' && FIGHT.active && (performance.now() - FIGHT.t0) >= o,
      { timeout: 15000, polling: 30 }, off).catch(() => {});
    const label = String(off).padStart(4, '0');
    await page.screenshot({ path: `${DIR}/m${label}.jpg`, type: 'jpeg', quality: 82 });
  }
  console.log('captured', NAME, '->', DIR);
  await browser.close();
  srv.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
