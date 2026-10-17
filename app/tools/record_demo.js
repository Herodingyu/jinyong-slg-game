// 金庸群侠大战 · 战斗演出录屏脚本
// 真实驱动游戏: 六脉神剑演出 → 敌方回合(自动反击处理) → 合体技MAP → 说得收服
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const DIR = '/tmp/jy-demo-frames';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 480000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => console.error('PAGE_EXC:', String(e).slice(0, 200)));
  await page.goto('http://localhost:8123', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);

  // ---- 截帧器: 全程并行录 ----
  let capturing = true, frameN = 0;
  const capture = (async () => {
    while (capturing) {
      const n = String(frameN++).padStart(4, '0');
      try { await page.screenshot({ path: `${DIR}/f${n}.jpg`, type: 'jpeg', quality: 82 }); } catch (e) {}
      await sleep(30);
    }
  })();

  let rect = null;
  const clickCell = async (x, y) => {
    if (!rect) rect = await page.evaluate(() => {
      const r = document.getElementById('cv').getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await page.mouse.click(rect.left + x * 64 + 32, rect.top + y * 64 + 32);
    await sleep(350);
  };
  const clickMenuItem = async (match) => {
    const ok = await page.evaluate((m) => {
      const btns = [...document.querySelectorAll('#actionMenu button')];
      const b = btns.find(b => b.textContent.includes(m));
      if (b) { b.click(); return true; } return false;
    }, match);
    await sleep(400); return ok;
  };
  const clickForecastItem = async (idx) => {
    await page.evaluate((i) => {
      const items = document.querySelectorAll('#fList .witem');
      if (items[i]) items[i].click();
    }, idx);
    await sleep(400);
  };
  // 自动处理反击询问: 弹窗就点"不还手"
  await page.evaluate(() => {
    setInterval(() => {
      const f = document.getElementById('forecast');
      if (f && !f.classList.contains('hidden')) {
        const items = f.querySelectorAll('#fList .witem');
        if (items.length) items[items.length - 1].click();
      }
    }, 300);
  });

  // ===== 开场 =====
  await sleep(1200);
  await page.evaluate(() => document.getElementById('startBtn').click());
  await sleep(1800);

  // ===== 第一幕: 段誉六脉神剑 =====
  await clickCell(6, 9);                       // 选段誉
  await clickCell(6, 4);                       // 移动到射程内
  await clickMenuItem('攻击');
  await clickForecastItem(0);                  // 六脉神剑(列表第1个可用)
  await clickCell(5, 2);                       // 打辽兵 → 触发完整演出
  await sleep(3200);                           // 演完+格子血条

  // ===== 第二幕: 萧峰降龙 =====
  await clickCell(5, 8);                       // 选萧峰
  await clickCell(5, 5);                       // 上移
  await clickMenuItem('攻击');
  await clickForecastItem(0);
  await clickCell(5, 2);                       // 打同一个辽兵(应该已被段誉打伤/击破,则打别的)
  await sleep(3000);

  // ===== 第三幕: 结束回合 → 敌方行动(可能运功) =====
  await page.evaluate(() => document.getElementById('endTurn').click());
  await sleep(9000);                           // 敌方逐个行动+反击自动处理

  // ===== 第四幕: 导演布置 → 合体技 MAP =====
  await sleep(800);
  await page.evaluate(() => {
    // 萧峰郭靖气势拉满
    G.units.find(u => u.key === 'xiaofeng').will = 125;
    G.units.find(u => u.key === 'guojing').will = 125;
    // 主角挪开, 敌人群聚到萧峰周边
    const hero = G.units.find(u => u.key === 'hero'); hero.x = 0; hero.y = 9;
    const duanyu = G.units.find(u => u.key === 'duanyu'); duanyu.x = 1; duanyu.y = 9;
    const xiaobao = G.units.find(u => u.key === 'xiaobao'); xiaobao.x = 2; xiaobao.y = 9;
    const foes = G.units.filter(u => u.side === 'enemy' && u.hp > 0);
    const spots = [[6,7],[5,7],[7,7],[6,6],[5,6]];
    foes.forEach((u, i) => { const s = spots[i % spots.length]; u.x = s[0]; u.y = s[1]; });
  });
  await sleep(500);
  await clickCell(5, 8);                       // 选萧峰
  await clickMenuItem('合体技');
  await clickCell(6, 7);                       // 合体技中心 → MAP 3x3 演出
  await sleep(4500);                           // 每个敌人一轮演出

  // ===== 第五幕: 韦小宝说得 =====
  await page.evaluate(() => {
    const lj = G.units.find(u => u.key === 'liaojiang' && u.hp > 0);
    if (lj) { lj.x = 5; lj.y = 8; lj.hp = 700; lj.acted = true; }
    const xb = G.units.find(u => u.key === 'xiaobao');
    xb.x = 4; xb.y = 8; xb.acted = false;
  });
  await sleep(400);
  await clickCell(4, 8);                       // 选韦小宝
  const spoke = await clickMenuItem('说得');
  if (spoke) await sleep(2200);

  // ===== 尾声: 全景 =====
  await sleep(1500);
  capturing = false;
  await capture;
  await browser.close();
  console.log('FRAMES:' + frameN);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
