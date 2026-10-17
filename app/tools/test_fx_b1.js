// B1 战斗场景化(缩略图背景 + HP逐格递减) 演出层冒烟测试
// 零依赖纯 node: DOM/Canvas 打桩, 真实定时器驱动 animateEvent 全流程
// 跑法: node tools/test_fx_b1.js
const fs = require('fs');
const path = require('path');

// ---- DOM/Canvas 桩 ----
function makeEl() {
  return {
    classList: { add() {}, remove() {} },
    style: {},
    innerHTML: '',
    textContent: '',
    children: { length: 0 },
    prepend() {}, appendChild() {},
    lastChild: { remove() {} },
    onclick: null,
  };
}
const ctxStub = new Proxy({}, {
  get(t, k) { return k in t ? t[k] : () => {}; },
  set(t, k, v) { t[k] = v; return true; },
});
const els = {};
const cvStub = Object.assign(makeEl(), {
  width: 896, height: 640,
  getContext: () => ctxStub,
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
});
global.document = {
  getElementById(id) {
    if (id === 'cv') return cvStub;
    return els[id] || (els[id] = makeEl());
  },
  createElement: () => makeEl(),
};
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.window = {};
global.Image = class {
  constructor() { this.complete = false; this.width = 1; this.height = 1; }
  set src(v) {}
};

// ---- 加载三层(与 HANDOFF §5 同款方式) ----
const code =
  fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, './test_fx_b1_case.js'), 'utf8');
eval(code);
