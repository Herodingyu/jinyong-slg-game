// B方案姿势帧接线测试用例(由 test_pose_bridge.js eval 进同一作用域, 可访问全部顶层符号)
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};
const drew = (sub) => draws.some(a => a[0] && typeof a[0].src === 'string' && a[0].src.indexOf(sub) >= 0);
function mkEv(over) {
  return Object.assign({
    type: 'hit', isCrit: false, killed: false, dmg: 30,
    att: { sprite: 'xiaofeng', hp: 100, x: 2, y: 2, side: 'player' },
    def: { sprite: 'guojing', hp: 70, maxhp: 100, x: 3, y: 2, side: 'enemy' },
    w: { name: '降龙十八掌', anim: { kind: 'dragon', color: '#ffb84a' } },
  }, over || {});
}
function restart(ev) {
  endFight();
  startFight(ev);
  FIGHT.t0 = 0; // 确定性时间轴: p == drawFightScene 的入参
}
function frameAt(t) { draws.length = 0; drawFightScene(t); return draws; }

// 0) 钩子注册: pose_bridge 在 window.POSE_RENDERERS 挂了 att/def 两个渲染器
assert(typeof window.POSE_RENDERERS === 'object' &&
       typeof window.POSE_RENDERERS.att === 'function' &&
       typeof window.POSE_RENDERERS.def === 'function',
       'POSE_RENDERERS 注册 {att, def}');

// ---- A) 普通命中: 攻方 idle→strike 切换 + 守方登场受击 hit ----
restart(mkEv());
for (let t = 0; t <= 4200; t += 100) frameAt(t); // 全时间轴无异常
assert(true, 'A: 全时间轴 0~4200ms 逐帧无异常');

frameAt(500);  // 入镜后 ~120ms: 镜1 起手蓄力段
assert(drew('xiaofeng_idle.png'), 'A: 镜1 攻方画 idle 姿势图');
frameAt(2000); // FT_READY(1240) 后定格段仍 idle
assert(drew('xiaofeng_idle.png'), 'A: 起手定格段攻方仍 idle');
assert(!drew('xiaofeng_strike.png'), 'A: 出招前不 preemptively 画 strike');

frameAt(2800); // tI=2760 命中后 40ms: 攻方切 strike, 守方登场 hit
assert(drew('xiaofeng_strike.png'), 'A: 命中后攻方切 strike 姿势图');
assert(drew('guojing_hit.png'), 'A: 守方登场画 hit 姿势图');
frameAt(3900); // 收势段
assert(drew('xiaofeng_strike.png'), 'A: 收势停在 strike(horizon 帧)');

// ---- B) 会心: tStrike/tImpact +120ms, 帧表按新签名重建 ----
restart(mkEv({ isCrit: true }));
const tICrit = FT.impact + 120; // 2880
frameAt(tICrit - 200); // 2680: 守方登场淡入(tI-90)尚未开始，画面里还没有守方
assert(!drew('guojing_hit.png') && !drew('guojing_idle.png'),
       'B: 登场淡入前守方整体不在画面(P1-11 命中帧才登场)');
frameAt(tICrit - 60); // 2820: 登场淡入中，恰在 hit crossfade 起点(tI-125=2755)之后
// 125ms crossfade 语义: prevImg(idle, α≈0.48) 与 img(hit, α≈0.52) 叠画——姿势帧接手是渐混而非硬切
assert(drew('guojing_idle.png') && drew('guojing_hit.png'),
       'B: 登场瞬间 idle→hit crossfade 叠画(渐混接手, 无硬切)');
frameAt(tICrit + 120); // 3000: 命中后
assert(drew('guojing_hit.png'), 'B: crit 命中后守方 hit(+120ms 时间轴生效)');
assert(drew('xiaofeng_strike.png'), 'B: crit 攻方 strike');

// ---- C) 落空: 守方回退 puppet(侧闪残影表达保留), 攻方姿势帧不受影响 ----
restart(mkEv({ type: 'miss' }));
frameAt(2950);
assert(!drew('guojing_hit.png'), 'C: miss 守方不画姿势帧');
assert(drew('assets/portraits/guojing.png'), 'C: miss 守方回退 puppet 原立绘');
frameAt(500);
assert(drew('xiaofeng_idle.png'), 'C: miss 攻方姿势帧照常');

// ---- D) 击破: killAt 冻结窗口全扫无异常, 定格期守方停在 hit ----
restart(mkEv({ killed: true })); // killAt = 2760 + ceil(100/10)*40 = 3160
assert(FIGHT.killAt === 3160, `D: killAt 计算 ${FIGHT.killAt}`);
for (let t = 3000; t <= 3800; t += 40) frameAt(t); // 含冻结窗 [3160,3660)
assert(true, 'D: 击破定格窗逐帧无异常');
frameAt(3300); // 冻结内(p 被 frozenP 钉在 3160)
assert(drew('guojing_hit.png'), 'D: 定格期守方停在 hit 峰值帧');

// ---- F) 占位灰模 gate: 正式战斗绝不使用 poses_placeholder(那是 pose_demo/QA 专用) ----
// 玩家验收铁律(丁工 10-31): 灰模木偶比真立绘木偶更出戏——宁可回退立绘 puppet 演出
window.POSE_BRIDGE.sets.guojing.poses.idle.from = 'assets/portraits/poses_placeholder/guojing_idle.png';
window.POSE_BRIDGE.sets.guojing.poses.hit.from = 'assets/portraits/poses_placeholder/guojing_hit.png';
restart(mkEv({ isCrit: true })); // 新签名强制重建帧表
frameAt(2950);
assert(!drew('guojing_hit.png'), 'F: 占位灰模不进正式战斗(守方 hit 不接)');
assert(drew('assets/portraits/guojing.png'), 'F: 姿势图仅占位时守方回退真立绘 puppet');
window.POSE_BRIDGE.sets.guojing.poses.idle.from = 'assets/portraits/poses/guojing_idle.png';
window.POSE_BRIDGE.sets.guojing.poses.hit.from = 'assets/portraits/poses/guojing_hit.png';

// ---- E) 钩子拔除 = 零变化路径: POSE_RENDERERS 置空后逐字节走 drawPuppet ----
const saved = window.POSE_RENDERERS;
window.POSE_RENDERERS = undefined;
restart(mkEv());
frameAt(2800);
assert(!drew('xiaofeng_strike.png') && !drew('guojing_hit.png'), 'E: 无渲染器时不画任何姿势图');
assert(drew('assets/portraits/xiaofeng.png') && drew('assets/portraits/guojing.png'),
       'E: 无渲染器时攻守双方逐字节 drawPuppet 原路径');
window.POSE_RENDERERS = saved;

console.log('B方案姿势帧接线测试全部通过');
process.exit(0);
