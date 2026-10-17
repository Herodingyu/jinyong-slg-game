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
    ammo: {}, x: entry.x, y: entry.y,
    acted: false, movedTo: null,
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
function forecast(att, def, w) {
  const tE = TERRAIN[terrainAt(def.x, def.y)];
  const tA = TERRAIN[terrainAt(att.x, att.y)];
  let hitp = 90 + (att.hit - def.evd) * 0.4 - tE.eva * 0.5 + (tA.def ? 0 : 0);
  if (att.buffs.mustHit) hitp = 100;
  hitp = Math.max(5, Math.min(97, Math.round(hitp)));
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
    if (killed) { def.hp = 0; att.will = Math.min(att.maxwill, att.will + 4); }
    else { att.will = Math.min(att.maxwill, att.will + 1); def.will = Math.min(def.maxwill, def.will + 1); }
    if (w.ammo !== undefined) att.ammo[w.name] = (att.ammo[w.name] ?? w.ammo) - 1;
    return { type: 'hit', att, def, w, dmg, isCrit, killed };
  }
  att.will = Math.min(att.maxwill, att.will + 1);
  return { type: 'miss', att, def, w };
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

const G = {
  units: [], turn: 1, phase: 'player', over: false, comboUsed: false, result: null,
};
