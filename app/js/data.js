// ============ 金庸群侠大战 · 数据层 ============
// 地块: 0平野 1草地 2竹林 3水泽 4雪地 5石板 6城墙 7屋顶 8擂台
const TERRAIN = {
  平野:{cost:1, def:0,  eva:0},
  草地:{cost:1, def:0,  eva:5},
  竹林:{cost:1, def:0,  eva:20},
  水泽:{cost:-1,def:0,  eva:0},   // -1 = 不可通行
  雪地:{cost:2, def:0,  eva:0},
  石板:{cost:1, def:5,  eva:0},
  城墙:{cost:2, def:25, eva:0},
  屋顶:{cost:2, def:10, eva:10},
  擂台:{cost:1, def:0,  eva:0},
};
const TIDX = {平野:0,草地:1,竹林:2,水泽:3,雪地:4,石板:5,城墙:6,屋顶:7,擂台:8};

// 武功: {名,威力,命中,会心,射程:[近,远],耗内,气势需求,类型}
// anim: 机战式横版战斗动画配置(纯表现参数,渲染在main.js)
//   kind: dash=快拳连打 sweep=横扫弧光 dragon=双掌龙形气劲 beam=凝指点射(光束) bullet=瞄准射击(弹丸)
//         wave=云手气浪 stab=瞬步突刺 smash=跃起下砸 slashx=交叉双斩
//   P1-12: 每种 kind 配专属 puppet 动作编排+程序特效(main.js ATT_POSES/drawWeaponFx)
//   beams=N: 六道剑气类扇形齐发(缺省单道); 其余可选表现参数同层扩展
const WEAPONS = {
  changquan:  {name:'太祖长拳',   pow:1200, hit:90, crit:10, rng:[1,1], cost:0,  will:0,   type:'外', anim:{kind:'dash',   color:'#ffb84a'}},
  dagou:      {name:'打狗棒法',   pow:2100, hit:85, crit:15, rng:[1,1], cost:10, will:0,   type:'外', anim:{kind:'sweep',  color:'#8fd08f'}},
  xianglong:  {name:'降龙十八掌', pow:3600, hit:80, crit:20, rng:[1,2], cost:35, will:110, type:'外', anim:{kind:'dragon', color:'#ffd24a'}},
  kongming:   {name:'空明拳',     pow:1900, hit:90, crit:10, rng:[1,1], cost:8,  will:0,   type:'外', anim:{kind:'wave',   color:'#9ad0ff'}},
  liumai:     {name:'六脉神剑',   pow:2900, hit:80, crit:25, rng:[2,4], cost:35, will:0,   type:'内', anim:{kind:'beam',   color:'#6cf0ff', beams:6}},
  bishou:     {name:'匕首',       pow:800,  hit:85, crit:10, rng:[1,1], cost:0,  will:0,   type:'外', anim:{kind:'stab',   color:'#d0d8e8'}},
  huoqiang:   {name:'火枪',       pow:2400, hit:75, crit:20, rng:[2,4], cost:0,  will:0,   type:'奇', ammo:5, anim:{kind:'bullet', color:'#ffcf6a'}},
  canpu:      {name:'残谱一式',   pow:2000, hit:85, crit:15, rng:[1,2], cost:15, will:0,   type:'奇', anim:{kind:'slashx', color:'#c89aff'}},
  wandao:     {name:'辽军弯刀',   pow:1300, hit:80, crit:10, rng:[1,1], cost:0,  will:0,   type:'外', anim:{kind:'sweep',  color:'#e86a5a'}},
  langyabang: {name:'狼牙棒',     pow:1900, hit:75, crit:15, rng:[1,1], cost:5,  will:0,   type:'外', anim:{kind:'smash',  color:'#b89060'}},
  tiezhang:   {name:'铁杖',       pow:2600, hit:85, crit:15, rng:[1,2], cost:10, will:0,   type:'外', anim:{kind:'smash',  color:'#707a90'}},
  yiyang:     {name:'一阳指',     pow:3400, hit:80, crit:20, rng:[1,3], cost:20, will:0,   type:'内', anim:{kind:'beam',   color:'#fff8d0'}},
};

// 运功: {名,耗真气,效果键,说明}
const SPIRIT_BOOK = {
  ning:   {name:'凝神',   cost:25, fx:'mustHit',  desc:'本回合攻击必中'},
  rexue:  {name:'热血',   cost:35, fx:'dmg2',     desc:'下次伤害×2'},
  youshen:{name:'游身',   cost:20, fx:'evade',    desc:'完全闪避一次攻击'},
  jinzhong:{name:'金钟',  cost:20, fx:'halfDmg',  desc:'本回合受伤减半'},
  shizi:  {name:'狮子吼', cost:20, fx:'willUp',   desc:'邻接友方气势+10'},
  qinna:  {name:'擒拿',   cost:15, fx:'capture',  desc:'下次攻击将敌人打到剩1点'},
  shenxing:{name:'神行',  cost:15, fx:'mov3',     desc:'移动力+3'},
};

// 角色模板: atk膂力 def根骨 hit身法(命中) evd身法(闪避) mov轻功
const CHAR_DATA = {
  xiaofeng:  {cn:'萧峰',   sprite:'xiaofeng',  side:'player',
              hp:5200, sp:150, mov:5, atk:220, def:170, hit:150, evd:130,
              weapons:['changquan','dagou','xianglong'],
              spirits:['ning','rexue'],
              motto:'我乔峰要走，谁能拦我！'},
  guojing:   {cn:'郭靖',   sprite:'guojing',   side:'player',
              hp:5600, sp:120, mov:4, atk:180, def:210, hit:130, evd:100,
              weapons:['changquan','kongming','xianglong'],
              spirits:['jinzhong','shizi'],
              motto:'侠之大者，为国为民！'},
  duanyu:    {cn:'段誉',   sprite:'duanyu',    side:'player',
              hp:3600, sp:200, mov:5, atk:170, def:110, hit:160, evd:180,
              weapons:['changquan','liumai'],
              spirits:['youshen','ning'],
              motto:'神仙姐姐保佑……咦，打中了？'},
  xiaobao:   {cn:'韦小宝', sprite:'xiaobao',   side:'player',
              hp:2400, sp:100, mov:4, atk:90,  def:90,  hit:140, evd:160,
              weapons:['bishou','huoqiang'],
              spirits:['qinna','shenxing'],
              motto:'有话好说，有话好说！'},
  hero:      {cn:'无名主角',sprite:'hero',      side:'player',
              hp:3000, sp:120, mov:5, atk:140, def:130, hit:140, evd:140,
              weapons:['changquan','canpu'],
              spirits:['rexue','youshen'],
              motto:'我的名字……在哪里？'},
  liaobing:  {cn:'辽兵',   sprite:'liaobing',  side:'enemy',
              hp:2200, sp:40, mov:4, atk:120, def:100, hit:100, evd:90,
              weapons:['wandao'], spirits:['jinzhong'], motto:'杀！'},
  liaojiang: {cn:'辽将',   sprite:'liaojiang', side:'enemy', speakable:true,
              hp:3400, sp:60, mov:4, atk:160, def:140, hit:120, evd:110,
              weapons:['wandao','langyabang'], spirits:['ning','jinzhong'], motto:'中原无英雄！'},
  duanyq:    {cn:'段延庆', sprite:'duanyq',    side:'enemy', boss:true,
              hp:6800, sp:100, mov:4, atk:230, def:180, hit:150, evd:120,
              weapons:['tiezhang','yiyang'], spirits:['rexue','ning','jinzhong'], motto:'大理段氏，今日血债血偿。'},
};

// 14 x 10 地图
const MAP_LAYOUT = [
  ['城墙','城墙','石板','石板','石板','石板','石板','石板','城墙','城墙','雪地','雪地','雪地','雪地'],
  ['城墙','石板','石板','石板','擂台','石板','石板','石板','城墙','雪地','雪地','雪地','雪地','雪地'],
  ['石板','石板','石板','石板','石板','石板','石板','石板','石板','雪地','雪地','雪地','雪地','雪地'],
  ['石板','屋顶','石板','石板','石板','石板','屋顶','石板','石板','雪地','雪地','雪地','雪地','雪地'],
  ['石板','石板','石板','石板','石板','石板','石板','石板','石板','石板','雪地','雪地','雪地','雪地'],
  ['草地','草地','石板','石板','石板','石板','石板','石板','石板','石板','石板','雪地','雪地','雪地'],
  ['草地','草地','草地','水泽','水泽','石板','石板','石板','石板','石板','石板','石板','雪地','雪地'],
  ['草地','竹林','竹林','水泽','水泽','石板','石板','石板','石板','石板','石板','石板','石板','雪地'],
  ['草地','竹林','竹林','水泽','水泽','石板','石板','石板','石板','竹林','竹林','石板','石板','石板'],
  ['草地','草地','竹林','水泽','水泽','石板','石板','石板','石板','竹林','竹林','石板','石板','石板'],
];

// 初始布阵
const INITIAL_UNITS = [
  {key:'xiaofeng',  x:5, y:8},
  {key:'guojing',   x:4, y:8},
  {key:'duanyu',    x:6, y:9},
  {key:'xiaobao',   x:5, y:9},
  {key:'hero',      x:6, y:8},
  {key:'liaojiang', x:2, y:1},
  {key:'liaobing',  x:5, y:2},
  {key:'liaobing2', x:3, y:3, tpl:'liaobing'},
  {key:'liaobing3', x:7, y:2, tpl:'liaobing'},
  {key:'duanyq',    x:12, y:2},
  {key:'liaobing4', x:11, y:2, tpl:'liaobing'},
];

// ============ P3-11a 序章剧情演出(机战式第一话标配: 章节标题卡→立绘对白→出击) ============
// 脚本内容层(台词/章名全在此, 演出系统本体在 main.js); name 缺省取 CHAR_DATA[sp].cn
const STORY = {
  chapterNo: '序 章',
  chapterTitle: '破庙残谱',
  // 开场对白: 「踏入江湖」后逐句播放, 点击/空格推进, 全部放完进出击画面
  opening: [
    { sp:'hero',     name:'？？？',   text:'……头好痛。这是哪里？雨声，残破的佛像，还有半页从天而降的残谱。' },
    { sp:'hero',     name:'？？？',   text:'谱上这套武功，我明明从未练过——可一招一式，像是已经练了一百年。' },
    { sp:'xiaofeng',              text:'小兄弟，醒醒！辽兵杀进镇子了，还能站的话，跟紧我。' },
    { sp:'guojing',               text:'这位兄台面生得很。不管从何而来，先并肩退敌，余话战后细说！' },
    { sp:'duanyu',                text:'诸位小心。东北雪地里那个恶僧，铁杖劲力奇大，不可硬接。' },
    { sp:'xiaobao',               text:'喂喂喂，打架归打架！先说清楚，我韦小宝这条命，金贵得很！' },
    { sp:'hero',     name:'无名主角', text:'（这个世界没有辽，可城墙与飞雪都是真的。）先活下去——然后，找回我的名字。' },
  ],
};
