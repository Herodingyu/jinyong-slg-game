// 探针: 攻击菜单 → 预测列表出现时序诊断
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  p.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 300)));
  await p.goto('http://localhost:8123', { waitUntil: 'networkidle0' });
  await sleep(800);
  await p.evaluate(() => document.getElementById('startBtn').click());
  for (let i = 0; i < 60; i++) {
    const done = await p.evaluate(() => !(TITLE.active || DLG.active || SORTIE.active));
    if (done) break;
    await p.mouse.click(640, 400);
    await sleep(300);
  }
  await sleep(800);
  const rect = await p.evaluate(() => document.getElementById('cv').getBoundingClientRect().toJSON());
  const clickCell = async (x, y) => p.mouse.click(rect.left + x * 64 + 32, rect.top + y * 64 + 32);
  await clickCell(6, 9);   // 选段誉
  await sleep(300);
  console.log('after select:', await p.evaluate(() => JSON.stringify({ sel: Sel.unit && Sel.unit.key, menu: !document.getElementById('actionMenu').classList.contains('hidden') })));
  await clickCell(7, 5);   // 移动
  for (let i = 0; i < 30; i++) {
    const st = await p.evaluate(() => JSON.stringify({ mv: !!MAP_MOVE, menu: !document.getElementById('actionMenu').classList.contains('hidden'), du: (() => { const u = G.units.find(v => v.key === 'duanyu'); return u.x + ',' + u.y + ' acted=' + u.acted; })() }));
    console.log(i * 150 + 'ms', st);
    if (JSON.parse(st).menu) break;
    await sleep(150);
  }
  const atk = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#actionMenu button')].find(b => b.textContent.includes('攻击'));
    if (b) { b.click(); return b.textContent; } return null;
  });
  console.log('atk btn:', atk);
  for (let i = 0; i < 20; i++) {
    const st = await p.evaluate(() => JSON.stringify({ fx: !document.getElementById('forecast').classList.contains('hidden'), items: [...document.querySelectorAll('#fList .witem')].map(w => w.textContent.trim()).slice(0, 4) }));
    console.log('fx-poll', i * 150 + 'ms', st);
    if (JSON.parse(st).fx) break;
    await sleep(150);
  }
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
