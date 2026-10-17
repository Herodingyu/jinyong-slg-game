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
             miniOn: false,   // B1: 攻击事件期间战场缩略图置底模式
             hpAnim: null,    // B1: HP逐格递减 {u,from,to,t0,per,crit}
             floats: [] };    // B1: 伤害飘字(改由draw统一渲染, 缩略图模式下跟战场同坐标系)

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
    if (FX.portrait && FX.portrait.complete && now < FX.cutinUntil) {
      const im = FX.portrait;
      const ph = cv.height * 0.78, pw = ph * im.width / im.height;
      const slide = Math.min(1, (now - FX.cutinT0) / 220); // 220ms滑入
      const px = -pw + (14 + pw) * slide;
      ctx.drawImage(im, px, cv.height - ph - 8, pw, ph);
      // 大字: 白芯深红描边, 立绘右侧
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 68px "KaiTi","STKaiti","Microsoft YaHei",serif';
      const tx = Math.max(px + pw - 40, cv.width * 0.38), ty = cv.height * 0.4;
      ctx.lineWidth = 10; ctx.strokeStyle = FX.bigCrit ? '#7a1010' : '#26203a';
      ctx.strokeText(FX.bigText, tx, ty);
      ctx.fillStyle = FX.bigCrit ? '#ffd24a' : '#fff8e0';
      ctx.fillText(FX.bigText, tx, ty);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
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
function showInfo(u) {
  if (!u) { unitInfo.innerHTML = '点击我方单位查看信息'; return; }
  const wp = u.weapons.map(wid => WEAPONS[wid].name).join('、');
  unitInfo.innerHTML =
    `<b>${u.cn}</b> ${u.boss ? '·BOSS' : ''}<br>` +
    `HP ${u.hp}/${u.maxhp} ｜ 真气 ${u.sp}/${u.maxsp} ｜ 气势 <b style="color:#e8c85a">${u.will}</b><br>` +
    `膂力${u.atk} 根骨${u.def} 命中${u.hit} 闪避${u.evd} 轻功${u.mov}<br>` +
    `武功: ${wp}`;
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
      fn: () => {
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
  const fakeW = { name: '双侠镇襄阳', pow: 3400, hit: 100, crit: 25, rng: [1, 1], cost: 0, will: 0, type: '外' };
  for (const e of hitSet) {
    // 经 opts 传临时buff/膂力加成, resolveAttack 的气势增减直接落在真身
    const ev = resolveAttack(u, e, fakeW, { buffs: { mustHit: true }, atkBonus: p.atk });
    await animateEvent(ev, true);
  }
  finishUnit(u, true);
}

// 战斗演出
async function animateEvent(ev, skipMotif) {
  if (ev.type === 'evade') {
    seMiss(); log(`${ev.def.cn} 游身闪过 ${ev.w.name}！`);
    await sleep(500); return;
  }
  if (ev.type === 'miss') {
    seMiss(); log(`${ev.att.cn} 的【${ev.w.name}】落空了`);
    await sleep(500); return;
  }
  // 机战式切入: 立绘+书法大字+爆闪+震屏; 演出关闭或无立绘时退回横幅提示
  const pt = fxOn ? portraits[ev.att.sprite] : null;
  const cutin = !!(pt && pt.complete);
  // B1: 演出开启时, 攻击事件全程战场进入缩略图置底模式
  FX.miniOn = fxOn;
  try {
    if (cutin) {
      const t0 = performance.now();
      FX.portrait = pt;
      FX.bigText = ev.w.name + (ev.isCrit ? ' ·会心!' : '');
      FX.bigCrit = !!ev.isCrit;
      FX.cutinT0 = t0;
      FX.cutinUntil = t0 + (ev.isCrit ? 980 : 760);
      FX.flashT0 = t0;
      FX.flashUntil = t0 + (ev.isCrit ? 340 : 240);
      FX.shakeUntil = t0 + 460;
    }
    seHit(); if (ev.isCrit) seCrit();
    if (!cutin) banner(ev.w.name + (ev.isCrit ? ' ·会心！' : ''), ev.isCrit ? 900 : 650);
    if (cutin) await sleep(ev.isCrit ? 820 : 640);
    // 攻击者前冲
    const dx = Math.sign(ev.def.x - ev.att.x), dy = Math.sign(ev.def.y - ev.att.y);
    const ox = ev.att.x, oy = ev.att.y;
    ev.att.x = ox + dx * 0.5; ev.att.y = oy + dy * 0.5;
    await sleep(280);
    ev.att.x = ox; ev.att.y = oy;
    if (fxOn) {
      // B1: HP逐格递减——"格"为 maxhp 的 1/10(机战格子血条), 每格 40ms(会心 25ms+红字),
      // 一格一跳严禁瞬间跳变; 最多 11 格, 整段动画天然不超过 ~440ms, 无需限速
      const from = Math.min(ev.def.maxhp, ev.def.hp + ev.dmg);
      const seg = Math.max(1, Math.round(ev.def.maxhp / 10));
      const per = ev.isCrit ? 25 : 40;
      const steps = Math.max(1, Math.ceil((from - ev.def.hp) / seg));
      FX.hpAnim = { u: ev.def, from, to: ev.def.hp, t0: performance.now(), per, seg, crit: !!ev.isCrit };
      floatText(ev.def, '-' + ev.dmg + (ev.isCrit ? '!' : ''), ev.isCrit ? '#ff5040' : '#ffe070');
      log(`${ev.att.cn} 的【${ev.w.name}】命中 ${ev.def.cn}，造成 <b>${ev.dmg}</b>${ev.isCrit ? ' 会心!' : ''}伤害` +
          (ev.killed ? `，<span style="color:#ff9070">击破！</span>` : ''));
      if (ev.killed) { banner(ev.def.cn + ' 击破！', 800); playMotif(ev.att); }
      await sleep(steps * per + 80);
    } else {
      // 演出关闭: 保持旧行为(瞬间结算+飘字+短暂停顿)
      floatText(ev.def, '-' + ev.dmg + (ev.isCrit ? '!' : ''), ev.isCrit ? '#ff5040' : '#ffe070');
      log(`${ev.att.cn} 的【${ev.w.name}】命中 ${ev.def.cn}，造成 <b>${ev.dmg}</b>${ev.isCrit ? ' 会心!' : ''}伤害` +
          (ev.killed ? `，<span style="color:#ff9070">击破！</span>` : ''));
      if (ev.killed) { banner(ev.def.cn + ' 击破！', 800); playMotif(ev.att); }
      await sleep(450);
    }
    checkEnd();
  } finally {
    FX.hpAnim = null;  // B1: 异常路径也不残留大HP条/跳动数字
    FX.miniOn = false; // B1: 演出结束恢复战场全屏显示
  }
}

// 伤害飘字: B1起改由draw()统一渲染(旧setInterval直画在缩略图模式下会错位)
function floatText(u, text, color) {
  FX.floats.push({ x: u.x, y: u.y, text, color, t0: performance.now() });
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
function askCounter(def, att) {
  return new Promise(res => {
    const opts = counterWeapons(def, att);
    if (!opts.length) return res(null);
    showForecast(`${def.cn} 受到攻击！是否反击？`, opts.map(wid => {
      const w = WEAPONS[wid];
      const f = forecast(def, att, w);
      return {
        name: `${w.name} <span class="dim">威力${w.pow}</span>`,
        sub: `命中${f.hitp}% 伤害约${f.dmg}`,
        fn: () => res(wid)
      };
    }).concat([{ name: '<span class="dim">不还手（硬吃攒气势）</span>', sub: '', fn: () => res(null) }]));
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
});
cv.addEventListener('mouseleave', () => { mouse.x = -1; });

cv.addEventListener('click', async () => {
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
