// B方案姿势帧接线冒烟测试（pose_bridge.js × drawCombatant 钩子）
// 零依赖纯 node: DOM/Canvas 打桩 + Image 同步 settle 桩，eval 全部五层脚本，
// 直接驱动 drawFightScene(t) 走姿势渲染器路径，断言姿势图在正确时间窗上画。
// 跑法: node tools/test_pose_bridge.js
const fs = require('fs');
const path = require('path');

// ---- DOM/Canvas 桩 ----
function makeEl() {
  return {
    classList: { add() {}, remove() {} },
    style: {}, innerHTML: '', textContent: '',
    children: { length: 0 }, prepend() {}, appendChild() {},
    lastChild: { remove() {} }, onclick: null,
  };
}
const draws = []; // 记录全部 drawImage 实参
const gradient = { addColorStop() {} };
const ctxStub = new Proxy({
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  measureText: () => ({ width: 10 }),
  drawImage: (...a) => { draws.push(a); },
}, {
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
  getElementById(id) { return id === 'cv' ? cvStub : (els[id] || (els[id] = makeEl())); },
  createElement: () => makeEl(),
};
global.requestAnimationFrame = () => {};
global.window = {};
// Image 桩: src 一挂即同步 onload（PoseSet 三级回退的第一级 AI 目录直接成功，settled 立即可用）
global.Image = class {
  constructor() { this.complete = false; this.width = 100; this.height = 200; this._src = ''; }
  set src(v) { this._src = v; this.complete = true; if (this.onload) this.onload(); }
  get src() { return this._src; }
};

// poseanim.js 是 UMD：node 侧 require 拿到 api 后挂全局，模拟浏览器 window 语义
// （eval 串里 main.js/pose_bridge.js 的顶层 const/function 同作用域互联，与 index.html 脚本链等价）
const poseanimApi = require('../js/poseanim.js');
global.PoseSet = poseanimApi.PoseSet;
global.PosePlayer = poseanimApi.PosePlayer;

// ---- 加载五层（main.js + pose_bridge.js eval 进同一作用域；poseanim 已挂全局） ----
const code =
  fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../js/pose_bridge.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, './test_pose_bridge_case.js'), 'utf8');
eval(code);
