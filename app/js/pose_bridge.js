// ============ B方案接线桥: poseanim.js ←→ main.js drawCombatant 钩子 ============
// 按 docs/POSE_WIRING.md §3-5 落地，适配 P1-14 钩子形态（绘制点已包装为 drawCombatant，
// 不再是旧文档假设的裸 drawPuppet 调用点）。main.js 侧最小侵入仅 3 行：
//   1. drawCombatant 形参追加可选 p（演出内时间），透传进 opts
//   2. 两个调用点（攻/守）末尾多传一个 p
//   index.html 在本文件之前加载 poseanim.js（播放器本体）与 main.js（FT/FIGHT/drawPuppet）。
// 帧表构建/缓存/三级回退全部在本文件：
//   - 姿势集未 settle / 非立绘角色 / 守方落空 → 逐字节回退 drawPuppet（零行为变化）
//   - 单姿势缺图 → 该帧回退用 idle 图（避免 puppet/姿势帧混画闪变；idle 缺则整套不接）
//   - 击破定格 → update 时间轴走 frozenP（与 main.js 同款 killAt 冻结窗口），峰值停得住
// 加载顺序：data.js → engine.js → main.js → poseanim.js → pose_bridge.js（index.html 50-51 行）。
(function () {
  'use strict';
  if (typeof window === 'undefined') return; // node 测试台无 window，静默跳过（test_fx_b1 不加载本文件）

  const CROSSFADE = 125;     // 简报要求 100~150（POSE_WIRING.md §3）
  const POSE_PH = 470;       // 与 main.js drawFightScene 的 PH 对齐（立绘守方 defH == PH）
  const HORIZON = 60000;     // 末帧延伸 horizon：收势淡出/击破定格都停在最后姿势
  // 已知有立绘的角色：页面加载即预载姿势图（PoseSet.load 内部三级回退 AI图→占位灰模→null）
  const KNOWN_PORTRAITS = ['xiaofeng', 'guojing', 'duanyu', 'xiaobao', 'duanyq'];

  const sets = Object.create(null); // sprite → PoseSet（每场战斗复用，不重复加载）
  let cur = null;                   // { sig, att, def } 当前场次的 PosePlayer

  function setFor(name) {
    if (!sets[name]) sets[name] = (typeof PoseSet !== 'undefined') ? PoseSet.load(name) : null;
    return sets[name];
  }
  function poseImg(ps, pose) {
    const s = ps && ps.poses && ps.poses[pose];
    // 占位灰模(poses_placeholder)只供 pose_demo/QA 目验，不进正式战斗——
    // 玩家验收铁律：灰模木偶比真立绘木偶更出戏，宁可回退立绘 puppet 演出
    return (s && s.ok && s.img && s.from && s.from.indexOf('poses_placeholder') < 0) ? s.img : null;
  }
  KNOWN_PORTRAITS.forEach(setFor); // 预载（不 await；settle 前渲染走 puppet 回退，settle 后自动接上）

  // 击破定格：与 main.js drawFightScene 同款冻结窗口（定格期内姿势时间轴钉在 killAt）
  function frozenP(p) {
    const ev = FIGHT.ev;
    if (ev && ev.killed && FIGHT.killAt && p >= FIGHT.killAt && p < FIGHT.killAt + 500) return FIGHT.killAt;
    return p;
  }

  // ---- 帧表构建：战斗签名（t0+crit+双方sprite+落空+立绘标志）变化时惰性重建 ----
  // 图未 settle 时不建玩家（返回 null → puppet 回退），settle 后下一帧自动建成接上。
  function ensure() {
    if (typeof FIGHT === 'undefined' || !FIGHT.active || !FIGHT.ev || typeof FT === 'undefined') return null;
    const ev = FIGHT.ev;
    const critOff = FIGHT.crit ? 120 : 0;
    const sig = [FIGHT.t0, critOff, ev.att.sprite, ev.def.sprite,
                 FIGHT.isMiss ? 1 : 0, FIGHT.attIsPortrait ? 1 : 0, FIGHT.defIsPortrait ? 1 : 0].join('|');
    if (cur && cur.sig === sig) return cur;
    const tS = FT.strike + critOff;
    const tI = FT.impact + critOff;

    // 攻方：idle 图一表到底（起手~出招），strike 图从命中起接管（POSE_WIRING.md §4 att）
    let att = null;
    if (FIGHT.attIsPortrait) {
      const ps = setFor(ev.att.sprite);
      const id = ps ? (poseImg(ps, 'idle') || poseImg(ps, 'ready')) : null;
      if (id) {
        const im = poseImg(ps, 'strike') || poseImg(ps, 'hit') || id;
        att = new PosePlayer([
          { img: id, tStart: 0,        tEnd: FT.enter,  rot: -4, scale: 0.98 },
          { img: id, tStart: FT.enter, tEnd: FT_READY,  rot: 2,  scaleY: 0.96 },
          { img: id, tStart: FT_READY, tEnd: tS - 110,  rot: 2,  scaleY: 0.96 },
          { img: id, tStart: tS - 110, tEnd: tS + 20,   rot: 6,  scaleY: 1.04 },
          { img: id, tStart: tS + 20,  tEnd: tI,        rot: 6,  scaleY: 1.04 },
          { img: im, tStart: tI,       tEnd: tI + 230,  rot: 2,  scaleY: 0.99 },
          { img: im, tStart: tI + 230, tEnd: HORIZON },
        ], { crossfade: CROSSFADE });
      }
    }

    // 守方：非立绘/落空不接姿势帧（侧闪/残影等 puppet 表达原样保留）；
    // 受击下沉由帧表 oy 表达（+0.10h→+0.32h→回 0，三段线性即"下沉-顿-沉到底"），defSink 仍由 main.js 叠加
    let def = null;
    if (FIGHT.defIsPortrait && !FIGHT.isMiss) {
      const ps = setFor(ev.def.sprite);
      const id = ps ? poseImg(ps, 'idle') : null;
      if (id) {
        const ih = poseImg(ps, 'hit') || poseImg(ps, 'strike') || id;
        def = new PosePlayer([
          { img: id, tStart: 0,        tEnd: tI - 60 },
          { img: id, tStart: tI - 60,  tEnd: tI,       oy: 8 },
          { img: ih, tStart: tI,       tEnd: tI + 120,  rot: 5, scaleY: 0.96, oy: 0.10 * POSE_PH },
          { img: ih, tStart: tI + 120, tEnd: tI + 280,  rot: 5, scaleY: 0.96, oy: 0.32 * POSE_PH },
          { img: ih, tStart: tI + 280, tEnd: tI + 430,  rot: 5, scaleY: 0.96, oy: 0 },
          { img: id, tStart: tI + 430, tEnd: HORIZON },
        ], { crossfade: CROSSFADE });
      }
    }
    cur = { sig: sig, att: att, def: def };
    return cur;
  }

  // ---- 渲染器：注册进 window.POSE_RENDERERS，drawCombatant 检测到对应 slot 就改调本函数 ----
  // opts 语义与 drawPuppet 对齐：img/x/y/h/mirror/alpha/pose 原样透传（p 由 main.js 钩子补传）。
  function render(slot) {
    return function (ctx, o) {
      const puppet = function () { drawPuppet(o.img, o.x, o.y, o.h, o.mirror, o.alpha, o.pose); };
      const c = ensure();
      if (!c) { puppet(); return; }
      const pl = c[slot];
      if (!pl) { puppet(); return; }
      const p = (o.p === undefined) ? (performance.now() - FIGHT.t0) : o.p;
      const inst = pl.update(frozenP(p));
      if (!inst || !inst.img) { puppet(); return; }
      ctx.save();
      ctx.globalAlpha = (o.alpha === undefined ? 1 : o.alpha); // paint 内部再乘帧 fade 与 crossfade
      pl.paint(ctx, inst, o.x, o.y, o.h, o.mirror);
      ctx.restore();
    };
  }

  window.POSE_RENDERERS = { att: render('att'), def: render('def') };
  // 开发/测试自省句柄：test_pose_bridge F 例程用它模拟"姿势图仅有占位灰模"场景
  window.POSE_BRIDGE = { sets: sets };
})();
