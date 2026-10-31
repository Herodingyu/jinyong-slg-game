// F-Day15 道具系统 + 运功buff到期 引擎断言用例(由 test_items.js eval 进同一作用域)
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };

// ---- ① 初始库存(按 data.js ITEMS.init) ----
assert(G.items.jinchuang === 2 && G.items.jiuhua === 2 && G.items.nuerrhong === 1 && G.items.shihui === 1,
  `初始道具袋 金创药×2/九花×2/女儿红×1/石灰粉×1 (实得 ${JSON.stringify(G.items)})`);

// ---- ② 金创药: 邻接友方回血35%(四舍五入), 扣减库存 ----
const hero = G.units.find(u => u.key === 'hero');
const guo = G.units.find(u => u.key === 'guojing');
hero.x = 5; hero.y = 8; guo.x = 5; guo.y = 7; // 邻接
guo.hp = 1000;
const r1 = useItem(hero, 'jinchuang', guo);
assert(r1 && r1.gains.hp === Math.round(guo.maxhp * 0.35), `金创药回血 ${r1 && r1.gains.hp}`);
assert(guo.hp === 1000 + r1.gains.hp, '血量落账');
assert(G.items.jinchuang === 1, '库存 2→1');
// 非邻接目标 → 拒绝且不扣库存
const dy = G.units.find(u => u.key === 'duanyu');
dy.x = 13; dy.y = 9;
const rBad = useItem(hero, 'jinchuang', dy);
assert(rBad === null && G.items.jinchuang === 1, '非邻接友方被拒绝, 库存不扣');
// 满血 → 允许用但无增益(不卡玩家), 照常消耗
guo.hp = guo.maxhp;
const rFull = useItem(hero, 'jinchuang', guo);
assert(rFull && !rFull.gains.hp && G.items.jinchuang === 0, '满血可用但无增益, 库存清空 1→0');
// 无库存 → null
assert(useItem(hero, 'jinchuang', guo) === null, '库存用尽 → 拒绝');

// ---- ③ 九花玉露丸: 回内45%, 自身可用 ----
const dy2 = G.units.find(u => u.key === 'duanyu');
dy2.x = 6; dy2.y = 8; dy2.sp = 10;
const r2 = useItem(dy2, 'jiuhua', dy2);
assert(r2 && r2.gains.sp === Math.round(dy2.maxsp * 0.45), `九花回内 ${r2 && r2.gains.sp}`);
assert(dy2.sp === 10 + r2.gains.sp && G.items.jiuhua === 1, '真气落账, 库存扣减');

// ---- ④ 女儿红: 气势+25 封顶 maxwill, 部分生效 ----
hero.will = 100;
const r3 = useItem(hero, 'nuerrhong', hero);
assert(r3 && r3.gains.will === 25 && hero.will === 125, '女儿红 气势100→125');
hero.will = 140; // 剩余额度 10 < 25 → 部分生效到封顶
G.items.nuerrhong = 1; // 补一件再测部分生效(r3 已把初始 1 件用掉)
const r3b = useItem(hero, 'nuerrhong', hero);
assert(r3b && r3b.gains.will === 10 && hero.will === 150 && G.items.nuerrhong === 0,
  '女儿红部分生效 140→150(封顶), 库存清空');

// ---- ⑤ 石灰粉: 邻接敌方命中-40(dust buff), forecast 下降, clearBuffs 清除 ----
const bing = G.units.find(u => u.key === 'liaobing');
guo.x = 4; guo.y = 7;   // guo 挪开
bing.x = 5; bing.y = 7; // 与 hero(5,8) 上下相邻
const f0 = forecast(bing, hero, WEAPONS.wandao);
const r4 = useItem(hero, 'shihui', bing);
assert(r4 && bing.buffs.dust === 40, '石灰粉挂 dust=40');
const f1 = forecast(bing, hero, WEAPONS.wandao);
assert(f1.hitp === Math.max(5, f0.hitp - 40), `forecast 命中 ${f0.hitp}→${f1.hitp}(-40, clamp后)`);
// 非邻接敌人拒绝(补一件再测拒绝路径: r4 已消耗初始库存)
G.items.shihui = 1;
const dyq = G.units.find(u => u.key === 'duanyq');
const rBad2 = useItem(hero, 'shihui', dyq);
assert(rBad2 === null && G.items.shihui === 1, '非邻接敌方被拒绝');
// clearBuffs(敌方行动后清除) —— main.js 函数
clearBuffs(bing);
assert(bing.buffs.dust === undefined, 'clearBuffs 清除 dust');

// ---- ⑥ 道具栏随档走 + 老档兜底 ----
G.items.jiuhua = 1; // 用掉一件再存
const snap = serialize();
G.items.jiuhua = 99; // 污染
G.items.shihui = 0;
deserialize(snap);
assert(G.items.jiuhua === 1 && G.items.shihui === 1, `读档恢复道具栏 ${JSON.stringify(G.items)}`);
const old = serialize(); delete old.items;
deserialize(old);
assert(G.items.jinchuang === ITEMS.jinchuang.init, '老档缺 items → 按 ITEMS.init 兜底');

// ---- ⑦ AUDIT#46: 运功 buff 到期 —— 上回合施放的 mustHit/dmg2/halfDmg/mov3 在下次行动结束清除 ----
hero.buffs.mustHit = true; hero.buffs._castTurn = G.turn - 1; // 上回合运的凝神
expireTurnBuffs(hero);
assert(hero.buffs.mustHit === undefined && hero.buffs._castTurn === undefined, '上回合buff到期清除');
hero.buffs.dmg2 = true; hero.buffs._castTurn = G.turn;       // 本回合刚运的热血
expireTurnBuffs(hero);
assert(hero.buffs.dmg2 === true, '本回合新buff保留(活到下次行动结束)');
G.turn++;                                                    // 回合推进
expireTurnBuffs(hero);
assert(hero.buffs.dmg2 === undefined, '回合推进后清除 → 热血不再永久×2');
// evade(次数型)不受 expireTurnBuffs 影响
hero.buffs.evade = true;
hero.buffs._castTurn = 0;
expireTurnBuffs(hero);
assert(hero.buffs.evade === true, '游身(次数型)不走回合到期');
delete hero.buffs.evade;

console.log('F-Day15 道具系统+buff到期 引擎断言全部通过');
process.exit(0);
