// P2-13 移动序列重采 v2: 采样 MAP_MOVE 状态+郭靖绘制位, 按数据选帧
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const OUT = '/root/.openclaw/workspace/projects/jinyong-tactics/extracted/evidence/fday10_after';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 920, height: 700 });
  await p.goto('http://localhost:8124', { waitUntil: 'networkidle0' });
  await p.waitForFunction('typeof G !== "undefined" && G.units.length > 0', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await p.evaluate(() => { document.getElementById('intro').classList.add('hidden'); return true; });
  // 关键: evaluate 里不 await animUnitMove, 让它后台跑
  await p.evaluate(() => { const g = G.units.find(u => u.key === 'guojing'); animUnitMove(g, g.x, g.y - 3); return true; });
  const seen = { mid: false, dust: false, rest: false };
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const st = await p.evaluate(() => {
      const g = G.units.find(u => u.key === 'guojing');
      return { gx: g.x, gy: g.y, mv: !!MAP_MOVE, dust: FX.dust.length,
               my: MAP_MOVE && MAP_MOVE.u === g ? MAP_MOVE.y0 + (MAP_MOVE.y1 - MAP_MOVE.y0) * ((performance.now() - MAP_MOVE.t0) / MAP_MOVE.dur) : null };
    });
    const el = Date.now() - t0;
    console.log(el + 'ms', JSON.stringify(st));
    // 行进中段(插值小数) → mid
    if (!seen.mid && st.mv && st.my !== null && Math.abs(st.my - Math.round(st.my)) > 0.2) {
      seen.mid = true;
      await p.screenshot({ path: `${OUT}/mv_mid.jpg`, quality: 92 });
      console.log('  -> mv_mid.jpg');
    }
    // 落定后仍有尘 → dust
    if (!seen.dust && !st.mv && st.dust > 0) {
      seen.dust = true;
      await p.screenshot({ path: `${OUT}/mv_dust.jpg`, quality: 92 });
      console.log('  -> mv_dust.jpg');
    }
    if (!seen.rest && !st.mv && el > 700) {
      seen.rest = true;
      await p.screenshot({ path: `${OUT}/mv_rest.jpg`, quality: 92 });
      console.log('  -> mv_rest.jpg');
      break;
    }
    await new Promise(r => setTimeout(r, 25));
  }
  console.log('seen:', JSON.stringify(seen));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
