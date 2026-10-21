// B1 测试用例(由 test_fx_b1.js eval 进同一作用域, 可访问全部顶层符号)
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};

(async () => {
  const att = G.units.find(u => u.key === 'xiaofeng');
  const def = G.units.find(u => u.key === 'liaobing');
  def.x = att.x + 1; def.y = att.y; // 挪到近战位, 保证有伤害
  const w = WEAPONS[att.weapons[0]];

  // 1) 演出开: 攻击事件期间进入横版战斗场景, 扣血期间 hpAnim 逐格递减
  assert(fxOn === true, '演出默认开启');
  // AUDIT#21: 锁 RNG — 默认 15% 会心会把 hpAnim.per 抖成 26≠断言的 40, 确定性才能断言
  const origRand = Math.random;
  Math.random = () => 0.99; // 命中(必中buff)且非会心
  const hp0 = def.hp;
  const ev = resolveAttack(att, def, w, { buffs: { mustHit: true } });
  assert(ev.type === 'hit' && ev.dmg > 0, `必中命中, 伤害=${ev.dmg}`);
  const p = animateEvent(ev);
  await sleep(350); // 切入(前冲)后必已在战斗场景内
  assert(FIGHT.active === true, '演出中: 横版战斗场景(攻左守右)进行中');
  await sleep(1000); // FT.strike≈1030ms 后 hpAnim 进入逐格扣血段
  if (FX.hpAnim) { // 扣血极短时可能已结束, 存在则必须严格按格跳变
    const a = FX.hpAnim;
    // 确定性采样: 取第3格中途的显示值, 不受定时器抖动影响
    const vMid = hpAnimValue(a.t0 + a.per * 2 + a.per / 2);
    assert(vMid < a.from && vMid > a.to, `逐格递减中点值 ${vMid} (${a.from}→${a.to})`);
    assert((a.from - vMid) % a.seg === 0, `按格跳变 seg=${a.seg}, 差值=${a.from - vMid}`);
    assert(a.per === 40, `普通命中每格40ms(实际${a.per}ms)`);
  }
  await p;
  assert(FIGHT.active === false, '演出结束: 战斗场景已收起');
  assert(FX.hpAnim === null, '演出结束: HP动画已清理');
  assert(def.hp === Math.max(0, hp0 - ev.dmg), `HP结算正确 ${hp0}→${def.hp}`);

  // 1b) miss/evade 提前返回路径: 不进入缩略图模式, 无状态残留
  // (RNG 仍是 0.99 桩: 强制掷骰不中, 与 1) 共用 origRand)
  const defM = G.units.find(u => u.key === 'duanyq');
  defM.x = att.x + 1; defM.y = att.y;
  const evM = resolveAttack(att, defM, w);
  assert(evM.type === 'miss', '强制掷骰不中→miss');
  await animateEvent(evM);
  assert(FIGHT.active === false && FX.hpAnim === null, 'miss: 场景收起无动画无残留');
  defM.buffs.evade = true;
  const evE = resolveAttack(att, defM, w);
  assert(evE.type === 'evade', '游身buff+不中→evade');
  await animateEvent(evE);
  assert(FIGHT.active === false && FX.hpAnim === null, 'evade: 场景收起无动画无残留');
  Math.random = origRand;

  // 2) 演出关: 一切从简(不缩图, 无HP动画)
  fxOn = false;
  const def2 = G.units.find(u => u.key === 'liaojiang');
  def2.x = att.x + 1; def2.y = att.y;
  const hp1 = def2.hp;
  const ev2 = resolveAttack(att, def2, w, { buffs: { mustHit: true } });
  const p2 = animateEvent(ev2);
  await sleep(300);
  assert(FIGHT.active === false, '演出关: 不进战斗场景');
  assert(FX.hpAnim === null, '演出关: 无HP逐格动画');
  await p2;
  assert(def2.hp === Math.max(0, hp1 - ev2.dmg), `演出关: HP照常结算 ${hp1}→${def2.hp}`);
  fxOn = true;

  // 3) 渲染冒烟: 大HP条(会心红)路径整帧不抛异常
  FX.hpAnim = { u: def, from: def.maxhp, to: def.maxhp / 2, t0: performance.now() - 100, per: 40, seg: Math.round(def.maxhp / 10), crit: true };
  rafCb(); // 手动推一帧 draw()
  FX.hpAnim = null;
  assert(true, '大HP条渲染路径无异常');

  console.log('B1 演出层冒烟测试全部通过');
  process.exit(0);
})().catch(e => { console.error('FAIL: 异常', e); process.exit(1); });
