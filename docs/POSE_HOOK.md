# POSE_HOOK · 姿势帧渲染挂接说明（poseanim.js 接线指南）

> P1-14 B 方案挂架线。main.js 已在三镜演出（`drawFightScene`）的攻方/守方主绘制点挂上可插拔渲染器。
> **不注册时渲染路径与旧实现逐字节一致**（已验证：test_fx_b1 17/17 + before/after 6 帧对照无系统性差异）。

## 1. 注册方式

```js
// poseanim.js 载入后在 window 上注册（两个 slot 独立，可只注册一个）：
window.POSE_RENDERERS = {
  att: (ctx, opts) => { /* 攻方渲染 */ },
  def: (ctx, opts) => { /* 守方渲染 */ },
};
```

## 2. 渲染器签名

```js
function renderer(ctx, { img, x, y, h, mirror, alpha, pose, phase }) { ... }
```

| 字段 | 含义 |
|------|------|
| `ctx` | 战场 canvas 2D 上下文（三镜相机变换已应用，直接按 x/y/h 画即可） |
| `img` | 立绘 Image（portraits）或放大 sprite（无立绘角色）；只读 |
| `x, y` | 绘制左上角锚点（立绘）；脚底阴影/相机已按此计算，**不要自行改站位** |
| `h` | 目标高度（宽 = h × img 宽高比） |
| `mirror` | 是否水平翻转（守方为 true） |
| `alpha` | 透明度（含登场/退场/收势淡出，直接乘上） |
| `pose` | puppet 姿态对象 `{lean, squash, headLean, headDX, headDY, legDX, legDY, legLean, whole}`——**现成的时间轴姿态**，可直接消费也可忽略自算 |
| `phase` | 三镜阶段名，见下 |

## 3. phase 时间轴映射

攻方（`att`）：

| phase | 时间轴（p = 演出内相对 ms，FT 常量） | 三镜 |
|-------|--------------------------------------|------|
| `'windup'` | p < tStrike | 镜1 起手（enter/windup 同归此段，起手定格在 FT_READY→FT.cut1） |
| `'strike'` | tStrike ≤ p < tImpact | 镜2 攻击 |
| `'impact'` | tImpact ≤ p < FT.out | 镜3 命中后收势 |
| `'out'` | p ≥ FT.out | 退场淡出 |

守方（`def`）：登场起恒为 `'impact'`（受击/退场都在镜3，命中锚点 = tImpact）。

FT 常量（main.js）：`{ enter:380, cut1:1560, strike:2320, cut2:2580, impact:2760, out:3640, cutMs:170 }`；
会心时 tStrike/tImpact +120ms。想按 phase 内细分进度，可用这些常量自行归一（钩子不挡路）。

## 4. 接线后想替换 drawPuppet？

自定义渲染器接管后，`pose` 字段仍传给你作参考；若完全自算，`img/mirror/alpha` 建议照用（站位与淡入出是相机/流程逻辑的一部分）。
参考实现（委托回默认渲染）见 `evidence/fday14_accept/` 探针做法，或直接把默认实现复制起步：

```js
window.POSE_RENDERERS = { att: (c, o) => drawPuppet(o.img, o.x, o.y, o.h, o.mirror, o.alpha, o.pose) };
```

## 5. 注意

- 只挂了**主绘制点**：攻方主立绘 ×1、守方主立绘 ×1。残影/双影/白闪剪影/合体搭档仍走原 `drawPuppet`（速度感与打击感不在姿势帧范围内）。
- 取消注册：`delete window.POSE_RENDERERS.att`（或整体置 `window.POSE_RENDERERS = undefined`）即恢复默认渲染，无需刷新。
- 钩子零行为变化由 `node tools/test_fx_b1.js`（17/17）与 `hook_before_*/hook_after_*` 同时间戳对照帧兜底；改动演出逻辑时不要绕过 `drawCombatant`。
