// ============ 表现层: 渲染/输入/演出 ============
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const TS = 64; // 32px素材 x2放大渲染
const SPRITE = {};

const tileImg = new Image();
tileImg.src = 'assets/tiles.png';
const sprites = {};
['xiaofeng','guojing','duanyu','xiaobao','hero','liaobing','liaojiang','duanyq'].forEach(k => {
  const im = new Image(); im.src = 'assets/units/' + k + '.png'; sprites[k] = im;
});
// 战斗立绘(assets/portraits/ 现有5张; 无立绘的角色自动回退旧式演出)
const portraits = {};
['xiaofeng','guojing','duanyu','xiaobao','duanyq'].forEach(k => {
  const im = new Image(); im.src = 'assets/portraits/' + k + '.png'; portraits[k] = im;
});
// 机战式演出台词状态: draw() 每帧读取, 时间轴由 animateEvent 写入
// P3-11: 演出/音乐/反击三开关持久化到 localStorage; node 测试台无 localStorage 时静默降级
const _store = (typeof localStorage !== 'undefined') ? localStorage : null;
function loadSwitch(key, dft) {
  if (!_store) return dft;
  const v = _store.getItem('jy_' + key);
  return v === null ? dft : v === '1';
}
function saveSwitch(key, val) {
  if (!_store) return;
  try { _store.setItem('jy_' + key, val ? '1' : '0'); } catch (e) {}
}

// ============ P3-12 D1: 存档/读档(表现层) ============
// 规则层快照走 engine.serialize/deserialize(纯逻辑可单测); 这里只管 localStorage 与表现层收尾。
// 存档时机: 玩家手动 + 开场/每回合开始自动存档 —— 败北后读档直接回到回合检查点(AUDIT#12)。
const SAVE_KEY = 'jy_save';
function syncSwitchBtns() { // 开关文案同步(读档应用了存档里的开关后需要)
  document.getElementById('fxBtn').textContent = '演出:' + (fxOn ? '开' : '关');
  document.getElementById('bgmBtn').textContent = '音乐:' + (bgmOn ? '开' : '关');
  document.getElementById('counterBtn').textContent = '反击:' + (AUTO_COUNTER ? '自动' : '手动');
}
function saveGame(silent) {
  if (!_store) return false; // node 测试台无 localStorage, 静默降级
  try {
    _store.setItem(SAVE_KEY, JSON.stringify({
      v: 1, savedAt: Date.now(),
      switches: { fx: fxOn, bgm: bgmOn, counter: AUTO_COUNTER }, // 演出开关随档走
      state: serialize(),
    }));
    if (!silent) { log('进度已存档'); banner('进度已保存', 900); }
    return true;
  } catch (e) { if (!silent) log('存档失败: ' + e.message); return false; }
}
function loadGame() {
  if (!_store) return false;
  const raw = _store.getItem(SAVE_KEY);
  if (!raw) { log('没有找到存档'); return false; }
  try {
    const payload = JSON.parse(raw);
    // 表现层 transient 状态全收尾, 避免读档后残留旧演出/选中/移动动画
    endFight(); INTRO.active = false; TITLE.active = false; DLG.active = false;
    SORTIE.active = false; RESULT.active = false; MAP_MOVE = null;
    FX.dust = []; FX.floats = []; FX.hpAnim = null; FX.ringFx = null; FX.phaseQuote = null;
    FX.bigText = null; FX.portrait = null; FX.cutinRight = false;
    Sel.unit = null; Sel.moveTiles = null; Sel.atkTiles = null; Sel.pending = null;
    hideMenus(); showInfo(null);
    document.getElementById('loseModal').classList.add('hidden'); // P3-12 D4: 败北画面一并收
    for (const k in FACE) delete FACE[k];
    deserialize(payload.state);
    if (payload.switches) {
      fxOn = !!payload.switches.fx; bgmOn = !!payload.switches.bgm;
      AUTO_COUNTER = payload.switches.counter !== false;
      if (!bgmOn) beepStop();
      syncSwitchBtns();
    }
    updateTop();
    log(`读档完成：第 ${G.turn} 回合`);
    banner('已读取存档', 900);
    return true;
  } catch (e) { log('读档失败: ' + e.message); return false; }
}
// 存档/读档准入: 只在"玩家回合且无演出进行"时空闲(战斗/移动/剧情/结算中操作会截断状态机)
function saveLoadIdle() {
  return G.phase === 'player' && !G.over && !FIGHT.active && !MAP_MOVE &&
    !INTRO.active && !TITLE.active && !DLG.active && !SORTIE.active && !RESULT.active;
}
let fxOn = loadSwitch('fx', true);
const FX = { portrait: null, bigText: '', bigCrit: false,
             cutinT0: 0, cutinUntil: 0, cutinRight: false, // P3-12a: true=立绘从右侧入画(BOSS压迫感, 与运功左侧cutin区分)
             flashT0: 0, flashUntil: 0,
             redT0: 0, redUntil: 0,      // P3-12a: BOSS 阶段赤红压屏闪
             phaseQuote: null,           // P3-12a: 阶段台词 {text,t0,until}(底部台词条)
             shakeUntil: 0,
             miniOn: false,   // 攻击事件期间战场缩略图置底模式
             hpAnim: null,    // HP逐格递减 {u,from,to,t0,per,crit}
             ringFx: null,    // P1-6: 运功角色色环 {x,y,color,t0,until}
             floats: [] };    // 伤害飘字(由draw统一渲染)
FX.dust = [];                 // P2-13: 移动扬尘 {wx,wy,t0,seed}

// P2-13: FE 式地图单位动画(纯表现层零素材, 引擎零改动)
// 待机呼吸 squash-stretch / 移动步伐摆动+扬尘 / 选中快节奏踏步 / 敌入射程攻击架势 / 按行动方向翻转朝向
const UAN = { breatheA: 0.022, breatheT: 1100,   // 待机呼吸: squash幅度/周期(相位按单位id错开)
              selHopT: 240, selHopY: 2.6,        // 选中踏步: 快节奏原地小跳(FE 光标下的待命感)
              stepSquash: 0.07, stepLean: 0.05,  // 移动: 步伐squash/上身前倾
              tileMs: 130, dustLife: 430 };      // 每格移动耗时/扬尘寿命
const FACE = {};                // u.id → 1(朝右)/-1(朝左); 缺省我方朝右/敌方朝左
let MAP_MOVE = null;            // 地图移动动画 {u,x0,y0,x1,y1,t0,dur,lastStep}
// P3-12 D2: 升级演出状态(金漆大字+成长明细+脚下光环); 数值早已在规则层落账, 这里只管玩家看见
const LVUP = { active: false, t0: 0, until: 0, u: null, lv0: 0, gains: null };
const LVUP_GAINS_CN = { hp: '体力', sp: '真气', atk: '膂力', def: '根骨', hit: '命中', evd: '闪避' };
function fmtGains(gains) { return Object.keys(gains).map(k => `${LVUP_GAINS_CN[k]}+${gains[k]}`).join(' '); }

// ============ B2: 机战式横版战斗场景 ============
// 攻击确认后切入: 战场压暗为背景+电影黑边, 攻方立绘左/守方立绘右(守方镜像),
// 每把武功按 data.js 的 anim 配置演出独立动作(蓄力→出招→命中→收势), 全程程序动画零素材依赖。
// P1-14 三镜分镜时间轴(丁工 10-30 打回: 机战每武器 3~5s 三镜流, 旧版 ~1s 单镜读不出招式):
//   入镜(0~enter) → 镜1 起手特写(enter~cut1, 相机推近攻方半身, 起手pose定格≥250ms)
//   → 黑场切镜 cutMs → 镜2 攻击全景(cut1+cutMs~cut2, 拉回全景, strike 出招爆发)
//   → 黑场切镜 → 镜3 命中特写(cut2+cutMs~out, 守方中景, impact 白闪/震屏/扣血)
// 会心整体 +120ms; 合体技由 startFight 另加收势加长(必杀 4.5s+ 规格); 普通全镜 ~3.6s(规格 2.8~4s)
const FT = { enter: 380, cut1: 1560, strike: 2320, cut2: 2580, impact: 2760, out: 3640, cutMs: 170 };
const FT_READY = FT.cut1 - 320; // 起手定格起点: 起手 pose 在此前蓄满, 此后停住 ≥250ms(机战关键 pose 停得住, "像不像"的分水岭)
const FIGHT = { active: false, ev: null, t0: 0, crit: false, isMiss: false, sparks: [],
                attImg: null, defImg: null, attIsPortrait: false, defIsPortrait: false,
                weaponName: '', animKind: 'dash', animColor: '#ffb84a', durOut: FT.out,
                killAt: 0,       // P1-5: HP归零时刻(相对t0), 击破定格+台词时间轴锚点
                comboPartner: null,  // P1-7: 合体技搭档单位(双立绘同框), 由 ev.partner 注入
                partnerImg: null, partnerIsPortrait: false, _relaySparked: false,
                animCfg: null,       // P1-12: 当前招式完整 anim 配置(特效读取 beams 等可选参数)
                _hit2Sparked: false, // P1-12: dash 第二拳火花一次性标记
                gunX: 0, gunY: 0 };

// P1-8: 开场镜头调度 — 开场横幅后镜头变焦扫场(我方→敌方→BOSS→归位) + 敌我位置脉冲
const INTRO = { active: false, t0: 0, dur: 3400 };
// P3-11b: 评价结算画面(机战式战斗结果; 胜负判定在 checkEnd, 内容配置在 data.js RESULT_CFG)
const RESULT = { active: false, t0: 0 };
// 镜头参数: 世界点P映射到屏幕 = C + pan + s·(P−C)。关键帧给"想看的兴趣点",
// pan 钳制在不留空边范围内(画布=地图尺寸, 变焦 1.45 换扫场空间)
function introCam(ip) {
  const CWX = cv.width / 2, CWY = cv.height / 2;
  // 变焦: 0~500ms 推近至1.45, 最后800ms ease 回 1.0
  const s = 1 + 0.45 * Math.min(1, ip / 500) * (1 - win(ip, INTRO.dur - 800, INTRO.dur));
  // 扫场关键帧: [时刻ms, 视野中心世界x, 世界y]
  const KF = [[0, CWX, CWY], [600, 352, 544], [1400, 300, 170], [2300, 660, 190], [INTRO.dur - 800, CWX, CWY]];
  let cx = CWX, cy = CWY;
  for (let i = 0; i < KF.length - 1; i++) {
    const [t0, x0, y0] = KF[i], [t1, x1, y1] = KF[i + 1];
    if (ip >= t0 && ip <= t1) {
      let u = (ip - t0) / (t1 - t0);
      u = u * u * (3 - 2 * u); // smoothstep 缓入缓出, 镜头不顿挫
      cx = x0 + (x1 - x0) * u; cy = y0 + (y1 - y0) * u;
      break;
    }
  }
  const maxPX = CWX * (s - 1), maxPY = CWY * (s - 1); // 空边钳制
  const px = Math.max(-maxPX, Math.min(maxPX, s * (CWX - cx)));
  const py = Math.max(-maxPY, Math.min(maxPY, s * (CWY - cy)));
  return { s, px, py };
}
// 敌我位置脉冲: 开场逐个点名(我方蓝圈→敌方红圈→BOSS金圈压轴), 玩家第一眼定位
function drawIntroPulses(now) {
  const ip = now - INTRO.t0;
  const ring = (wx, wy, t, color, big) => {
    if (t <= 0 || t >= 1) return;
    const r = (big ? 20 : 14) + t * TS * (big ? 1.15 : 0.8);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = color; ctx.lineWidth = 4 - t * 2;
    ctx.beginPath(); ctx.ellipse(wx, wy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  G.units.filter(u => u.side === 'player' && u.hp > 0).forEach((u, i) => {
    ring(u.x * TS + TS / 2, u.y * TS + TS / 2, win(ip, 200 + i * 140, 700 + i * 140), '#6cb0ff');
  });
  G.units.filter(u => u.side === 'enemy' && u.hp > 0).forEach((u, i) => {
    ring(u.x * TS + TS / 2, u.y * TS + TS / 2, win(ip, 1300 + i * 160, 1900 + i * 160),
         u.boss ? '#ffd24a' : '#ff6050', u.boss);
  });
}

// 窗口进度: p 在 [a,b] 间的归一化位置(0→1)
function win(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }

// ============ P3-11a: 剧情演出系统(机战式第一话标配: 章节标题卡→立绘对白→出击画面) ============
// 三段皆为战前序章流程, 由 playStory() 顺序驱动; 演出开关关闭时整体跳过(尊重演出开关)。
// 标题卡单独立起(AUDIT#24: 先压住镜头再让扫场与对白同播, 开场 0.6s 空窗被填掉)。
const TITLE = { active: false, t0: 0, dur: 2600 };
const DLG = { active: false, idx: 0, t0: 0, chars: 0, done: false, spKey: '', spT0: 0 };
const SORTIE = { active: false, t0: 0, dur: 2600 };
let inputPulse = 0; // 点击/空格脉冲计数: 演出驱动按脉冲差推进(与选中/攻击输入完全隔离)

// 章节标题卡: 黑底 + 作品名小字 + 章序红印 + 章名大字左→右擦拭 + 金漆 Brush 线; 点击可跳
function drawTitleCard(now) {
  const p = now - TITLE.t0;
  const fade = 1 - win(p, TITLE.dur - 500, TITLE.dur);   // 末尾500ms淡出, 露出背后扫场
  if (fade <= 0) { TITLE.active = false; return; }
  const CX = cv.width / 2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#060609';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // 顶部小字: 作品名
  ctx.globalAlpha = fade * win(p, 0, 500);
  ctx.font = '20px "KaiTi","STKaiti","Microsoft YaHei",serif';
  ctx.fillStyle = '#8a7a58';
  ctx.fillText('金 庸 群 侠 大 战', CX, cv.height * 0.20);
  // 章序(红印式)
  ctx.globalAlpha = fade * win(p, 350, 800);
  ctx.font = 'bold 30px "KaiTi","STKaiti","Microsoft YaHei",serif';
  ctx.fillStyle = '#c8402f';
  ctx.fillText('◆ ' + STORY.chapterNo + ' ◆', CX, cv.height * 0.335);
  // 章名大字: 左→右擦拭(毛笔开卷感), 金漆线随擦拭拖出
  const rw = win(p, 550, 1500);
  ctx.font = 'bold 92px "KaiTi","STKaiti","Microsoft YaHei",serif';
  const title = STORY.chapterTitle;
  const tw = ctx.measureText(title).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(CX - tw / 2 - 10, cv.height * 0.36, (tw + 20) * rw, cv.height * 0.30);
  ctx.clip();
  ctx.fillStyle = '#f3e9cf';
  ctx.fillText(title, CX, cv.height * 0.51);
  ctx.restore();
  ctx.globalAlpha = fade * rw;
  ctx.fillStyle = '#c8a04a';
  ctx.fillRect(CX - tw / 2 - 10, cv.height * 0.635, (tw + 20) * rw, 4);
  // 跳过提示
  ctx.globalAlpha = fade * win(p, 1200, 1700) * 0.6;
  ctx.font = '15px "KaiTi","STKaiti","Microsoft YaHei",serif';
  ctx.fillStyle = '#9a8f78';
  ctx.fillText('点击 跳过 ▸', CX, cv.height * 0.86);
  ctx.restore();
}

// 立绘对白框: 底部机战式窗口 — 左侧半身立绘(无立绘角色放大 sprite 回退), 名牌, 打字机正文
// 首击补全本句, 再击翻页; 正文按字宽贪心换行, ▼ 呼吸提示翻页
function drawDialogBox(now) {
  const line = STORY.opening[DLG.idx];
  if (!line) return;
  if (!DLG.done) {
    DLG.chars = Math.min(line.text.length, Math.floor((now - DLG.t0) / 42)); // 打字机 42ms/字
    if (DLG.chars >= line.text.length) DLG.done = true;
  }
  const bx = 16, bw = cv.width - 32, bh = 150, by = cv.height - bh - 12;
  // 面板底+金边
  ctx.save();
  ctx.fillStyle = 'rgba(7,9,18,.94)';
  roundRectPath(bx, by, bw, bh, 8); ctx.fill();
  ctx.strokeStyle = '#c8a860'; ctx.lineWidth = 2;
  roundRectPath(bx, by, bw, bh, 8); ctx.stroke();
  // ---- 立绘(128px 底对齐, 半身 cover 取景; 换说话时滑入) ----
  const pim = portraits[line.sp];
  const hasP = pim && pim.complete && pim.naturalWidth > 0;
  const img = hasP ? pim : sprites[line.sp];
  if (DLG.spKey !== line.sp) { DLG.spKey = line.sp; DLG.spT0 = now; }
  const slide = win(now, DLG.spT0, DLG.spT0 + 190);
  const dh = 128, dyy = by + bh - 8 - dh;
  const dx = bx + 14 - (1 - (1 - Math.pow(1 - slide, 3))) * 64;
  ctx.save();
  ctx.globalAlpha = slide;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(bx + 10, dyy - 2, 128, dh + 4);
  if (hasP) {
    // 半身取景: 源图取顶部58%(头+胸), cover 进 128px 宽框
    drawCover(img, 0.58, dx, dyy, 128, dh);
  } else {
    ctx.imageSmoothingEnabled = false; // 像素小人保持颗粒感
    ctx.drawImage(img, dx + 22, dyy + 12, 104, 104);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.restore();
  // ---- 名牌(压面板顶边) ----
  const name = line.name || CHAR_DATA[line.sp].cn;
  ctx.font = 'bold 19px "KaiTi","STKaiti","Microsoft YaHei",serif';
  const nw = ctx.measureText(name).width + 24;
  ctx.fillStyle = '#1a1408';
  roundRectPath(bx + 30, by - 14, nw, 28, 6); ctx.fill();
  ctx.strokeStyle = '#c8a860'; ctx.lineWidth = 1.5;
  roundRectPath(bx + 30, by - 14, nw, 28, 6); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd98a';
  ctx.fillText(name, bx + 42, by + 1);
  // ---- 打字机正文(贪心按字宽换行, 最多三行) ----
  const revealed = line.text.slice(0, DLG.chars);
  const tx0 = bx + 162, maxW = bw - 162 - 22;
  ctx.font = '21px "KaiTi","STKaiti","Microsoft YaHei",serif';
  const rows = [];
  let cur = '';
  for (const ch of revealed) {
    if (ctx.measureText(cur + ch).width > maxW) { rows.push(cur); cur = ch; }
    else cur += ch;
  }
  rows.push(cur);
  ctx.fillStyle = '#f5ecd7';
  rows.slice(0, 3).forEach((r, i) => ctx.fillText(r, tx0, by + 44 + i * 34));
  // ▼ 翻页提示(呼吸闪烁)
  if (DLG.done) {
    ctx.globalAlpha = 0.45 + 0.45 * Math.sin(now / 160);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '18px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('▼', bx + bw - 20, by + bh - 20);
  }
  ctx.restore();
}

// 出击画面: 深蓝底+斜光带扫过, 我方名册依次滑入(立绘半身头像+名+兵器), 右侧金漆「出击！」爆字收场
function drawSortie(now) {
  const p = now - SORTIE.t0;
  const CX = cv.width / 2;
  // 底: 深夜蓝渐变(出击前的肃杀感)
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#0a1030'); g.addColorStop(0.6, '#0d1440'); g.addColorStop(1, '#070a20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  // 斜向光带缓慢扫过
  const sx = -300 + win(p, 0, SORTIE.dur) * (cv.width + 600);
  ctx.save();
  ctx.translate(sx, 0); ctx.rotate(-0.35);
  const band = ctx.createLinearGradient(0, 0, 190, 0);
  band.addColorStop(0, 'rgba(255,240,200,0)');
  band.addColorStop(0.5, 'rgba(255,240,200,.10)');
  band.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, -260, 190, cv.height + 520);
  ctx.restore();
  // 顶部章节标注
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.8;
  ctx.font = '19px "KaiTi","STKaiti","Microsoft YaHei",serif';
  ctx.fillStyle = '#8a94c8';
  ctx.fillText(STORY.chapterNo.replace(/\s/g, '') + ' · ' + STORY.chapterTitle + ' —— 出 击', CX, 40);
  ctx.restore();
  // 名册: 我方单位依次滑入
  const roster = G.units.filter(u => u.side === 'player');
  roster.forEach((u, i) => {
    const lp = win(p, 260 + i * 210, 560 + i * 210);
    if (lp <= 0) return;
    const ease = 1 - Math.pow(1 - lp, 3);
    const y = 118 + i * 94;
    const x = 84 - (1 - ease) * 320;
    ctx.save();
    ctx.globalAlpha = lp;
    ctx.fillStyle = 'rgba(10,12,26,.85)';
    roundRectPath(x, y, 400, 78, 6); ctx.fill();
    ctx.strokeStyle = '#3a4670'; ctx.lineWidth = 1.5;
    roundRectPath(x, y, 400, 78, 6); ctx.stroke();
    // 头像: 立绘半身 cover 取景, 无立绘用 sprite 回退(像素颗粒保留)
    const pim = portraits[u.sprite];
    const hasP = pim && pim.complete && pim.naturalWidth > 0;
    if (hasP) drawCover(pim, 0.5, x + 8, y + 7, 54, 64);
    else {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprites[u.sprite], x + 3, y + 7, 64, 64);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px "KaiTi","STKaiti","Microsoft YaHei",serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(u.cn, x + 76, y + 30);
    ctx.font = '15px "KaiTi","STKaiti","Microsoft YaHei",serif';
    ctx.fillStyle = '#9aa4c8';
    ctx.fillText(u.weapons.map(w => WEAPONS[w].name).join(' · '), x + 76, y + 57);
    ctx.restore();
  });
  // 「出击！」大字: 名册铺完后爆字(过冲回弹), 金漆待遇
  const pop0 = 300 + roster.length * 210;
  const pop = win(p, pop0, pop0 + 480);
  if (pop > 0) {
    const scale = 0.62 + 0.38 * easeOutBack(Math.min(1, pop * 2.4));
    ctx.save();
    ctx.globalAlpha = Math.min(1, pop * 2.6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(96 * scale) + 'px "KaiTi","STKaiti","Microsoft YaHei",serif';
    const ox = cv.width * 0.72, oy = cv.height * 0.52;
    ctx.lineWidth = 14; ctx.strokeStyle = '#3a2408';
    ctx.strokeText('出 击 ！', ox, oy);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('出 击 ！', ox, oy);
    // 两侧速度线(程序绘制, 爆字瞬间拉出)
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const yy = oy - 90 + i * 44;
      const ext = win(pop, 0.15, 0.9) * 120;
      ctx.beginPath(); ctx.moveTo(ox - 210 - ext, yy); ctx.lineTo(ox - 150, yy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + 210 + ext, yy); ctx.lineTo(ox + 150, yy); ctx.stroke();
    }
    ctx.restore();
  }
}

// cover 式取景: 源图取顶部 sClipH 比例(半身), 等比放大填满目标框, 居中裁边
function drawCover(im, sClipH, dx, dy, dw, dh) {
  const sw = im.width, sh = im.height * sClipH;
  const sc = Math.max(dw / sw, dh / sh);
  const cw = dw / sc, ch = dh / sc;
  ctx.drawImage(im, (sw - cw) / 2, 0, cw, ch, dx, dy, dw, dh);
}
// 圆角矩形路径(不依赖 ctx.roundRect, 兼容旧内核)
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============ P1-9: 立绘 puppet 分层动画(伪骨骼) ============
// 丁工 10-20 点名"人物不会动": 机战A 是逐帧动作, 零新素材下把立绘按头/躯干/腿三层切分，
// 每层独立变换逼近"这个人在出招/在挨打"。切分比例做成常量, 个别立绘姿势差异可在此微调。
const PUPPET = { HEAD: 0.22, TORSO: 0.56 };   // 头占顶22% 躯干占中56% 腿=剩余22%
// P1-16(AUDIT#41/#42): 蓄力光球/出招特效锚点逐张标定——旧默认锚(attW≈0.64, 0.42H)恰好落在各立绘脸部，
// 三镜特写下光球糊脸/贴脸，"拳端凝气"的语义读不出。按素材逐图标定"离敌方最近的前手/枪口"(归一化坐标)。
// 表现层常量表，同 PUPPET 惯例；新增立绘须逐张标定(AUDIT#22 同款约束)。
const ATT_ANCHOR = {
  'xiaofeng.png': [0.85, 0.60],  // 萧峰: 右拳(前手拳端；左掌为后手)
  'xiaobao.png':  [0.87, 0.44],  // 韦小宝: 烟枪口=火枪枪口前缘
  'duanyu.png':   [0.62, 0.40],  // 段誉: 右手指尖(六脉/一阳指出手点)
  'duanyq.png':   [0.45, 0.48],  // 段延庆: 前推爪手(一阳指·透骨劲源)
  'guojing.png':  [0.77, 0.53],  // 郭靖: 前手(右)
  '':             [0.62, 0.70],  // sprite 默认(像素小人): 双手部中心——脸部在 0.23H，手在 0.70H
};
// 攻方出手锚点: 立绘按文件名查表(未标定的新立绘回退右拳前缘)，sprite 一律双手部
function attAnchorOf(img, isPortrait) {
  if (!isPortrait) return ATT_ANCHOR[''];
  const src = (img && img.src || '').split('/').pop();
  return ATT_ANCHOR[src] || ATT_ANCHOR['xiaofeng.png'];
}
// puppet 姿态: lean=躯干前倾角(+, 顶向画面右) squash=Y缩放(1=常态) headLean/headDX/headDY=头部附加
//             legDX/legDY/legLean=腿部附加(后蹬/屈膝)
// pose.whole=true 时整图变换(供 64px 像素小人用: 其头切片仅14px且盔缨留白大, 硬切三层会裂)，
// 头部/腿部附加量按权重并入整体 lean 与位移, 姿态代码两套角色通用
function drawPuppet(im, x, y, h, mirror, alpha, pose) {
  pose = pose || {};
  const w = h * im.width / im.height;
  const hh = h * PUPPET.HEAD, th = h * PUPPET.TORSO, bh = h - hh - th; // 三层高度
  const imH = im.height, imW = im.width;
  const dir = mirror ? -1 : 1; // 镜像后旋转方向视觉上翻转, 统一用"画面坐标"语义
  const leanDeg = pose.whole ? (pose.lean || 0) + (pose.headLean || 0) * 0.5 + (pose.legLean || 0) * 0.3 : (pose.lean || 0);
  const lean = leanDeg * Math.PI / 180;
  const headLean = (pose.headLean || 0) * Math.PI / 180;
  const legLean = (pose.legLean || 0) * Math.PI / 180;
  const squash = pose.squash === undefined ? 1 : pose.squash;
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.translate(x + w / 2, y + h);                 // 原点移到脚底中心(整个人绕脚变换)
  if (mirror) ctx.scale(-1, 1);
  ctx.rotate(dir * lean);
  ctx.scale(1, squash);
  if (pose.whole) {                                // 像素小人: 整图变换, 附加量已并入
    ctx.drawImage(im, -w / 2 + (pose.legDX || 0) * 0.5 + (pose.headDX || 0) * 0.5,
                  -h + (pose.legDY || 0) + (pose.headDY || 0), w, h);
    ctx.restore();
    return w;
  }
  // 腿( hip 为轴, 可后蹬/屈膝 )
  ctx.save();
  ctx.translate(pose.legDX || 0, -bh + (pose.legDY || 0));
  if (legLean) { ctx.translate(0, bh); ctx.rotate(dir * legLean); ctx.translate(0, -bh); }
  ctx.drawImage(im, 0, imH * (PUPPET.HEAD + PUPPET.TORSO), imW, imH * (1 - PUPPET.HEAD - PUPPET.TORSO),
                -w / 2, -bh, w, bh);
  ctx.restore();
  // 躯干( 随 lean/squash 整体走, 无附加变换 )
  ctx.drawImage(im, 0, imH * PUPPET.HEAD, imW, imH * PUPPET.TORSO, -w / 2, -bh - th, w, th);
  // 头( neck 为轴附加点头/后仰 )
  ctx.save();
  ctx.translate(pose.headDX || 0, -h + (pose.headDY || 0));
  if (headLean) { ctx.translate(0, hh); ctx.rotate(dir * headLean); ctx.translate(0, -hh); }
  ctx.drawImage(im, 0, 0, imW, imH * PUPPET.HEAD, -w / 2, 0, w, hh);
  ctx.restore();
  ctx.restore();
  return w;
}
// easeOutBack: 收招过冲回弹(机战式挥空后回位)
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// ============ P1-14 B方案挂接钩子: 可插拔姿势渲染器(poseanim.js 接线口, 默认 drawPuppet 零行为变化) ============
// 用法: poseanim 播放器在 window 上注册 window.POSE_RENDERERS = { att: fn, def: fn };
// drawCombatant 检测到对应 slot 的渲染器就改调 fn(ctx, {img,x,y,h,mirror,alpha,pose,phase}),
// 否则逐字节走原 drawPuppet 路径。不改 FT 时间轴/相机/特效, 不注册时渲染结果与原实现完全一致。
// phase=三镜阶段名: 攻方 'windup'(镜1 起手, enter/windup 同归) / 'strike'(镜2 攻击) / 'impact'(镜3 命中后收势) / 'out'(退场);
//               守方登场起恒为 'impact'(受击/退场都在镜3)。
function fightAttPhase(p, tStrike, tImpact) {
  if (p < tStrike) return 'windup';  // 镜1: 起手 pose 定格段
  if (p < tImpact) return 'strike';  // 镜2: 出招段
  if (p < FT.out) return 'impact';   // 镜3: 命中后收势段
  return 'out';
}
function drawCombatant(slot, img, x, y, h, mirror, alpha, pose, phase, p) {
  const r = (typeof window !== 'undefined' && window.POSE_RENDERERS) ? window.POSE_RENDERERS[slot] : null;
  if (r) { r(ctx, { img, x, y, h, mirror, alpha, pose, phase, p }); return; }
  drawPuppet(img, x, y, h, mirror, alpha, pose);
}

// ============ P1-12: 每招式差异化动作编排(丁工 10-23 点名"每一种招式动作是不一样的") ============
// 基础时间轴: charge=蓄力进度, snap=快起前送→easeOutBack 带回冲归位; 各招式函数自取所需窗口。
// 设计原则(苛刻老玩家): 身体先于特效说话——直拳小快灵/横扫扭腰抡臂/降龙沉身推掌/
// 空明云手慢摇/指法头部锁定瞄准/火枪后坐力/匕首弹射突刺/棒杖抡起俯砸/残谱正反双斩。
function attBase(p, now, tStrike) {
  const chargeP = win(p, FT.enter, FT_READY); // P1-14: 蓄力在镜1内蓄满(起手特写), FT_READY 后定格等切镜
  const snap = win(p, tStrike - 110, tStrike + 20) * (1 - easeOutBack(win(p, tStrike + 20, tStrike + 310)));
  return { chargeP, snap, breathe: Math.sin(now / 280) * 0.012 };
}
// dash 太祖长拳·快拳连打: 紧凑站架两记快拳(第二拳冲量65%), 前倾小快灵
function poseAttDash(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const jab1 = win(p, tStrike - 110, tStrike + 20) * (1 - easeOutBack(win(p, tStrike + 20, tStrike + 300)));
  const jab2raw = win(p, tStrike + 130, tStrike + 220) * (1 - easeOutBack(win(p, tStrike + 220, tStrike + 470)));
  const snap = jab1 + 0.65 * Math.max(0, jab2raw);
  return {
    lean: 5 * chargeP + 8 * snap,
    headLean: 3 * chargeP + 4 * Math.max(0, snap) + Math.sin(now / 420) * 1.5,
    headDY: 5 * chargeP,
    squash: (1 - 0.06 * chargeP) * (1 + 0.03 * Math.max(0, snap)) + breathe,
    legDX: -10 * Math.max(0, snap) + 3 * chargeP,
    legDY: 3 * chargeP,
    legLean: -5 * Math.max(0, snap),
  };
}
// sweep 横扫(打狗棒/弯刀): 先扭身后抡扫——lean 由负扫到正, 腿随转体大摆
function poseAttSweep(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const windup = win(p, FT.enter + 60, FT_READY - 140); // P1-14: 扭身蓄势在镜1蓄满定格, 镜2挥出
  const sweepIn = win(p, tStrike - 150, tStrike + 30);
  const sweepOut = win(p, tStrike + 30, tStrike + 380);
  const thru = sweepIn * (1 - easeOutBack(sweepOut));
  const coil = windup * (1 - sweepIn); // 扭身蓄力(挥出即消失)
  return {
    lean: -9 * coil + 16 * thru,
    headLean: -5 * coil + 8 * Math.max(0, thru) + Math.sin(now / 420) * 1.5,
    headDY: 4 * chargeP,
    squash: (1 - 0.04 * coil - 0.03 * chargeP) * (1 + 0.03 * Math.max(0, thru)) + breathe,
    legDX: 8 * coil - 18 * Math.max(0, thru) + 3 * chargeP,
    legDY: 3 * chargeP,
    legLean: 6 * coil - 10 * Math.max(0, thru),
  };
}
// dragon 降龙十八掌·双掌前推: 全招式最深马步蓄力(squash 0.88), 全身前推送掌(最大前倾18°)
function poseAttDragon(p, now, tStrike) {
  const { breathe } = attBase(p, now, tStrike);
  const chargeP = win(p, FT.enter, FT_READY);            // P1-14: 沉身蓄力镜1内蓄满定格(旧窗口拉到 tStrike 全程太慢)
  const pushIn = win(p, tStrike - 130, tStrike + 30);
  const pushOut = win(p, tStrike + 30, tStrike + 430);
  const push = pushIn * (1 - easeOutBack(pushOut));
  return {
    lean: 11 * chargeP + 18 * Math.max(0, push),
    headLean: 5 * chargeP + 9 * Math.max(0, push) + Math.sin(now / 420) * 1.5,
    headDY: 8 * chargeP - 3 * Math.max(0, push),
    squash: (1 - 0.12 * chargeP) * (1 + 0.045 * Math.max(0, push)) + breathe,
    legDX: -16 * Math.max(0, push) + 4 * chargeP,
    legDY: 6 * chargeP,
    legLean: -8 * Math.max(0, push),
  };
}
// wave 空明拳·云手气浪: 蓄力期云手慢摇(sin 摆), 出招柔推(慢进慢出)
function poseAttWave(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const sway = Math.sin(now / 320) * 4 * chargeP;
  const pushIn = win(p, tStrike - 150, tStrike + 60);
  const pushOut = win(p, tStrike + 60, tStrike + 470);
  const push = pushIn * (1 - easeOutBack(pushOut));
  return {
    lean: sway + 9 * push,
    headLean: sway * 0.6 + 4 * push + Math.sin(now / 420) * 1.5,
    headDY: 3 * chargeP,
    squash: 1 - 0.04 * chargeP + 0.02 * push + breathe,
    legDX: 3 * chargeP - 8 * Math.max(0, push),
    legDY: 2 * chargeP,
    legLean: -4 * Math.max(0, push),
  };
}
// beam 六脉/一阳指·凝指点射: 蓄力后仰凝神、头部几乎不动(瞄准感), 出招速点即回
function poseAttBeam(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const aim = win(p, FT.enter + 120, FT_READY - 100) * (1 - win(p, tStrike - 100, tStrike + 10)); // P1-14: 凝指瞄准镜1定格(配指尖凝气光球), 出招速点即回
  const jabIn = win(p, tStrike - 90, tStrike + 15);
  const jabOut = win(p, tStrike + 15, tStrike + 280);
  const jab = jabIn * (1 - easeOutBack(jabOut));
  return {
    lean: -5 * aim + 7 * jab,
    headLean: -2 * aim + 1 * jab + Math.sin(now / 420) * 1.5, // 头锁住=在瞄准
    headDY: -4 * aim + 2 * jab,
    squash: (1 - 0.03 * chargeP) * (1 + 0.02 * jab) + breathe,
    legDX: -9 * Math.max(0, jab) + 2 * aim,
    legDY: 2 * aim,
    legLean: -4 * Math.max(0, jab),
  };
}
// bullet 火枪·瞄准射击: 贴腮瞄准(头后仰), 击发后整个人被后坐力震仰——老玩家一眼认出的枪感
function poseAttBullet(p, now, tStrike) {
  const { breathe } = attBase(p, now, tStrike);
  const aim = win(p, FT.enter + 100, FT_READY - 120) * (1 - win(p, tStrike - 40, tStrike + 60)); // P1-14: 贴腮瞄准镜1定格
  const recoilIn = win(p, tStrike - 30, tStrike + 130);
  const recoilOut = win(p, tStrike + 130, tStrike + 540);
  const recoil = recoilIn * (1 - easeOutBack(recoilOut));
  return {
    lean: -4 * aim - 13 * recoil,
    headLean: -6 * aim - 9 * recoil + Math.sin(now / 420) * 1.5,
    headDY: 2 * aim + 3 * recoil,
    squash: (1 - 0.02 * aim) * (1 - 0.05 * recoil) + breathe,
    legDX: 10 * recoil,                                // 重心后错半步
    legDY: 2 * aim,
    legLean: 6 * recoil,
  };
}
// stab 匕首·瞬步突刺: 深蹲蓄力→整个人弹射前扑(最大前倾20°+弓箭步后腿蹬直), 全招式最凶
function poseAttStab(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const lungeIn = win(p, tStrike - 100, tStrike + 10);
  const lungeOut = win(p, tStrike + 10, tStrike + 340);
  const lunge = lungeIn * (1 - easeOutBack(lungeOut));
  return {
    lean: 7 * chargeP + 20 * Math.max(0, lunge),
    headLean: 3 * chargeP + 5 * Math.max(0, lunge) + Math.sin(now / 420) * 1.5,
    headDY: 4 * chargeP,
    squash: (1 - 0.10 * chargeP) * (1 + 0.05 * Math.max(0, lunge)) + breathe,
    legDX: -22 * Math.max(0, lunge) + 3 * chargeP,    // 大弓箭步
    legDY: 4 * chargeP,
    legLean: -12 * Math.max(0, lunge),                // 后腿完全蹬直
  };
}
// smash 下砸(狼牙棒/铁杖): 深蹲抡起(上挺拉伸)→俯身砸落, 与整体跃起(attLeapY)叠加
function poseAttSmash(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const windup = win(p, FT.enter + 80, FT_READY - 120); // P1-14: 抡起上挺镜1定格
  const slamIn = win(p, tStrike - 170, tStrike + 40);
  const slamOut = win(p, tStrike + 40, tStrike + 400);
  const slam = slamIn * (1 - easeOutBack(slamOut));
  const coil = windup * (1 - slamIn);
  return {
    lean: -7 * coil + 15 * Math.max(0, slam),         // 先仰身后俯砸
    headLean: -4 * coil + 7 * Math.max(0, slam) + Math.sin(now / 420) * 1.5,
    headDY: 4 * chargeP + 3 * coil,
    squash: (1 - 0.06 * chargeP) * (1 + 0.05 * coil) * (1 - 0.02 * slam) + breathe,
    legDX: 6 * coil - 12 * Math.max(0, slam),
    legDY: 5 * chargeP,
    legLean: 5 * coil - 7 * Math.max(0, slam),
  };
}
// slashx 残谱一式·交叉双斩: 躯干左右双快斩(一正一反两个 snap), 扭腰挥臂感
function poseAttSlashX(p, now, tStrike) {
  const { chargeP, breathe } = attBase(p, now, tStrike);
  const c1 = win(p, tStrike - 110, tStrike + 10) * (1 - easeOutBack(win(p, tStrike + 10, tStrike + 170)));
  const c2raw = win(p, tStrike + 150, tStrike + 260) * (1 - easeOutBack(win(p, tStrike + 260, tStrike + 540)));
  const c2 = Math.max(0, c2raw);
  return {
    lean: 5 * chargeP + 10 * c1 - 12 * c2,
    headLean: 3 * chargeP + 6 * c1 - 7 * c2 + Math.sin(now / 420) * 1.5,
    headDY: 4 * chargeP,
    squash: (1 - 0.05 * chargeP) + breathe,
    legDX: -8 * Math.max(0, c1) + 10 * c2 + 2 * chargeP,
    legDY: 2 * chargeP,
    legLean: -6 * Math.max(0, c1) + 7 * c2,
  };
}
// 出招动作编排分发表: kind→专属身段; 未识别 kind 回退 dash
const ATT_POSES = { dash: poseAttDash, sweep: poseAttSweep, dragon: poseAttDragon, wave: poseAttWave,
                    beam: poseAttBeam, bullet: poseAttBullet, stab: poseAttStab, smash: poseAttSmash,
                    slashx: poseAttSlashX };
function fightAttPose(p, now, tStrike) {
  return (ATT_POSES[FIGHT.animKind] || poseAttDash)(p, now, tStrike);
}
// P1-7: 合体技搭档姿态 — 蓄力与主攻同步(双人同频运劲), 出招冲量晚~130ms再起:
// 主攻先至、搭档接力, 机战合体技的"双动机接力"打击感; 其余基底参数复用 fightAttPose
function fightPartnerPose(p, now, tStrike) {
  const pose = fightAttPose(p, now, tStrike);
  const relayIn = win(p, tStrike + 30, tStrike + 150);      // 接力前送(快)
  const relayOut = win(p, tStrike + 150, tStrike + 460);      // 接力回弹(带回冲)
  const relay = relayIn * (1 - easeOutBack(relayOut));
  const snap = Math.max(0, relay);
  pose.lean = (pose.lean || 0) + 13 * relay;                  // 躯干接力前送(要比主攻更狠才读得出接力)
  pose.headLean = (pose.headLean || 0) + 7 * snap;            // 头部跟随
  pose.squash = (pose.squash === undefined ? 1 : pose.squash) + 0.04 * snap;
  pose.legDX = (pose.legDX || 0) - 14 * snap;               // 接力腿后蹬
  pose.legLean = (pose.legLean || 0) - 7 * snap;            // 后腿蹬直
  return pose;
}

// 守方姿态时间轴: 待机呼吸 -> 受击"快起-峰值定格-带颤动回落"(机战受击帧要停得住) -> 归位
// sprite 守方(64px 像素小人)变换不敏感, 幅度×1.35 补偿; 落空改侧闪倾身
function fightDefPose(p, now, tStrike, isMiss, crit, freezeHit, isPortrait) {
  let hitP = win(p, tStrike, tStrike + 430);
  if (freezeHit) hitP = 0.3;                            // 击破定格: 定在受击峰值帧(机战撃破冻结)
  // 受击冲量: 0~0.15 快起, 0.15~0.5 峰值定格(挨打要停半拍), 0.5~1 颤动回落
  const recoil = Math.min(win(hitP, 0, 0.15), 1 - win(hitP, 0.5, 1));
  // 回落段两次颤动(衰减)
  const tremble = (hitP > 0.5 && hitP < 1) ? Math.sin((hitP - 0.5) * Math.PI * 4) * (1 - hitP) : 0;
  const k = (crit ? 1.25 : 1) * (isPortrait ? 1 : 1.5); // crit 更狠 / 像素小人整图变换需更大幅度
  const breathe = Math.sin(now / 300) * 0.01;
  if (isMiss) return {                                 // 侧闪: 整体向闪避方向倾身
    lean: -7 * recoil, squash: 1 - 0.03 * recoil + breathe,
    headLean: -4 * recoil, legDX: -6 * recoil, legLean: 6 * recoil,
  };
  return {                                             // 后仰被打弯腰 -> 颤动回弹
    lean: (11 * recoil + 6 * tremble) * k,             // 躯干后仰11°(crit×1.25)
    headLean: (14 * recoil + 7 * tremble) * k,         // 头部后仰14°
    squash: 1 - 0.08 * recoil * k + breathe,           // 弯腰感
    legDX: 6 * recoil, legDY: -4 * recoil,             // 重心后错
    legLean: 5 * recoil * k,
  };
}

// 战斗场景入位: 由 animateEvent 调用, 填好 FIGHT 全部状态
function startFight(ev) {
  const now = performance.now();
  FIGHT.active = true;
  FIGHT.ev = ev;
  FIGHT.crit = !!ev.isCrit;
  FIGHT.isMiss = (ev.type === 'miss');
  FIGHT.t0 = now;
  FIGHT.skip = false; // P1-10: 点击画面跳过演出标记
  FIGHT.sparks = [];
  // 雪粒子: ~70 颗确定性参数(位置由 now 推进, 击破定格自动冻结)
  FIGHT.snow = [];
  for (let i = 0; i < 70; i++) {
    FIGHT.snow.push({
      x0: Math.random() * cv.width, y0: Math.random() * cv.height,
      r: 0.8 + Math.random() * 1.6, v: 0.028 + Math.random() * 0.05,
      drift: -0.008 + Math.random() * 0.016, ph: Math.random() * 6.28,
      a: 0.35 + Math.random() * 0.5
    });
  }
  FIGHT.durOut = FT.out + (FIGHT.crit ? 240 : 0);
  if (ev.partner) FIGHT.durOut += 940; // P1-14: 合体技按必杀规格 4.5s+(双立绘同框收势拉长)
  FIGHT.weaponName = ev.w.name;
  const anim = (ev.w.anim) || { kind: 'dash', color: '#ffb84a' };
  FIGHT.animKind = anim.kind;
  FIGHT.animColor = anim.color;
  FIGHT.animCfg = anim;          // P1-12: 六道剑气等可选参数
  FIGHT._hit2Sparked = false;    // P1-12: dash 连打第二拳
  // 立绘优先, 无立绘角色用地图 sprite 放大回退(保持横版对峙成立)
  const ap = portraits[ev.att.sprite], dp = portraits[ev.def.sprite];
  FIGHT.attIsPortrait = !!(ap && ap.complete);
  FIGHT.defIsPortrait = !!(dp && dp.complete);
  FIGHT.attImg = FIGHT.attIsPortrait ? ap : sprites[ev.att.sprite];
  FIGHT.defImg = FIGHT.defIsPortrait ? dp : sprites[ev.def.sprite];
  // P1-7: 合体技双立绘同框 — 搭档单位从 ev.partner 注入(规则层零改动, 仅表现消费)
  FIGHT.comboPartner = ev.partner || null;
  FIGHT._relaySparked = false;
  if (FIGHT.comboPartner) {
    const pp = portraits[FIGHT.comboPartner.sprite];
    FIGHT.partnerIsPortrait = !!(pp && pp.complete);
    FIGHT.partnerImg = FIGHT.partnerIsPortrait ? pp : sprites[FIGHT.comboPartner.sprite];
  } else { FIGHT.partnerImg = null; FIGHT.partnerIsPortrait = false; }
  if (FIGHT.isMiss) { // 落空: 守方不扣血, 无爆闪无震屏
    FIGHT.killAt = 0;
    FX.hpAnim = null;
    FX.flashT0 = FX.flashUntil = FX.shakeUntil = 0;
  } else {
    const from = Math.min(ev.def.maxhp, ev.def.hp + ev.dmg);
    const seg = Math.max(1, Math.round(ev.def.maxhp / 10));
    const per = FIGHT.crit ? 26 : 40;
    // P1-14: 白闪/震屏/扣血全部锚定镜3 命中瞬间(impact)——切镜黑场后直接命中特写, 镜2只看出招
    FX.hpAnim = { u: ev.def, from, to: ev.def.hp,
                  t0: now + FT.impact + (FIGHT.crit ? 120 : 0),
                  per, seg, crit: FIGHT.crit };
    FX.flashT0 = now + FT.impact; FX.flashUntil = now + FT.impact + (FIGHT.crit ? 380 : 260);
    FX.shakeUntil = now + FT.impact + (FIGHT.crit ? 560 : 380);
    if (ev.killed) {
      // P1-5: 击破情绪峰值 — HP归零瞬间白闪定格~500ms, 再接攻方胜利台词(motto)大字
      const zeroTicks = Math.ceil(from / seg);          // 逐格归零所需格数
      FIGHT.killAt = FT.impact + (FIGHT.crit ? 120 : 0) + zeroTicks * per;
      FIGHT.durOut = FIGHT.killAt + 500 + 980;          // 定格500ms + 台词停留~1s
    } else FIGHT.killAt = 0;
  }
}
function endFight() {
  FIGHT.active = false; FIGHT.ev = null; FIGHT.sparks = []; FIGHT.snow = [];
  FIGHT.killAt = 0;
  FIGHT.animCfg = null; FIGHT._hit2Sparked = false; // P1-12
  FIGHT.comboPartner = null; FIGHT.partnerImg = null; FIGHT._relaySparked = false; // P1-7
  FX.hpAnim = null;
}

// 火花粒子
function spawnSparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6.5;
    FIGHT.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5,
                        t0: performance.now(), life: 420 + Math.random() * 280,
                        color, r: 2 + Math.random() * 3.2 });
  }
}
function drawSparks(now) {
  for (const s of FIGHT.sparks) {
    const age = now - s.t0;
    if (age > s.life) continue;
    const x = s.x + s.vx * age / 16, y = s.y + s.vy * age / 16 + 0.012 * age * age / 16;
    ctx.globalAlpha = 1 - age / s.life;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  FIGHT.sparks = FIGHT.sparks.filter(s => now - s.t0 <= s.life);
}

const Sel = {
  unit: null,           // 当前选中
  moveTiles: null, atkTiles: null,
  mode: 'idle',         // idle | moved(待指令)
};
const mouse = { x: -1, y: -1 };

// ---------- 音频: WebAudio 简易合成 ----------
let AC = null, bgmTimer = null, bgmOn = loadSwitch('bgm', true);
const MOTIF = { // 每人一句五声音阶动机(占位出阵曲)
  xiaofeng:  [220,262,294,262,220,196,220,0],
  guojing:   [196,220,262,220,196,175,196,0],
  duanyu:    [294,330,392,330,294,262,294,0],
  xiaobao:   [330,294,262,294,330,392,330,262],
  hero:      [262,294,330,294,262,247,262,0],
};
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function beep(freq, dur, type, vol) {
  if (!bgmOn) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = vol || 0.05;
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function seHit() { beep(120, .15, 'sawtooth', .12); beep(90, .2, 'square', .08); }
function seCrit() { beep(180, .1, 'sawtooth', .12); setTimeout(() => beep(240, .12, 'sawtooth', .12), 80); setTimeout(() => beep(320, .2, 'square', .1), 160); }
function seMiss() { beep(500, .08, 'sine', .05); }
let motifUnit = null;
function playMotif(u) {
  if (bgmTimer) clearInterval(bgmTimer);
  motifUnit = u;
  let i = 0;
  bgmTimer = setInterval(() => {
    if (!motifUnit || motifUnit.hp <= 0 || !bgmOn) { beepStop(); return; }
    const m = MOTIF[motifUnit.key] || MOTIF.hero;
    if (m[i % m.length]) beep(m[i % m.length], .18, 'square', .04);
    i++;
  }, 220);
}
function beepStop() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

// B1: HP逐格递减动画当前应显示值(按格一跳, 严禁平滑插值)
// "格"= maxhp 的 1/10(机战格子血条), 每格 per ms, 数字随格同步跳动
function hpAnimValue(now) {
  const a = FX.hpAnim;
  if (now < a.t0) return a.from; // 命中前保持满血显示(此前负数tick会溢出成超大数字)
  const ticks = Math.floor((now - a.t0) / a.per);
  return Math.max(a.to, a.from - ticks * a.seg);
}

// ---------- 渲染 ----------
// P2-13: 朝向读取/写回(缺省我方面朝右/敌方面朝左, 行动按方向翻转)
function unitFace(u) { return FACE[u.id] || (u.side === 'player' ? 1 : -1); }
function setFace(u, dir) { if (dir) FACE[u.id] = dir; }
// P2-13: 敌入射程判定 — 任一武功够得着任一我方单位即返回最近目标(攻击架势用)
function stanceTarget(u) {
  let best = null, bd = 1e9;
  for (const f of G.units) {
    if (f.hp <= 0 || f.side !== 'player') continue;
    const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
    if (d >= bd) continue;
    for (const wid of u.weapons) {
      const w = WEAPONS[wid];
      if (d >= w.rng[0] && d <= w.rng[1]) { best = f; bd = d; break; }
    }
  }
  return best;
}
function spawnDust(wx, wy, now) { FX.dust.push({ wx, wy, t0: now, seed: FX.dust.length % 7 }); }
// P2-13: 地图单位移动 — FE 式步伐插值替原瞬移+sleep, 落定才提交坐标(中途读位置仍是旧格)
async function animUnitMove(u, nx, ny) {
  const dist = Math.abs(nx - u.x) + Math.abs(ny - u.y);
  if (!dist) return;
  if (nx !== u.x) setFace(u, nx > u.x ? 1 : -1);
  MAP_MOVE = { u, x0: u.x, y0: u.y, x1: nx, y1: ny,
               t0: performance.now(), dur: Math.max(200, dist * UAN.tileMs), lastStep: -1 };
  await sleep(MAP_MOVE.dur + 40);
  u.x = nx; u.y = ny;
  if (MAP_MOVE && MAP_MOVE.u === u) MAP_MOVE = null;
  spawnDust(nx * TS + TS / 2, ny * TS + TS - 6, performance.now());  // 落定一团尘
}
function draw() {
  const now = performance.now();
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  // 屏幕震动(命中/会心时)
  if (fxOn && now < FX.shakeUntil) {
    ctx.translate((Math.random() * 2 - 1) * 5, (Math.random() * 2 - 1) * 5);
  }
  // P1-8: 开场镜头 — 推镜扫场期间整个世界坐标系跟着镜头走(覆盖层不受影响)
  if (INTRO.active) {
    const ip = now - INTRO.t0;
    if (ip >= INTRO.dur || !fxOn) INTRO.active = false;
    else {
      const cam = introCam(ip);
      ctx.translate(cv.width / 2 + cam.px, cv.height / 2 + cam.py);
      ctx.scale(cam.s, cam.s);
      ctx.translate(-cv.width / 2, -cv.height / 2);
    }
  }
  // B1 缩略图模式: 演出期间战场整体缩至~40%并置底, 主视觉让给立绘与大字
  const mini = fxOn && FX.miniOn;
  if (mini) {
    const s = 0.4;
    ctx.translate((cv.width - W * TS * s) / 2, cv.height - H * TS * s);
    ctx.scale(s, s);
  }
  // 地块: 旋转变体消重复 + 程序装饰点缀(2026-10-22 丁工"地图太简陋" → 零素材丰富度方案)
  const decoRng = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const key = MAP_LAYOUT[y][x];
    const t = TIDX[key];
    const px = x * TS, py = y * TS;
    const v = (x * 7 + y * 13 + ((x * y) % 5)) % 4;   // 确定性变体 0..3
    ctx.save();
    ctx.translate(px + TS / 2, py + TS / 2);
    if (v === 1) ctx.scale(-1, 1); else if (v === 2) ctx.scale(1, -1); else if (v === 3) ctx.scale(-1, -1);
    ctx.drawImage(tileImg, t * 32, 0, 32, 32, -TS / 2, -TS / 2, TS, TS);
    ctx.restore();
    // 程序装饰层
    ctx.save();
    ctx.translate(px, py);
    if (key === '草地' || key === '平野') {
      ctx.fillStyle = 'rgba(18,58,22,.38)';
      // P2-9: 草叶微风 — 整丛草叶按格相位轻摆(幅度<1px, 三帧对比可读)
      const swayG = Math.sin(now / 420 + x * 1.9 + y * 2.7) * 0.8;
      for (let i = 0; i < 4; i++) {
        const rx = decoRng(x, y, i) * (TS - 8) + 2, ry = decoRng(y, x, i + 9) * (TS - 10) + 2;
        ctx.fillRect(rx + swayG, ry, 3, 6); ctx.fillRect(rx + 5 + swayG, ry + 2, 2, 4);
      }
    } else if (key === '雪地') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(decoRng(x, y, i + 3) * (TS - 10) + 5, decoRng(y, x, i + 5) * (TS - 10) + 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // P2-9: 雪面闪光 — 每格一颗冰晶按各自相位明灭, 峰值时十字星光一闪(雪地在呼吸)
      const twk = 0.5 + 0.5 * Math.sin(now / 300 + (x * 3 + y * 7));
      const sx = decoRng(x, y, 41) * (TS - 14) + 7, sy = decoRng(y, x, 43) * (TS - 14) + 7;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + 0.5 * twk).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
      if (twk > 0.86) {
        ctx.strokeStyle = 'rgba(255,255,255,' + ((twk - 0.86) / 0.14 * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy);
        ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke();
      }
      if (decoRng(x, y, 7) > 0.55) {           // 露出的石尖
        ctx.fillStyle = 'rgba(90,95,110,.6)';
        ctx.beginPath();
        ctx.moveTo(14, 44); ctx.lineTo(24, 30); ctx.lineTo(34, 44); ctx.closePath(); ctx.fill();
      }
    } else if (key === '水泽') {
      // P2-9: 水波微动效 — 三条波线各自相位明暗 + 一条流动波光(机战地图水面的活气)
      const wp = now / 1000;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ry = decoRng(x, y, i + 11) * (TS - 12) + 6;
        const shimmer = 0.5 + 0.5 * Math.sin(wp * 1.6 + x * 1.7 + y * 2.3 + i * 2.1);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.14 + 0.3 * shimmer).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(8 + i * 6, ry);
        ctx.lineTo(8 + i * 6 + 14 + decoRng(y, x, i) * 10, ry);
        ctx.stroke();
      }
      const drift = (wp * 0.25 + decoRng(x, y, 31)) % 1;  // 亮斑左→右漂流, ~4s 一周, 每格相位错开
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * Math.sin(drift * Math.PI)).toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      const gx = 6 + drift * (TS - 16), gy = decoRng(x, y, 13) * (TS - 14) + 7;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 10, gy); ctx.stroke();
    } else if (key === '屋顶') {
      ctx.strokeStyle = 'rgba(70,22,22,.45)'; ctx.lineWidth = 2;
      for (const lx of [14, 30, 46]) { ctx.beginPath(); ctx.moveTo(lx, 4); ctx.lineTo(lx, TS - 4); ctx.stroke(); }
    } else if (key === '城墙' || key === '石板') {
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(2, 32); ctx.lineTo(TS - 2, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, 6); ctx.lineTo(20, 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(44, 36); ctx.lineTo(44, 58); ctx.stroke();
    } else if (key === '竹林') {
      ctx.fillStyle = 'rgba(12,52,22,.42)';
      // P2-9: 竹影轻摇 — 两团竹影随正弦微偏移(风过竹林, 与草叶同频不同相)
      const swayB = Math.sin(now / 500 + x * 2.1 + y * 1.3) * 1.6;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(decoRng(x, y, i + 21) * (TS - 12) + 6 + swayB, decoRng(y, x, i + 17) * (TS - 12) + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  // 范围高亮
  // P2-9: 范围呼吸 — 选中范围按正弦整体明灭(240ms 相位), 光标感从"油漆"变"活气"
  const hb = 0.5 + 0.5 * Math.sin(now / 240);
  if (Sel.moveTiles) for (const key in Sel.moveTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(60,140,255,' + (0.20 + 0.12 * hb).toFixed(3) + ')';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(90,160,255,' + (0.65 + 0.3 * hb).toFixed(3) + ')';
    ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  if (Sel.atkTiles) for (const key in Sel.atkTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(255,70,60,' + (0.18 + 0.11 * hb).toFixed(3) + ')';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(255,110,90,' + (0.60 + 0.32 * hb).toFixed(3) + ')';
    ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  if (Sel.comboTiles) for (const key in Sel.comboTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(255,210,60,' + (0.22 + 0.14 * hb).toFixed(3) + ')';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(255,220,90,' + (0.70 + 0.28 * hb).toFixed(3) + ')';
    ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  // 单位
  // P2-10: 单位占比 64→78px — FE/SRW 惯例: 人物略溢格边才有战场体积感。
  // 脚底锚定(底部对齐格底-2), 头顶自然探入上一格; 框/HP条仍按格子画(格子标记≠人物轮廓)
  const US = 78;
  for (const u of G.units) {
    if (u.hp <= 0) continue;
    const im = sprites[u.sprite];
    // ---- P2-13: 本帧姿态 — 移动插值/选中踏步/敌架势/待机呼吸 + 朝向翻转 ----
    const face = unitFace(u);
    let gx = u.x, gy = u.y;      // 绘制格位(移动动画期间为小数插值)
    let squash = 1, lean = 0, hopY = 0;
    const m = MAP_MOVE;
    if (m && m.u === u) {
      const p = win(now, m.t0, m.t0 + m.dur);
      gx = m.x0 + (m.x1 - m.x0) * p;
      gy = m.y0 + (m.y1 - m.y0) * p;
      const dist = Math.abs(m.x1 - m.x0) + Math.abs(m.y1 - m.y0);
      const stepPh = p * dist * 2;                          // 每格两步, 落足点交替
      squash = 1 - UAN.stepSquash * Math.abs(Math.sin(Math.PI * stepPh));
      lean = UAN.stepLean;                                  // 上身前倾朝行进向
      const st = Math.floor(stepPh);
      if (st > m.lastStep) {                                // 每次落足扬尘(脚步踩得到地面)
        m.lastStep = st;
        spawnDust(gx * TS + TS / 2 - face * 12, gy * TS + TS - 6, now);
      }
    } else if (Sel.unit === u) {
      // 选中: FE 式快节奏原地踏步(小跳+轮替squash, 光标下的单位是"待命"不是站桩)
      const ph = (now % (UAN.selHopT * 2)) / UAN.selHopT;  // 0..2 一轮两拍
      hopY = -Math.abs(Math.sin(Math.PI * ph)) * UAN.selHopY;
      squash = 1 - 0.03 * Math.sin(2 * Math.PI * ph);
    } else if (u.side === 'enemy' && stanceTarget(u)) {
      // 敌入射程: 攻击架势 — 沉身前倾朝最近可及我方, 呼吸压平(临战感, FE 敌兵举刀待发)
      const tgt = stanceTarget(u);
      if (tgt.x !== u.x) setFace(u, tgt.x > u.x ? 1 : -1);
      squash = 0.96; lean = 0.06;
    } else {
      // 待机呼吸 squash-stretch — 脚底锚定, 相位按单位id错开(整队不整齐划一)
      squash = 1 + UAN.breatheA * Math.sin(now / UAN.breatheT * 2 * Math.PI + u.id * 1.93);
    }
    if (u.side === 'enemy') { // 敌方红框
      ctx.strokeStyle = '#d04030'; ctx.lineWidth = 2;
      ctx.strokeRect(gx * TS + 3, gy * TS + 3, TS - 6, TS - 6);
    }
    if (Sel.unit === u) {
      // P2-9: 选中呼吸 — 外圈金光按正弦明灭(200ms 相位), 选中态是活的不是油漆框
      const pulse = 0.55 + 0.45 * Math.sin(now / 200);
      ctx.save();
      ctx.globalAlpha = pulse * 0.55;
      ctx.strokeStyle = '#fff8c0'; ctx.lineWidth = 6;
      ctx.strokeRect(gx * TS + 2, gy * TS + 2, TS - 4, TS - 4);
      ctx.restore();
      ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 3;
      ctx.strokeRect(gx * TS + 2, gy * TS + 2, TS - 4, TS - 4);
    }
    if (im.complete) {
      const h = US * squash;
      ctx.save();
      ctx.translate(gx * TS + TS / 2, gy * TS + TS - 2 + hopY);  // 脚底锚定
      if (lean) ctx.rotate(lean * face);                          // 前倾朝面朝向
      ctx.scale(face, 1);                                         // 按朝向水平翻转
      ctx.drawImage(im, -US / 2, -h, US, h);
      ctx.restore();
    }
    // HP 条 + 气势(移动插值期间跟着人物走)
    const bw = TS - 10;
    // B1 演出期间: 条与数字都走逐格动画的当前值, 演出关闭时直接用真实值
    const disp = (fxOn && FX.hpAnim && FX.hpAnim.u === u) ? hpAnimValue(now) : u.hp;
    ctx.fillStyle = '#202028'; ctx.fillRect(gx * TS + 5, gy * TS + TS - 8, bw, 4);
    ctx.fillStyle = u.side === 'player' ? '#50c060' : '#d05040';
    ctx.fillRect(gx * TS + 5, gy * TS + TS - 8, bw * (Math.max(0, disp) / u.maxhp), 4);
    ctx.fillStyle = '#202028'; ctx.fillRect(gx * TS + 5, gy * TS + TS - 3, bw, 2);
    ctx.fillStyle = '#e8c85a';
    ctx.fillRect(gx * TS + 5, gy * TS + TS - 3, bw * (u.will / 150), 2);
    ctx.fillStyle = u.side === 'player' ? '#cfe0ff' : '#ffc8b8';
    ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(u.cn, gx * TS + TS / 2, gy * TS + 10);
    // B1 扣血中的数字同步跳动(会心红字)
    if (fxOn && FX.hpAnim && FX.hpAnim.u === u) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = FX.hpAnim.crit ? '#ff5040' : '#fff8e0';
      ctx.fillText(Math.max(0, disp), gx * TS + TS / 2, gy * TS + TS - 14);
    }
  }
  // P2-13: 移动扬尘 — 落足小尘团渐扩渐淡(程序绘制零素材)
  if (FX.dust.length) {
    for (const d of FX.dust) {
      const age = now - d.t0;
      if (age < 0 || age > UAN.dustLife) continue;
      const p = age / UAN.dustLife;
      const j = (d.seed % 3 - 1) * 3;
      ctx.globalAlpha = (1 - p) * 0.5;
      ctx.fillStyle = '#ddd2bc';
      ctx.beginPath();
      ctx.arc(d.wx + j * p, d.wy - 8 * p, 3 + 5.5 * p, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    FX.dust = FX.dust.filter(d => now - d.t0 <= UAN.dustLife);
  }
  // 伤害飘字(B1: 由draw统一渲染, 与战场同一坐标系)
  ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  for (const f of FX.floats) {
    const age = now - f.t0;
    if (age < 0 || age > 1040) continue;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x * TS + TS / 2, f.y * TS + 8 - age / 40 * 2);
  }
  // 鼠标格
  if (mouse.x >= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(mouse.x * TS + .5, mouse.y * TS + .5, TS - 1, TS - 1);
  }
  // P1-8: 开场点名脉冲(世界坐标, 随镜头变焦)
  if (INTRO.active) drawIntroPulses(now);
  ctx.restore(); // 震动/缩略图/开场镜头变换结束, 覆盖层不参与抖动
  if (FX.floats.length) FX.floats = FX.floats.filter(f => now - f.t0 <= 1040);

  // B2: 战斗场景覆盖一切; 否则走旧立绘切入路径
  if (FIGHT.active) { drawFightScene(now); requestAnimationFrame(draw); return; }

  // ---- 机战式演出覆盖层: 缩略图暗幕 + 爆闪 + 立绘切入 + 书法大字 ----
  if (fxOn) {
    // B1 缩略图模式: 暗色遮罩压暗战场背景, 突出演出主体
    if (mini) {
      ctx.fillStyle = 'rgba(4,6,16,.62)';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    if (now < FX.flashUntil) {
      const a = 0.85 * (1 - (now - FX.flashT0) / (FX.flashUntil - FX.flashT0));
      ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, a).toFixed(3) + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    // P3-12a: BOSS 阶段赤红压屏闪(与受击白闪分层, 情绪拐点必须看得见)
    if (now < FX.redUntil) {
      const a = 0.5 * (1 - (now - FX.redT0) / (FX.redUntil - FX.redT0));
      const rg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, 60,
        cv.width / 2, cv.height / 2, cv.width * 0.7);
      rg.addColorStop(0, 'rgba(200,30,20,0)');
      rg.addColorStop(1, 'rgba(200,30,20,' + Math.max(0, a).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    // P0-1/P1-6/P3-12a: 立绘切入+书法大字; 无立绘角色大字居中(台词/运功通用)
    // cutinRight: BOSS 从右侧入画(面对玩家), 文字居左——与运功cutin(左入画)镜像
    if (now < FX.cutinUntil && FX.bigText) {
      const im = FX.portrait;
      const hasIm = im && im.complete;
      let tx;
      if (hasIm) {
        const ph = cv.height * 0.78, pw = ph * im.width / im.height;
        const slide = Math.min(1, (now - FX.cutinT0) / 220); // 220ms滑入
        if (FX.cutinRight) {
          const px = cv.width + pw - (14 + pw) * slide - pw;  // 右侧贴边入画
          // 镜像面向左=面向玩家: T(px+pw,0)·S(-1,1) 后, 镜像空间内画 [0,pw] 正好落在 [px,px+pw]
          ctx.save(); ctx.translate(px + pw, 0); ctx.scale(-1, 1);
          ctx.drawImage(im, 0, cv.height - ph - 8, pw, ph);
          ctx.restore();
          tx = Math.min(px - 30, cv.width * 0.52);
          ctx.textAlign = 'right';
        } else {
          const px = -pw + (14 + pw) * slide;
          ctx.drawImage(im, px, cv.height - ph - 8, pw, ph);
          tx = Math.max(px + pw - 40, cv.width * 0.38);
          ctx.textAlign = 'left';
        }
      } else {
        tx = cv.width * 0.5; // 无立绘: 大字居中
        ctx.textAlign = 'center';
      }
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 68px "KaiTi","STKaiti","Microsoft YaHei",serif';
      const ty = cv.height * 0.4;
      ctx.lineWidth = 10; ctx.strokeStyle = FX.bigCrit ? '#7a1010' : '#26203a';
      ctx.strokeText(FX.bigText, tx, ty);
      ctx.fillStyle = FX.bigCrit ? '#ffd24a' : '#fff8e0';
      ctx.fillText(FX.bigText, tx, ty);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    }
    // P1-6: 运功角色色环 — 画在覆盖层最上(不被立绘切入遮住, 角色色扩散反馈必须被看见)
    if (FX.ringFx && now < FX.ringFx.until) {
      const r = FX.ringFx, rp = win(now, r.t0, r.until);
      const cx = r.x * TS + TS / 2, cy = r.y * TS + TS / 2;
      ctx.save();
      // 双环外扩(外环粗亮, 内环补韵)
      const rad = 18 + rp * 48;
      ctx.globalAlpha = (1 - rp);
      ctx.strokeStyle = r.color; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - rp) * 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, rad * 0.62, rad * 0.62 * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      // 角色色溢光
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, TS * 0.85);
      rg.addColorStop(0, r.color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (1 - rp) * 0.5;
      ctx.fillStyle = rg;
      ctx.fillRect(cx - TS, cy - TS, TS * 2, TS * 2);
      ctx.restore();
    }
    // B1 机战式大HP条: 演出中以粗条逐格扣血(缩略图里的小条同步递减)
    if (FX.hpAnim && now >= FX.hpAnim.t0) {
      const a = FX.hpAnim;
      const cur = Math.max(0, hpAnimValue(now));
      const gw = cv.width * 0.44, gh = 16, gx = cv.width * 0.34, gy = cv.height * 0.56;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 19px "KaiTi","STKaiti","Microsoft YaHei",serif';
      ctx.fillStyle = a.crit ? '#ff6050' : '#fff8e0';
      ctx.fillText(`${a.u.cn}  HP ${cur}/${a.u.maxhp}`, gx, gy - 15);
      ctx.fillStyle = '#202028'; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = a.crit ? '#e04030' : (a.u.side === 'player' ? '#50c060' : '#d05040');
      ctx.fillRect(gx, gy, gw * (cur / a.u.maxhp), gh);
      // 分段刻度(每1/10一格, 机战格子血条)
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(gx + gw * i / 10, gy); ctx.lineTo(gx + gw * i / 10, gy + gh);
        ctx.stroke();
      }
      ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    }
  }
  // P3-11a: 剧情演出覆盖层(标题卡/对白框/出击画面, 战前序章专属; 与 FIGHT 互斥不同时)
  if (TITLE.active) drawTitleCard(now);
  if (DLG.active) drawDialogBox(now);
  if (SORTIE.active) drawSortie(now);
  // P3-12a: BOSS 阶段台词台词条(底部黑条金字, 与对白框同风格但轻量, 不与剧情演出共存)
  if (FX.phaseQuote && now < FX.phaseQuote.until) {
    const q = FX.phaseQuote, qa = Math.min(1, (now - q.t0) / 220);
    const qy = cv.height - 96;
    ctx.save();
    ctx.globalAlpha = qa * 0.92;
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(cv.width * 0.08, qy - 26, cv.width * 0.84, 52);
    ctx.strokeStyle = '#8a2a20'; ctx.lineWidth = 1.5;
    ctx.strokeRect(cv.width * 0.08, qy - 26, cv.width * 0.84, 52);
    ctx.globalAlpha = qa;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '22px "KaiTi","STKaiti","Microsoft YaHei",serif';
    ctx.fillStyle = '#f0d8b0';
    ctx.fillText(q.text, cv.width / 2, qy);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  }
  // P3-11b: 评价结算画面(最顶层; 点击重开)
  // P3-12 D2: 升级大字画在结算屏之下(结算优先, 击破BOSS同帧升级时不糊结算画面)
  if (LVUP.active) drawLvUp(now);
  if (RESULT.active) drawResult(now);
  requestAnimationFrame(draw);
}

// ============ P3-11b: 评价结算画面(机战式战斗结果, 程序绘制零素材; 内容在 data.js RESULT_CFG) ============
// 入场编排: 幕布→章名/任务完成→三项战绩逐行→评价大字弹入→收尾旁白→重开提示; 点击画面重开一局
function drawResult(now) {
  const p = now - RESULT.t0;
  const CW = cv.width, CH = cv.height;
  const KAI = '"KaiTi","STKaiti","Microsoft YaHei",serif';
  // 深蓝夜幕底(序章雪夜同题材) + 冷月光晕
  ctx.fillStyle = '#0a0e1c';
  ctx.fillRect(0, 0, CW, CH);
  const mg = ctx.createRadialGradient(CW / 2, CH * 0.30, 0, CW / 2, CH * 0.30, 260);
  mg.addColorStop(0, 'rgba(150,180,255,0.14)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.textAlign = 'center';
  const fadeIn = win(p, 0, 450);

  // 章名 + 任务完成
  ctx.globalAlpha = fadeIn * win(p, 150, 500);
  ctx.font = `20px ${KAI}`;
  ctx.fillStyle = '#c8b060';
  ctx.fillText(STORY.chapterNo + ' · ' + STORY.chapterTitle, CW / 2, 118);
  ctx.globalAlpha = fadeIn * win(p, 300, 750);
  ctx.font = `bold 54px ${KAI}`;
  ctx.fillStyle = '#ffd24a';
  ctx.shadowColor = 'rgba(255,210,74,0.55)'; ctx.shadowBlur = 22;
  ctx.fillText(RESULT_CFG.victoryTitle, CW / 2, 185);
  ctx.shadowBlur = 0;
  // 金漆分隔线
  ctx.globalAlpha = fadeIn * win(p, 550, 800);
  ctx.strokeStyle = '#8a7430'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CW * 0.20, 214); ctx.lineTo(CW * 0.80, 214); ctx.stroke();

  // 三项战绩逐行入场(击破/说得/回合); P3-12a: foes 含阶段召唤援军(由 engine 在召唤时累加)
  const foesTotal = G.stats.foes || INITIAL_UNITS.filter(e => CHAR_DATA[e.tpl || e.key].side === 'enemy').length;
  const rows = [
    ['击破敌军', `${G.stats.kills} / ${foesTotal}`],
    ['说得', `${G.stats.speaks} / 1`],
    ['使用回合', `${G.turn}`],
  ];
  rows.forEach((r, i) => {
    const a = fadeIn * win(p, 750 + i * 260, 1000 + i * 260);
    if (a <= 0) return;
    const y = 268 + i * 46;
    ctx.globalAlpha = a * 0.85;
    ctx.font = `24px ${KAI}`;
    ctx.fillStyle = '#d8dce8';
    ctx.textAlign = 'right';
    ctx.fillText(r[0], CW * 0.46, y);
    ctx.textAlign = 'left';
    ctx.font = `bold 26px ${KAI}`;
    ctx.fillStyle = '#fff8e0';
    ctx.fillText(r[1], CW * 0.50, y);
    ctx.textAlign = 'center';
  });

  // 评价大字(回合定档, data.js RESULT_CFG.ranks; 弹入过冲)
  const rk = RESULT_CFG.ranks.find(r => G.turn <= r.maxTurns) || RESULT_CFG.ranks[RESULT_CFG.ranks.length - 1];
  const ra = fadeIn * win(p, 1650, 1950);
  if (ra > 0) {
    const pop = 1 + (1 - easeOutBack(win(p, 1650, 1950))) * 0.6;
    ctx.save();
    ctx.translate(CW * 0.76, 330);
    ctx.scale(pop, pop);
    ctx.globalAlpha = ra;
    ctx.font = `bold 128px ${KAI}`;
    const rankColor = rk.rank === 'S' ? '#ffd24a' : (rk.rank === 'A' ? '#8fd08f' : (rk.rank === 'B' ? '#7ab8ff' : '#b8a0c0'));
    ctx.fillStyle = rankColor;
    ctx.shadowColor = rankColor; ctx.shadowBlur = 30;
    ctx.fillText(rk.rank, 0, 0);
    ctx.restore();
    ctx.globalAlpha = ra * win(p, 1950, 2250);
    ctx.font = `22px ${KAI}`;
    ctx.fillStyle = '#c8b060';
    ctx.fillText('评 价', CW * 0.76, 400);
    ctx.globalAlpha = ra * win(p, 2150, 2450);
    ctx.font = `19px ${KAI}`;
    ctx.fillStyle = '#a8b0c8';
    ctx.fillText(rk.blurb, CW * 0.76, 434);
  }

  // 收尾旁白(机战式结尾定格) + 重开提示
  RESULT_CFG.ending.forEach((line, i) => {
    const a = fadeIn * win(p, 2550 + i * 380, 2850 + i * 380);
    if (a <= 0) return;
    ctx.globalAlpha = a * 0.95;
    ctx.font = `${i === 0 ? '22px' : '26px'} ${KAI}`;
    ctx.fillStyle = i === 0 ? '#d8dce8' : '#c8b060';
    ctx.fillText(line, CW / 2, CH - 150 + i * 40);
  });
  const ha = fadeIn * win(p, 3400, 3700) * (0.65 + 0.35 * Math.sin(p / 320));
  ctx.globalAlpha = Math.max(0, ha);
  ctx.font = `18px ${KAI}`;
  ctx.fillStyle = '#8a94b0';
  ctx.fillText('点击画面 重新开始', CW / 2, CH - 34);
  ctx.globalAlpha = 1;
}

// ============ FIGHT 背景: 雪夜战场全景(程序绘制, 零素材) ============
// 2026-10-22 丁工点名"战斗时没有背景画面"。机战式战斗背景 = 全屏环境:
// 夜空渐变+冷月+远山城影+城墙剪影飘旗+雪粒子飘落。击破定格时 now 冻结, 雪与旗同步定格。
function drawFightBackdrop(now, CW, CH, outA) {
  const horizon = CH * 0.60;                       // 地平线(城墙根)
  // --- 夜空: 雪夜深蓝渐变, 地平线处透一点暖光(远处灯火) ---
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#070a1a');
  sky.addColorStop(0.55, '#101735');
  sky.addColorStop(0.88, '#252045');
  sky.addColorStop(1, '#3a2b46');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, horizon);
  // --- 冷月 + 光晕 ---
  const mx = CW * 0.76, my = CH * 0.17, mr = 30;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4.2);
  halo.addColorStop(0, 'rgba(210,225,255,.34)');
  halo.addColorStop(0.4, 'rgba(180,200,255,.10)');
  halo.addColorStop(1, 'rgba(160,190,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 4.2, my - mr * 4.2, mr * 8.4, mr * 8.4);
  ctx.fillStyle = '#dfe8fa';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,175,210,.5)';          // 月面暗斑
  ctx.beginPath(); ctx.arc(mx - 9, my - 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 7, my + 8, 4.5, 0, Math.PI * 2); ctx.fill();
  // --- 远山两层剪影(大气透视: 越远越亮越蓝) ---
  const ridge = (baseY, amp, color, seed) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= CW; x += 24) {
      const y = baseY - Math.abs(Math.sin(x * 0.008 + seed)) * amp - Math.sin(x * 0.021 + seed * 2.7) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CW, horizon);
    ctx.closePath(); ctx.fill();
  };
  ridge(horizon - 46, 74, 'rgba(38,46,86,.75)', 1.7);
  ridge(horizon - 14, 52, 'rgba(24,30,58,.95)', 4.2);
  // --- 城墙剪影: 底部主体+顶部城垛+两面飘旗(序章主题: 不该存在的城墙) ---
  ctx.fillStyle = '#1a1420';
  ctx.fillRect(0, horizon - 58, CW, 58);
  for (let x = 8; x < CW; x += 46) ctx.fillRect(x, horizon - 72, 24, 14);   // 城垛
  ctx.fillStyle = 'rgba(255,190,110,.16)';                                  // 墙上灯火窗洞
  for (let x = 26; x < CW; x += 92) ctx.fillRect(x, horizon - 40, 7, 10);
  const flag = (fx, i) => {                    // 飘旗: 旗杆+quadratic 旗面随时间摆动
    ctx.strokeStyle = '#2c2130'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx, horizon - 72); ctx.lineTo(fx, horizon - 128); ctx.stroke();
    const wave = Math.sin(now / 260 + i * 2.1) * 9;
    ctx.fillStyle = i % 2 ? '#6e1f24' : '#232c56';
    ctx.beginPath();
    ctx.moveTo(fx, horizon - 128);
    ctx.quadraticCurveTo(fx + 26, horizon - 126 + wave, fx + 50, horizon - 118 + wave * 1.6);
    ctx.quadraticCurveTo(fx + 26, horizon - 112 + wave, fx, horizon - 104);
    ctx.closePath(); ctx.fill();
  };
  flag(CW * 0.16, 0); flag(CW * 0.58, 1); flag(CW * 0.87, 2);
  // --- 地面: 雪地, 近深远浅 + 地面微光 ---
  const gnd = ctx.createLinearGradient(0, horizon, 0, CH);
  gnd.addColorStop(0, '#3d3a52');
  gnd.addColorStop(0.35, '#2c2a3e');
  gnd.addColorStop(1, '#191722');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, horizon, CW, CH - horizon);
  const glow = ctx.createRadialGradient(CW * 0.5, CH * 0.99, 40, CW * 0.5, CH * 0.99, CW * 0.62);
  glow.addColorStop(0, 'rgba(120,130,190,.13)');
  glow.addColorStop(1, 'rgba(120,130,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon, CW, CH - horizon);
  ctx.strokeStyle = 'rgba(210,220,255,.07)'; ctx.lineWidth = 2;  // 雪地裂纹
  for (let i = 0; i < 6; i++) {
    const yy = horizon + 24 + i * ((CH - horizon) / 7);
    ctx.beginPath(); ctx.moveTo((i * 257) % CW, yy);
    ctx.lineTo(((i * 257) % CW) + 130 + i * 40, yy + 4);
    ctx.stroke();
  }
  // --- 雪粒子: FIGHT 开始时初始化, 位置按 now 确定性推进(定格即冻结) ---
  if (!FIGHT.snow || !FIGHT.snow.length) return;
  const el = now - FIGHT.t0;
  ctx.fillStyle = 'rgba(235,242,255,.85)';
  for (const s of FIGHT.snow) {
    const y = ((s.y0 + el * s.v) % (CH + 20)) - 10;
    const x = ((s.x0 + Math.sin(el / 700 + s.ph) * 26 + el * s.drift) % (CW + 20) + CW + 20) % (CW + 20) - 10;
    ctx.globalAlpha = s.a * outA;
    ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============ B2: 战斗场景渲染(FIGHT.active 期间由 draw 调) ============
// ============ P1-14: 三镜相机(独立镜头状态: 推拉/注视点/切镜黑场; 纯表现层, 只读 FT 时间轴) ============
// 镜1 起手特写: s 1.04→1.30 缓推攻方半身; 镜2 攻击全景: 拉回 ~1.02; 镜3 命中特写: 守方中景 s~1.16。
// 切镜点(cut1/cut2)各接 cutMs 黑场(1→0 衰减), 机战标志性剪辑——黑场遮住机位跳变。
function fightCam(p, attFx, attFy, defFx, defFy) {
  const CW = cv.width, CH = cv.height;
  let s, fx, fy, bx = CW * 0.40, by = CH * 0.46; // 注视点落屏位置: 镜1攻方偏左(身后留空间)
  const S2 = FT.cut1 + FT.cutMs, S3 = FT.cut2 + FT.cutMs;
  if (p < FT.cut1) { // 镜1: smoothstep 缓推(慢工出细活, 不硬怼)
    const u = Math.max(0, (p - FT.enter) / (FT.cut1 - FT.enter));
    const e = u * u * (3 - 2 * u);
    s = 1.04 + 0.26 * e; fx = attFx; fy = attFy;
  } else if (p < S3) { // 镜2: 从特写拉回全景(切镜黑场遮住跳变)
    const u = win(p, S2 - 120, FT.cut2);
    s = 1.30 - 0.28 * u; fx = CW * 0.5; fy = CH * 0.52; bx = CW * 0.5; by = CH * 0.52;
  } else { // 镜3: 守方中景(受击表演是主角)
    const u = win(p, S3, S3 + 240);
    s = 1.02 + 0.14 * u; fx = defFx; fy = defFy; bx = CW * 0.58; by = CH * 0.46;
  }
  let black = 0; // 切镜黑场
  if (p >= FT.cut1 && p < FT.cut1 + FT.cutMs) black = 1 - (p - FT.cut1) / FT.cutMs;
  else if (p >= FT.cut2 && p < FT.cut2 + FT.cutMs) black = 1 - (p - FT.cut2) / FT.cutMs;
  return { s, fx, fy, bx, by, black };
}

function drawFightScene(nowReal) {
  const ev = FIGHT.ev;
  if (!ev) return;
  const p = nowReal - FIGHT.t0;
  const crit = FIGHT.crit;
  const tStrike = FT.strike + (crit ? 120 : 0);
  const tImpact = FT.impact + (crit ? 120 : 0); // P1-14: 命中锚点(镜3起): 白闪/震屏/扣血/守方登场受击
  const killAt = FIGHT.killAt || 0;
  // P1-5: 击破定格 — 定格窗口内全场景时间冻结(火花悬停/立绘定住), 只有白闪在衰减
  const now = (ev.killed && p >= killAt && p < killAt + 500)
    ? FIGHT.t0 + killAt : nowReal;
  const outA = 1 - win(p, FIGHT.durOut - 200, FIGHT.durOut); // 收势淡出
  const CW = cv.width, CH = cv.height;

  // --- 背景: 雪夜战场全景(程序绘制零素材) — 2026-10-22 丁工点名"战斗无背景", 取代旧"缩略图+黑幕" ---
  drawFightBackdrop(now, CW, CH, outA);
  ctx.save();
  ctx.globalAlpha = outA;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CW, 54);            // 上黑边
  ctx.fillRect(0, CH - 44, CW, 44);      // 下黑边

  // --- 站位: P1-11 机战式出招流程(丁工10-23点名) — 发招期攻方独占, 命中帧守方才登场, 受击完毕退场收势 ---
  const enter = win(p, 0, FT.enter);
  const ease = 1 - Math.pow(1 - enter, 3);
  const PH = 470;                              // 立绘高度(缩小拉开对峙距离)
  const standY = CH - 44 - PH + 14;
  const attRestX = 64;
  const attX = -380 + ease * (attRestX + 380);
  const defW0 = FIGHT.defIsPortrait ? PH * (FIGHT.defImg.width / FIGHT.defImg.height) : 400;
  const defRestX = CW - 96 - defW0;
  // P1-14: 推近/拉回全部交给三镜相机(fightCam), 立绘自身不再做镜头位移——独占感由镜1特写表达
  const attScale = 1;
  const attDX = 0;
  // 守方登场: 镜3 黑场切镜中滑入(命中特写一开场守方已在画), 之前完全不在画面
  const defEnterP = win(p, tImpact - 90, tImpact + 30);            // P1-14: 登场进度(命中前90ms起, 黑场遮切入画)
  const defSlideIn = Math.pow(1 - defEnterP, 3) * 300;             // 从右屏外被"打入"画面(ease-out)
  let defExit = 0, defAlpha = win(p, tImpact - 90, tImpact - 20);  // 入画淡入极快
  let defSink = 0;                                                 // 击破: 倒下沉降
  if (ev.killed) {
    // 击破: 定格期必须在场(冻结帧), 击破大字播放时倒下退场
    if (p >= killAt + 500) defSink = win(p, killAt + 500, killAt + 950) * 44;
    defAlpha *= 1 - win(p, killAt + 520, killAt + 980);
  } else {
    // 受击完毕退场收势: 峰值落定后稍驻留, 随即向右离场(镜3 内完成, 攻方独占收势)
    defExit = win(p, tImpact + 470, tImpact + 830) * 190;
    defAlpha *= 1 - win(p, tImpact + 620, tImpact + 960);
  }
  const defX = defRestX + defSlideIn + defExit;
  const defW = (FIGHT.defIsPortrait ? PH : 420) * (FIGHT.defImg.width / FIGHT.defImg.height); // 与 drawPuppet 返回宽一致(FX 端点用)
  // P1-9: 受击后仰进度(守方 puppet 姿态驱动); 击破定格期间姿态锁在峰值帧; P1-14: 受击窗口在镜3
  const hitP = win(p, tImpact, tImpact + 430);
  const recoil = (hitP > 0 && hitP < 1) ? Math.sin(hitP * Math.PI) : 0;
  const freezeHit = !!ev.killed && p >= killAt && p < killAt + 500;
  let defShakeX;
  if (FIGHT.isMiss) defShakeX = -recoil * 90; // 守方向右后方闪避(面向左,身后=+x取负避开)
  else defShakeX = recoil * (16 + (crit ? 10 : 0)) * (0.55 + Math.random() * 0.45);
  // 突进类位移(整体位移保留, 但不再是唯一动作——身体姿态由 puppet 层表达)
  // P1-15: 全招式突进——近战(dash/stab/sweep/dragon/smash/slashx)全幅 0.22CW，
  // 远程(beam/bullet/wave)半幅 0.10CW：原地发招也要有前冲的决意，人物才"动"得起来
  let attLunge = 0, attLeapY = 0;
  const sp2 = win(p, tStrike - 70, tStrike + 140);
  const MELEE_KINDS = { dash: 1, stab: 1, sweep: 1, dragon: 1, smash: 1, slashx: 1 };
  if (FIGHT.animKind === 'smash') // 跃起下砸
    attLeapY = -Math.sin(Math.min(1, sp2) * Math.PI) * 130;
  attLunge = Math.sin(Math.min(1, sp2) * Math.PI) * (MELEE_KINDS[FIGHT.animKind] ? CW * 0.22 : CW * 0.10);
  // P1-15: 命中急停——出招冲程在命中锚被"刹住"并微回弹(机战击打帧顿挫感)
  const attRecoilX = -34 * win(p, tImpact, tImpact + 90) * (1 - win(p, tImpact + 90, tImpact + 320));
  // P1-9: 双方 puppet 姿态(像素小人走整图变换: 64px 源图切三层会裂)
  const attPose = fightAttPose(p, now, tStrike);
  attPose.whole = !FIGHT.attIsPortrait;
  const defPose = fightDefPose(p, now, tImpact, FIGHT.isMiss, crit, freezeHit, FIGHT.defIsPortrait);
  defPose.whole = !FIGHT.defIsPortrait;

  // --- 守方(P1-11: 只在登场~退场窗口内绘制; 落空残影/受击/侧闪由 puppet 姿态表达) ---
  const defH = FIGHT.defIsPortrait ? PH : 420; // 无立绘角色 sprite 放大到 420
  const defY = standY + (FIGHT.defIsPortrait ? 0 : 100) + defSink;
  // P1-14: 三镜相机 — 镜1攻方半身/镜2全景/镜3守方中景, 切镜黑场由 fightCam 给出
  const attH0e = FIGHT.attIsPortrait ? PH : 420;
  const attWrest = attH0e * (FIGHT.attImg.width / FIGHT.attImg.height);
  const cam = fightCam(p,
    attX + attDX + attWrest * 0.5, standY + (FIGHT.attIsPortrait ? 0 : 100) + attH0e * 0.40,
    defRestX + defW * 0.45, defY + defH * 0.42);
  ctx.save();
  ctx.translate(cam.bx, cam.by); ctx.scale(cam.s, cam.s); ctx.translate(-cam.fx, -cam.fy);
  // 站位脚下阴影(人站在雪地上, 不是飘在背景前)
  if (defAlpha > 0.01) {
    ctx.fillStyle = 'rgba(8,8,16,.42)';
    ctx.beginPath(); ctx.ellipse(defX + defW0 * 0.5, defY + defH + 4, defW0 * 0.46, 14, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 攻方脚下阴影(独占推近期同步放大移位; 不受突进位移影响)
  const attGroundY = standY + (FIGHT.attIsPortrait ? PH : 100 + 420) + 4;
  ctx.fillStyle = 'rgba(8,8,16,.42)';
  ctx.beginPath(); ctx.ellipse(attX + attDX + (FIGHT.attIsPortrait ? 300 : 200) * attScale, attGroundY,
    (FIGHT.attIsPortrait ? 150 : 190) * (0.7 + 0.3 * attScale), 14, 0, 0, Math.PI * 2); ctx.fill();
  if (defAlpha > 0.01) {
    if (FIGHT.isMiss && hitP > 0 && hitP < 1) {
      drawPuppet(FIGHT.defImg, defX + defShakeX * 0.4, defY, defH, true, 0.22 * outA * defAlpha, defPose);
      drawPuppet(FIGHT.defImg, defX + defShakeX * 0.7, defY, defH, true, 0.12 * outA * defAlpha, defPose);
    }
    drawCombatant('def', FIGHT.defImg, defX + defShakeX, defY, defH, true, outA * defAlpha, defPose, 'impact', p); // P1-14 钩子: 守方登场起 phase 恒 'impact'; p 供姿势帧时间轴(pose_bridge)
    // crit 双影(更强打击感)
    if (!FIGHT.isMiss && crit && hitP > 0.05 && hitP < 0.85)
      drawPuppet(FIGHT.defImg, defX + defShakeX - 16 * recoil, defY + 5, defH, true, 0.30 * (1 - hitP) * outA * defAlpha, defPose);
    // 受击白闪(落空无; crit 加强): 白色剪影压人
    if (!FIGHT.isMiss && hitP > 0 && hitP < 0.5) {
      const fa = Math.min(1, (0.5 - hitP) * (crit ? 2.4 : 1.5)) * outA * defAlpha;
      if ('filter' in ctx) {
        ctx.save();
        ctx.filter = 'brightness(0) invert(1)';
        drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, fa * 0.75, defPose);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, fa * 0.4, defPose);
        ctx.restore();
      }
    }
  }

  // --- 攻方(puppet: 呼吸/下蹲蓄力/前送出招/过冲收招; P1-11 独占期推近放大, 脚底锚定不飘) ---
  const attH0 = FIGHT.attIsPortrait ? PH : 420;
  const attH = attH0 * attScale;
  const attY = standY + (FIGHT.attIsPortrait ? 0 : 100) + attLeapY - (attH - attH0);
  const attW0 = attH * (FIGHT.attImg.width / FIGHT.attImg.height); // 立绘宽(搭档站位用)
  // P1-7: 合体技双立绘同框 — 搭档画在主攻右侧(萧左郭右), 先画搭档让主攻叠其上;
  // 蓄力同频, 出招接力晚~130ms(双动机接力), 突进位移只跟 30%(主攻是镜头主角)
  let partnerX = 0, partnerY = 0, partnerH = 0;
  if (FIGHT.comboPartner) {
    partnerH = FIGHT.partnerIsPortrait ? PH * 0.92 : 400;
    partnerX = attX + attDX + attLunge * 0.3 + attW0 * 0.60;
    partnerY = standY + (FIGHT.partnerIsPortrait ? 6 : 108);
    const pPose = fightPartnerPose(p, now, tStrike);
    pPose.whole = !FIGHT.partnerIsPortrait;
    // 接力突进: 搭档在主攻命中后向前扑出一段(静止帧也要读得出"接力"), 随回弹归位
    const relayLunge = win(p, tStrike + 30, tStrike + 170) * (1 - win(p, tStrike + 170, tStrike + 420)) * 46;
    drawPuppet(FIGHT.partnerImg, partnerX + relayLunge, partnerY, partnerH, false, outA, pPose);
  }
  // P1-15: 出招速度线(镜2 出招窗 攻方→守方放射白梭, 每帧微抖=闪烁速度感)——PSP机战签名元素
  const slP = win(p, tStrike - 120, tStrike + 30) * (1 - win(p, tStrike + 150, tStrike + 420));
  if (slP > 0.02 && !FIGHT.isMiss && defAlpha > 0.01) {
    const attCx = attX + attDX + attLunge + attW0 * 0.5, attCy = attY + attH * 0.45;
    const dirX = (defX + defW0 * 0.5) - attCx || 1;
    const nx = Math.sign(dirX);
    ctx.save();
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const spread = (i - 4.5) * attH * 0.09 + (Math.random() - 0.5) * 14;
      const len = attW0 * (0.9 + Math.random() * 0.9);
      const sx = attCx - nx * 70, sy = attCy + spread;
      ctx.globalAlpha = (0.25 + Math.random() * 0.45) * slP * outA;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - nx * len, sy + spread * 0.10); ctx.stroke();
    }
    ctx.restore();
  }
  drawCombatant('att', FIGHT.attImg, attX + attDX + attLunge + attRecoilX, attY, attH, false, outA, attPose, fightAttPhase(p, tStrike, tImpact), p); // P1-14 钩子: phase 按三镜时间轴映射; p 供姿势帧时间轴(pose_bridge)
  // P1-15: 全招式残影(近战双层/远程单层)——"动出来"的速度感不再只属于突刺类;
  // 横扫(sweep)单层(双层残影会跟武器弧光打架)
  if (!FIGHT.isMiss) {
    const gp = win(p, tStrike - 60, tStrike + 240) * (1 - win(p, tStrike + 240, tStrike + 540));
    if (gp > 0.02) {
      drawPuppet(FIGHT.attImg, attX + attDX + attLunge - 46 * gp, attY + 4, attH, false, 0.20 * gp * outA, attPose);
      if (MELEE_KINDS[FIGHT.animKind] && FIGHT.animKind !== 'sweep')
        drawPuppet(FIGHT.attImg, attX + attDX + attLunge - 92 * gp, attY + 8, attH, false, 0.10 * gp * outA, attPose);
    }
  }

  // --- 蓄力光球(攻方"出手点"=前手/枪口; P1-16 AUDIT#41/#42 逐张标定锚点, 不再用固定偏移) ---
  const chargeP = win(p, FT.enter, FT_READY);
  const anch = attAnchorOf(FIGHT.attImg, FIGHT.attIsPortrait);
  let gunX = attX + attDX + attLunge + attW0 * anch[0];
  let gunY = attY + attH * anch[1];
  if (FIGHT.comboPartner) {
    // 合体技: 光球在双立绘手部之间聚合(两人内力合流, 再一道发出)
    const pHandX = partnerX + (FIGHT.partnerIsPortrait ? 250 : 210);
    const pHandY = partnerY + partnerH * 0.42;
    gunX = (gunX + pHandX) / 2; gunY = (gunY + pHandY) / 2;
  }
  if (chargeP > 0.12 && p < tStrike + 40) {
    const gr = 11 + chargeP * 24 + Math.sin(now / 60) * 4;
    const g = ctx.createRadialGradient(gunX, gunY, 0, gunX, gunY, gr * 2.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, FIGHT.animColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = chargeP * outA;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(gunX, gunY, gr * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  FIGHT.gunX = gunX; FIGHT.gunY = gunY;

  // --- P1-14 六脉神剑专项: 指尖凝气光球(镜1人物全程在画, 凝气≥0.5s 硬指标; 出招后甩出成束) ---
  if (FIGHT.animKind === 'beam' && !FIGHT.isMiss) {
    const orbP = win(p, FT.enter + 150, tStrike + 100); // 凝气窗口 ~1.9s(硬指标≥0.5s)
    if (orbP > 0) {
      const orbA = (1 - win(p, tStrike + 30, tStrike + 150)) * outA; // 出招后光球甩出成束
      const orR = 8 + orbP * 24 + Math.sin(now / 70) * 3;
      const og = ctx.createRadialGradient(gunX, gunY, 0, gunX, gunY, orR * 2.4);
      og.addColorStop(0, '#ffffff'); og.addColorStop(0.4, '#bfefff'); og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = orbA * (0.55 + 0.45 * orbP);
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(gunX, gunY, orR * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = orbA * 0.8; // 凝气环两道(呼吸收束)
      ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const rr4 = orR * (1.5 + k * 0.55) + Math.sin(now / 130 + k * 2.1) * 3;
        ctx.beginPath(); ctx.arc(gunX, gunY, rr4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- 出招特效(落空不出招; P1-14: 镜2爆发→跨切镜→镜3命中余韵) ---
  const strikeP = win(p, tStrike - 40, tImpact + 160);
  const defCx = defX + defW * 0.45, defCy = defY + defH * 0.42;
  if (!FIGHT.isMiss && strikeP > 0 && strikeP <= 1)
    drawWeaponFx(strikeP, p, now, gunX, gunY, defCx, defCy, attX + attLunge, attY, attH);

  // --- 命中: 火花+伤害大字+击破 / 落空: 闪避大字 ---
  if (FIGHT.isMiss) {
    drawSparks(now);
    const dp = win(p, tImpact + 60, tImpact + 900);
    if (dp > 0 && dp < 1) {
      const pop = dp < 0.18 ? dp / 0.18 : 1;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = (1 - dp) * outA;
      const word = (ev.type === 'miss') ? '闪 避' : '游 身';
      const mainC = (ev.type === 'miss') ? '#bfe4ff' : '#ffd24a';
      ctx.font = 'bold ' + Math.round((52 + (1 - Math.min(1, dp * 3)) * 26) * pop + 22 * (1 - pop)) + 'px KaiTi,STKaiti,serif';
      const ty = defCy - 40 - dp * 40;
      ctx.lineWidth = 9; ctx.strokeStyle = (ev.type === 'miss') ? '#12263f' : '#4a2a08';
      ctx.strokeText(word, defCx, ty);
      ctx.fillStyle = mainC;
      ctx.fillText(word, defCx, ty);
      ctx.restore();
    }
  } else if (p >= tImpact) {
    if (p - tImpact < 70) spawnSparks(defCx, defCy, FIGHT.animColor, crit ? 26 : 15);
    // P1-7: 合体技接力二段 — 搭档晚~130ms接力出手, 金色火花补爆+震屏追加(一次性)
    if (FIGHT.comboPartner && !FIGHT._relaySparked && p >= tImpact + 130) {
      spawnSparks(defCx, defCy, '#ffd24a', 18);
      FX.shakeUntil = Math.max(FX.shakeUntil, performance.now() + 420);
      FIGHT._relaySparked = true;
    }
    // P1-12: 太祖长拳连打第二拳 — 守方处补爆火花+轻震(一次性, 对齐特效第二爆在镜3 的峰值)
    if (FIGHT.animKind === 'dash' && !FIGHT._hit2Sparked && p >= tImpact + 120) {
      spawnSparks(defCx, defCy, FIGHT.animColor, 10);
      FX.shakeUntil = Math.max(FX.shakeUntil, performance.now() + 160);
      FIGHT._hit2Sparked = true;
    }
    drawSparks(now);
    const dp = win(p, tImpact + 60, tImpact + 980);
    if (dp > 0 && dp < 1) {
      const pop = dp < 0.18 ? dp / 0.18 : 1;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = (1 - dp) * outA;
      ctx.font = 'bold ' + Math.round((44 + (1 - Math.min(1, dp * 3)) * 30) * pop + 20 * (1 - pop)) + 'px KaiTi,STKaiti,serif';
      const ty = defCy - 60 - dp * 46;
      ctx.lineWidth = 8; ctx.strokeStyle = '#3a0a08';
      ctx.strokeText('-' + ev.dmg, defCx, ty);
      ctx.fillStyle = crit ? '#ffd24a' : '#fff0e0';
      ctx.fillText('-' + ev.dmg, defCx, ty);
      if (crit) {
        ctx.font = 'bold 30px KaiTi,STKaiti,serif';
        ctx.strokeText('会心!', defCx + 92, ty - 30);
        ctx.fillStyle = '#ff6050';
        ctx.fillText('会心!', defCx + 92, ty - 30);
      }
      ctx.restore();
    }
  } else drawSparks(now);
  ctx.restore(); // P1-14: 三镜相机结束(以上场景吃镜头; 以下标题/提示/血条为 HUD 不吃镜头)

  // --- 顶部: 武器名标题(入位后浮现); 合体技升级: 金漆组合名+双侠副题 ---
  const titleA = win(p, FT.enter - 80, FT.enter + 60) * (1 - win(p, tStrike - 60, tStrike + 60));
  if (titleA > 0) {
    ctx.save();
    ctx.globalAlpha = titleA * outA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = CW / 2;
    if (FIGHT.comboPartner) { // P1-7: 组合技大字待遇(金漆+双侠合璧副题)
      ctx.font = 'bold 50px KaiTi,STKaiti,"Microsoft YaHei",serif';
      ctx.lineWidth = 11; ctx.strokeStyle = '#4a2a08';
      ctx.strokeText(FIGHT.weaponName, tx, 88);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(FIGHT.weaponName, tx, 88);
      ctx.font = 'bold 21px KaiTi,STKaiti,"Microsoft YaHei",serif';
      ctx.lineWidth = 6; ctx.strokeStyle = '#1a1030';
      ctx.strokeText(ev.att.cn + ' · ' + FIGHT.comboPartner.cn + '　合璧一击', tx, 130);
      ctx.fillStyle = '#fff0c0';
      ctx.fillText(ev.att.cn + ' · ' + FIGHT.comboPartner.cn + '　合璧一击', tx, 130);
    } else {
      ctx.font = 'bold 40px KaiTi,STKaiti,"Microsoft YaHei",serif';
      ctx.lineWidth = 9; ctx.strokeStyle = '#1a1030';
      ctx.strokeText(FIGHT.weaponName, tx, 92);
      ctx.fillStyle = '#fff8e0';
      ctx.fillText(FIGHT.weaponName, tx, 92);
    }
    ctx.restore();
  }
  // P1-10: 跳过提示(入位后淡入, 演出后半段保留; 点击任意处直接收尾)
  const hintA = win(p, FT.enter + 200, FT.enter + 500) * 0.55 * outA;
  if (hintA > 0) {
    ctx.save();
    ctx.globalAlpha = hintA;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '16px KaiTi,STKaiti,"Microsoft YaHei",serif';
    ctx.fillStyle = '#cfc4e8';
    ctx.fillText('点击画面 跳过演出 ▸', CW - 26, CH - 22);
    ctx.restore();
  }

  // --- 底部 HP 条(双方, 机战样式); 合体技左侧显示双侠合璧名; P1-11: 守方血条随登场/退场淡入出 ---
  drawFightHpBar(ev.att, CW * 0.06, CH - 96, false,
    FIGHT.comboPartner ? ev.att.cn + ' · ' + FIGHT.comboPartner.cn : null);
  ctx.save();
  ctx.globalAlpha = Math.min(1, defAlpha * 1.6);
  drawFightHpBar(ev.def, CW * 0.54, CH - 96, true);
  ctx.restore();
  ctx.restore();
  if (cam.black > 0.004) { // 切镜黑场压最上(机战标志性剪辑: 镜间 170ms 全黑)
    ctx.save(); ctx.globalAlpha = Math.min(1, cam.black);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }

  // ==== P1-5: 击破情绪峰值(白闪定格 → 击破大字 → 攻方胜利台词) ====
  if (ev.killed) {
    // 定格白闪: HP归零瞬间全屏白闪, 500ms 内衰减但不消失(机战撃破闪光)
    if (p >= killAt && p < killAt + 500) {
      const fa = 1 - (p - killAt) / 500;
      ctx.fillStyle = 'rgba(255,252,240,' + (0.30 + 0.58 * fa).toFixed(3) + ')';
      ctx.fillRect(0, 0, CW, CH);
    }
    // 击破大字 + motto 台词(定格后错峰入场, 台词停留到收势)
    if (p >= killAt + 500) {
      const kp = win(p, killAt + 500, killAt + 960);
      const mp = win(p, killAt + 640, killAt + 1060);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 击破大字(金, 爆发出现在上屏)
      ctx.globalAlpha = (1 - kp * kp) * outA;
      ctx.font = 'bold ' + Math.round(52 + kp * 40) + 'px KaiTi,STKaiti,serif';
      ctx.lineWidth = 12; ctx.strokeStyle = '#4a2a08';
      ctx.strokeText(ev.def.cn + ' 击破!', CW / 2, CH * 0.28);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(ev.def.cn + ' 击破!', CW / 2, CH * 0.28);
      // 攻方胜利台词(白芯深描边, SRW 击破后胜利姿势配台词)
      const msize = Math.round(30 + 14 * (1 - Math.pow(1 - Math.min(1, mp * 1.6), 3)));
      const my = CH * 0.47;
      // 台词衬底暗带, 保证任何背景可读
      ctx.globalAlpha = Math.min(1, mp * 2.2) * 0.55 * outA;
      ctx.fillStyle = '#0a0812';
      ctx.fillRect(CW * 0.08, my - 34, CW * 0.84, 68);
      ctx.globalAlpha = Math.min(1, mp * 2.2) * outA;
      ctx.font = 'bold ' + msize + 'px KaiTi,STKaiti,"Microsoft YaHei",serif';
      ctx.lineWidth = 9; ctx.strokeStyle = '#2a0a08';
      ctx.strokeText(ev.att.motto, CW / 2, my);
      ctx.fillStyle = '#fff8e0';
      ctx.fillText(ev.att.motto, CW / 2, my);
      ctx.restore();
    }
  }
}

// 战斗场景 HP 条(左攻右守, 守方条同步逐格动画)
function drawFightHpBar(u, x, y, isDef, label) {
  const bw = cv.width * 0.40, bh = 14;
  const cur = (fxOn && isDef && FX.hpAnim && FX.hpAnim.u === u)
    ? Math.max(0, hpAnimValue(performance.now())) : u.hp;
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px KaiTi,STKaiti,"Microsoft YaHei",serif';
  ctx.fillStyle = '#fff8e0';
  ctx.fillText(label || u.cn, x, y - 12);
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = u.side === 'player' ? '#8fd08f' : '#ff9a8a';
  ctx.fillText(Math.max(0, cur) + ' / ' + u.maxhp, x + bw, y - 12);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#14161f'; ctx.fillRect(x, y, bw, bh);
  const ratio = Math.max(0, cur / u.maxhp);
  const grad = ctx.createLinearGradient(x, y, x, y + bh);
  const c = u.side === 'player' ? '#3ec25a' : '#e04838';
  grad.addColorStop(0, '#ffffff88');
  grad.addColorStop(0.25, c);
  grad.addColorStop(1, c);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, bw * ratio, bh);
  ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(x + bw * i / 10, y); ctx.lineTo(x + bw * i / 10, y + bh);
    ctx.stroke();
  }
  ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, bw, bh);
  ctx.restore();
}

// ============ B2: 各武器专属动作特效(P1-12: 特效与身段同等级差异化, 零素材) ============
// t=出招进度(0~1), p=FIGHT 相对时刻(ms, 供第二击等错峰窗口); gx/gy=出手点, tx/ty=受击点
function drawWeaponFx(t, p, now, gx, gy, tx, ty, attX, attY, attH) {
  const c = FIGHT.animColor;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 4) * (1 - Math.max(0, t - 0.8) * 3);
  const dx = tx - gx, dy = ty - gy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  switch (FIGHT.animKind) {
    case 'beam': { // 光束: 六脉=六道剑气扇形齐发; 一阳指=单道粗光束+端点余辉
      const n = (FIGHT.animCfg && FIGHT.animCfg.beams) || 1;
      if (n > 1) { // 六脉神剑: 六道细剑气扇形散开+各自错峰, 收束于同一点(六脉汇一)
        for (let b = 0; b < n; b++) {
          const tb = Math.max(0, Math.min(1, t * 1.7 - b * 0.11));
          if (tb <= 0) continue;
          const ang = (b - (n - 1) / 2) * 0.055;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const ux2 = ux * ca - uy * sa, uy2 = ux * sa + uy * ca;
          const w2 = (tb < 0.3 ? tb / 0.3 : 1 - (tb - 0.3) / 0.7 * 0.6) * 8;
          const g = ctx.createLinearGradient(gx, gy, tx, ty);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, c); g.addColorStop(1, '#eaffff');
          ctx.strokeStyle = g; ctx.lineWidth = w2; ctx.lineCap = 'round';
          ctx.globalAlpha = Math.min(1, tb * 5) * (1 - Math.max(0, tb - 0.82) * 2.5);
          ctx.beginPath(); ctx.moveTo(gx, gy);
          ctx.lineTo(gx + ux2 * len * tb, gy + uy2 * len * tb); ctx.stroke();
        }
        // 六脉汇聚爆光(端点)
        const hg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 42);
        hg.addColorStop(0, '#fff'); hg.addColorStop(0.4, c); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(1, t * 4) * (1 - Math.max(0, t - 0.75) * 3);
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(tx, ty, 42, 0, Math.PI * 2); ctx.fill();
      } else { // 一阳指: 单道粗光束, 收招后端点余辉不撒(指力透体)
        const w = (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7 * 0.7) * (FIGHT.crit ? 26 : 17);
        const g = ctx.createLinearGradient(gx, gy, tx, ty);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, c);
        g.addColorStop(1, '#ffffff');
        ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(gx, gy);
        const mx = gx + ux * len * (0.4 + t * 0.6), my = gy + uy * len * (0.4 + t * 0.6) + Math.sin(now / 40) * 3;
        ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, w * 0.35);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
        const lg = win(t, 0.5, 0.64) * (1 - win(t, 0.64, 1)); // 端点余辉
        if (lg > 0) {
          const hg2 = ctx.createRadialGradient(tx, ty, 0, tx, ty, 46);
          hg2.addColorStop(0, '#fff'); hg2.addColorStop(0.35, c); hg2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = lg * 0.9;
          ctx.fillStyle = hg2;
          ctx.beginPath(); ctx.arc(tx, ty, 46, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'bullet': { // 弹丸+拖尾+枪口焰+硝烟(枪感三件套; P1-16 AUDIT#43: 枪口焰拉长+弹丸放大加亮——"开了一枪"必须读得出)
      if (t < 0.45) { // 枪口星形焰(击发窗拉长到 t<0.45≈280ms, 峰值在早期)
        const mf = 1 - t / 0.45;
        ctx.globalAlpha = Math.min(1, mf * 1.7);
        ctx.fillStyle = '#fff2c0';
        const mr2 = 12 + mf * 22;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, rr2 = k % 2 ? mr2 * 0.45 : mr2;
          ctx.lineTo(gx + Math.cos(a) * rr2, gy + Math.sin(a) * rr2);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = mf * 0.8;
        ctx.beginPath(); ctx.arc(gx, gy, mr2 * 0.6, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 3; i++) { // 硝烟团: 三团缓升确定性飘移
        const sp = win(t, 0.06 + i * 0.1, 0.75 + i * 0.08);
        if (sp <= 0) continue;
        ctx.globalAlpha = 0.28 * (1 - sp);
        ctx.fillStyle = '#b9bcc8';
        ctx.beginPath();
        ctx.arc(gx - ux * (12 + sp * 34) + (i - 1) * 9, gy - uy * (12 + sp * 34) - sp * 30, 6 + sp * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      const px = gx + ux * len * t, py = gy + uy * len * t;
      // 弹丸光晕(角色色, 半径16——不再是 5px 白点)
      const pg = ctx.createRadialGradient(px, py, 0, px, py, 16);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.35, c); pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, t * 6);
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
      for (let i = 1; i <= 6; i++) { // 拖尾: 间距加大/前两节纯白/衰减放缓=弹道读得出
        ctx.globalAlpha *= 0.86;
        ctx.fillStyle = i < 3 ? '#ffffff' : c;
        ctx.beginPath(); ctx.arc(px - ux * i * 11, py - uy * i * 11, 6 - i * 0.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'dragon': { // 龙形气劲: 曲线蛇行+龙头光球+鳞片光点 + 命中地面掌风涟漪
      const head = Math.min(1, t * 1.15);
      const segs = 22;
      ctx.lineCap = 'round';
      for (let i = 0; i < segs * head; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const wave = (f) => Math.sin(f * 9 + now / 55) * 34 * (1 - f * 0.4);
        const x0 = gx + ux * len * f0 - uy * wave(f0), y0 = gy + uy * len * f0 + ux * wave(f0);
        const x1 = gx + ux * len * f1 - uy * wave(f1), y1 = gy + uy * len * f1 + ux * wave(f1);
        ctx.strokeStyle = i > segs * head - 4 ? '#fff' : c;
        ctx.lineWidth = (1 - f0 * 0.55) * (FIGHT.crit ? 22 : 15);
        ctx.globalAlpha = (0.5 + 0.5 * (1 - f0)) * Math.min(1, t * 4);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      const hw = Math.sin(head * 9 + now / 55) * 34 * (1 - head * 0.4);
      const hx = gx + ux * len * head - uy * hw, hy = gy + uy * len * head + ux * hw;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 34);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, 34, 0, Math.PI * 2); ctx.fill();
      const rip = win(t, 0.55, 1); // 掌风压地: 守方脚下雪尘涟漪环形扩散
      if (rip > 0) {
        ctx.strokeStyle = c; ctx.lineWidth = 5 * (1 - rip) + 1;
        ctx.globalAlpha = (1 - rip) * 0.8;
        ctx.beginPath(); ctx.ellipse(tx, ty + 130, 30 + rip * 140, (30 + rip * 140) * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = (1 - rip) * 0.4;
        ctx.beginPath(); ctx.ellipse(tx, ty + 130, 18 + rip * 90, (18 + rip * 90) * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'sweep': { // 横扫弧光: 大弧从攻方扫到守方 + 延迟尾弧(风声) + 命中横斩冲击带
      const mid = Math.min(1, t * 1.2);
      const r = len * 0.62;
      const cx2 = gx + dx * 0.5, cy2 = gy + dy * 0.5 - 60;
      const a0 = Math.atan2(gy - cy2, gx - cx2);
      const aEnd = Math.atan2(ty - cy2, tx - cx2);
      const a1 = a0 + (aEnd - a0) * mid;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 0 ? '#ffffff' : c;
        ctx.lineWidth = (16 - i * 4);
        ctx.globalAlpha = (0.9 - i * 0.3) * Math.min(1, t * 5);
        ctx.beginPath();
        ctx.arc(cx2, cy2, r - i * 12, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
      for (let i = 1; i <= 2; i++) { // 尾弧: 挥过的轨迹留两圈渐散风痕
        const tm = Math.min(1, t * 1.2 - i * 0.1);
        if (tm <= 0) continue;
        const a1i = a0 + (aEnd - a0) * tm;
        ctx.strokeStyle = c; ctx.lineWidth = 7 - i * 2;
        ctx.globalAlpha = Math.max(0, 0.5 - i * 0.16) * (1 - tm * 0.55);
        ctx.beginPath();
        ctx.arc(cx2, cy2, r + i * 15, Math.min(a0, a1i), Math.max(a0, a1i));
        ctx.stroke();
      }
      if (t > 0.5) { // 命中横斩冲击带: 守方处水平白刃带扩开
        const bt = win(t, 0.5, 1);
        ctx.globalAlpha = (1 - bt) * 0.75;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 10 * (1 - bt) + 2;
        ctx.beginPath(); ctx.moveTo(tx - 80 * (1 + bt * 0.8), ty); ctx.lineTo(tx + 80 * (1 + bt * 0.8), ty); ctx.stroke();
      }
      break;
    }
    case 'wave': { // 环形气浪推进 + 阴阳双游光点(空明拳意)
      const rings = 6;
      for (let i = 0; i < rings; i++) {
        const rt = (t * 1.5 + i / rings) % 1;
        ctx.strokeStyle = c;
        ctx.globalAlpha = (1 - rt) * 0.75;
        ctx.lineWidth = 6 * (1 - rt) + 2;
        ctx.beginPath();
        ctx.ellipse(gx + dx * rt, gy + dy * rt, 46 * (1 - rt * 0.4), 26 * (1 - rt * 0.4), Math.atan2(dy, dx), 0, Math.PI * 2);
        ctx.stroke();
      }
      const rt2 = (t * 1.5) % 1; // 最前环上反向流转的双光点
      const cx3 = gx + dx * rt2, cy3 = gy + dy * rt2;
      const rx = 46 * (1 - rt2 * 0.4), ry = rx * 0.55;
      for (let k = 0; k < 2; k++) {
        const ph = now / 180 * (k ? -1 : 1) + k * Math.PI;
        ctx.globalAlpha = (1 - rt2) * 0.9;
        ctx.fillStyle = k ? '#ffffff' : c;
        ctx.beginPath();
        ctx.arc(cx3 + Math.cos(ph) * rx, cy3 + Math.sin(ph) * ry, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stab': { // 突刺: 尖刺闪光+直线残影 + 瞬闪整条白芒 + 命中星芒
      if (t > 0.05 && t < 0.3) { // 瞬闪: 出手一瞬的整条白芒(读得出"一刺即到")
        ctx.globalAlpha = (0.3 - t) * 3;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
      }
      const reach = Math.min(1, t * 1.6);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = (0.9 - i * 0.18) * (1 - reach * 0.4);
        const back = reach - i * 0.05;
        ctx.beginPath();
        ctx.moveTo(gx + ux * len * Math.max(0, back - 0.5), gy + uy * len * Math.max(0, back - 0.5));
        ctx.lineTo(gx + ux * len * back, gy + uy * len * back);
        ctx.stroke();
      }
      if (t > 0.15 && t < 0.62) { // 命中星芒(四尖)
        const sa = (0.62 - t) / 0.47;
        const sr = 10 + sa * 22;
        ctx.globalAlpha = sa;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a2 = k * Math.PI / 4, rr3 = k % 2 ? sr * 0.4 : sr;
          ctx.lineTo(tx + Math.cos(a2) * rr3, ty + Math.sin(a2) * rr3);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, sr * 0.7, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'smash': { // 下砸: 挥杖弧光(AUDIT#44 镜2主体特效) + 落点冲击环+地裂纹 + 碎石迸起(窗口拉长)
      // 挥杖轨迹(AUDIT#44): 抡起(身后下方)→过头(前上方)→砸落守方, 二次贝塞尔采样折线;
      // 曲线恒在控制点凸包内=任意时刻已扫段都在画面内; 杖头彗星引领动点; 命中后淡出
      const Wx = gx - 200, Wy = gy + 60;               // 抡起位: 身后下方(蓄力回摆)
      const Cx2 = gx + 40, Cy2 = gy - 240;             // 控制点: 头前上方(杖过头)
      const bpt = tt => [
        (1 - tt) * (1 - tt) * Wx + 2 * (1 - tt) * tt * Cx2 + tt * tt * tx,
        (1 - tt) * (1 - tt) * Wy + 2 * (1 - tt) * tt * Cy2 + tt * tt * ty,
      ];
      const sw = Math.min(1, t / 0.45);
      const arcFade = 1 - win(t, 0.82, 1.0);
      const NPT = 24;
      let hx = Wx, hy = Wy;
      for (let i = 1; i <= NPT; i++) {
        const t0 = (i - 1) / NPT, t1 = i / NPT;
        if (t1 > sw) { const u = (sw - t0) * NPT; const p0 = bpt(t0); hx = p0[0] + (bpt(t1)[0] - p0[0]) * u; hy = p0[1] + (bpt(t1)[1] - p0[1]) * u; break; }
        const p0 = bpt(t0), p1 = bpt(t1);
        hx = p1[0]; hy = p1[1];
        const nearHead = t1 > sw - 0.14;
        ctx.strokeStyle = nearHead ? '#ffffff' : c;
        ctx.lineWidth = (nearHead ? 13 : 10) * (1 - t1 * 0.3);
        ctx.globalAlpha = Math.min(1, t * 5) * arcFade * (1 - t1 * 0.35);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
      { // 杖头彗星光球: 挥击的"动点", 眼睛跟得住杖往哪挥
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26);
        hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.4, c); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(1, t * 5) * arcFade;
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, 26, 0, Math.PI * 2); ctx.fill();
      }
      const drop = Math.min(1, t * 1.3);
      const rr = drop * 120;
      ctx.strokeStyle = c; ctx.lineWidth = 8 * (1 - drop) + 2;
      ctx.globalAlpha = 1 - drop;
      ctx.beginPath(); ctx.ellipse(tx, ty + 40, rr, rr * 0.34, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI - Math.PI;
        ctx.globalAlpha = (1 - drop) * 0.8;
        ctx.beginPath();
        ctx.moveTo(tx, ty + 40);
        ctx.lineTo(tx + Math.cos(a) * rr * 0.9, ty + 40 + Math.sin(a) * rr * 0.32);
        ctx.stroke();
      }
      if (t > 0.15) { // 碎石: 八颗按各自相位抛出再落回(窗口拉长到 t→1.0, 重力放缓=滞空更久, 体量加大)
        for (let i = 0; i < 8; i++) {
          const seed = i * 2.4;
          const dp = win(t, 0.15 + (i % 3) * 0.04, 1.0);
          if (dp <= 0) continue;
          const vx = Math.sin(seed) * 80, vy0 = 110 + (i % 4) * 38;
          const px = tx + vx * dp, py = ty + 40 - vy0 * dp + 190 * dp * dp;
          ctx.globalAlpha = (1 - dp) * 0.95;
          ctx.fillStyle = i % 2 ? '#9a9aa6' : c;
          ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'slashx': { // 交叉双斩: 交叉剑气X + 两道先后飞出的月牙剑气 + 第二斩小X
      const ang = Math.atan2(dy, dx);
      for (let b = 0; b < 2; b++) { // 月牙剑气: 一正弧一反弧, 错峰飞出
        const bt = win(t, 0.06 + b * 0.28, 0.6 + b * 0.28);
        if (bt <= 0) continue;
        const bx = gx + dx * (0.25 + bt * 0.75), by = gy + dy * (0.25 + bt * 0.75) + (b ? -16 : 16);
        ctx.globalAlpha = (1 - bt * 0.7) * Math.min(1, t * 6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(bx, by, 26, ang - 1.0 + b * Math.PI, ang + 1.0 + b * Math.PI); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bx, by, 31, ang - 1.0 + b * Math.PI, ang + 1.0 + b * Math.PI); ctx.stroke();
      }
      const grow = Math.min(1, t * 1.5);
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k += 2) {
        const g2 = ctx.createLinearGradient(tx - 90 * grow, ty - 90 * grow * k, tx + 90 * grow, ty + 90 * grow * k);
        g2.addColorStop(0, 'rgba(0,0,0,0)');
        g2.addColorStop(0.5, '#ffffff');
        g2.addColorStop(1, c);
        ctx.strokeStyle = g2;
        ctx.lineWidth = 9;
        ctx.globalAlpha = Math.min(1, t * 5) * (1 - Math.max(0, t - 0.75) * 3);
        ctx.beginPath();
        ctx.moveTo(tx - 90 * grow, ty - 90 * grow * k);
        ctx.lineTo(tx + 90 * grow, ty + 90 * grow * k);
        ctx.stroke();
      }
      const t2 = win(t, 0.32, 0.95); // 第二斩: 反向小X紧随(双斩要斩得出"两次")
      if (t2 > 0) {
        const g3 = Math.min(1, t2 * 1.6) * 0.62;
        ctx.globalAlpha = g3 * (1 - Math.max(0, t2 - 0.8) * 3);
        for (let k = -1; k <= 1; k += 2) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(tx - 66 * g3, ty + 66 * g3 * k);
          ctx.lineTo(tx + 66 * g3, ty - 66 * g3 * k);
          ctx.stroke();
        }
      }
      break;
    }
    default: { // dash 快拳连打: 拳芒冲击环+出拳速度线+第二拳在守方处小爆
      const ring = Math.min(1, t * 1.4);
      const fistX = gx + ux * 46, fistY = gy + uy * 46;
      const g3 = ctx.createRadialGradient(fistX, fistY, 0, fistX, fistY, 40);
      g3.addColorStop(0, '#fff'); g3.addColorStop(0.5, c); g3.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g3;
      ctx.beginPath(); ctx.arc(fistX, fistY, 40, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 6 * (1 - ring) + 2;
      ctx.globalAlpha = 1 - ring;
      ctx.beginPath(); ctx.arc(fistX, fistY, 24 + ring * 110, 0, Math.PI * 2); ctx.stroke();
      if (t < 0.55) { // 出拳速度线(三条短流光)
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = Math.max(0, 0.6 - t) * (0.8 - i * 0.25);
          const ly = gy - 18 + i * 18;
          ctx.beginPath(); ctx.moveTo(gx + 30 + i * 16 + t * 70, ly); ctx.lineTo(gx + 96 + i * 16 + t * 70, ly); ctx.stroke();
        }
      }
      const t2 = win(t, 0.48, 1); // 第二拳小爆(连打的"打"字落点)
      if (t2 > 0) {
        ctx.strokeStyle = c; ctx.lineWidth = 5 * (1 - t2) + 1;
        ctx.globalAlpha = (1 - t2) * 0.9;
        ctx.beginPath(); ctx.arc(tx, ty, 10 + t2 * 58, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = (1 - t2) * 0.5;
        ctx.beginPath(); ctx.arc(tx, ty, 8 * (1 - t2) + 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---------- UI ----------
const unitInfo = document.getElementById('unitInfo');
const actionMenu = document.getElementById('actionMenu');
const logBox = document.getElementById('log');

function log(msg) {
  const p = document.createElement('p');
  p.innerHTML = msg;
  logBox.prepend(p);
  while (logBox.children.length > 60) logBox.lastChild.remove();
}
// P0-4: 选中面板立绘头像(SRW/FE 铁律: 选中必带脸)
// 有立绘用 portraits/ 原画; 无立绘角色(主角/辽兵/辽将)放大单位 sprite 回退, 像素风保留
function showInfo(u) {
  if (!u) { unitInfo.innerHTML = '点击我方单位查看信息'; return; }
  const wp = u.weapons.map(wid => WEAPONS[wid].name).join('、');
  const pim = portraits[u.sprite];
  const hasP = pim && pim.complete && pim.naturalWidth > 0;
  const border = u.boss ? '#c04030' : (u.side === 'player' ? '#4a6a9a' : '#9a4a3a');
  unitInfo.innerHTML =
    `<div style="display:flex;gap:8px;align-items:flex-start">` +
    `<img src="assets/${hasP ? 'portraits' : 'units'}/${u.sprite}.png" ` +
    `style="width:76px;height:76px;flex:none;object-fit:contain;background:#14141c;` +
    `border:2px solid ${border};image-rendering:${hasP ? 'auto' : 'pixelated'}">` +
    `<div style="flex:1;min-width:0"><b>${u.cn}</b>${u.boss ? ' <span style="color:#ff7050">·BOSS</span>' : ''}<br>` +
    `HP ${u.hp}/${u.maxhp} ｜ 真气 ${u.sp}/${u.maxsp} ｜ 气势 <b style="color:#e8c85a">${u.will}</b><br>` +
    `Lv.${u.lv || 1} ｜ 经验 ${u.exp || 0}/${EXP_CFG.need}<br>` + // P3-12 D2: 成长可见(AUDIT#12⑤)
    `膂力${u.atk} 根骨${u.def} 命中${u.hit} 闪避${u.evd} 轻功${u.mov}<br>` +
    `武功: ${wp}</div></div>`;
}

function banner(text, ms) {
  const b = document.getElementById('banner');
  b.textContent = text; b.classList.remove('hidden');
  setTimeout(() => b.classList.add('hidden'), ms || 1200);
}

// 指令菜单
function openMenu(u) {
  Sel.unit = u;
  const items = [];
  const anyFoe = G.units.some(v => v.hp > 0 && v.side === 'enemy');
  if (anyFoe) items.push(['攻击', () => openWeaponMenu(u)]);
  if (u.spirits.length) items.push(['运功', () => openSpiritMenu(u)]);
  if (Object.keys(ITEMS).some(id => (G.items[id] || 0) > 0)) items.push(['道具', () => openItemMenu(u)]); // P3-12 D3
  const speakTarget = G.units.find(v => canSpeak(u, v));
  if (speakTarget) items.push([`<span style="color:#8fd08f">说得 ${speakTarget.cn}</span>`, () => doSpeak(u, speakTarget)]);
  if (canCombo(u)) items.push([`<span style="color:#ffd24a">合体技·双侠镇襄阳</span>`, () => openComboMenu(u)]);
  items.push(['待机', () => { finishUnit(u); }]);
  renderMenu(items);
  showInfo(u);
  playMotif(u);
}

function renderMenu(items) {
  actionMenu.innerHTML = '';
  items.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.innerHTML = label; b.style.display = 'block'; b.style.width = '100%'; b.style.margin = '4px 0';
    b.onclick = () => { hideMenus(); fn(); };
    actionMenu.appendChild(b);
  });
  actionMenu.classList.remove('hidden');
}
function hideMenus() { actionMenu.classList.add('hidden'); }

// P3-12 D3: 道具菜单 —— 列出库存, 选后按 target 类型走二级目标列表(自身直用)
function openItemMenu(u) {
  const ids = Object.keys(ITEMS).filter(id => (G.items[id] || 0) > 0);
  if (!ids.length) { log('道具袋已空'); openMenu(u); return; }
  showForecast('道具（全队共享）', ids.map(id => {
    const it = ITEMS[id];
    const tgts0 = itemTargets(u, id); // 展示用快照(模态开着局面不会变); 真正执行时 fn 内会重算
    return {
      name: `${it.name} ×${G.items[id]} <span class="dim">${it.desc}</span>`,
      sub: tgts0.length ? (it.target === 'self' ? '对自身使用' : `可用目标: ${tgts0.map(t => t.cn).join('、')}`) : '没有可用目标',
      fn: () => {
        const tgts = itemTargets(u, id); // 点击时重算, 不用打开菜单时的旧快照
        if (!tgts.length) { log('没有可用目标'); openItemMenu(u); return; }
        if (it.target === 'self' || tgts.length === 1) return doUseItem(u, id, tgts[0]);
        showForecast(`${it.name} → 选择目标`, tgts.map(t => ({
          name: `${t.cn} <span class="dim">HP ${t.hp}/${t.maxhp} 真气 ${t.sp}/${t.maxsp}</span>`,
          sub: '', fn: () => doUseItem(u, id, t)
        })), () => openItemMenu(u));
      }
    };
  }), () => openMenu(u));
}

// P3-12 D3: 使用道具 —— 规则层 useItem 落账, 这里给玩家看见(绿飘字+角色色环+日志)。
// 使用道具消耗本回合行动(FE/SRW 惯例: 道具=一个指令)。
async function doUseItem(u, itemId, target) {
  const r = useItem(u, itemId, target);
  if (!r) { log('使用失败'); openMenu(u); return; }
  seSpirit(); // 道具轻音, 与运功同号
  const bits = [];
  if (r.gains.hp) bits.push('体力+' + r.gains.hp);
  if (r.gains.sp) bits.push('真气+' + r.gains.sp);
  if (r.gains.will) bits.push('气势+' + r.gains.will);
  if (r.item.effect.dust) bits.push('命中-' + r.item.effect.dust + '(下次行动后恢复)');
  const now = performance.now();
  FX.ringFx = { x: target.x, y: target.y, color: '#8fd08f', t0: now, until: now + 640 };
  FX.floats.push({ x: target.x, y: target.y, text: '【' + r.item.name + '】' + bits.join(' '), color: '#8fd08f', t0: now });
  log(`<span style="color:#8fd08f">${u.cn} 使用【${r.item.name}】→ ${target.cn}: ${bits.join(' ')}</span>`);
  await sleep(300);
  finishUnit(u, true);
}

// 选武功 + 预测窗口
function openWeaponMenu(u) {
  const distOf = t => Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
  const foes = G.units.filter(v => v.hp > 0 && v.side === 'enemy');
  const usable = u.weapons.filter(wid => {
    const w = WEAPONS[wid];
    if (u.will < w.will) return false;
    if (w.ammo !== undefined && (u.ammo[w.name] ?? w.ammo) <= 0) return false;
    return foes.some(f => { const d = distOf(f); return d >= w.rng[0] && d <= w.rng[1]; });
  });
  if (!usable.length) { log('没有能打到敌人的武功'); openMenu(u); return; }
  showForecast('选择武功（点击后选目标）', usable.map(wid => {
    const w = WEAPONS[wid];
    const tgt = foes.filter(f => { const d = distOf(f); return d >= w.rng[0] && d <= w.rng[1]; })
                    .sort((a, b) => forecast(u, a, w).dmg - forecast(u, b, w).dmg)[0];
    const f = forecast(u, tgt, w);
    const am = w.ammo !== undefined ? ` 残弹${(u.ammo[w.name] ?? w.ammo)}` : '';
    return {
      name: `${w.name} <span class="dim">威力${w.pow} 射程${w.rng[0]}-${w.rng[1]}${am}${u.will < w.will ? ' 气势不足' : ''}</span>`,
      sub: tgt ? `对${tgt.cn}: 命中${f.hitp}% 伤害约${f.dmg} 会心${f.crit}%` : '无目标',
      fn: () => pickTarget(u, wid, foes.filter(v => { const d = distOf(v); const w2 = WEAPONS[wid]; return d >= w2.rng[0] && d <= w2.rng[1]; }))
    };
  }), () => openMenu(u));
}

function showForecast(title, items, onCancel) {
  document.getElementById('fTitle').innerHTML = title;
  const list = document.getElementById('fList');
  list.innerHTML = '';
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'witem';
    d.innerHTML = `<span class="wn">${it.name}</span><span class="ws">${it.sub || ''}</span>`;
    d.onclick = () => { document.getElementById('forecast').classList.add('hidden'); it.fn(); };
    list.appendChild(d);
  });
  document.getElementById('fCancel').onclick = () => {
    document.getElementById('forecast').classList.add('hidden');
    if (onCancel) onCancel();
  };
  document.getElementById('forecast').classList.remove('hidden');
}

// 选目标(高亮黄格)
function pickTarget(u, wid, targets) {
  Sel.atkTiles = {};
  targets.forEach(t => Sel.atkTiles[t.x + ',' + t.y] = true);
  Sel.pending = { kind: 'attack', u, wid, targets };
  log('选择攻击目标');
}

function pickComboTarget(u, targets) {
  Sel.atkTiles = {};
  targets.forEach(t => Sel.atkTiles[t.x + ',' + t.y] = true);
  Sel.pending = { kind: 'combo', u, targets };
  log('选择合体技中心目标');
}

// 运功菜单
function openSpiritMenu(u) {
  showForecast('运功（真气 ' + u.sp + '）', u.spirits.map(sid => {
    const s = SPIRIT_BOOK[sid];
    return {
      name: `${s.name} <span class="dim">耗真气${s.cost}</span>`,
      sub: s.desc + (u.sp < s.cost ? '（真气不足）' : ''),
      fn: async () => {
        if (u.sp < s.cost) { log('真气不足'); openMenu(u); return; }
        u.sp -= s.cost;
        if (s.fx === 'willUp') {
          const ally = G.units.find(v => v.hp > 0 && v.side === 'player' && v !== u &&
            Math.abs(v.x - u.x) + Math.abs(v.y - u.y) === 1);
          if (ally) { ally.will = Math.min(ally.maxwill, ally.will + 10); log(`${u.cn}狮子吼,${ally.cn}气势+10`); }
          else log('没有邻接友军');
        } else {
          u.buffs[s.fx] = true;
          u.buffs._castTurn = G.turn; // P3-12 D3(AUDIT#46): 运功buff标施放回合, 下次行动结束时到期
          log(`${u.cn}运功【${s.name}】:${s.desc}`);
        }
        await spiritFx(u, s); // P1-6: 运功演出(大字+色环+头顶小字), 再结束行动
        finishUnit(u, true);
      }
    };
  }), () => openMenu(u));
}

// 说得
async function doSpeak(u, target) {
  banner('韦小宝：' + target.cn + '！识时务者为俊杰！');
  await sleep(900);
  target.side = 'player';
  target.speakable = false;
  target.hp = Math.min(target.maxhp, target.hp + Math.round(target.maxhp * 0.3));
  target.acted = true;
  G.stats.speaks++; // P3-11b: 说得计数(评价结算)
  log(`<span style="color:#8fd08f">说得成功！${target.cn}加入我方</span>`);
  playMotif(target);
  finishUnit(u, true);
}

// 合体技
function openComboMenu(u) {
  const targets = comboTargets(u);
  if (!targets.length) { log('射程内没有敌人'); openMenu(u); return; }
  showForecast('合体技 · 双侠镇襄阳', [{
    name: '双侠镇襄阳 <span class="dim">MAP 3×3 必中 双方气势-30</span>',
    sub: '以敌人为中心的3×3范围攻击',
    fn: () => pickComboTarget(u, targets)
  }], () => openMenu(u));
}

async function doCombo(u, center) {
  const p = G.units.find(v => v.hp > 0 && v.key === (u.key === 'xiaofeng' ? 'guojing' : 'xiaofeng'));
  G.comboUsed = true;
  u.will -= 30; p.will -= 30;
  banner('合体技！ 双侠镇襄阳！', 1600);
  seCrit();
  await sleep(1200);
  const hitSet = G.units.filter(v => v.hp > 0 && v.side === 'enemy' &&
    Math.abs(v.x - center.x) <= 1 && Math.abs(v.y - center.y) <= 1);
  const fakeW = { name: '双侠镇襄阳', pow: 3400, hit: 100, crit: 25, rng: [1, 1], cost: 0, will: 0, type: '外',
                  anim: { kind: 'dragon', color: '#ffd24a' } };
  for (const e of hitSet) {
    // 经 opts 传临时buff/膂力加成, resolveAttack 的气势增减直接落在真身
    const ev = resolveAttack(u, e, fakeW, { buffs: { mustHit: true }, atkBonus: p.atk });
    ev.partner = p; // P1-7: 双立绘同框(郭靖入画接力), 表现层消费, 规则层零改动
    await animateEvent(ev, true);
  }
  finishUnit(u, true);
}

// P1-10: 可跳过的等待——点击画面置 FIGHT.skip 立即收尾(敌我双方演出通用)
async function waitFightEnd() {
  while (FIGHT.active && !FIGHT.skip && performance.now() - FIGHT.t0 < FIGHT.durOut + 40)
    await sleep(60);
}

// 战斗演出
async function animateEvent(ev, skipMotif) {
  if (ev.type === 'miss' || ev.type === 'evade') {
    seMiss(); log(ev.type === 'miss'
      ? `${ev.att.cn} 的【${ev.w.name}】落空了`
      : `${ev.def.cn} 游身闪过 ${ev.w.name}！`);
    if (fxOn) { // P0-1: 落空也进横版场景(侧闪+大字), 不再是一张静态图
      startFight(ev);
      try { await waitFightEnd(); } finally { endFight(); }
    } else await sleep(500);
    return;
  }
  // B2: 演出开启时切入横版战斗场景(攻左守右+武器专属动作); 关闭时退回横幅提示
  if (fxOn) {
    seHit(); if (ev.isCrit) seCrit();
    startFight(ev);
    try { await waitFightEnd(); } finally { endFight(); }
  } else {
    seHit(); if (ev.isCrit) seCrit();
    banner(ev.w.name + (ev.isCrit ? ' ·会心！' : ''), ev.isCrit ? 900 : 650);
    await sleep(450);
  }
  floatText(ev.def, '-' + ev.dmg + (ev.isCrit ? '!' : ''), ev.isCrit ? '#ff5040' : '#ffe070');
  log(`${ev.att.cn} 的【${ev.w.name}】命中 ${ev.def.cn}，造成 <b>${ev.dmg}</b>${ev.isCrit ? ' 会心!' : ''}伤害` +
      (ev.killed ? `，<span style="color:#ff9070">击破！</span>` : ''));
  if (ev.killed) { if (!fxOn) banner(ev.def.cn + ' 击破！', 800); playMotif(ev.att); } // P1-5: 演出开时击破峰值在FIGHT内(定格+台词), 不再重复banner
  checkEnd();
  // P3-12a: BOSS 阶段判定 —— 未被击破的 BOSS 被打穿阈值时触发(规则+演出, AUDIT#15)
  if (!G.over && ev.def.boss && ev.def.hp > 0) {
    const ph = checkBossPhase(ev.def);
    if (ph) await phaseFx(ev.def, ph);
  }
  // P3-12 D2: 升级演出(击破/命中的经验已在规则层落账, 这里让玩家看见成长)
  if (ev.levelUps) await lvUpFx(ev.att, ev.levelUps);
}

// 伤害飘字: B1起改由draw()统一渲染(旧setInterval直画在缩略图模式下会错位)
function floatText(u, text, color) {
  FX.floats.push({ x: u.x, y: u.y, text, color, t0: performance.now() });
}

// P1-6: 运功演出配色(表现层配置, 与 MOTIF 同级)
const SPIRIT_COLOR = { mustHit:'#6cf0ff', dmg2:'#ff6050', evade:'#8fd08f',
                       halfDmg:'#e8c85a', willUp:'#d0a0ff', capture:'#c89aff', mov3:'#7fd0ff' };
function seSpirit() { beep(392, .1, 'sine', .06); setTimeout(() => beep(523, .12, 'sine', .06), 90); setTimeout(() => beep(659, .16, 'sine', .05), 180); }
// P3-11a: 出击号角(简易上行三音, 出战前的仪式感)
function seSortie() { beep(262, .14, 'square', .07); setTimeout(() => beep(392, .14, 'square', .07), 130); setTimeout(() => beep(523, .3, 'square', .08), 260); }
// P3-12a: BOSS 阶段怒吼(低锯齿双音下坠, 压迫感)
function seBossPhase() { beep(86, .5, 'sawtooth', .13); setTimeout(() => beep(58, .75, 'sawtooth', .11), 120); setTimeout(() => beep(120, .22, 'square', .07), 420); }
// P3-12a: BOSS 阶段演出 —— 规则层已结算完(data.js BOSS_PHASES 驱动), 这里只负责让玩家看见:
// 赤红压屏闪 + BOSS立绘右侧入画(面向玩家) + 「狂怒」金漆大字 + 底部台词条 + 怒吼 + 援军扬尘登场。
// fxOff 时退化为横幅+日志(规则照样生效, 不锁玩家)。
async function phaseFx(u, ph) {
  const cfg = ph.phase;
  banner(u.cn + ' · ' + cfg.tag.replace(/\s/g, ''), 1500);
  log(`<span style="color:#ff7050">${u.cn}进入第二阶段【${cfg.tag.replace(/\s/g, '')}】！</span>`);
  seBossPhase();
  if (fxOn) {
    const now = performance.now();
    const pim = portraits[u.sprite];
    FX.portrait = (pim && pim.complete && pim.naturalWidth > 0) ? pim : null;
    FX.bigText = cfg.tag + '！';
    FX.bigCrit = true;
    FX.cutinRight = true;                    // BOSS 从右侧入画, 与运功 cutin 镜像
    FX.cutinT0 = now; FX.cutinUntil = now + 1560;
    FX.redT0 = now; FX.redUntil = now + 900; // 赤红压屏
    FX.phaseQuote = { text: cfg.quote, t0: now + 240, until: now + 2360 };
    await sleep(1700);
  } else await sleep(500);
  // 援军登场扬尘(规则层已生成单位, 这里给落点反馈)
  const now2 = performance.now();
  for (const s of ph.spawned) {
    spawnDust(s.x * TS + TS / 2, s.y * TS + TS - 6, now2);
    spawnDust(s.x * TS + TS / 2 - 14, s.y * TS + TS - 8, now2 + 40);
    log(`<span style="color:#ff9070">辽兵援军出现在 (${s.x},${s.y})！</span>`);
  }
  if (ph.spawned.length) await sleep(360);
  FX.cutinRight = false; FX.phaseQuote = null;
}

// P3-12 D2: 升级演出 —— 金漆「升级！」大字 + 等级跃迁 + 成长明细 + 单位脚下金色光环。
// 多连升聚合一段(Lv.5 → 7, 成长累加)。fxOff 退化为日志(数值早已落账, 不锁玩家)。
async function lvUpFx(u, ups) {
  const lv0 = u.lv - ups.length;
  const gains = {};
  for (const up of ups) for (const k in up.gains) gains[k] = (gains[k] || 0) + up.gains[k];
  log(`<span style="color:#ffd24a">✦ ${u.cn} 升到 Lv.${u.lv}！${fmtGains(gains)}</span>`);
  if (!fxOn) return;
  const now = performance.now();
  LVUP.active = true; LVUP.t0 = now; LVUP.until = now + 1900;
  LVUP.u = u; LVUP.lv0 = lv0; LVUP.gains = gains;
  seSortie(); // 上行三音充当升级号
  await sleep(1950);
  LVUP.active = false;
}
// 升级大字: 金漆渐显+入场微弹跳, 成长明细行, 单位脚下呼吸光环(属性微光)
function drawLvUp(now) {
  const u = LVUP.u;
  const k = Math.min(1, (now - LVUP.t0) / 220);
  const pop = 1 + 0.18 * Math.sin(Math.min(1, (now - LVUP.t0) / 300) * Math.PI);
  const fade = now > LVUP.until - 300 ? Math.max(0, (LVUP.until - now) / 300) : 1;
  ctx.save();
  ctx.globalAlpha = k * fade;
  if (u) { // 脚下金色光环(呼吸)
    const cx = u.x * TS + TS / 2, cy = u.y * TS + TS - 6;
    const pr = 0.5 + 0.5 * Math.sin(now / 130);
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55 * k * fade;
    ctx.beginPath(); ctx.ellipse(cx, cy, 20 + 6 * pr, 8 + 3 * pr, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = k * fade;
  }
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(64 * pop)}px "Kaiti SC","STKaiti",serif`;
  ctx.fillStyle = '#3a2a10';
  ctx.fillText('升 级 ！', W * TS / 2 + 3, 133);
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('升 级 ！', W * TS / 2, 130);
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#fff8e0';
  ctx.fillText(`${u.cn}  Lv.${LVUP.lv0} → ${u.lv}`, W * TS / 2, 168);
  ctx.font = '18px monospace';
  ctx.fillStyle = '#ffe9a0';
  ctx.fillText(fmtGains(LVUP.gains), W * TS / 2, 196);
  ctx.restore();
}

// 运功演出: buff名大字(立绘切入, 无立绘居中出字)+角色色光环+头顶小字
async function spiritFx(u, s) {
  if (!fxOn) return;
  const now = performance.now();
  const color = SPIRIT_COLOR[s.fx] || '#9ad0ff';
  const pim = portraits[u.sprite];
  FX.portrait = (pim && pim.complete && pim.naturalWidth > 0) ? pim : null;
  FX.bigText = s.name + '！';
  FX.bigCrit = (s.fx === 'dmg2' || s.fx === 'mustHit'); // 进攻型运功给金字待遇
  FX.cutinT0 = now; FX.cutinUntil = now + 840;
  FX.ringFx = { x: u.x, y: u.y, color, t0: now, until: now + 640 };
  FX.floats.push({ x: u.x, y: u.y, text: '【' + s.name + '】', color, t0: now });
  seSpirit();
  await sleep(840);
}

function finishUnit(u, keepMenuOpen) {
  u.acted = true;
  expireTurnBuffs(u); // P3-12 D3(AUDIT#46): 上回合运的功, 本次行动结束即到期(热血不再永久×2)
  Sel.unit = null; Sel.moveTiles = null; Sel.atkTiles = null; Sel.pending = null;
  hideMenus();
  if (!keepMenuOpen) {}
  if (G.units.every(v => v.side !== 'player' || v.hp <= 0 || v.acted)) {
    enemyPhase();
  }
}

// 反击询问
// P0-2: 反击自动决策(期望命中×伤害最大); 手动模式走原弹窗
let AUTO_COUNTER = loadSwitch('counter', true);
let lastHover = '';
function askCounter(def, att) {
  const opts = counterWeapons(def, att);
  if (!opts.length) return Promise.resolve(null);
  if (AUTO_COUNTER) {
    let best = null, bestE = -1;
    for (const wid of opts) {
      const f = forecast(def, att, WEAPONS[wid]);
      const e = (f.hitp / 100) * f.dmg;
      if (e > bestE) { bestE = e; best = wid; }
    }
    return Promise.resolve(best);
  }
  return new Promise(res => {
    showForecast(`${def.cn} 受到攻击！是否反击？`, opts.map(wid => {
      const w = WEAPONS[wid];
      const f = forecast(def, att, w);
      return {
        name: `${w.name} <span class="dim">威力${w.pow}</span>`,
        sub: `命中${f.hitp}% 伤害约${f.dmg}`,
        fn: () => res(wid)
      };
    }).concat([{ name: '<span class="dim">不还手（硬吃攒气势）</span>', sub: '', fn: () => res(null) }]),
    () => res(null)); // 修复: 取消不再永久卡死流程
  });
}

// 敌方回合
async function enemyPhase() {
  G.phase = 'enemy';
  updateTop();
  banner('敌方行动', 800);
  await sleep(900);
  for (const u of G.units.filter(v => v.side === 'enemy' && v.hp > 0)) {
    if (G.over) return;
    const plan = enemyPlan(u);
    if (!plan) continue;
    if (plan.x !== u.x || plan.y !== u.y) await animUnitMove(u, plan.x, plan.y); // P2-13: 步伐插值替瞬移
    if (plan.kind === 'attack' && plan.target.hp > 0) {
      // 敌方运功AI: 引擎决策, 这里扣真气挂buff(与玩家运功同一条路)
      const sid = enemySpirit(u, plan.target);
      if (sid) {
        const s = SPIRIT_BOOK[sid];
        u.sp -= s.cost;
        u.buffs[s.fx] = true;
        log(`${u.cn} 运功【${s.name}】:${s.desc}`);
        await spiritFx(u, s); // P1-6: 敌方运功同样给演出(AI 的努力要让玩家看见)
      }
      const ev = resolveAttack(u, plan.target, WEAPONS[plan.wid]);
      await animateEvent(ev);
      // 反击
      if (!ev.killed && plan.target.hp > 0 && ev.type !== 'evade') {
        const cw = await askCounter(plan.target, u);
        if (cw && !G.over) {
          const cev = resolveAttack(plan.target, u, WEAPONS[cw]);
          await animateEvent(cev);
        }
      }
    }
    clearBuffs(u);
  }
  // 新回合
  G.turn++; G.phase = 'player';
  for (const u of G.units.filter(v => v.side === 'player' && v.hp > 0)) {
    u.acted = false;
    u.sp = Math.min(u.maxsp, u.sp + 5);
    u.will = Math.min(u.maxwill, u.will + 2);
  }
  for (const u of G.units.filter(v => v.side === 'enemy' && v.hp > 0)) clearBuffs(u);
  updateTop();
  // P3-12 D1: 每回合开始自动存档 —— 败北后刷新+读档直接回到回合检查点
  saveGame(true);
  log('<span class="dim">回合开始，已自动存档</span>');
  banner('第 ' + G.turn + ' 回合 · 我方行动', 900);
}

function clearBuffs(u) {
  ['mustHit', 'dmg2', 'halfDmg', 'mov3', 'dust'].forEach(k => delete u.buffs[k]); // dust=P3-12 D3 石灰粉
  if (u.buffs.evade === false) delete u.buffs.evade;
}

function checkEnd() {
  if (G.over) return;
  const boss = G.units.find(v => v.boss);
  const bossDead = !boss || boss.hp <= 0;
  const playersAlive = G.units.some(v => v.side === 'player' && v.hp > 0);
  const hero = G.units.find(v => v.key === 'hero');
  if (bossDead) {
    G.over = true; G.result = 'win';
    banner('段延庆击破！ 危机解除', 1600);
    // P3-11b: 机战式评价结算画面替原生 alert(AUDIT#14); 等击破 banner 落定后入场
    setTimeout(() => { RESULT.active = true; RESULT.t0 = performance.now(); }, 1500);
  } else if (!playersAlive || (hero && hero.hp <= 0)) {
    G.over = true; G.result = 'lose';
    banner('我方全灭……', 2200);
    // P3-12 D4(AUDIT#39): 体面败北出口 —— 画面内直接给「读档/重开」两个按钮, 不再 confirm+整页刷新
    setTimeout(() => showLose(), 1300);
  }
}

// P3-12 D4: 败北画面(DOM 模态, 与开场同风格) —— 读档回回合检查点(需有档), 或重开一周目。
// 任何残留模态(道具/预测)一并收起 —— 败北可从敌方回合触发, 玩家可能正开着道具菜单(AUDIT#47)。
function showLose() {
  const hasSave = !!(typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY));
  const btn = document.getElementById('loseLoadBtn');
  btn.disabled = !hasSave;
  btn.textContent = hasSave ? '读档（回到回合检查点）' : '读档（无存档）';
  document.getElementById('forecast').classList.add('hidden');
  hideMenus();
  document.getElementById('loseModal').classList.remove('hidden');
}

function updateTop() {
  document.getElementById('turnInfo').textContent =
    `第 ${G.turn} 回合 · ${G.phase === 'player' ? '我方行动' : '敌方行动'}` +
    (G.comboUsed ? ' · 合体技已用' : '');
}

// ---------- 输入 ----------
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mouse.x = Math.floor((e.clientX - r.left) / TS);
  mouse.y = Math.floor((e.clientY - r.top) / TS);
  // P0-3: 悬停情报(FE 式) — 有单位显示单位, 空地显示地形效果
  if (FIGHT.active || mouse.x < 0 || mouse.x >= W || mouse.y < 0 || mouse.y >= H) return;
  const key = mouse.x + ',' + mouse.y;
  if (key === lastHover) return;
  lastHover = key;
  const hu = G.units.find(v => v.hp > 0 && v.x === mouse.x && v.y === mouse.y);
  if (hu && hu !== Sel.unit) showInfo(hu);
  else if (!hu) {
    const tn = MAP_LAYOUT[mouse.y][mouse.x];
    const t = TERRAIN[tn];
    const move = t.cost < 0 ? '不可通行' : '移动力 ' + t.cost;
    unitInfo.innerHTML = `<b>${tn}</b> ｜ ${move}` +
      (t.def ? ` ｜ 防御+${t.def}` : '') + (t.eva ? ` ｜ 回避+${t.eva}` : '') +
      `<br><span class="dim">地形效果 · 悬停情报</span>`;
  }
});
cv.addEventListener('mouseleave', () => { mouse.x = -1; });

cv.addEventListener('click', async () => {
  // P3-11a: 剧情演出期间点击=推进(补全/翻页/跳段), 不吃成选中
  if (TITLE.active || DLG.active || SORTIE.active) { inputPulse++; return; }
  // P3-11b: 评价结算画面点击 = 重新开始(序章打完即一局终了)
  if (RESULT.active) { location.reload(); return; }
  // P1-10: 演出期间点击=跳过(最优先; 敌方回合演出也能跳)
  if (FIGHT.active) { FIGHT.skip = true; return; }
  // P1-8: 开场镜头进行中点击 = 直接收场(不吃掉这次点击做选中)
  if (INTRO.active) { INTRO.active = false; return; }
  if (G.over || G.phase !== 'player') return;
  // P2-13: 移动演出进行中锁输入, 防点了白点/吃到旧菜单
  if (MAP_MOVE) return;
  const { x, y } = mouse;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const u = G.units.find(v => v.hp > 0 && v.x === x && v.y === y);

  // 待选目标(攻击/合体)
  if (Sel.pending) {
    const pend = Sel.pending;
    const tgt = pend.targets.find(v => v.x === x && v.y === y && v.hp > 0);
    if (!tgt) return;
    Sel.atkTiles = null; Sel.pending = null;
    if (pend.kind === 'attack') {
      const ev = resolveAttack(pend.u, tgt, WEAPONS[pend.wid]);
      await animateEvent(ev);
      if (!ev.killed && tgt.hp > 0 && ev.type !== 'evade') {
        const cw = await askCounter(tgt, pend.u);
        if (cw && !G.over) await animateEvent(resolveAttack(tgt, pend.u, WEAPONS[cw]));
      }
      finishUnit(pend.u);
    } else if (pend.kind === 'combo') {
      await doCombo(pend.u, tgt);
    }
    return;
  }

  // 选中友军
  if (u && u.side === 'player' && !u.acted && !Sel.unit) {
    Sel.moveTiles = moveRange(u);
    Sel.unit = u;
    openMenu(u);
    return;
  }
  // 已选中,点击移动范围 = 移动并展开菜单
  if (Sel.unit && Sel.moveTiles && Sel.moveTiles[x + ',' + y] !== undefined && !u) {
    // P2-13: FE 式步伐插值移动替瞬移, 落定才展开指令菜单
    const mu = Sel.unit;
    Sel.moveTiles = null;
    hideMenus();
    await animUnitMove(mu, x, y);
    if (Sel.unit !== mu) return;
    openMenu(mu);
    return;
  }
  // 点空白取消
  if (!u) {
    Sel.unit = null; Sel.moveTiles = null; Sel.atkTiles = null;
    hideMenus(); showInfo(null);
  } else {
    showInfo(u);
  }
});

document.getElementById('endTurn').onclick = () => {
  if (G.phase !== 'player' || G.over) return;
  // P1-8/P3-11a: 开场镜头与剧情演出期间不吃结束回合(避免流程叠加)
  if (INTRO.active || TITLE.active || DLG.active || SORTIE.active) return;
  Sel.unit = null; Sel.moveTiles = null; hideMenus(); showInfo(null);
  G.units.filter(v => v.side === 'player').forEach(v => v.acted = true);
  enemyPhase();
};
document.getElementById('bgmBtn').onclick = e => {
  bgmOn = !bgmOn;
  saveSwitch('bgm', bgmOn); // P3-11: 持久化
  e.target.textContent = '音乐:' + (bgmOn ? '开' : '关');
  if (!bgmOn) beepStop();
};
document.getElementById('fxBtn').onclick = e => {
  fxOn = !fxOn;
  saveSwitch('fx', fxOn); // P3-11: 持久化
  e.target.textContent = '演出:' + (fxOn ? '开' : '关');
};
document.getElementById('counterBtn').onclick = e => {
  AUTO_COUNTER = !AUTO_COUNTER;
  saveSwitch('counter', AUTO_COUNTER); // P3-11: 持久化
  e.target.textContent = '反击:' + (AUTO_COUNTER ? '自动' : '手动');
};
document.getElementById('helpBtn').onclick = () => {
  alert('操作:\n点击我方单位 -> 点蓝格移动 -> 在菜单选指令\n攻击: 选武功(看命中/伤害预测) -> 点黄圈内的敌人\n运功: 耗真气发动(凝神必中/热血×2/游身闪避...), 效果持续到下次行动结束\n道具: 全队共享道具袋(金创药回血/九花回内/女儿红攒气势/石灰粉糊敌脸), 用道具=用掉本回合行动\n韦小宝邻接残血辽将 -> 说得收服\n萧峰郭靖相邻且气势≥120 -> 合体技「双侠镇襄阳」\n敌方回合可反击(选武功或硬吃攒气势)\n存档: 我方回合空闲随时可存; 开场/每回合开始自动存档\n败北后可直接「读档」回回合检查点, 或重开\n胜利条件: 击破段延庆');
};
// P3-12 D1: 存档/读档按钮(准入见 saveLoadIdle)
document.getElementById('saveBtn').onclick = () => {
  if (!saveLoadIdle()) { log('战斗或演出进行中，不能存档'); return; }
  saveGame(false);
};
document.getElementById('loadBtn').onclick = () => {
  if (!saveLoadIdle()) { log('战斗或演出进行中，不能读档'); return; }
  loadGame();
};
// P3-12 D4: 败北画面两个出口 —— 读档直接回检查点(不经过 saveLoadIdle, G.over 状态由档内覆盖), 重开=刷新
document.getElementById('loseLoadBtn').onclick = () => {
  document.getElementById('loseModal').classList.add('hidden');
  if (!loadGame()) log('读档失败, 请重开');
};
document.getElementById('loseRestartBtn').onclick = () => location.reload();
// 空格/回车也可推进剧情(与点击同权; 测试台 window 无 addEventListener, 防御式注册)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') && (TITLE.active || DLG.active || SORTIE.active)) {
      e.preventDefault();
      inputPulse++;
    }
  });
}
document.getElementById('startBtn').onclick = () => {
  document.getElementById('intro').classList.add('hidden');
  playStory(); // P3-11a: 标题卡→立绘对白→出击画面→开战(演出关则直接开战)
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============ P3-11a: 剧情演出驱动 ============
// 顺序: 标题卡(2.6s) → 镜头扫场与对白同播(点击/空格逐句) → 出击画面 → 开战横幅
// 任何阶段演出开关被关 => 立即收尾直接开战(尊重演出开关, 不锁死玩家)
async function playStory() {
  if (!fxOn) { beginPlay(); return; }
  TITLE.active = true; TITLE.t0 = performance.now();
  await waitPulseOr(TITLE.dur);
  TITLE.active = false;
  if (!fxOn) { beginPlay(); return; }
  // 扫场与对白同播(AUDIT#24: 标题卡垫场后, 镜头 0.6s 空窗已被填掉)
  INTRO.active = true; INTRO.t0 = performance.now();
  DLG.active = true;
  for (let i = 0; i < STORY.opening.length; i++) {
    DLG.idx = i; DLG.t0 = performance.now(); DLG.chars = 0; DLG.done = false;
    await playLine();
    if (!fxOn) break;
  }
  DLG.active = false;
  if (fxOn) {
    SORTIE.active = true; SORTIE.t0 = performance.now();
    seSortie();
    await waitPulseOr(SORTIE.dur);
    SORTIE.active = false;
  }
  beginPlay();
}

function beginPlay() {
  INTRO.active = false; // 对白比扫场长时, 开战即收镜头
  banner('第 1 回合 · 我方行动', 1200);
  // P3-12 D1: 开场即自动存档(全新一周目的第一个检查点)
  saveGame(true);
}

// 等一个输入脉冲(点击/空格)或超时自动收场(标题卡/出击用)
async function waitPulseOr(ms) {
  const p0 = inputPulse, t0 = performance.now();
  while (inputPulse === p0 && performance.now() - t0 < ms) await sleep(60);
}

// 单句对白: 打字机播字(首击=整句补全), 播完后再等一个脉冲翻页
async function playLine() {
  const line = STORY.opening[DLG.idx];
  let p0 = inputPulse;
  while (!DLG.done && fxOn) {
    await sleep(50);
    if (inputPulse !== p0) { p0 = inputPulse; DLG.chars = line.text.length; DLG.done = true; }
  }
  while (inputPulse === p0 && fxOn) await sleep(60);
}

// ---------- 初始化 ----------
// P3-11: 恢复上次开关状态后同步按钮文案(刷新后不再全部回到默认开)
syncSwitchBtns();
G.units = INITIAL_UNITS.map(makeUnit);
G.stats.foes = INITIAL_UNITS.filter(e => CHAR_DATA[e.tpl || e.key].side === 'enemy').length; // P3-12a: 初始敌总量(援军由 engine 累加)
G.units.forEach(u => u.weapons.forEach(wid => { const w = WEAPONS[wid]; if (w.ammo !== undefined) u.ammo[w.name] = w.ammo; }));
updateTop();
log('雨夜破庙，半页残谱。辽兵在不该存在的襄阳城墙下肆虐……');
log('目标：击破东北雪地的段延庆。祝少侠武运昌隆。');
requestAnimationFrame(draw);
