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

  // 1) 演出开: 攻击事件期间 miniOn 应为 true, 扣血期间 hpAnim 逐格递减
  assert(fxOn === true, '演出默认开启');
  const hp0 = def.hp;
  const ev = resolveAttack(att, def, w, { buffs: { mustHit: true } });
  assert(ev.type === 'hit' && ev.dmg > 0, `必中命中, 伤害=${ev.dmg}`);
  const p = animateEvent(ev);
  await sleep(350); // 切入(横幅)+前冲280ms 后已进扣血段
  assert(FX.miniOn === true, '演出中: 战场处于缩略图置底模式');
  if (FX.hpAnim) { // 扣血极短时可能已结束, 存在则必须递减中
    const v = hpAnimValue(performance.now());
    assert(v < FX.hpAnim.from && v >= FX.hpAnim.to, `HP逐格递减中 ${v} (${FX.hpAnim.from}→${FX.hpAnim.to})`);
    assert(FX.hpAnim.per === 40, `普通命中每格40ms(实际${FX.hpAnim.per}ms)`);
    // 逐格=按 maxhp/10 分段跳变, 非平滑插值: 当前值与起点之差必须是整格
    assert((FX.hpAnim.from - v) % FX.hpAnim.seg === 0, `按格跳变 seg=${FX.hpAnim.seg}, 差值=${FX.hpAnim.from - v}`);
  }
  await p;
  assert(FX.miniOn === false, '演出结束: 缩略图模式已恢复');
  assert(FX.hpAnim === null, '演出结束: HP动画已清理');
  assert(def.hp === Math.max(0, hp0 - ev.dmg), `HP结算正确 ${hp0}→${def.hp}`);

  // 1b) miss/evade 提前返回路径: 不进入缩略图模式, 无状态残留
  const origRand = Math.random;
  Math.random = () => 0.99; // 强制掷骰不中
  const defM = G.units.find(u => u.key === 'duanyq');
  defM.x = att.x + 1; defM.y = att.y;
  const evM = resolveAttack(att, defM, w);
  assert(evM.type === 'miss', '强制掷骰不中→miss');
  await animateEvent(evM);
  assert(FX.miniOn === false && FX.hpAnim === null, 'miss: 不缩图无动画无残留');
  defM.buffs.evade = true;
  const evE = resolveAttack(att, defM, w);
  assert(evE.type === 'evade', '游身buff+不中→evade');
  await animateEvent(evE);
  assert(FX.miniOn === false && FX.hpAnim === null, 'evade: 不缩图无动画无残留');
  Math.random = origRand;

  // 2) 演出关: 一切从简(不缩图, 无HP动画)
  fxOn = false;
  const def2 = G.units.find(u => u.key === 'liaojiang');
  def2.x = att.x + 1; def2.y = att.y;
  const hp1 = def2.hp;
  const ev2 = resolveAttack(att, def2, w, { buffs: { mustHit: true } });
  const p2 = animateEvent(ev2);
  await sleep(300);
  assert(FX.miniOn === false, '演出关: 不进入缩略图模式');
  assert(FX.hpAnim === null, '演出关: 无HP逐格动画');
  await p2;
  assert(def2.hp === Math.max(0, hp1 - ev2.dmg), `演出关: HP照常结算 ${hp1}→${def2.hp}`);
  fxOn = true;

  // 3) 渲染冒烟: 缩略图+大HP条(会心红)路径整帧不抛异常
  FX.miniOn = true;
  FX.hpAnim = { u: def, from: def.maxhp, to: def.maxhp / 2, t0: performance.now() - 100, per: 40, seg: Math.round(def.maxhp / 10), crit: true };
  rafCb(); // 手动推一帧 draw()
  FX.hpAnim = null; FX.miniOn = false;
  assert(true, '缩略图+大HP条渲染路径无异常');

  console.log('B1 演出层冒烟测试全部通过');
  process.exit(0);
})().catch(e => { console.error('FAIL: 异常', e); process.exit(1); });
