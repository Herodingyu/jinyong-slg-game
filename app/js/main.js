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
let fxOn = true;
const FX = { portrait: null, bigText: '', bigCrit: false,
             cutinT0: 0, cutinUntil: 0, flashT0: 0, flashUntil: 0, shakeUntil: 0,
             miniOn: false,   // 攻击事件期间战场缩略图置底模式
             hpAnim: null,    // HP逐格递减 {u,from,to,t0,per,crit}
             ringFx: null,    // P1-6: 运功角色色环 {x,y,color,t0,until}
             floats: [] };    // 伤害飘字(由draw统一渲染)

// ============ B2: 机战式横版战斗场景 ============
// 攻击确认后切入: 战场压暗为背景+电影黑边, 攻方立绘左/守方立绘右(守方镜像),
// 每把武功按 data.js 的 anim 配置演出独立动作(蓄力→出招→命中→收势), 全程程序动画零素材依赖。
const FT = { enter: 360, charge: 700, strike: 1030, hit: 1500, out: 1740 }; // 时间轴(ms), 会心整体+240
const FIGHT = { active: false, ev: null, t0: 0, crit: false, isMiss: false, sparks: [],
                attImg: null, defImg: null, attIsPortrait: false, defIsPortrait: false,
                weaponName: '', animKind: 'dash', animColor: '#ffb84a', durOut: FT.out,
                killAt: 0,       // P1-5: HP归零时刻(相对t0), 击破定格+台词时间轴锚点
                gunX: 0, gunY: 0 };

// 窗口进度: p 在 [a,b] 间的归一化位置(0→1)
function win(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }

// ============ P1-9: 立绘 puppet 分层动画(伪骨骼) ============
// 丁工 10-20 点名"人物不会动": 机战A 是逐帧动作, 零新素材下把立绘按头/躯干/腿三层切分，
// 每层独立变换逼近"这个人在出招/在挨打"。切分比例做成常量, 个别立绘姿势差异可在此微调。
const PUPPET = { HEAD: 0.22, TORSO: 0.56 };   // 头占顶22% 躯干占中56% 腿=剩余22%
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

// 攻方姿态时间轴: 待机呼吸 -> 蓄力下沉 -> 出招前送(腿后蹬) -> 收招过冲回弹
// tStrike=命中时刻(相对t0), p=当前进度(相对t0)
function fightAttPose(p, now, tStrike) {
  const chargeP = win(p, FT.enter, tStrike);            // 蓄力进度
  const strikeIn = win(p, tStrike - 110, tStrike + 20); // 前送(快)
  const strikeOut = win(p, tStrike + 20, tStrike + 310);// 回弹(带回冲)
  const breathe = Math.sin(now / 280) * 0.012;          // 待机呼吸
  const snap = strikeIn * (1 - easeOutBack(strikeOut)); // 出招冲量(归位时过冲为负)
  return {
    lean: 6 * chargeP + 9 * snap,                       // 蓄力前倾6°(沉身) -> 出招躯干前送9°
    headLean: 4 * chargeP + 5 * Math.max(0, snap) + Math.sin(now / 420) * 1.5, // 头随躯干+待机微侧1.5°
    headDY: 5 * chargeP,                                // 蓄力头下沉(蓄势感)
    squash: (1 - 0.07 * chargeP) * (1 + 0.035 * Math.max(0, snap)) + breathe, // 下蹲0.93 / 出招挺直
    legDX: -12 * Math.max(0, snap) + 3 * chargeP,       // 出招腿后蹬 / 蓄力重心前移
    legDY: 3 * chargeP,                                 // 蓄力屈膝
    legLean: -6 * Math.max(0, snap),                    // 后腿蹬直
  };
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
  FIGHT.durOut = FT.out + (FIGHT.crit ? 240 : 0);
  FIGHT.weaponName = ev.w.name;
  const anim = (ev.w.anim) || { kind: 'dash', color: '#ffb84a' };
  FIGHT.animKind = anim.kind;
  FIGHT.animColor = anim.color;
  // 立绘优先, 无立绘角色用地图 sprite 放大回退(保持横版对峙成立)
  const ap = portraits[ev.att.sprite], dp = portraits[ev.def.sprite];
  FIGHT.attIsPortrait = !!(ap && ap.complete);
  FIGHT.defIsPortrait = !!(dp && dp.complete);
  FIGHT.attImg = FIGHT.attIsPortrait ? ap : sprites[ev.att.sprite];
  FIGHT.defImg = FIGHT.defIsPortrait ? dp : sprites[ev.def.sprite];
  if (FIGHT.isMiss) { // 落空: 守方不扣血, 无爆闪无震屏
    FIGHT.killAt = 0;
    FX.hpAnim = null;
    FX.flashT0 = FX.flashUntil = FX.shakeUntil = 0;
  } else {
    const from = Math.min(ev.def.maxhp, ev.def.hp + ev.dmg);
    const seg = Math.max(1, Math.round(ev.def.maxhp / 10));
    const per = FIGHT.crit ? 26 : 40;
    FX.hpAnim = { u: ev.def, from, to: ev.def.hp,
                  t0: now + FT.strike + (FIGHT.crit ? 120 : 0),
                  per, seg, crit: FIGHT.crit };
    FX.flashT0 = now + FT.strike; FX.flashUntil = now + FT.strike + (FIGHT.crit ? 380 : 260);
    FX.shakeUntil = now + FT.strike + 500;
    if (ev.killed) {
      // P1-5: 击破情绪峰值 — HP归零瞬间白闪定格~500ms, 再接攻方胜利台词(motto)大字
      const zeroTicks = Math.ceil(from / seg);          // 逐格归零所需格数
      FIGHT.killAt = FT.strike + (FIGHT.crit ? 120 : 0) + zeroTicks * per;
      FIGHT.durOut = FIGHT.killAt + 500 + 980;          // 定格500ms + 台词停留~1s
    } else FIGHT.killAt = 0;
  }
}
function endFight() {
  FIGHT.active = false; FIGHT.ev = null; FIGHT.sparks = [];
  FIGHT.killAt = 0;
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
let AC = null, bgmTimer = null, bgmOn = true;
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
function draw() {
  const now = performance.now();
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  // 屏幕震动(命中/会心时)
  if (fxOn && now < FX.shakeUntil) {
    ctx.translate((Math.random() * 2 - 1) * 5, (Math.random() * 2 - 1) * 5);
  }
  // B1 缩略图模式: 演出期间战场整体缩至~40%并置底, 主视觉让给立绘与大字
  const mini = fxOn && FX.miniOn;
  if (mini) {
    const s = 0.4;
    ctx.translate((cv.width - W * TS * s) / 2, cv.height - H * TS * s);
    ctx.scale(s, s);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = TIDX[MAP_LAYOUT[y][x]];
    ctx.drawImage(tileImg, t * 32, 0, 32, 32, x * TS, y * TS, TS, TS);
  }
  // 范围高亮
  if (Sel.moveTiles) for (const key in Sel.moveTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(60,140,255,.28)';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(90,160,255,.9)'; ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  if (Sel.atkTiles) for (const key in Sel.atkTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(255,70,60,.25)';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(255,110,90,.9)'; ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  if (Sel.comboTiles) for (const key in Sel.comboTiles) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(255,210,60,.3)';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    ctx.strokeStyle = 'rgba(255,220,90,.95)'; ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  // 单位
  const t = performance.now() / 300;
  for (const u of G.units) {
    if (u.hp <= 0) continue;
    const bob = Math.sin(t + u.id) * 1.5;
    const im = sprites[u.sprite];
    if (u.side === 'enemy') { // 敌方红框
      ctx.strokeStyle = '#d04030'; ctx.lineWidth = 2;
      ctx.strokeRect(u.x * TS + 3, u.y * TS + 3, TS - 6, TS - 6);
    }
    if (Sel.unit === u) {
      ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 3;
      ctx.strokeRect(u.x * TS + 2, u.y * TS + 2, TS - 4, TS - 4);
    }
    if (im.complete) ctx.drawImage(im, u.x * TS, u.y * TS + bob, TS, TS);
    // HP 条 + 气势
    const bw = TS - 10;
    // B1 演出期间: 条与数字都走逐格动画的当前值, 演出关闭时直接用真实值
    const disp = (fxOn && FX.hpAnim && FX.hpAnim.u === u) ? hpAnimValue(now) : u.hp;
    ctx.fillStyle = '#202028'; ctx.fillRect(u.x * TS + 5, u.y * TS + TS - 8, bw, 4);
    ctx.fillStyle = u.side === 'player' ? '#50c060' : '#d05040';
    ctx.fillRect(u.x * TS + 5, u.y * TS + TS - 8, bw * (Math.max(0, disp) / u.maxhp), 4);
    ctx.fillStyle = '#202028'; ctx.fillRect(u.x * TS + 5, u.y * TS + TS - 3, bw, 2);
    ctx.fillStyle = '#e8c85a';
    ctx.fillRect(u.x * TS + 5, u.y * TS + TS - 3, bw * (u.will / 150), 2);
    ctx.fillStyle = u.side === 'player' ? '#cfe0ff' : '#ffc8b8';
    ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(u.cn, u.x * TS + TS / 2, u.y * TS + 10);
    // B1 扣血中的数字同步跳动(会心红字)
    if (fxOn && FX.hpAnim && FX.hpAnim.u === u) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = FX.hpAnim.crit ? '#ff5040' : '#fff8e0';
      ctx.fillText(Math.max(0, disp), u.x * TS + TS / 2, u.y * TS + TS - 14);
    }
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
  ctx.restore(); // 震动/缩略图变换结束, 覆盖层不参与抖动
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
    // P0-1/P1-6: 立绘切入+书法大字; 无立绘角色大字居中(台词/运功通用)
    if (now < FX.cutinUntil && FX.bigText) {
      const im = FX.portrait;
      const hasIm = im && im.complete;
      let tx;
      if (hasIm) {
        const ph = cv.height * 0.78, pw = ph * im.width / im.height;
        const slide = Math.min(1, (now - FX.cutinT0) / 220); // 220ms滑入
        const px = -pw + (14 + pw) * slide;
        ctx.drawImage(im, px, cv.height - ph - 8, pw, ph);
        tx = Math.max(px + pw - 40, cv.width * 0.38);
        ctx.textAlign = 'left';
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
  requestAnimationFrame(draw);
}

// ============ B2: 战斗场景渲染(FIGHT.active 期间由 draw 调) ============
function drawFightScene(nowReal) {
  const ev = FIGHT.ev;
  if (!ev) return;
  const p = nowReal - FIGHT.t0;
  const crit = FIGHT.crit;
  const tStrike = FT.strike + (crit ? 120 : 0);
  const killAt = FIGHT.killAt || 0;
  // P1-5: 击破定格 — 定格窗口内全场景时间冻结(火花悬停/立绘定住), 只有白闪在衰减
  const now = (ev.killed && p >= killAt && p < killAt + 500)
    ? FIGHT.t0 + killAt : nowReal;
  const outA = 1 - win(p, FIGHT.durOut - 200, FIGHT.durOut); // 收势淡出
  const CW = cv.width, CH = cv.height;

  // --- 背景: 战场缩略压暗 + 电影黑边 ---
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,20,.92)';
  ctx.fillRect(0, 0, CW, CH);
  const s = 0.5, mw = W * TS * s, mh = H * TS * s;
  ctx.globalAlpha = 0.32 * outA;
  ctx.translate((CW - mw) / 2, (CH - mh) / 2 + 10);
  ctx.scale(s, s);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = TIDX[MAP_LAYOUT[y][x]];
    ctx.drawImage(tileImg, t * 32, 0, 32, 32, x * TS, y * TS, TS, TS);
  }
  for (const u of G.units) { // 战场上单位也一起缩略显示
    if (u.hp <= 0) continue;
    const im = sprites[u.sprite];
    if (im.complete) ctx.drawImage(im, u.x * TS, u.y * TS, TS, TS);
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = outA;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CW, 54);            // 上黑边
  ctx.fillRect(0, CH - 44, CW, 44);      // 下黑边

  // --- 站位: 攻左守右, 守方镜像面向攻方 ---
  const enter = win(p, 0, FT.enter);
  const ease = 1 - Math.pow(1 - enter, 3);
  const PH = 470;                              // 立绘高度(缩小拉开对峙距离)
  const standY = CH - 44 - PH + 14;
  const attRestX = 64;
  const attX = -380 + ease * (attRestX + 380);
  const defW0 = FIGHT.defIsPortrait ? PH * (FIGHT.defImg.width / FIGHT.defImg.height) : 400;
  const defRestX = CW - 96 - defW0;
  const defX = CW + 60 - ease * (CW + 60 - defRestX);
  // P1-9: 受击后仰进度(守方 puppet 姿态驱动); 击破定格期间姿态锁在峰值帧
  const hitP = win(p, tStrike, tStrike + 430);
  const recoil = (hitP > 0 && hitP < 1) ? Math.sin(hitP * Math.PI) : 0;
  const freezeHit = !!ev.killed && p >= killAt && p < killAt + 500;
  let defShakeX;
  if (FIGHT.isMiss) defShakeX = -recoil * 90; // 守方向右后方闪避(面向左,身后=+x取负避开)
  else defShakeX = recoil * (16 + (crit ? 10 : 0)) * (0.55 + Math.random() * 0.45);
  // 突进类位移(整体位移保留, 但不再是唯一动作——身体姿态由 puppet 层表达)
  let attLunge = 0, attLeapY = 0;
  const sp2 = win(p, tStrike - 70, tStrike + 140);
  if (FIGHT.animKind === 'dash' || FIGHT.animKind === 'stab')
    attLunge = Math.sin(Math.min(1, sp2) * Math.PI) * (CW * 0.22);
  if (FIGHT.animKind === 'smash') // 跃起下砸
    attLeapY = -Math.sin(Math.min(1, sp2) * Math.PI) * 130;
  // P1-9: 双方 puppet 姿态(像素小人走整图变换: 64px 源图切三层会裂)
  const attPose = fightAttPose(p, now, tStrike);
  attPose.whole = !FIGHT.attIsPortrait;
  const defPose = fightDefPose(p, now, tStrike, FIGHT.isMiss, crit, freezeHit, FIGHT.defIsPortrait);
  defPose.whole = !FIGHT.defIsPortrait;

  // --- 守方(先画; 落空时叠加2道残影; 受击/侧闪由 puppet 姿态表达) ---
  const defH = FIGHT.defIsPortrait ? PH : 420; // 无立绘角色 sprite 放大到 420
  const defY = standY + (FIGHT.defIsPortrait ? 0 : 100);
  if (FIGHT.isMiss && hitP > 0 && hitP < 1) {
    drawPuppet(FIGHT.defImg, defX + defShakeX * 0.4, defY, defH, true, 0.22 * outA, defPose);
    drawPuppet(FIGHT.defImg, defX + defShakeX * 0.7, defY, defH, true, 0.12 * outA, defPose);
  }
  const defW = drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, outA, defPose);
  // crit 双影(更强打击感)
  if (!FIGHT.isMiss && crit && hitP > 0.05 && hitP < 0.85)
    drawPuppet(FIGHT.defImg, defX + defShakeX - 16 * recoil, defY + 5, defH, true, 0.30 * (1 - hitP) * outA, defPose);
  // 受击白闪(落空无; crit 加强)
  if (!FIGHT.isMiss && hitP > 0 && hitP < 0.5) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (0.5 - hitP) * (crit ? 2.4 : 1.5)) * outA;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#fff';
    ctx.fillRect(defX - 30, defY - 30, defW + 80, defH + 60);
    ctx.restore();
  }

  // --- 攻方(puppet: 呼吸/下蹲蓄力/前送出招/过冲收招) ---
  const attH = FIGHT.attIsPortrait ? PH : 420;
  const attY = standY + (FIGHT.attIsPortrait ? 0 : 100) + attLeapY;
  drawPuppet(FIGHT.attImg, attX + attLunge, attY, attH, false, outA, attPose);

  // --- 蓄力光球(攻方右前方=出手点; chargeP=蓄力进度驱动光球聚合) ---
  const chargeP = win(p, FT.enter, tStrike);
  let gunX = attX + attLunge + (FIGHT.attIsPortrait ? 300 : 250);
  let gunY = attY + attH * 0.42;
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

  // --- 出招特效(落空不出招) ---
  const strikeP = win(p, tStrike - 50, tStrike + 220);
  const defCx = defX + defW * 0.45, defCy = defY + defH * 0.42;
  if (!FIGHT.isMiss && strikeP > 0 && strikeP <= 1)
    drawWeaponFx(strikeP, now, gunX, gunY, defCx, defCy, attX + attLunge, attY, attH);

  // --- 命中: 火花+伤害大字+击破 / 落空: 闪避大字 ---
  if (FIGHT.isMiss) {
    drawSparks(now);
    const dp = win(p, tStrike + 60, tStrike + 900);
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
  } else if (p >= tStrike) {
    if (p - tStrike < 70) spawnSparks(defCx, defCy, FIGHT.animColor, crit ? 26 : 15);
    drawSparks(now);
    const dp = win(p, tStrike + 60, tStrike + 980);
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

  // --- 顶部: 武器名标题(入位后浮现) ---
  const titleA = win(p, FT.enter - 80, FT.enter + 60) * (1 - win(p, tStrike - 60, tStrike + 60));
  if (titleA > 0) {
    ctx.save();
    ctx.globalAlpha = titleA * outA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px KaiTi,STKaiti,"Microsoft YaHei",serif';
    const tx = CW / 2;
    ctx.lineWidth = 9; ctx.strokeStyle = '#1a1030';
    ctx.strokeText(FIGHT.weaponName, tx, 92);
    ctx.fillStyle = '#fff8e0';
    ctx.fillText(FIGHT.weaponName, tx, 92);
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

  // --- 底部 HP 条(双方, 机战样式) ---
  drawFightHpBar(ev.att, CW * 0.06, CH - 96, false);
  drawFightHpBar(ev.def, CW * 0.54, CH - 96, true);
  ctx.restore();

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
function drawFightHpBar(u, x, y, isDef) {
  const bw = cv.width * 0.40, bh = 14;
  const cur = (fxOn && isDef && FX.hpAnim && FX.hpAnim.u === u)
    ? Math.max(0, hpAnimValue(performance.now())) : u.hp;
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px KaiTi,STKaiti,"Microsoft YaHei",serif';
  ctx.fillStyle = '#fff8e0';
  ctx.fillText(u.cn, x, y - 12);
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

// ============ B2: 各武器专属动作特效 ============
function drawWeaponFx(t, now, gx, gy, tx, ty, attX, attY, attH) {
  const c = FIGHT.animColor;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 4) * (1 - Math.max(0, t - 0.8) * 3);
  const dx = tx - gx, dy = ty - gy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  switch (FIGHT.animKind) {
    case 'beam': { // 光束: 由细到粗再收, 端点爆
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
      break;
    }
    case 'bullet': { // 弹丸+拖尾
      const px = gx + ux * len * t, py = gy + uy * len * t;
      for (let i = 1; i <= 6; i++) {
        ctx.globalAlpha *= 0.82;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(px - ux * i * 9, py - uy * i * 9, 4 - i * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'dragon': { // 龙形气劲: 曲线蛇行+龙头光球+鳞片光点
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
      break;
    }
    case 'sweep': { // 横扫弧光: 大弧从攻方扫到守方
      const mid = Math.min(1, t * 1.2);
      const r = len * 0.62;
      const cx2 = gx + dx * 0.5, cy2 = gy + dy * 0.5 - 60;
      const a0 = Math.atan2(gy - cy2, gx - cx2);
      const a1 = a0 + (Math.atan2(ty - cy2, tx - cx2) - a0) * mid;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 0 ? '#ffffff' : c;
        ctx.lineWidth = (16 - i * 4);
        ctx.globalAlpha = (0.9 - i * 0.3) * Math.min(1, t * 5);
        ctx.beginPath();
        ctx.arc(cx2, cy2, r - i * 12, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
      break;
    }
    case 'wave': { // 环形气浪推进
      const rings = 4;
      for (let i = 0; i < rings; i++) {
        const rt = (t * 1.5 + i / rings) % 1;
        ctx.strokeStyle = c;
        ctx.globalAlpha = (1 - rt) * 0.75;
        ctx.lineWidth = 6 * (1 - rt) + 2;
        ctx.beginPath();
        ctx.ellipse(gx + dx * rt, gy + dy * rt, 46 * (1 - rt * 0.4), 26 * (1 - rt * 0.4), Math.atan2(dy, dx), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'stab': { // 突刺: 尖刺闪光+直线残影
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
      break;
    }
    case 'smash': { // 下砸: 落点冲击环+地裂纹
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
      break;
    }
    case 'slashx': { // 交叉剑气 X
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
      break;
    }
    default: { // dash 直拳冲击波环
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
}

// 伤害飘字: B1起改由draw()统一渲染(旧setInterval直画在缩略图模式下会错位)
function floatText(u, text, color) {
  FX.floats.push({ x: u.x, y: u.y, text, color, t0: performance.now() });
}

// P1-6: 运功演出配色(表现层配置, 与 MOTIF 同级)
const SPIRIT_COLOR = { mustHit:'#6cf0ff', dmg2:'#ff6050', evade:'#8fd08f',
                       halfDmg:'#e8c85a', willUp:'#d0a0ff', capture:'#c89aff', mov3:'#7fd0ff' };
function seSpirit() { beep(392, .1, 'sine', .06); setTimeout(() => beep(523, .12, 'sine', .06), 90); setTimeout(() => beep(659, .16, 'sine', .05), 180); }
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
  Sel.unit = null; Sel.moveTiles = null; Sel.atkTiles = null; Sel.pending = null;
  hideMenus();
  if (!keepMenuOpen) {}
  if (G.units.every(v => v.side !== 'player' || v.hp <= 0 || v.acted)) {
    enemyPhase();
  }
}

// 反击询问
// P0-2: 反击自动决策(期望命中×伤害最大); 手动模式走原弹窗
let AUTO_COUNTER = true;
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
    if (plan.kind === 'move' || plan.x !== u.x || plan.y !== u.y) {
      u.x = plan.x; u.y = plan.y;
      await sleep(320);
    }
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
  banner('第 ' + G.turn + ' 回合 · 我方行动', 900);
}

function clearBuffs(u) {
  ['mustHit', 'dmg2', 'halfDmg', 'mov3'].forEach(k => delete u.buffs[k]);
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
    banner('段延庆击破！ 危机解除', 3000);
    setTimeout(() => alert('过关！\n\n「今夕是何年？」萧峰望着天边的飞雪。\n\n——序章完——\n（原型演示结束，更多章节见策划案）'), 1500);
  } else if (!playersAlive || (hero && hero.hp <= 0)) {
    G.over = true; G.result = 'lose';
    banner('我方全灭……', 3000);
    setTimeout(() => { if (confirm('失败了……重新开始？')) location.reload(); }, 1200);
  }
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
  // P1-10: 演出期间点击=跳过(最优先; 敌方回合演出也能跳)
  if (FIGHT.active) { FIGHT.skip = true; return; }
  if (G.over || G.phase !== 'player') return;
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
    Sel.unit.x = x; Sel.unit.y = y;
    Sel.moveTiles = null;
    await sleep(250);
    openMenu(Sel.unit);
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
  Sel.unit = null; Sel.moveTiles = null; hideMenus(); showInfo(null);
  G.units.filter(v => v.side === 'player').forEach(v => v.acted = true);
  enemyPhase();
};
document.getElementById('bgmBtn').onclick = e => {
  bgmOn = !bgmOn;
  e.target.textContent = '音乐:' + (bgmOn ? '开' : '关');
  if (!bgmOn) beepStop();
};
document.getElementById('fxBtn').onclick = e => {
  fxOn = !fxOn;
  e.target.textContent = '演出:' + (fxOn ? '开' : '关');
};
document.getElementById('counterBtn').onclick = e => {
  AUTO_COUNTER = !AUTO_COUNTER;
  e.target.textContent = '反击:' + (AUTO_COUNTER ? '自动' : '手动');
};
document.getElementById('helpBtn').onclick = () => {
  alert('操作:\n点击我方单位 -> 点蓝格移动 -> 在菜单选指令\n攻击: 选武功(看命中/伤害预测) -> 点黄圈内的敌人\n运功: 耗真气发动(凝神必中/热血×2/游身闪避...)\n韦小宝邻接残血辽将 -> 说得收服\n萧峰郭靖相邻且气势≥120 -> 合体技「双侠镇襄阳」\n敌方回合可反击(选武功或硬吃攒气势)\n胜利条件: 击破段延庆');
};
document.getElementById('startBtn').onclick = () => {
  document.getElementById('intro').classList.add('hidden');
  banner('第 1 回合 · 我方行动', 1200);
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- 初始化 ----------
G.units = INITIAL_UNITS.map(makeUnit);
G.units.forEach(u => u.weapons.forEach(wid => { const w = WEAPONS[wid]; if (w.ammo !== undefined) u.ammo[w.name] = w.ammo; }));
updateTop();
log('雨夜破庙，半页残谱。辽兵在不该存在的襄阳城墙下肆虐……');
log('目标：击破东北雪地的段延庆。祝少侠武运昌隆。');
requestAnimationFrame(draw);
