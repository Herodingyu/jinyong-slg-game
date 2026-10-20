// 定位 test_fx_b1 "必中却undefined" 抖动: 单测 resolveAttack mustHit 路径
const fs = require('fs');
const path = require('path');
const code =
  fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\n' + `
G.units = INITIAL_UNITS.map(makeUnit);
const att = G.units.find(u => u.key === 'xiaofeng');
const def = G.units.find(u => u.key === 'liaobing');
const w = WEAPONS[att.weapons[0]];
let miss = 0, undef = 0;
for (let i = 0; i < 20000; i++) {
  def.hp = def.maxhp; def.buffs = {};
  const ev = resolveAttack(att, def, w, { buffs: { mustHit: true } });
  if (ev.type !== 'hit') { miss++; if (miss <= 3) console.log('non-hit:', ev.type, 'case', i); }
  if (ev.dmg === undefined) undef++;
}
console.log('20000次 mustHit: 非命中=' + miss + ', dmg undefined=' + undef);
`;
eval(code);
