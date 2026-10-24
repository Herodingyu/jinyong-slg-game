// 金庸群侠大战 · 战斗演出录屏脚本
// 真实驱动游戏: 六脉神剑演出 → 萧峰降龙 → 敌方回合(自动反击处理) → 说得收服 → 合体技MAP
// 每一步带 VERIFY 自检, 失败即打印 FAIL 日志(不再静默翻车)
// 坐标依据(2026-10-24 版 f407fe3 实测):
//   段誉 mov5 被主角(6,8)卡位, 够不到辽兵(5,2); 改打辽兵3(7,2): 移动(7,5)+六脉rng[2,4]距离3 ✓
//   萧峰武功最大射程 2(降龙), 须移到(5,4)才够得着(5,2)
//   说得位置动态选相邻空格, 避免与郭靖(4,8)叠格被 find 抢先选中
//   合体技要求萧峰郭靖相邻且未行动; 导演布置负责重置 acted 并传送郭靖
const puppeteer = require('/usr/lib/node_modules/url-to-markdown-cli-tool/node_modules/puppeteer');
const fs = require('fs');
const DIR = '/tmp/jy-demo-frames';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
fs.readdirSync(DIR).forEach(f => fs.unlinkSync(DIR + '/' + f));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const scene = (s) => console.log('SCENE: ' + s);
const verify = (name, ok, detail) => console.log(`VERIFY ${name}: ${ok ? 'OK' : 'FAIL'} ${detail || ''}`);

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

  // 等战斗演出/剧情演出/回合推进全部收场(固定 sleep 在 P1-11 后不可靠)
  const waitIdle = async (timeout = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const busy = await page.evaluate(() => !!(FIGHT.active || TITLE.active || DLG.active || SORTIE.active || G.phase !== 'player' || G.over));
      if (!busy) return true;
      await sleep(250);
    }
    console.log('WARN: waitIdle 超时');
    return false;
  };

  let rect = null;
  const clickCell = async (x, y) => {
    if (!rect) rect = await page.evaluate(() => {
      const r = document.getElementById('cv').getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await page.mouse.click(rect.left + x * 64 + 32, rect.top + y * 64 + 32);
    await sleep(350);
  };
  // 只点可见菜单按钮(隐藏的旧按钮点了会复活旧选中态)
  const clickMenuItem = async (match) => {
    const ok = await page.evaluate((m) => {
      const menu = document.getElementById('actionMenu');
      if (!menu || menu.classList.contains('hidden')) return false;
      const b = [...menu.querySelectorAll('button')].find(b => b.textContent.includes(m));
      if (b) { b.click(); return true; } return false;
    }, match);
    await sleep(400); return ok;
  };
  // 按文字选预测列表项(武功), 可见才点
  const pickWeapon = async (match) => {
    const ok = await page.evaluate((m) => {
      const f = document.getElementById('forecast');
      if (!f || f.classList.contains('hidden')) return false;
      const it = [...f.querySelectorAll('#fList .witem')].find(w => w.textContent.includes(m));
      if (it) { it.click(); return true; } return false;
    }, match);
    await sleep(400); return ok;
  };
  const unitState = (key) => page.evaluate((k) => {
    const u = G.units.find(v => v.key === k);
    return u ? { x: u.x, y: u.y, hp: u.hp, acted: u.acted, side: u.side, will: u.will } : null;
  }, key);

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

  // ===== 开场(跳过 P3-11a 剧情演出) =====
  await sleep(1200);
  await page.evaluate(() => document.getElementById('startBtn').click());
  scene('开始战斗 clicked');
  for (let i = 0; i < 60; i++) {
    const introDone = await page.evaluate(() => !(TITLE.active || DLG.active || SORTIE.active));
    if (introDone) break;
    await page.mouse.click(640, 400);
    await sleep(300);
  }
  scene('剧情演出收场 ' + await page.evaluate(() => JSON.stringify({ TITLE: TITLE.active, DLG: DLG.active, SORTIE: SORTIE.active })));
  await sleep(800);

  // ===== 第一幕: 段誉六脉神剑 → 辽兵3(7,2) =====
  scene('幕1 段誉六脉神剑');
  await clickCell(6, 9);                       // 选段誉
  await clickCell(7, 5);                       // 移动(在mov5范围内, 距(7,2)三格)
  const menu1 = await clickMenuItem('攻击');
  const wp1 = await pickWeapon('六脉');
  await clickCell(7, 2);                       // 打辽兵3
  await waitIdle();
  const dySt = await unitState('duanyu');
  const lb3St = await unitState('liaobing3');
  verify('幕1攻击', menu1 && dySt.acted && lb3St.hp < 2200,
    `menu=${menu1} wp=${wp1}(自动反击interval代点) duanyu=(${dySt.x},${dySt.y}) acted=${dySt.acted} liaobing3 hp=${lb3St.hp}`);
  await sleep(600);

  // ===== 第二幕: 萧峰降龙 → 辽兵(5,2) =====
  scene('幕2 萧峰降龙');
  await page.evaluate(() => { G.units.find(u => u.key === 'xiaofeng').will = 125; }); // 降龙需气势110, 开局100, 导演补满
  await clickCell(5, 8);                       // 选萧峰
  await clickCell(5, 4);                       // 前移(距(5,2)两格, 降龙rng[1,2]可达)
  const menu2 = await clickMenuItem('攻击');
  const wp2 = await pickWeapon('降龙');
  await clickCell(5, 2);
  await waitIdle();
  const xfSt = await unitState('xiaofeng');
  const lbSt = await unitState('liaobing');
  verify('幕2攻击', menu2 && xfSt.acted && lbSt.hp < 2200,
    `menu=${menu2} wp=${wp2}(自动反击interval代点) xiaofeng=(${xfSt.x},${xfSt.y}) acted=${xfSt.acted} liaobing hp=${lbSt.hp}`);
  await sleep(600);

  // ===== 第三幕: 结束回合 → 敌方行动 =====
  scene('幕3 敌方回合');
  await page.evaluate(() => document.getElementById('endTurn').click());
  await waitIdle(90000);
  scene('幕3 敌方回合结束');

  // ===== 第四幕: 韦小宝说得 =====
  scene('幕4 韦小宝说得');
  const spot = await page.evaluate(() => {
    const xb = G.units.find(u => u.key === 'xiaobao');
    const lj = G.units.find(u => u.key === 'liaojiang' && u.hp > 0);
    if (!lj) return null;
    const occ = (x, y) => G.units.some(u => u.hp > 0 && u.x === x && u.y === y && u !== xb && u !== lj);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 13; x++) {
      if (!occ(x, y) && !occ(x + 1, y)) {
        xb.x = x; xb.y = y; lj.x = x + 1; lj.y = y;
        lj.hp = Math.min(lj.hp, 700);
        return { x, y };
      }
    }
    return null;
  });
  if (spot) {
    await sleep(300);
    await clickCell(spot.x, spot.y);           // 选韦小宝(独占空格, 不会误选别人)
    const spoke = await clickMenuItem('说得');
    await waitIdle();
    await sleep(1500);
    const ljSt = await unitState('liaojiang');
    verify('幕4说得', spoke && ljSt && ljSt.side === 'player', `spoke=${spoke} liaojiang side=${ljSt && ljSt.side} hp=${ljSt && ljSt.hp}`);
  } else verify('幕4说得', false, 'liaojiang 已阵亡, 无说得目标');
  await sleep(600);

  // ===== 第五幕: 导演布置 → 合体技 MAP =====
  scene('幕5 导演布置+合体技MAP');
  await waitIdle(90000);
  const comboSpot = await page.evaluate(() => {
    const xf = G.units.find(u => u.key === 'xiaofeng');
    const gj = G.units.find(u => u.key === 'guojing');
    if (!xf || !gj) return null;
    xf.acted = false; xf.will = 125; gj.will = 125; // 导演权限: 重置行动与气势
    const occ = (x, y, skip) => G.units.some(u => u.hp > 0 && u.x === x && u.y === y && u !== skip);
    // 郭靖挪到萧峰邻格
    let gjMoved = false;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = xf.x + dx, ny = xf.y + dy;
      if (nx >= 0 && nx < 14 && ny >= 0 && ny < 10 && !occ(nx, ny, gj)) { gj.x = nx; gj.y = ny; gjMoved = true; break; }
    }
    if (!gjMoved) return null;
    // 存活敌人群聚到萧峰周边
    const foes = G.units.filter(u => u.side === 'enemy' && u.hp > 0);
    const offs = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [-2, 0], [2, 0]];
    let oi = 0;
    const placed = [];
    for (const f of foes) {
      while (oi < offs.length) {
        const nx = xf.x + offs[oi][0], ny = xf.y + offs[oi][1]; oi++;
        if (nx >= 0 && nx < 14 && ny >= 0 && ny < 10 && !occ(nx, ny, f)) {
          f.x = nx; f.y = ny; placed.push([nx, ny]); break;
        }
      }
    }
    if (!placed.length) return null;
    return { fx: xf.x, fy: xf.y, cx: placed[0][0], cy: placed[0][1] };
  });
  if (comboSpot) {
    await sleep(400);
    await clickCell(comboSpot.fx, comboSpot.fy); // 选萧峰
    const comboMenu = await clickMenuItem('合体技');
    await clickCell(comboSpot.cx, comboSpot.cy); // 合体技中心(敌人格)
    await waitIdle(90000);
    const foesSt = await page.evaluate(() => JSON.stringify(G.units.filter(u => u.side === 'enemy' && u.hp > 0).map(u => u.key + ':' + u.hp)));
    verify('幕5合体技', comboMenu, `menu=${comboMenu} 存活敌=${foesSt}`);
  } else verify('幕5合体技', false, '导演布置失败(萧峰/郭靖状态异常)');
  await sleep(800);

  // ===== 尾声: 全景 =====
  scene('尾声');
  await sleep(1500);
  capturing = false;
  await capture;
  await browser.close();
  console.log('FRAMES:' + frameN);
  scene('录屏结束');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
