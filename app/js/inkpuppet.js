// ============ 水墨关节人 · 战斗演出四肢动画引擎 (2026-11-02, P1-16) ============
// 丁工铁律"人物四肢要动起来"的零素材落地：程序骨架皮影人替代立绘整图变换。
// 9 关节(颈/肩×2/肘×2/髋×2/膝×2) + 躯干倾/扭 + 根骨位移, 宣纸白剪影+墨线+红腰带。
// 编排对齐 FT 三镜时间轴：待机呼吸→蓄力(镜1)→出招爆发(镜2)→收势; 守方登场/受击/侧闪/击破定格。
// 优先级: 真 AI 姿势图(poses/, pose_bridge) > 本引擎 > 立绘 puppet——由 pose_bridge 回退链决定。
// 由 index.html 置 window.INK_PUPPET_ON=true 启用; node 测试台无此标记自动走原路径。
(function () {
  'use strict';
  const INK = 'rgba(16,18,28,0.92)';
  const PAPER = 'rgba(238,233,220,0.97)';
  const SASH = 'rgba(178,34,34,0.95)';
  const rad = d => d * Math.PI / 180;

  function brush(ctx, x0, y0, angDeg, len, w) {
    const a = rad(angDeg);
    const mx = x0 + Math.sin(a) * len * 0.5, my = y0 - Math.cos(a) * len * 0.5;
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    ctx.strokeStyle = INK; ctx.lineWidth = w + 2.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.strokeStyle = PAPER; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    return [x1, y1];
  }
  function dot(ctx, x, y, r) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 骨架比例(皮影式: 四肢偏长, 剪影可读)。脚底=(0,0), 向上为负y, s=身高px/210。
  function draw(ctx, o) {
    const J = o.J, s = o.h / 210;
    ctx.save();
    ctx.translate(o.x, o.feetY);
    ctx.scale(o.mirror ? -s : s, s);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const rootX = (J.rootX || 0), rootY = -(J.rootY || 0);
    const pelvisY = rootY - 92; // 腿长=髋到脚 92(大腿48+小腿44), 不悬空不插地
    const aT = J.aT || 0, tw = J.tw || 0;
    const waistX = rootX + Math.sin(rad(aT)) * 8, waistY = pelvisY - 30;
    const chestX = waistX + Math.sin(rad(aT)) * 28, chestY = waistY - Math.cos(rad(aT)) * 28;
    const headX = chestX + Math.sin(rad(aT + (J.aN || 0))) * 20;
    const headY = chestY - 20 - Math.cos(rad(aT)) * 4;
    const shL = [chestX - 15 - Math.sin(rad(tw)) * 4, chestY + 3 + Math.abs(Math.sin(rad(tw))) * 2];
    const shR = [chestX + 15 + Math.sin(rad(tw)) * 4, chestY + 3 + Math.abs(Math.sin(rad(tw))) * 2];
    const hipL = [rootX - 10, pelvisY + 3], hipR = [rootX + 10, pelvisY + 3];
    const arm = (sh, a1, a2, w) => {
      const [ex, ey] = brush(ctx, sh[0], sh[1], a1, 36, w);
      const [hx, hy] = brush(ctx, ex, ey, a1 + a2, 33, w - 3);
      dot(ctx, hx, hy, 5.2);
      return [hx, hy];
    };
    const leg = (hp, a1, a2) => {
      const [kx, ky] = brush(ctx, hp[0], hp[1], a1, 48, 11);
      const [ax, ay] = brush(ctx, kx, ky, a1 + a2, 44, 7.5);
      ctx.strokeStyle = INK; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(ax - 3, ay); ctx.lineTo(ax + 10, ay + 1); ctx.stroke();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(ax - 3, ay); ctx.lineTo(ax + 9, ay + 1); ctx.stroke();
    };
    // 远侧(左)→躯干→近侧(右)
    leg(hipL, -3 + (J.hipL || 0), J.knL || 4);
    arm(shL, (J.aL || 0) - tw * 0.5, J.aLE || 0, 9);
    brush(ctx, rootX, pelvisY + 4, aT * 0.5, 22, 18);   // 胯
    brush(ctx, waistX, waistY + 4, aT, 31, 15);         // 腰
    brush(ctx, chestX, chestY + 6, aT, 25, 16.5);       // 胸
    ctx.strokeStyle = SASH; ctx.lineWidth = 4.5;        // 红腰带
    ctx.beginPath(); ctx.moveTo(rootX - 12, pelvisY + 1); ctx.lineTo(rootX + 12, pelvisY - 2); ctx.stroke();
    dot(ctx, headX, headY - 10, 10);                   // 头
    dot(ctx, headX - 1, headY - 21, 3);                // 发髻(小, 免误判二头)
    ctx.strokeStyle = PAPER; ctx.lineWidth = 2.2;      // 飘带随扭转摆动
    ctx.beginPath(); ctx.moveTo(headX - 6, headY - 20);
    ctx.quadraticCurveTo(headX - 16 - tw * 0.4, headY - 14, headX - 24 - tw * 0.9, headY + 2 + tw * 0.25);
    ctx.stroke();
    leg(hipR, 3 + (J.hipR || 0), J.knR || 4);
    arm(shR, (J.aR || 0) + tw * 0.5, J.aRE || 0, 10.5);
    ctx.restore();
  }

  // ---- 姿态时间轴(攻): FT 锚点。KINDS[kind] = {windup, strike, hold?, pulses?} 关节姿态 ----
  // 手部高度几何: 肩在-154; 手=肩-36cos(a1)-33cos(a1+a2)。手要高举须近水平——
  // 武侠抱架=前手水平前伸护面(aL≈70), 后手沉肋(aR≈-40)。这是格斗抱架不是投降。
  const GUARD = { aN: 0, aL: 68, aR: -42, aLE: 34, aRE: -48, aT: 0, tw: 0, hipL: -3, hipR: 3, knL: 5, knR: 5, rootX: 0, rootY: 0 };
  const KINDS = {
    dragon: { // 降龙双掌: 拉臂扭身→双掌水平击出
      windup: { aN: 8, aL: 82, aR: -74, aLE: 22, aRE: -52, aT: 8, tw: 16, hipL: -10, hipR: 10, knL: 18, knR: 16, rootX: 0, rootY: 14 },
      strike: { aN: -4, aL: 58, aR: 94, aLE: 10, aRE: -4, aT: 5, tw: -16, hipL: 8, hipR: -13, knL: 5, knR: 24, rootX: 22, rootY: -4 } },
    dash: { // 快拳连打: 拳端连珠三拳(交替)
      windup: { aN: 4, aL: 20, aR: -30, aLE: 20, aRE: -80, aT: 6, tw: 12, hipL: -8, hipR: 8, knL: 14, knR: 12, rootX: 0, rootY: 10 },
      strike: { aN: -2, aL: 30, aR: 98, aLE: 6, aRE: -2, aT: 4, tw: -12, hipL: 6, hipR: -10, knL: 6, knR: 18, rootX: 16, rootY: -2 },
      pulses: { arms: ['aR', 'aL', 'aR'], dt: [0, 110, 220], extend: 96, rest: 30 } },
    sweep: { // 横扫: 单臂平挥扫月牙(扭腰带臂)
      windup: { aN: 6, aL: 14, aR: -60, aLE: 16, aRE: -40, aT: 4, tw: 24, hipL: -9, hipR: 9, knL: 13, knR: 13, rootX: 0, rootY: 9 },
      strike: { aN: -4, aL: 10, aR: 92, aLE: 4, aRE: -2, aT: 3, tw: -22, hipL: 7, hipR: -11, knL: 6, knR: 17, rootX: 18, rootY: -2 } },
    wave: { // 气浪: 双掌前上推涛
      windup: { aN: 6, aL: 30, aR: -30, aLE: 40, aRE: -40, aT: 5, tw: 14, hipL: -9, hipR: 9, knL: 15, knR: 15, rootX: 0, rootY: 11 },
      strike: { aN: -3, aL: 74, aR: 88, aLE: 10, aRE: 6, aT: 3, tw: -14, hipL: 7, hipR: -10, knL: 6, knR: 16, rootX: 14, rootY: -2 } },
    beam: { // 六脉弹指: 指端凝气→右手食指水平点射(身法几乎不动=狙击感)
      windup: { aN: 4, aL: 16, aR: 60, aLE: 20, aRE: -30, aT: 2, tw: 8, hipL: -4, hipR: 4, knL: 7, knR: 7, rootX: 0, rootY: 4 },
      strike: { aN: -2, aL: 14, aR: 99, aLE: 2, aRE: 0, aT: 1, tw: -4, hipL: 3, hipR: -4, knL: 4, knR: 8, rootX: 8, rootY: 0 } },
    bullet: { // 火枪: 端臂瞄准→击发微后座
      windup: { aN: 3, aL: 18, aR: 86, aLE: 14, aRE: -12, aT: 1, tw: 6, hipL: -4, hipR: 4, knL: 6, knR: 6, rootX: 0, rootY: 3 },
      strike: { aN: 2, aL: 20, aR: 84, aLE: 12, aRE: -10, aT: -3, tw: 5, hipL: -3, hipR: 4, knL: 6, knR: 6, rootX: -5, rootY: 2 } },
    stab: { // 突刺: 大弓步单臂直送
      windup: { aN: 6, aL: 24, aR: -46, aLE: 22, aRE: -88, aT: 7, tw: 16, hipL: -11, hipR: 11, knL: 18, knR: 18, rootX: 0, rootY: 13 },
      strike: { aN: -4, aL: 18, aR: 101, aLE: 3, aRE: 0, aT: 7, tw: -14, hipL: 12, hipR: -18, knL: 4, knR: 30, rootX: 30, rootY: -6 } },
    smash: { // 下砸: 双臂高举过顶→抡落(深蹲)
      windup: { aN: -6, aL: -150, aR: -155, aLE: -30, aRE: -30, aT: -8, tw: 6, hipL: -8, hipR: 8, knL: 12, knR: 12, rootX: 0, rootY: 6 },
      strike: { aN: 6, aL: 52, aR: 58, aLE: 8, aRE: 6, aT: 14, tw: -8, hipL: 10, hipR: -6, knL: 26, knR: 10, rootX: 12, rootY: 20 } },
    slashx: { // 双斩: 交叉双快斩(一正一反两个 snap)
      windup: { aN: 4, aL: 30, aR: -50, aLE: 20, aRE: -60, aT: 5, tw: 15, hipL: -9, hipR: 9, knL: 14, knR: 14, rootX: 0, rootY: 10 },
      strike: { aN: -3, aL: 55, aR: 90, aLE: 6, aRE: -4, aT: 4, tw: -18, hipL: 7, hipR: -11, knL: 6, knR: 18, rootX: 18, rootY: -2 },
      pulses: { arms: ['aR', 'aL'], dt: [0, 210], extend: 92, rest: 40, tw: [-18, 16] } },
  };
  function lerp(a, b, t) { const o = {}; for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t; return o; }
  const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // 攻方姿态: p=演出内时间(ms, 已被 main.js 冻结逻辑处理过或自行冻结), tStrike/tImpact 锚
  function attJoints(kind, p, tStrike) {
    const K = KINDS[kind] || KINDS.dash;
    const breathe = Math.sin(p / 300) * 1.5;
    let J;
    if (p < 380) { // 登场: Guard→立正微沉
      J = lerp({ ...GUARD, aL: 4, aR: -4, knL: 2, knR: 2 }, GUARD, easeIO(Math.min(1, p / 380)));
    } else if (p < tStrike - 110) { // 镜1 蓄力定格(缓推到底)
      const u = easeIO((p - 380) / Math.max(1, tStrike - 490));
      J = lerp(GUARD, K.windup, u);
    } else if (p < tStrike + 140) { // 镜2 出招爆发(快)
      const u = Math.min(1, (p - (tStrike - 110)) / 130);
      J = lerp(K.windup, K.strike, u * u);
      // 连打类: 脉冲交替手臂
      if (K.pulses) {
        for (let i = 0; i < K.pulses.dt.length; i++) {
          const t0 = tStrike + K.pulses.dt[i];
          if (p >= t0 && p < t0 + 150) {
            const armKey = K.pulses.arms[i];
            J[armKey] = K.pulses.extend;
            J[armKey === 'aR' ? 'aRE' : 'aLE'] = -2;
            if (K.pulses.tw) J.tw = K.pulses.tw[i];
          }
        }
      }
    } else if (p < tStrike + 520) { // 收势回架
      const u = easeIO((p - tStrike - 140) / 380);
      J = lerp(K.strike, GUARD, u);
    } else {
      J = { ...GUARD };
    }
    J.aN = (J.aN || 0) + breathe;
    J.rootX = (J.rootX || 0); J.rootY = (J.rootY || 0);
    return J;
  }
  // 守方姿态: idle→受击快起-峰值-颤落 / 侧闪 / 击破定格(p 已被冻结在 killAt)
  function defJoints(p, tImpact, isMiss) {
    const breathe = Math.sin(p / 300) * 1.5;
    let J = { ...GUARD };
    if (isMiss) { // 侧闪: 快闪-定-回
      const d = Math.min(1, Math.max(0, (p - tImpact + 90) / 150));
      const back = easeIO(d) * (1 - easeIO(Math.min(1, Math.max(0, (p - tImpact - 260) / 240))));
      J.aT = -16 * back; J.tw = -10 * back; J.rootX = -14 * back; J.rootY = 6 * back;
      J.aL = 20 + 30 * back; J.aR = -20; J.aLE = 20; J.aRE = -40;
    } else if (p >= tImpact) {
      const hitP = Math.min(1, (p - tImpact) / 430);
      const rise = Math.min(1, hitP / 0.15);
      const fall = Math.max(0, (hitP - 0.55) / 0.45);
      const tremble = hitP > 0.55 && hitP < 1 ? Math.sin((hitP - 0.55) * Math.PI * 4) * (1 - hitP) : 0;
      const k = 1 - rise * 0 + (1 - fall); // 快起
      J.aT = -20 * rise * (1 - fall) + tremble * 2;
      J.tw = -12 * rise * (1 - fall);
      J.rootX = -22 * rise * (1 - fall);
      J.rootY = 8 * rise * (1 - fall);
      J.aL = 12 + 55 * rise * (1 - fall) + tremble * 3;
      J.aR = -20 - 40 * rise * (1 - fall);
      J.aLE = 14; J.aRE = -30;
      J.hipL = -6 * rise * (1 - fall); J.hipR = 8 * rise * (1 - fall);
      J.knL = 5 + 8 * rise * (1 - fall); J.knR = 5 + 12 * rise * (1 - fall);
    } else { // 登场前待机
      const enter = Math.min(1, Math.max(0, (p - (tImpact - 90)) / 120));
      J = lerp({ ...GUARD, aL: 4, aR: -4 }, GUARD, easeIO(enter));
    }
    J.aN = (J.aN || 0) + breathe;
    return J;
  }

  // ---- drawCombatant 渲染器签名(与 pose_bridge 的 POSE_RENDERERS 一致) ----
  function drawCombatant(ctx2, o) {
    if (typeof FIGHT === 'undefined' || !FIGHT.active || !FIGHT.ev) return;
    const p = (o.p === undefined) ? (performance.now() - FIGHT.t0) : o.p;
    // 击破定格冻结(与 main.js/pose_bridge 同款)
    const ev = FIGHT.ev;
    const pf = (ev.killed && FIGHT.killAt && p >= FIGHT.killAt && p < FIGHT.killAt + 500) ? FIGHT.killAt : p;
    const critOff = FIGHT.crit ? 120 : 0;
    const tS = FT.strike + critOff, tI = FT.impact + critOff;
    let J;
    if (o.slot === 'att') {
      J = attJoints(FIGHT.animKind || 'dash', pf, tS);
    } else {
      J = defJoints(pf, tI, !!FIGHT.isMiss);
    }
    const halfW = o.h / 3; // 与 drawPuppet 左缘锚点对齐: 脚底中心 = x + 宽/2(皮影标准站姿宽约 h/1.5)
    draw(ctx2, { x: o.x + halfW, feetY: o.y + o.h, h: o.h, mirror: o.mirror, alpha: o.alpha, J: J });
  }

  const api = { draw: draw, attJoints: attJoints, defJoints: defJoints, drawCombatant: drawCombatant, KINDS: KINDS, GUARD: GUARD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.InkPuppet = api;
})();
