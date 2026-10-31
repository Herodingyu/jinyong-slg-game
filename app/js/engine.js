// ============ 引擎层: 规则计算(不含渲染) ============
const W = 14, H = 10;

let UID = 0;
function makeUnit(entry) {
  const tpl = CHAR_DATA[entry.tpl || entry.key];
  return {
    id: ++UID,
    key: entry.key,
    cn: tpl.cn, sprite: tpl.sprite, side: tpl.side,
    boss: !!tpl.boss, speakable: !!tpl.speakable,
    maxhp: tpl.hp, hp: tpl.hp,
    maxsp: tpl.sp, sp: tpl.sp,
    will: 100, maxwill: 150,
    atk: tpl.atk, def: tpl.def, hit: tpl.hit, evd: tpl.evd,
    mov: tpl.mov, weapons: tpl.weapons.slice(), spirits: tpl.spirits.slice(),
    motto: tpl.motto,
    lv: tpl.lv || 1, exp: 0, growth: tpl.growth || null, // P3-12 D2: 等级/经验/成长率(模板 lv 是击破经验数据源)
    ammo: {}, x: entry.x, y: entry.y,
    acted: false, movedTo: null,
    phaseIdx: 0,   // P3-12a: BOSS 阶段进度(对照 data.js BOSS_PHASES[u.key])
    buffs: {}, // {mustHit, dmg2, evade, halfDmg, mov3, capture}
  };
}
function unitAt(u) { return G.units.find(v => v.x === u.x && v.y === u.y && v.hp > 0); }
function terrainAt(x, y) { return MAP_LAYOUT[y][x]; }

function moveCost(u, x, y) {
  const t = TERRAIN[terrainAt(x, y)];
  return t.cost < 0 ? -1 : t.cost;
}

// BFS 移动范围(受单位阻挡)
function moveRange(u) {
  const bonus = u.buffs.mov3 ? 3 : 0;
  const limit = u.mov + bonus;
  const dist = {}, q = [[u.x, u.y, 0]];
  dist[u.x + ',' + u.y] = 0;
  while (q.length) {
    const [x, y, d] = q.shift();
    if (d >= limit) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const c = moveCost(u, nx, ny);
      if (c < 0) continue;
      const key = nx + ',' + ny;
      const occupied = G.units.find(v => v.hp > 0 && v.x === nx && v.y === ny);
      if (occupied) continue; // 单位阻挡(机战A惯例:不可穿过)
      const nd = d + c;
      if (dist[key] === undefined || nd < dist[key]) {
        dist[key] = nd;
        q.push([nx, ny, nd]);
      }
    }
  }
  return dist;
}

// 某位置+某武功可攻击的格子集合
function attackTiles(u, w, fromX, fromY) {
  const set = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.abs(x - fromX) + Math.abs(y - fromY);
    if (d >= w.rng[0] && d <= w.rng[1]) set[x + ',' + y] = true;
  }
  return set;
}

// 战斗预测
// P3-12b: 武器命中字段接入公式(此前 w.hit 是死数据) —— (w.hit-85)*0.6, 粗重兵器负修正(火枪/狼牙棒-6),
// 精准拳脚正修正(长拳/空明+3); 单位身法仍是主项。mustHit 必中buff必须留在一切修正之后
function forecast(att, def, w) {
  const tE = TERRAIN[terrainAt(def.x, def.y)];
  const tA = TERRAIN[terrainAt(att.x, att.y)];
  let hitp = 90 + (att.hit - def.evd) * 0.4 + (w.hit - 85) * 0.6 - tE.eva * 0.5 + (tA.def ? 0 : 0);
  // P3-12 D3: 石灰粉debuff(ITEMS[x].effect.dust 挂到攻击方) —— 命中下降在clamp前, mustHit仍凌驾一切
  if (att.buffs.dust) hitp -= att.buffs.dust;
  hitp = Math.max(5, Math.min(97, Math.round(hitp)));
  if (att.buffs.mustHit) hitp = 100; // 必中buff凌驾命中率上限(放在clamp后, 否则被压回97)
  let dmg = w.pow + att.atk * 4 - def.def * 3;
  dmg *= 1 - (tE.def || 0) / 100;
  dmg *= 1 + Math.min(att.will - 100, 50) * 0.004; // 气势增伤
  if (att.buffs.dmg2) dmg *= 2;
  dmg = Math.max(50, Math.round(dmg));
  return { hitp, dmg, crit: w.crit };
}

// 执行攻击, 返回结算事件
// opts: {buffs: 攻击方buff表覆盖(缺省用att.buffs), atkBonus: 膂力临时加成}
//       ——合体技经 opts 传临时buff/加成, 不再展开单位副本, 气势增减才落得到真身
function resolveAttack(att, def, w, opts) {
  opts = opts || {};
  const ab = opts.buffs || att.buffs;
  const f = forecast({ ...att, atk: att.atk + (opts.atkBonus || 0), buffs: ab }, def, w);
  if (ab.evade === false) {} // noop
  const roll = Math.random() * 100;
  let acc = f.hitp;
  if (def.buffs.evade && roll >= acc) {
    def.buffs.evade = false;
    return { type: 'evade', att, def, w };
  }
  if (roll < acc) {
    let dmg = f.dmg;
    const isCrit = Math.random() * 100 < f.crit;
    if (isCrit) dmg = Math.round(dmg * 1.5);
    if (ab.capture) { dmg = def.hp - 1; ab.capture = false; }
    if (def.buffs.halfDmg) { dmg = Math.ceil(dmg / 2); }
    def.hp -= dmg;
    const killed = def.hp <= 0;
    if (killed) {
      def.hp = 0; att.will = Math.min(att.maxwill, att.will + 4);
      if (att.side === 'player') G.stats.kills++; // P3-11b: 我方击破计数(评价结算)
    }
    else { att.will = Math.min(att.maxwill, att.will + 1); def.will = Math.min(def.maxwill, def.will + 1); }
    if (w.ammo !== undefined) att.ammo[w.name] = (att.ammo[w.name] ?? w.ammo) - 1;
    // P3-12 D2: 经验结算(规则层; 数值在 data.js EXP_CFG) —— 命中即有, 击破=敌方等级×10
    let lvUps = gainExp(att, EXP_CFG.hit);
    if (killed) lvUps = lvUps.concat(gainExp(att, (def.lv || 1) * EXP_CFG.killPerLv));
    const ev = { type: 'hit', att, def, w, dmg, isCrit, killed };
    if (lvUps.length) ev.levelUps = lvUps; // 升级摘要交给演出层消费
    return ev;
  }
  att.will = Math.min(att.maxwill, att.will + 1);
  return { type: 'miss', att, def, w };
}

// P3-12 D2: 经验与升级 —— 满 EXP_CFG.need 升级(溢出结转), 按成长率随机加点。
// rng 可注入(测试锁确定性): 传入 ()=>0 必全成长, ()=>0.99 必不成长。
// 体力成长同步回血(机战式升级修理感)。返回升级摘要数组 [{lv,gains{hp:150,...}}] 供演出层。
function gainExp(u, n, rng) {
  rng = rng || Math.random;
  u.exp = (u.exp || 0) + n;
  const ups = [];
  while (u.exp >= EXP_CFG.need) {
    u.exp -= EXP_CFG.need;
    u.lv = (u.lv || 1) + 1;
    const gains = {};
    for (const k in EXP_CFG.steps) {
      const g = (u.growth && u.growth[k]) || 0;
      if (g > 0 && rng() < g) {
        const add = EXP_CFG.steps[k];
        if (k === 'hp') { u.maxhp += add; u.hp = Math.min(u.maxhp, u.hp + add); }
        else if (k === 'sp') { u.maxsp += add; }
        else u[k] += add;
        gains[k] = (gains[k] || 0) + add;
      }
    }
    ups.push({ lv: u.lv, gains });
  }
  return ups;
}

// ============ P3-12 D3: 道具系统规则(纯函数; 消耗/目标校验/效果落账全在引擎, 表现层只管演出) ============
// itemTargets: 该道具当前对 u 可用的目标列表(按 ITEMS[x].target 过滤邻接关系)
function itemTargets(u, itemId) {
  const it = ITEMS[itemId];
  if (!it || (G.items[itemId] || 0) <= 0) return [];
  const adj = v => Math.abs(v.x - u.x) + Math.abs(v.y - u.y) === 1;
  if (it.target === 'self')  return [u];
  if (it.target === 'ally')  return G.units.filter(v => v.hp > 0 && v.side === 'player' && (v === u || adj(v)));
  if (it.target === 'enemy') return G.units.filter(v => v.hp > 0 && v.side === 'enemy' && adj(v));
  return [];
}
// useItem: 消耗1件并落账效果。目标不合法/无库存返回 null(调用方退回菜单)。
// 返回 {item, target, gains:{hp,sp,will}} 供演出层飘字; dust 走 target.buffs(无 gains)。
function useItem(u, itemId, target) {
  const it = ITEMS[itemId];
  if (!it || (G.items[itemId] || 0) <= 0) return null;
  if (!target || itemTargets(u, itemId).indexOf(target) < 0) return null;
  G.items[itemId]--;
  const eff = it.effect, gains = {};
  if (eff.healPct) { const h = Math.round(target.maxhp * eff.healPct); const r = Math.min(target.maxhp - target.hp, h); target.hp += r; if (r > 0) gains.hp = r; }
  if (eff.spPct)   { const s = Math.round(target.maxsp * eff.spPct);   const r = Math.min(target.maxsp - target.sp, s); target.sp += r; if (r > 0) gains.sp = r; }
  if (eff.willAdd) { const w = Math.min(target.maxwill - target.will, eff.willAdd); target.will += w; if (w > 0) gains.will = w; }
  if (eff.dust)    { target.buffs.dust = eff.dust; } // 命中debuff挂攻击方(敌方), 行动后 clearBuffs 清除
  return { item: it, target, gains };
}

// P3-12 D3: 回合制运功buff到期(AUDIT#46修复) —— 运功时给buff标注施放回合(_castTurn),
// 单位下次行动结束(finishUnit)时, 早于当前回合施放的一律清除。
// 修的是老bug: 玩家运功buff从不清除 → 热血永久×2 = 无脑最优解(违反平衡清单「强招代价」)。
// 生命期对齐玩家心智: 第N回合运功(本回合行动已用掉) → 保护/生效到第N+1回合行动为止。
// 敌方不走此函数: 敌方buff在每次行动后由表现层 clearBuffs 清除(既有老路)。
function expireTurnBuffs(u) {
  if ((u.buffs._castTurn | 0) >= G.turn) return; // 本回合刚运的功, 留到下次行动结束
  for (const k of ['mustHit', 'dmg2', 'halfDmg', 'mov3']) delete u.buffs[k];
  delete u.buffs._castTurn;
}

// 可反击的武功列表
function counterWeapons(def, att) {
  const d = Math.abs(def.x - att.x) + Math.abs(def.y - att.y);
  return def.weapons.filter(wid => {
    const w = WEAPONS[wid];
    if (w.ammo !== undefined && (def.ammo[w.name] ?? w.ammo) <= 0) return false;
    return d >= w.rng[0] && d <= w.rng[1];
  });
}

// 敌方 AI: 评估本回合所有"可达位置×敌人×武功", 优先击破, 其次期望伤害, 再次少走路
function enemyPlan(u) {
  const foes = G.units.filter(v => v.hp > 0 && v.side === 'player');
  if (!foes.length) return null;
  const rng = moveRange(u);
  const spots = [{ x: u.x, y: u.y, d: 0 }];
  for (const key in rng) {
    const [x, y] = key.split(',').map(Number);
    spots.push({ x, y, d: rng[key] });
  }
  let bestAtk = null;
  for (const f of foes) {
    for (const s of spots) {
      const d = Math.abs(f.x - s.x) + Math.abs(f.y - s.y);
      const wid = pickWeapon(u, f, d);
      if (!wid) continue;
      const fc = forecast(u, f, WEAPONS[wid]);
      const lethal = fc.dmg >= f.hp;
      // 击杀 >> 期望伤害; 同等收益原地不动优先(省步数)
      const score = (lethal ? 1e9 + fc.hitp * 1e6 : fc.dmg * fc.hitp / 100) - s.d;
      if (!bestAtk || score > bestAtk.score) bestAtk = { f, x: s.x, y: s.y, wid, score };
    }
  }
  if (bestAtk) return { kind: 'attack', x: bestAtk.x, y: bestAtk.y, target: bestAtk.f, wid: bestAtk.wid };
  // 实在打不到就逼近最近敌人
  let nearestFoe = null;
  for (const f of foes) {
    const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
    if (!nearestFoe || d < nearestFoe.d) nearestFoe = { f, d };
  }
  let nearest = null;
  for (const key in rng) {
    const [x, y] = key.split(',').map(Number);
    const d = Math.abs(nearestFoe.f.x - x) + Math.abs(nearestFoe.f.y - y);
    if (!nearest || d < nearest.d) nearest = { x, y, d };
  }
  if (nearest) return { kind: 'move', x: nearest.x, y: nearest.y };
  return null;
}

// 敌方运功决策: 返回要用的运功id(真气够才考虑), 由调用方扣真气挂buff
function enemySpirit(u, target) {
  const affordable = u.spirits.filter(sid => u.sp >= SPIRIT_BOOK[sid].cost);
  if (!affordable.length) return null;
  const has = fx => affordable.find(sid => SPIRIT_BOOK[sid].fx === fx);
  // ① 半血以下开金钟(减伤保命)
  if (u.hp / u.maxhp <= 0.5 && has('halfDmg')) return has('halfDmg');
  // ② 锁定低血/高价值目标时凝神保证命中(命中不足70%才开)
  const ning = has('mustHit');
  if (ning) {
    const wid = pickWeapon(u, target, Math.abs(target.x - u.x) + Math.abs(target.y - u.y));
    if (wid && forecast(u, target, WEAPONS[wid]).hitp < 70) return ning;
  }
  // ③ 残血目标(可一击收割)时热血加倍
  const rexue = has('dmg2');
  if (rexue && target.hp / target.maxhp <= 0.35) return rexue;
  return null;
}

function pickWeapon(u, target, dist) {
  let best = null, bestScore = -1;
  for (const wid of u.weapons) {
    const w = WEAPONS[wid];
    if (u.will < w.will) continue;
    if (w.ammo !== undefined && (u.ammo[w.name] ?? w.ammo) <= 0) continue;
    if (dist < w.rng[0] || dist > w.rng[1]) continue;
    const f = forecast(u, target, w);
    const score = f.dmg * f.hitp / 100;
    if (score > bestScore) { bestScore = score; best = wid; }
  }
  return best;
}

// 说得判定: 韦小宝 vs 残血可说得敌将
function canSpeak(u, target) {
  return u.key === 'xiaobao' && target.speakable && target.side === 'enemy' &&
         target.hp / target.maxhp <= 0.3 &&
         Math.abs(u.x - target.x) + Math.abs(u.y - target.y) === 1;
}

// 合体技判定: 萧峰郭靖相邻, 双方气势≥120
function canCombo(u) {
  if (G.comboUsed) return false;
  const partnerKey = u.key === 'xiaofeng' ? 'guojing' : (u.key === 'guojing' ? 'xiaofeng' : null);
  if (!partnerKey) return false;
  const p = G.units.find(v => v.hp > 0 && v.key === partnerKey);
  if (!p || u.will < 120 || p.will < 120) return false;
  return Math.abs(u.x - p.x) + Math.abs(u.y - p.y) === 1;
}

// 合体技范围: 敌人在任一参战者(操作者或其搭档)周围2格内即可选为3x3中心
function comboTargets(u) {
  const list = [];
  const p = G.units.find(v => v.hp > 0 && (v.key === 'xiaofeng' || v.key === 'guojing') && v.id !== u.id);
  for (const e of G.units.filter(v => v.hp > 0 && v.side === 'enemy')) {
    const d1 = Math.abs(e.x - u.x) + Math.abs(e.y - u.y);
    const d2 = p ? Math.abs(e.x - p.x) + Math.abs(e.y - p.y) : 99;
    if (d1 <= 2 || d2 <= 2) list.push(e);
  }
  return list;
}

// P3-12a: BOSS 阶段判定 —— 守方 BOSS 被打穿阈值时调用(animateEvent 结算后)。
// 规则层只做三件事: 属性buff/解锁武器/召唤援军(全按 data.js BOSS_PHASES 配置), 返回阶段对象供演出层消费;
// 援军落点被占时按环形扫描挪到最近可站格。每阶段只触发一次(u.phaseIdx 推进)。
function findSpawnTile(x0, y0) {
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
    moveCost({ buffs: {} }, x, y) >= 0 &&
    !G.units.some(v => v.hp > 0 && v.x === x && v.y === y);
  if (free(x0, y0)) return [x0, y0];
  for (let r = 1; r < 6; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(x0 + dx, y0 + dy)) return [x0 + dx, y0 + dy];
      }
  return null;
}
function checkBossPhase(u) {
  const cfg = BOSS_PHASES[u.key];
  if (!cfg || u.hp <= 0) return null;
  const idx = u.phaseIdx || 0;
  if (idx >= cfg.length) return null;
  const ph = cfg[idx];
  if (u.hp / u.maxhp > ph.at) return null;   // 还没打到阈值
  u.phaseIdx = idx + 1;
  if (ph.buffs) for (const k in ph.buffs) u[k] += ph.buffs[k];
  if (ph.will) u.will = Math.min(u.maxwill, ph.will);
  if (ph.addWeapons)
    for (const wid of ph.addWeapons)
      if (u.weapons.indexOf(wid) < 0) u.weapons.push(wid);
  const spawned = [];
  if (ph.spawn) {
    for (const s of ph.spawn) {
      const tile = findSpawnTile(s.x, s.y);
      if (!tile) continue;                    // 实在没位置就放弃这名援军(不让游戏崩)
      const nu = makeUnit({ key: s.tpl + '_s' + (++UID), tpl: s.tpl, x: tile[0], y: tile[1] });
      G.units.push(nu);
      spawned.push(nu);
    }
    G.stats.foes += spawned.length;           // 结算画面的击破总数要算上援军
  }
  return { phase: ph, spawned };
}

const G = {
  units: [], turn: 1, phase: 'player', over: false, comboUsed: false, result: null,
  // P3-11b: 评价结算数据源(AUDIT#14)。击破数在 resolveAttack 结算, 说得数在 doSpeak 结算
  // P3-12a: foes=敌总量(初始+阶段援军), 结算画面「击破敌军 x/foes」用
  stats: { kills: 0, speaks: 0, foes: 0 },
  // P3-12 D3: 全队共享道具袋(初始库存按 data.js ITEMS[x].init), 随档走
  items: Object.fromEntries(Object.keys(ITEMS).map(k => [k, ITEMS[k].init])),
};

// ============ P3-12 D1: 存档/读档(纯规则层序列化, 表现层只管 localStorage 读写) ============
// 单位逐字段快照(全部 JSON 安全): 说得收服(side 改写)/升级成长/BOSS阶段进度/弹药/buff 全量保留。
// UID 一并存档 —— 反序列化后召唤援军的自增 id 不与旧单位冲突。
function serialize() {
  const units = G.units.map(u => ({
    id: u.id, key: u.key, cn: u.cn, sprite: u.sprite, side: u.side,
    boss: !!u.boss, speakable: !!u.speakable,
    maxhp: u.maxhp, hp: u.hp, maxsp: u.maxsp, sp: u.sp,
    will: u.will, maxwill: u.maxwill,
    atk: u.atk, def: u.def, hit: u.hit, evd: u.evd, mov: u.mov,
    weapons: u.weapons.slice(), spirits: u.spirits.slice(), motto: u.motto,
    lv: u.lv || 1, exp: u.exp || 0, growth: u.growth,
    ammo: Object.assign({}, u.ammo), x: u.x, y: u.y,
    acted: !!u.acted, movedTo: u.movedTo || null, phaseIdx: u.phaseIdx || 0,
    buffs: Object.assign({}, u.buffs),
  }));
  return {
    v: 1, UID,
    turn: G.turn, phase: G.phase, over: !!G.over,
    comboUsed: !!G.comboUsed, result: G.result,
    stats: Object.assign({}, G.stats),
    items: Object.assign({}, G.items), // P3-12 D3: 道具栏随档走
    units,
  };
}
// 反序列化: 深拷贝恢复(数组/对象全重建), 反复读档互不污染
function deserialize(s) {
  UID = s.UID || 0;
  G.units = s.units.map(u => Object.assign({}, u, {
    // 老存档兼容: 缺等级/经验字段时给默认值(老档单位零成长但不炸)
    lv: u.lv || 1, exp: u.exp || 0, growth: u.growth,
    weapons: u.weapons.slice(), spirits: u.spirits.slice(),
    ammo: Object.assign({}, u.ammo), buffs: Object.assign({}, u.buffs),
  }));
  G.turn = s.turn; G.phase = s.phase; G.over = !!s.over;
  G.comboUsed = !!s.comboUsed; G.result = s.result;
  G.stats = Object.assign({}, s.stats);
  // P3-12 D3: 老档无道具栏时按 ITEMS 初始库存兜底
  G.items = Object.assign({}, Object.fromEntries(Object.keys(ITEMS).map(k => [k, ITEMS[k].init])), s.items);
}
