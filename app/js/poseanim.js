// ============ B方案: AI 多姿势立绘切帧动画播放器（poseanim.js） ============
// 丁工拍板 B 方案（对标 PSP 机战切帧动画）：战斗演出从"程序伪骨骼 puppet"升级为
// "AI 多姿势立绘切帧"。本文件是播放器系统本身——纯表现层、零依赖、不 import 任何全局，
// 全部参数注入；只输出"当前该画的 img + 变换参数"，由调用方（main.js）负责 drawImage。
//
// 约定：
//   - 姿势图按角色名加载：assets/portraits/poses/<name>_{idle,ready,strike,hit}.png
//     缺失自动回退 assets/portraits/poses_placeholder/，再缺失该姿势记为 null（调用方回退旧 puppet）。
//   - 帧表：[{img, tStart, tEnd, ox, oy, rot, scale, scaleY, fade}]
//     img=该帧画哪张图; tStart/tEnd=相对演出开始的毫秒窗口; ox/oy=相对锚点位移(px);
//     rot=旋转(度, 正=向画面右倾); scale=整体缩放; scaleY=纵向单独缩放(缺省=scale,
//     squash-stretch 拉伸用, 建议 0.94~1.06); fade=该帧不透明度权重(缺省 1)。
//   - 帧间过渡：相邻帧 crossfade（默认 125ms，可调 100~150），过渡量对 ox/oy/rot/scale/
//     scaleY/fade 做 1 阶线性插值——姿势图只有 4 张，"动起来"全靠这个补间。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node 侧可跑单测
  else root.PoseSet = api.PoseSet, root.PosePlayer = api.PosePlayer;         // 浏览器挂全局
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POSES = ['idle', 'ready', 'strike', 'hit'];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ---------- PoseSet：按序加载一套四姿势图，三级回退 ----------
  // load(name, opts?) → poseSet：
  //   {
  //     name, total:4, settled:0,
  //     poses: { idle:{img,ok,from}, ... },   // ok=false 或整个姿势缺失=图没着落
  //     ready(): Promise<poseSet>,            // 全部落定后 resolve（无论成败）
  //     usable(): bool,                      // idle 可用即可启用姿势帧（最低门槛）
  //   }
  // opts.base = 资源根（默认 'assets'，main.js 同目录语义无差别）；
  // opts.loadImg = 注入的图片加载器（Node 测试用），缺省用浏览器 Image。
  function load(name, opts) {
    opts = opts || {};
    const base = (opts.base === undefined ? 'assets' : opts.base);
    const dirs = [base + '/portraits/poses/', base + '/portraits/poses_placeholder/']; // 先AI图后占位灰模
    const mkImg = opts.loadImg || function (src, onSettle) {
      const im = new Image();
      im.onload = () => onSettle(true);
      im.onerror = () => onSettle(false);
      im.src = src;
      return im;
    };
    const poseSet = { name: name, total: POSES.length, settled: 0, poses: {}, _wait: [] };
    // 全部落定才唤醒等待者（每次 settle 都检查，但只有齐了才 resolve）
    const notify = () => {
      if (poseSet.settled < poseSet.total) return;
      const w = poseSet._wait; poseSet._wait = [];
      w.forEach(r => r(poseSet));
    };
    for (const p of POSES) poseSet.poses[p] = null; // 先占位防串行时序问题
    for (const p of POSES) {
      let tried = 0, slot = { img: null, ok: false, from: null };
      poseSet.poses[p] = slot;
      const tryNext = () => {
        if (tried >= dirs.length) {                     // 两级目录都没有 → 该姿势 null
          poseSet.settled++;
          notify();
          return;
        }
        const src = dirs[tried] + name + '_' + p + '.png';
        tried++;
        slot.img = mkImg(src, ok => {
          if (ok) { slot.ok = true; slot.from = src; poseSet.settled++; notify(); }
          else tryNext();                                // 回退下一级目录
        });
      };
      tryNext();
    }
    poseSet.ready = () => poseSet.settled >= poseSet.total
      ? Promise.resolve(poseSet)
      : new Promise(res => poseSet._wait.push(res));    // 启用门槛：idle 必须有图（演出起手帧不能黑）；其余姿势缺了由调用方按帧回退
    poseSet.usable = () => !!(poseSet.poses.idle && poseSet.poses.idle.ok);
    return poseSet;
  }

  // ---------- PosePlayer：帧表驱动 + 相邻帧 crossfade + 一阶插值 ----------
  // new PosePlayer(frames, opts?) → player
  //   opts.crossfade = 帧间渐变毫秒（默认 125，简报要求 100~150）
  //   player.duration = 帧表总时长（= 最后一帧 tEnd，供调用方算收势）
  //   player.update(elapsedMs) → 绘制指令（纯数据，不碰 canvas）：
  //   {
  //     img, alpha,            // 主帧图与其不透明度
  //     prevImg, prevAlpha,    // crossfade 期间的上一帧（prevAlpha>0 才需叠画；否则忽略）
  //     ox, oy, rot, scaleX, scaleY,  // 两帧共用的一套插值后变换（1 阶程序插值）
  //     frameIdx,              // 当前落在第几帧（调试/接线期对表用）
  //     done,                  // elapsedMs 超过最后一帧 tEnd
  //   }
  function PosePlayer(frames, opts) {
    if (!frames || !frames.length) throw new Error('PosePlayer: 帧表不能为空');
    opts = opts || {};
    this.frames = frames;
    this.crossfade = opts.crossfade === undefined ? 125 : opts.crossfade;
    this.duration = frames[frames.length - 1].tEnd;
  }

  // 取帧的归一参数（缺省值补齐），插值单位统一在这里
  function norm(f) {
    const scale = f.scale === undefined ? 1 : f.scale;
    return {
      img: f.img,
      fade: f.fade === undefined ? 1 : f.fade,
      ox: f.ox || 0, oy: f.oy || 0,
      rot: f.rot || 0,
      scaleX: f.scaleX === undefined ? scale : f.scaleX,
      scaleY: f.scaleY === undefined ? scale : f.scaleY,
    };
  }

  PosePlayer.prototype.update = function (elapsedMs) {
    const t = Math.max(0, elapsedMs);
    const fr = this.frames;
    // 1) 定位当前帧：取 tStart<=t 的最后一张；未到首帧则钉住首帧
    let i = 0;
    while (i < fr.length - 1 && t >= fr[i + 1].tStart) i++;
    const A = norm(fr[i]);
    // 2) 相邻帧 crossfade：从"下一帧 tStart 前 crossfade 毫秒处"开始渐变到下一帧 tStart
    let B = null, a = 0;
    if (i < fr.length - 1) {
      const blendStart = fr[i + 1].tStart - this.crossfade;
      if (t >= blendStart) {
        a = clamp01((t - blendStart) / this.crossfade); // 0→1：A 渐出 B 渐入
        B = norm(fr[i + 1]);
      }
    }
    // 3) 1 阶程序插值：过渡窗口内对位移/旋转/缩放/透明度全部线性补间
    const L = (ka, kb) => (B ? lerp(ka, kb, a) : ka);
    const inst = {
      img: B ? B.img : A.img,
      alpha: L(A.fade, B ? B.fade : A.fade),
      prevImg: null,
      prevAlpha: 0,
      ox: L(A.ox, B ? B.ox : A.ox),
      oy: L(A.oy, B ? B.oy : A.oy),
      rot: L(A.rot, B ? B.rot : A.rot),
      scaleX: L(A.scaleX, B ? B.scaleX : A.scaleX),
      scaleY: L(A.scaleY, B ? B.scaleY : A.scaleY),
      frameIdx: i,
      done: t > this.duration,
    };
    if (B && a < 1) { inst.prevImg = A.img; inst.prevAlpha = (1 - a) * A.fade; }
    return inst;
  };

  // 便捷绘制（仍是纯表现封装：ctx 由调用方传入；不想用可只消费 update 的返回值自行画）
  // 语义与 drawPuppet 对齐：x,y=脚底锚点左上基准, h=目标高度, mirror=水平翻转。
  PosePlayer.prototype.paint = function (ctx2d, inst, x, y, h, mirror) {
    if (!inst || !inst.img) return 0;
    const im = inst.img;
    const w = h * im.width / im.height;
    const scX = (mirror ? -1 : 1) * inst.scaleX;
    ctx2d.save();
    ctx2d.globalAlpha *= Math.max(0, Math.min(1, inst.alpha));
    ctx2d.translate(x + w / 2 + inst.ox, y + h + inst.oy); // 脚底中心 + 帧位移
    ctx2d.rotate(inst.rot * Math.PI / 180);
    ctx2d.scale(scX, inst.scaleY);
    if (inst.prevImg && inst.prevAlpha > 0) {              // crossfade：先叠旧帧
      const pw = h * inst.prevImg.width / inst.prevImg.height;
      ctx2d.globalAlpha *= inst.prevAlpha;
      ctx2d.drawImage(inst.prevImg, -pw / 2, -h, pw, h);
      ctx2d.globalAlpha /= inst.prevAlpha || 1;
    }
    ctx2d.drawImage(im, -w / 2, -h, w, h);
    ctx2d.restore();
    return w;
  };

  return { POSES: POSES, PoseSet: { load: load, POSES: POSES }, PosePlayer: PosePlayer };
});
