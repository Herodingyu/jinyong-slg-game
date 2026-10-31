// B方案姿势帧占位灰模生成器（Agent 2 线，2026-10-30）
// AI 多姿势立绘（Agent 1 线）未到位前，先产出"姿势可辨"的灰模占位图：
//   assets/portraits/poses_placeholder/xiaofeng_{idle,ready,strike,hit}.png
// 四张图轮廓刻意拉开（站姿/格斗架/出拳/受击后仰），并烤入姿势名水印，方便目验。
// 纯 Node 零依赖：自带迷你 PNG 编码器（zlib + CRC32），不引任何包。
// 跑法: node tools/gen_pose_placeholder.js   （在 app/ 目录下运行）
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 240, H = 376; // 与现有立绘同比例量级（300×470 系），占位取 0.8 倍
const OUT_DIR = path.join(__dirname, '..', 'assets', 'portraits', 'poses_placeholder');

// ---------- 迷你 PNG 编码器 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// RGBA 像素缓冲 → PNG 文件缓冲
function encodePNG(px) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: None
    px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 像素绘制原语（简单扫描线填充，占位图够用） ----------
// 画布：Uint8Array RGBA，透明底
function newBuf() { return Buffer.alloc(W * H * 4); }
function setPx(b, x, y, r, g, bl, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const da = b[i + 3] / 255, sa = a / 255; // 简单 over 合成
  b[i]     = Math.round(r * sa + b[i] * da * (1 - sa));
  b[i + 1] = Math.round(g * sa + b[i + 1] * da * (1 - sa));
  b[i + 2] = Math.round(bl * sa + b[i + 2] * da * (1 - sa));
  b[i + 3] = Math.round((sa + da * (1 - sa)) * 255);
}
function fillCircle(b, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(b, x, y, col[0], col[1], col[2], col[3]);
}
function fillRect(b, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++)
      setPx(b, x, y, col[0], col[1], col[2], col[3]);
}
// 从关节点 (jx,jy) 向 angle 方向伸 len 长、宽 w 的肢体（rotated rect，带描边）
function limb(b, jx, jy, len, w, angleDeg, fill, stroke) {
  const a = angleDeg * Math.PI / 180;
  const dx = Math.sin(a), dy = -Math.cos(a); // 0° = 竖直向下
  const px = Math.cos(a), py = Math.sin(a);  // 宽度方向
  const hw = w / 2 + 2;
  const x0 = Math.min(jx, jx + dx * len) - hw - 2, x1 = Math.max(jx, jx + dx * len) + hw + 2;
  const y0 = Math.min(jy, jy + dy * len) - hw - 2, y1 = Math.max(jy, jy + dy * len) + hw + 2;
  for (let y = Math.floor(y0); y <= y1; y++)
    for (let x = Math.floor(x0); x <= x1; x++) {
      const rx = x - jx, ry = y - jy;
      const along = rx * dx + ry * dy;       // 沿肢体轴投影
      const across = rx * px + ry * py;      // 宽度方向投影
      if (along >= -2 && along <= len + 2 && Math.abs(across) <= hw) {
        const c = (along >= 0 && along <= len && Math.abs(across) <= w / 2) ? fill : stroke;
        setPx(b, x, y, c[0], c[1], c[2], c[3]);
      }
    }
}

// ---------- 5×7 点阵字（仅本工具需要的字母） ----------
const FONT = {
  A: [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  D: [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  E: [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  H: [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  I: [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b11111],
  K: [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  L: [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  R: [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  S: [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  T: [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  Y: [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100],
};
function label(b, text, cx, y, col) {
  const s = 3, gw = 6 * s; // 字宽 5 + 间距 1，横向放大 3
  let x = cx - (text.length * gw - s) / 2;
  for (const ch of text) {
    const gl = FONT[ch];
    if (gl) for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (gl[r] & (1 << (4 - c)))
          fillRect(b, x + c * s, y + r * s, x + (c + 1) * s - 1, y + (r + 1) * s - 1, col);
    x += gw;
  }
}

// ---------- 人形灰模：四姿势轮廓刻意拉开 ----------
// 约定：面向画面右；角度 0°=竖直向下，正角=朝 +x（前方）。
const FILL = [168, 172, 184, 255];   // 灰模本体
const STROKE = [58, 58, 70, 255];    // 深色描边（剪影可辨）
const INK = [230, 230, 236, 255];    // 水印字

function drawFigure(b, p) {
  const cx = 120 + (p.shiftX || 0);
  const hipY = 224 + (p.crouch || 0);           // 髋部（下蹲时下降）
  const shY = hipY - 96;                        // 肩
  const nkY = shY - 14;                         // 颈
  const hdY = nkY - 24 + (p.headDY || 0);       // 头心
  const hdX = cx + (p.headDX || 0);
  // 腿（髋为轴）：前腿/后腿分开角度
  limb(b, cx - 8, hipY, 112, 15, (p.legF !== undefined ? p.legF : 6), FILL, STROKE);
  limb(b, cx + 8, hipY, 112, 15, (p.legB !== undefined ? p.legB : -6), FILL, STROKE);
  // 躯干（肩为轴，len 向下画；lean 正=向画面右前倾）
  limb(b, cx, shY, 96, 34, (p.lean || 0), FILL, STROKE);
  // 手臂（肩为轴）
  limb(b, cx - 4, shY + 6, 74, 12, (p.armF !== undefined ? p.armF : 10), FILL, STROKE);
  limb(b, cx + 4, shY + 6, 74, 12, (p.armB !== undefined ? p.armB : -10), FILL, STROKE);
  // 头
  fillCircle(b, hdX, hdY, 24, STROKE);
  fillCircle(b, hdX, hdY, 20, FILL);
}

const POSES = {
  // idle：自然站姿，呼吸感
  idle: { shiftX: 0, crouch: 0, lean: 2, headDX: 2, legF: 7, legB: -7, armF: 12, armB: -12,
          tag: 'IDLE' },
  // ready：沉身格斗架，双拳提起护于身前
  ready: { shiftX: 4, crouch: 12, lean: 14, headDX: 10, legF: 22, legB: -16, armF: 52, armB: 38,
          tag: 'READY' },
  // strike：上步出拳，前拳平直打出，躯干猛前倾
  strike: { shiftX: 14, crouch: 6, lean: 30, headDX: 16, legF: 34, legB: -24, armF: 88, armB: -30,
          tag: 'STRIKE' },
  // hit：受击后仰，双臂扬起，重心后错
  hit: { shiftX: -8, crouch: 4, lean: -22, headDX: -12, headDY: -4, legF: 2, legB: -26, armF: -46, armB: -62,
          tag: 'HIT' },
};

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, p] of Object.entries(POSES)) {
  const b = newBuf();
  // 地面参考线（站立位置可读）
  fillRect(b, 24, 342, W - 24, 346, [90, 94, 110, 255]);
  drawFigure(b, p);
  label(b, p.tag, 120, 18, INK);
  const file = path.join(OUT_DIR, 'xiaofeng_' + name + '.png');
  fs.writeFileSync(file, encodePNG(b));
  console.log('OK', file);
}
