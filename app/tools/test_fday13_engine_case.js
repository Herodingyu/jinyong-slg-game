// F-Day13 引擎断言用例(由 test_fday13_engine.js eval 进同一作用域)
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};

// ============ D2 经验与升级 ============
G.units = INITIAL_UNITS.map(makeUnit);

// 1) 未满级线不升级; 恰满升级; 溢出结转
const hero = G.units.find(u => u.key === 'hero');
assert(hero.lv === 1 && hero.exp === 0 && hero.growth && hero.growth.atk > 0, '模板 lv/growth 进入单位实例');
let ups = gainExp(hero, EXP_CFG.need - 1, () => 0);
assert(ups.length === 0 && hero.lv === 1 && hero.exp === EXP_CFG.need - 1, `经验99不升级 lv=${hero.lv} exp=${hero.exp}`);
ups = gainExp(hero, 1, () => 0); // 恰满 100 → 升级, rng=0 全成长
assert(ups.length === 1 && hero.lv === 2 && hero.exp === 0, `恰满升级 lv=2 经验清零`);
const g0 = ups[0].gains;
assert(g0.hp === EXP_CFG.steps.hp && g0.atk === EXP_CFG.steps.atk && g0.sp === EXP_CFG.steps.sp &&
       g0.def === EXP_CFG.steps.def && g0.hit === EXP_CFG.steps.hit && g0.evd === EXP_CFG.steps.evd,
       `rng=0 六项全成长 ${JSON.stringify(g0)}`);
assert(hero.maxhp === 3000 + EXP_CFG.steps.hp, `体力上限成长 ${3000}→${hero.maxhp}`);
assert(hero.hp === 3000 + EXP_CFG.steps.hp, '体力成长同步回血(机战式升级修理感)');
assert(hero.atk === 140 + EXP_CFG.steps.atk && hero.maxsp === 120 + EXP_CFG.steps.sp, '膂力/真气上限成长落账');

// 2) rng=0.99 全不成长: 等级照升, 属性不动(成长率roll点语义正确)
const bing = G.units.find(u => u.key === 'liaobing');
const b0 = { atk: bing.atk, maxhp: bing.maxhp };
ups = gainExp(bing, 100, () => 0.99);
assert(ups.length === 1 && bing.lv === 2 && ups[0].gains && Object.keys(ups[0].gains).length === 0,
       'rng=0.99 升级但零成长(成长率roll点)');
assert(bing.atk === b0.atk && bing.maxhp === b0.maxhp, '零成长时属性不变');

// 3) 溢出结转 + 连升聚合: 一次吃250 → lv+2 余50
const xb = G.units.find(u => u.key === 'xiaobao');
ups = gainExp(xb, 250, () => 0);
assert(xb.lv === 4 && xb.exp === 50 && ups.length === 2, `250exp 连升2级 lv=${xb.lv} exp=${xb.exp}`);
assert(ups[1].gains.hp === EXP_CFG.steps.hp * 1, '单级成长单步增量');

// 4) resolveAttack 经验结算: 命中+2, 击破=敌方等级×10, 升级挂 ev.levelUps
const origRand = Math.random;
Math.random = () => 0.99; // 非会心
const att = G.units.find(u => u.key === 'xiaofeng');
const def = G.units.find(u => u.key === 'liaobing');
def.x = att.x + 1; def.y = att.y;
att.exp = EXP_CFG.need - EXP_CFG.hit; // 命中即升级的边缘
const hp0 = def.hp;
const ev = resolveAttack(att, def, WEAPONS[att.weapons[0]], { buffs: { mustHit: true } });
assert(ev.type === 'hit' && ev.dmg > 0, `必中命中 dmg=${ev.dmg}`);
assert(att.exp === 0 && att.lv === 7, `命中+${EXP_CFG.hit} 升级且清零 exp=${att.exp} lv=${att.lv}`);
assert(ev.levelUps && ev.levelUps.length === 1 && ev.levelUps[0].lv === 7, 'ev.levelUps 附升级摘要');
// 击破: 段延庆 lv6 → 60 + 命中2
const boss = G.units.find(u => u.key === 'duanyq');
att.exp = 0;
boss.hp = 1;
const evK = resolveAttack(att, boss, WEAPONS[att.weapons[0]], { buffs: { mustHit: true } });
assert(evK.killed === true, '段延庆击破');
assert(att.exp === EXP_CFG.hit + 6 * EXP_CFG.killPerLv, `击破经验 = 命中${EXP_CFG.hit}+等级6×${EXP_CFG.killPerLv} = ${att.exp}`);
Math.random = origRand;

// ============ D1 存档/读档(serialize/deserialize 往返) ============
// 5) 构造脏状态: 说得收服(改side)/升级成长/弹药消耗/buff/位置 + 顶层统计
const snap = () => JSON.stringify(serialize());
const jiang = G.units.find(u => u.key === 'liaojiang');
jiang.side = 'player'; jiang.speakable = false; jiang.hp = 900; // 说得收服现场
const dy = G.units.find(u => u.key === 'duanyu');
dy.x = 7; dy.y = 4; dy.acted = true; dy.buffs.mustHit = true;
const xb2 = G.units.find(u => u.key === 'xiaobao');
xb2.ammo['火枪'] = 1; xb2.x = 3; xb2.y = 2; // 火枪弹药消耗现场(韦小宝持火枪)
const xf2 = G.units.find(u => u.key === 'xiaofeng');
xf2.hp = 3000; xf2.sp = 77; xf2.will = 88;
G.turn = 3; G.phase = 'enemy'; G.comboUsed = true; G.stats.kills = 4; G.stats.speaks = 1; G.stats.foes = 8;
const before = snap();

// 污染 G(模拟读档前的其他运行)
G.turn = 99; G.units.forEach(u => { u.hp = 1; u.x = 0; u.y = 0; });
G.units.push(makeUnit({ key: 'liaobing_x', tpl: 'liaobing', x: 1, y: 1 }));
deserialize(JSON.parse(before));
const after = snap();
assert(before === after, 'serialize→污染→deserialize→serialize 逐字节一致(往返无损)');

// 6) 反序列化独立性: 改恢复出的单位不影响快照(可反复读档)
G.units.find(u => u.key === 'liaojiang').hp = 1;
deserialize(JSON.parse(before));
assert(G.units.find(u => u.key === 'liaojiang').hp === 900, '反复读档互不污染');
// 说得收服现场保留
const rj = G.units.find(u => u.key === 'liaojiang');
assert(rj.side === 'player' && rj.speakable === false, '收服状态(side/speakable)入档');
// 弹药/buff/位置/acted 保留
const rxb = G.units.find(u => u.key === 'xiaobao');
assert(rxb.ammo['火枪'] === 1 && rxb.x === 3, '弹药消耗现场入档');
const rd = G.units.find(u => u.key === 'duanyu');
assert(rd.buffs.mustHit === true && rd.x === 7 && rd.acted === true, 'buff/位置/acted 入档');
// 顶层状态保留
assert(G.turn === 3 && G.phase === 'enemy' && G.comboUsed === true && G.stats.kills === 4, '回合/阶段/合体/统计 入档');

// 7) UID 冲突防线: 读档后新单位 id 不与旧单位冲突(援军生成场景)
const ids = new Set(G.units.map(u => u.id));
const nu = makeUnit({ key: 'liaobing_new', tpl: 'liaobing', x: 0, y: 0 });
assert(!ids.has(nu.id) && nu.id > Math.max(...ids), `UID 单调不冲突 new=${nu.id} max=${Math.max(...ids)}`);

// 8) 老存档兼容: 缺 lv/exp/growth/ammo 字段的旧快照不炸
const legacy = JSON.parse(before);
legacy.units.forEach(u => { delete u.lv; delete u.exp; delete u.growth; });
deserialize(legacy);
const lu = G.units.find(u => u.key === 'xiaofeng');
assert(lu.lv === 1 && lu.exp === 0, '老存档缺字段 → lv/exp 默认兜底');

console.log('F-Day13 D1+D2 引擎断言全部通过');
process.exit(0);
