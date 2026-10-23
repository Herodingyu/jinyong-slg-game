// P3-11a 剧情演出(标题卡/对白框/出击画面) · 改前/改后截帧工具
// 跑法: node tools/capture_story.js <before|after>
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const MODE = process.argv[2] || 'after';
const DIR = '/root/.openclaw/workspace/projects/jinyong-tactics/extracted/evidence/fday7_' + MODE;
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
else fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 240000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 920, height: 700 });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.error('PAGE_EXC:', String(e).slice(0, 300)); });
  await page.goto('http://localhost:8124', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(500);

  const shot = n => page.screenshot({ path: `${DIR}/${n}.jpg`, type: 'jpeg', quality: 85 });

  if (MODE === 'before') {
    // 旧流程: HTML 开场 modal → 踏入江湖 → 横幅+镜头扫场
    await shot('01_intro_modal');
    await page.click('#startBtn');
    await sleep(900);
    await shot('02_start_camera');
    await sleep(2600);
    await shot('03_map_idle');
  } else {
    // 新流程: 标题卡(擦拭中段/完成) → 对白(打字中段/完成/翻页) → 出击 → 战场
    await page.click('#startBtn');
    await sleep(1000);
    await shot('01_title_wipe');
    await sleep(900); // ≈1900ms: 擦拭完成(1500ms)且未进淡出(2100ms), 稳定持帧
    await shot('02_title_hold');
    await sleep(1400); // 标题卡 2.6s 收场 → 镜头+对白开始
    await shot('03_dlg_typing');
    await sleep(2600); // 等第一句打完
    await shot('04_dlg_full');
    await page.mouse.click(460, 660); // 点下一句
    await sleep(900);
    await shot('05_dlg_line2');
    // 逐句过完: 只要对白还开着就点(补全+翻页), 不给多余脉冲(否则会把出击画面点掉)
    let portraitTaken = false;
    for (let i = 0; i < 30; i++) {
      const st = await page.evaluate(() => ({ dlg: DLG.active, idx: DLG.idx }));
      if (!st.dlg) break;
      if (st.idx === 3 && !portraitTaken) { // 第4句=萧峰, 验证立绘半身取景
        await sleep(700);
        await shot('05b_dlg_portrait');
        portraitTaken = true;
      }
      await page.mouse.click(460, 660);
      await sleep(250);
    }
    await sleep(500);
    await shot('06_sortie');       // 名册滑入中段
    await sleep(1500);
    await shot('07_sortie_pop');   // 「出击！」爆字
    await sleep(800);
    await shot('08_play_begin');   // 开战横幅(1.2s 内)
    // 验证游戏可玩: 选中萧峰
    await page.evaluate(() => { const u = G.units.find(v => v.key === 'xiaofeng'); u.x = 5; u.y = 8; });
    await page.mouse.click(5 * 64 + 40, 8 * 64 + 40);
    await sleep(400);
    await shot('08_select_unit');
  }
  console.log('captured ->', DIR, errors.length ? 'WITH PAGE ERRORS' : 'no pageerror');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
