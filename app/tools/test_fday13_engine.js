// F-Day13 P3-12 D1+D2 引擎层确定性断言: 经验/升级 + 存档序列化往返
// 零依赖纯 node: 只加载 data.js + engine.js(不碰 DOM/Canvas)
// 跑法: node tools/test_fday13_engine.js
const fs = require('fs');
const path = require('path');

const code =
  fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, './test_fday13_engine_case.js'), 'utf8');
eval(code);
