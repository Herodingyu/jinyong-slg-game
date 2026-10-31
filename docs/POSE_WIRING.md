# POSE_WIRING — 姿势帧播放器接线文档（给主合并者）

> B 方案（丁工拍板）：战斗演出从"程序伪骨骼 puppet"升级为"AI 多姿势立绘切帧动画"
> （对标 PSP 机战）。本文档说明如何把 `app/js/poseanim.js`（PoseSet + PosePlayer）
> 接入 `app/js/main.js` 的 `drawFightScene`。
>
> **行号基准：feat/pose-anim @ bb6647e 的 main.js。main.js 今晚仍在变动，
> 合并时请以当时 main.js 为准重新定位**（各调用点都给了函数名+代码特征串，全文检索可重定位）。
>
> 交付物清单：
> - `app/js/poseanim.js` — 播放器本体（纯表现零依赖，不 import 任何全局，参数全注入）
> - `app/assets/portraits/poses_placeholder/xiaofeng_{idle,ready,strike,hit}.png` — 占位灰模（Agent 1 的 AI 图到位后放 `assets/portraits/poses/` 同名文件即自动优先）
> - `app/tools/pose_demo.html` + `app/tools/capture_pose.js` — 独立 demo + 12 帧截帧验收（端口 8156）
> - `evidence/pose_player/f01~f12*.jpg` — 12 帧目验证据

---

## 0. 铁律提醒

- **不改 engine.js / data.js**；main.js 的改动只加"姿势帧分支"，**现有 drawPuppet 回退路径必须原样保留**。
- 姿势图缺失任何一张都不得黑屏/抛错：PoseSet 三级回退（AI 图 → 占位灰模 → null），
  调用方再对 null 回退 puppet。回退是硬要求，不是可选优化。

## 1. 引入脚本

`app/index.html` 第 47–49 行现状：

```html
<script src="js/data.js"></script>
<script src="js/engine.js"></script>
<script src="js/main.js"></script>
```

在 `main.js` 之前插一行：

```html
<script src="js/poseanim.js"></script>
```

浏览器侧挂全局 `PoseSet` / `PosePlayer`（UMD，Node 亦可 require 跑单测）。

## 2. 预载姿势集（FIGHT 入位时）

main.js 第 13–17 行有 portraits 预载段；在其后加姿势集缓存：

```js
// B方案: 姿势帧集缓存（按角色 sprite 名各一套；缺失自动回退占位灰模/ null）
const poseSets = {};
function getPoseSet(name) {
  if (!poseSets[name]) poseSets[name] = PoseSet.load(name); // base 缺省 'assets'，与 index.html 同根
  return poseSets[name];
}
```

`animateEvent` 的 FIGHT 入位段（函数 `startFight`，特征串 `FIGHT.attImg = FIGHT.attIsPortrait ? ap : sprites[...]`，
当前在第 699–703 行附近）末尾追加预载——不 await，演出有 ~380ms 入镜时间兜底，
`PosePlayer` 帧的 `img` 为 null 时该帧自动走 puppet 回退：

```js
// B方案: 姿势帧预载（异步，不阻塞演出开始；usable() =false 则全程回退 puppet）
FIGHT.attPoseSet = getPoseSet(ev.att.sprite);
FIGHT.defPoseSet = getPoseSet(ev.def.sprite);
```

## 3. 攻方帧表（id→ready→strike，相对 FIGHT.t0 的毫秒 p）

FT 常量（main.js 第 118–119 行）：

```js
const FT = { enter: 380, cut1: 1560, strike: 2320, cut2: 2580, impact: 2760, out: 3640, cutMs: 170 };
const FT_READY = FT.cut1 - 320;   // = 1240，起手定格起点（定格 ≥250ms 是机战关键 pose 硬指标）
```

三镜时间轴与姿势帧对照（crit 时 tStrike/tImpact 各 +120，帧表用 `FT.strike + (crit?120:0)` 同款动态值）：

| 镜 | 时间窗口 (p, ms) | 攻方姿势帧 | 说明 |
|---|---|---|---|
| 入镜 | 0 ~ FT.enter (380) | **idle** | 与入位滑入同步 |
| 镜1 起手特写 | FT.enter ~ FT.cut1 (1560) | idle → **ready** | 蓄力期 crossfade 到 ready，**FT_READY (1240) 前蓄满** |
| 镜1 定格 | FT_READY ~ FT.cut1 | **ready** 定住 | 320ms 关键 pose 定格，一个字：停得住 |
| 镜2 攻击全景 | cut1+cutMs (1730) ~ cut2 (2580) | ready → **strike** | FT.strike (2320) 前后切 strike（crossfade 125ms 提前在 2195 起） |
| 镜3 命中特写 | cut2+cutMs (2750) ~ out (3640) | strike 定格 → 收势回 idle | 命中锚 FT.impact (2760)；收势淡出处可叠 fade |
| 击破 | killAt ~ killAt+500 | strike 定格 | 冻结窗口：update 传入冻结后的 now（见 §5） |

帧表骨架（在 drawFightScene 内或 startFight 内构建，crit 用 tStrike 动态值）：

```js
const tS = FT.strike + (crit ? 120 : 0);
const attFrames = [
  { img: ps.poses.idle && ps.poses.idle.ok ? ps.poses.idle.img : null, tStart: 0,         tEnd: FT.enter },
  { img: RDY,  tStart: FT.enter,  tEnd: FT_READY,   ox: 0,  oy: 4,  rot: 2,  scaleY: 0.96 }, // 沉身蓄力
  { img: STK,  tStart: FT_READY,  tEnd: tS - 130,   ox: 6,  oy: 4,  rot: 2,  scaleY: 0.96 }, // 定格
  { img: STK,  tStart: tS - 130,  tEnd: tS + 420,   ox: 40, oy: 0,  rot: 6,  scaleY: 1.04 }, // 出招前送(squash-stretch)
  { img: STK,  tStart: tS + 420,  tEnd: FT.out,     ox: 10, oy: 2,  rot: 2,  scaleY: 0.98 }, // 收势
];
// ps = FIGHT.attPoseSet；RDY/STK = ready/strike 的 img（缺失给 null，该帧自动回退 puppet）
const attPlayer = new PosePlayer(attFrames, { crossfade: 125 }); // 100~150 之间按招式手感调
```

（idle 起步帧可照演示页拆两段加呼吸 oy 微动；squash-stretch 的 scaleY 建议约束在 0.94~1.06。）

## 4. 守方帧表（登场→hit→退场）

守方在 `defEnterP`（tImpact-90 起）才登场，受击由现有 `hitP/recoil/defShakeX/fightDefPose` 表达
——姿势帧只替换"身体图"，**现有后仰/颤动/滑动位移全部保留叠加**：

| 窗口 (p, ms) | 守方姿势帧 |
|---|---|
| tImpact-90 ~ tImpact+430 | **hit**（峰值定格窗口与 hitP 同步；freezeHit 时锁峰值帧） |
| tImpact+430 ~ tImpact+960 | hit 渐回 idle（crossfade），与 defExit 退场同步 |

```js
const tI = FT.impact + (crit ? 120 : 0);
const defFrames = [
  { img: HIT, tStart: tI - 90, tEnd: tI + 430, rot: -8, scaleY: 0.94 }, // 受击后仰（与 hitP 峰值重叠）
  { img: IDL2, tStart: tI + 430, tEnd: tI + 960, rot: 0, scaleY: 1.0 }, // 回落（未击破才有意义）
];
const defPlayer = new PosePlayer(defFrames, { crossfade: 125 });
```

落空（isMiss）：守方不播 hit，沿用现有侧闪 puppet 逻辑即可（姿势帧分支跳过）。

## 5. 替换调用点（drawFightScene 内，当前 @bb6647e 行号，合并时按特征串重定位）

绘制入口：`drawFightScene(nowReal)`（第 1447 行；由 `draw` 第 1101 行 `if (FIGHT.active) { drawFightScene(now); ... }` 调入）。

**注意时间冻结**：击破定格窗口 `now` 已被冻结（第 1456–1457 行 `now = FIGHT.t0 + killAt`），
PosePlayer.update 必须传这个 `now - FIGHT.t0`，定格自然生效，无需特判。

### 攻方

| 调用点 | 行号 | 特征串 | 接法 |
|---|---|---|---|
| 主攻立绘 | **1582** | `drawPuppet(FIGHT.attImg, attX + attDX + attLunge, attY, attH, false, outA, attPose);` | 见下方骨架 |
| 搭档（合体技） | 1580 | `drawPuppet(FIGHT.partnerImg, partnerX + relayLunge, ...)` | 同主攻，帧表复用 fightPartnerPose 的时间偏移即可，缺图回退 puppet |
| 攻方残影 | 1587/1589 | `drawPuppet(FIGHT.attImg, ... - 46 * gp, ...)` | **保留 drawPuppet 不动**（残影要的是速度感，切帧反闪） |

主攻替换骨架（包在 1582 行处）：

```js
const aps = FIGHT.attPoseSet;
if (aps && aps.usable() && attPlayer) {
  const inst = attPlayer.update(now - FIGHT.t0);   // 冻结 now 已处理击破定格
  if (inst.img) {
    ctx.globalAlpha *= outA;                        // inst.alpha 是帧表 fade，外层 outA 照旧
    attPlayer.paint(ctx, inst, attX + attDX + attLunge, attY, attH, false);
    ctx.globalAlpha /= outA || 1;
  } else {
    drawPuppet(FIGHT.attImg, attX + attDX + attLunge, attY, attH, false, outA, attPose); // 该帧缺图回退
  }
} else {
  drawPuppet(FIGHT.attImg, attX + attDX + attLunge, attY, attH, false, outA, attPose);     // 全套回退（原行一字不动）
}
```

`paint` 锚定语义与 drawPuppet 一致（x,y=脚底左上基准、脚底中心变换），所以站位/阴影/相机代码零改动。

### 守方

| 调用点 | 行号 | 特征串 | 接法 |
|---|---|---|---|
| 守方主绘 | **1543** | `drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, outA * defAlpha, defPose);` | 见骨架 |
| 落空残影 ×2 | 1540/1541 | `drawPuppet(FIGHT.defImg, defX + defShakeX * 0.4/0.7, ...)` | 保留不动（落空不走 hit 帧） |
| crit 双影 | 1546 | `drawPuppet(FIGHT.defImg, ... - 16 * recoil, ...)` | 保留不动 |
| 受击白闪 | 1553/1558 | `ctx.filter = 'brightness(0) invert(1)'; drawPuppet(...)` | 保留不动（白闪剪影仍用 puppet 图即可） |

守方替换骨架（包在 1543 行处）：

```js
const dps = FIGHT.defPoseSet;
if (dps && dps.usable() && defPlayer && !FIGHT.isMiss) {
  const inst = defPlayer.update(now - FIGHT.t0);
  // 现有 defShakeX（受击震退）/defSink（击破下沉）照旧叠加在 x/y 上
  if (inst.img) {
    ctx.globalAlpha *= outA * defAlpha;
    defPlayer.paint(ctx, inst, defX + defShakeX, defY + defSink, defH, true);
    ctx.globalAlpha /= (outA * defAlpha) || 1;
  } else {
    drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, outA * defAlpha, defPose);
  }
} else {
  drawPuppet(FIGHT.defImg, defX + defShakeX, defY, defH, true, outA * defAlpha, defPose);   // 原行一字不动
}
```

> attPlayer/defPlayer 的构建放 startFight（§2 处）里做，存进 FIGHT.attPlayer/defPlayer；
> drawFightScene 每帧只 update+paint。注意帧表 img 快照的是加载完成时的图——预载未完成时
> `poses.*.ok=false`，帧 img=null，自然落回 puppet，加载完成后下一场演出生效，无需刷新。

## 6. 像素小人（无立绘角色）

`FIGHT.attIsPortrait=false` 的单位（64px sprite 放大）**不要接姿势帧**（源图就一张，
切不出姿势），保持现有 whole 整图变换分支。即：姿势帧分支仅包在 `FIGHT.attIsPortrait` 为真时。

## 7. 验收清单（接完后必做）

1. `node --check js/poseanim.js && node --check js/main.js` 全过。
2. `node tools/capture_pose.js`（app/ 下，端口 8156）— 播放器本体 12 帧目验（已随本交付物完成：f01~f12 姿势逐张可辨）。
3. 接完线后跑 `node tools/capture_fight.js after hit crit miss kill`（8124 端口那条流程），
   把改前（fday14_before_fight）/改后同时间戳截帧逐张对比——目验不过不准记完成（DAILY_IMPROVE_TASK 交付标准）。
4. 断图演练：临时把 `assets/portraits/poses*/xiaofeng_hit.png` 挪走一场演出，
   确认守方自动回退 puppet 不黑屏——**回退路径必须实测，不是目测代码**。
5. AI 图到位（Agent 1 产出 `assets/portraits/poses/`）后零代码自动升级，重跑第 3 条对比。
