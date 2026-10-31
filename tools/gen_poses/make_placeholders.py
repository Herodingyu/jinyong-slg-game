#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
萧峰 4 姿势占位灰模生成器（降级方案，素材线 B 打样）
=========================================================
背景：本机暂无可用生图 API（详见 tools/gen_poses/PIPELINE.md），
按任务简报降级方案生成"明确标注占位的灰模人形图"：
  - 剪影级人形（头/躯干/四肢可辨），4 个姿势差异明确
  - 图上大字标注"占位灰模"，杜绝与真 AI 立绘混淆
  - 输出 1024x1024 PNG → app/assets/portraits/poses_placeholder/

真 AI 姿势图接入后，本脚本产物整体废弃即可（文件名一一对应，见 PIPELINE.md）。

依赖：Pillow（pip install pillow）
用法：python3 make_placeholders.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

# ---------- 常量 ----------
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "..", "app", "assets", "portraits", "poses_placeholder")
SIZE = 1024
GRAY = (136, 136, 136, 255)      # 人形主灰
GRAY_D = (102, 102, 102, 255)    # 深灰（关节/发髻）
LINE = (70, 70, 70, 255)         # 轮廓线
RED = (200, 40, 40, 255)         # 占位警示红

# 四肢角度约定：屏幕极角，0°=向右，90°=向下，180°=向左，270°=向上
DOWN, RIGHT, LEFT, UP = 90, 0, 180, 270


def polar(p, length, deg):
    """从点 p 沿角度 deg 走 length 像素。"""
    a = math.radians(deg)
    return (p[0] + length * math.cos(a), p[1] + length * math.sin(a))


def font(size: int) -> ImageFont.FreeTypeFont:
    """优先 Noto Sans CJK SC（简体），退回 DejaVu/默认。"""
    noto = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    if os.path.exists(noto):
        return ImageFont.truetype(noto, size, index=2)  # index2 = SC
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def capsule(draw: ImageDraw.ImageDraw, p1, p2, w, fill=GRAY):
    """粗线段（四肢）：圆头圆尾的胶囊形。"""
    draw.line([p1, p2], fill=fill, width=w)
    r = w // 2
    for p in (p1, p2):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def outline_capsule(draw, p1, p2, w):
    """胶囊外描边（沿线段两端画粗轮廓圆）。"""
    r = w // 2
    for p in (p1, p2):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r],
                     outline=LINE, width=5)


def joint(draw, p, r=17):
    draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GRAY_D)


def draw_figure(draw, cx, lean,
                l_arm, r_arm, l_leg, r_leg):
    """参数化画人形。
    lean: 躯干倾角（度，+后仰/-前倾，绕髋旋转）
    l_arm/r_arm: (上臂绝对角, 前臂绝对角)；l_leg/r_leg: (大腿绝对角, 小腿绝对角)
    """
    hip = (cx, 585)                        # 髋中心
    shoulder = polar(hip, 215, UP - lean)  # 肩中心随躯干倾角

    # ---- 腿：髋→膝→踝 ----
    for (spread, bend) in (l_leg, r_leg):
        hip_j = polar(hip, 52, LEFT - lean) if (spread, bend) == l_leg else polar(hip, 52, RIGHT - lean)
        knee = polar(hip_j, 165, spread)
        foot = polar(knee, 155, bend)
        capsule(draw, hip_j, knee, 64)
        capsule(draw, knee, foot, 56)
        outline_capsule(draw, hip_j, knee, 64)
        outline_capsule(draw, knee, foot, 56)
        joint(draw, knee)
        # 脚（朝小腿方向压扁的椭圆）
        draw.ellipse([foot[0] - 42, foot[1] - 22, foot[0] + 42, foot[1] + 22],
                     fill=GRAY, outline=LINE, width=5)

    # ---- 躯干（圆角梯形，随倾角）----
    def L(p):  # 跟随躯干旋转的点（绕髋）
        a = math.radians(lean)
        dx, dy = p[0] - cx, p[1] - hip[1]
        return (cx + dx * math.cos(a) - dy * math.sin(a),
                hip[1] + dx * math.sin(a) + dy * math.cos(a))
    top_l, top_r = L((cx - 78, 400)), L((cx + 78, 400))
    bot_l, bot_r = L((cx - 85, 615)), L((cx + 85, 615))
    draw.polygon([top_l, top_r, bot_r, bot_l], fill=GRAY, outline=LINE, width=6)

    # ---- 臂：肩→肘→手 ----
    for side, (ua, fa) in (("l", l_arm), ("r", r_arm)):
        sh_j = polar(shoulder, 100, LEFT if side == "l" else RIGHT)
        elbow = polar(sh_j, 158, ua)
        hand = polar(elbow, 148, fa)
        capsule(draw, sh_j, elbow, 56)
        capsule(draw, elbow, hand, 50)
        outline_capsule(draw, sh_j, elbow, 56)
        outline_capsule(draw, elbow, hand, 50)
        joint(draw, elbow)
        # 掌（圆形，剪影级即可辨）
        draw.ellipse([hand[0] - 36, hand[1] - 36, hand[0] + 36, hand[1] + 36],
                     fill=GRAY, outline=LINE, width=5)

    # ---- 头 + 发髻（萧峰束发特征） ----
    head_c = (shoulder[0], shoulder[1] - 88)
    draw.ellipse([head_c[0] - 78, head_c[1] - 88, head_c[0] + 78, head_c[1] + 88],
                 fill=GRAY, outline=LINE, width=6)
    bun = polar(head_c, 108, UP - lean)
    draw.ellipse([bun[0] - 32, bun[1] - 30, bun[0] + 32, bun[1] + 30],
                 fill=GRAY_D, outline=LINE, width=4)


def label(draw, title, subtitle):
    f1, f2, fw = font(76), font(42), font(44)
    while draw.textlength(title, font=f1) > 920 and f1.size > 40:
        f1 = font(f1.size - 6)
    draw.text((SIZE // 2, 64), title, font=f1, fill=(40, 40, 40, 255),
              anchor="mm", stroke_width=1, stroke_fill=(40, 40, 40))
    draw.text((SIZE // 2, 142), subtitle, font=f2, fill=(90, 90, 90, 255), anchor="mm")
    # 大红占位警示
    draw.text((SIZE // 2, SIZE - 60), "PLACEHOLDER 占位灰模 — 非 AI 立绘",
              font=fw, fill=RED, anchor="mm")
    # 四角警示框
    draw.rectangle([16, 16, SIZE - 16, SIZE - 16], outline=RED, width=10)


# ---------- 4 姿势定义（角度见模块头约定） ----------
POSES = {
    # 文件名: (中文名, 英文提示, 躯干倾角, 左臂(上臂,前臂), 右臂(上臂,前臂), 左腿(大腿,小腿), 右腿(大腿,小腿))
    "xiaofeng_idle": (
        "待机戒备", "idle guard, palms at sides",
        0, (115, 112), (65, 68), (100, 100), (80, 80)),
    "xiaofeng_ready": (
        "起手沉身·马步蓄力", "ready stance, horse stance charge",
        -8, (150, 35), (30, 145), (140, 85), (40, 95)),
    "xiaofeng_strike": (
        "双掌前推·降龙十八掌", "twin palm strike, lunge forward",
        -6, (228, 222), (312, 318), (118, 112), (62, 68)),
    "xiaofeng_hit": (
        "受击后仰", "hit reaction, stagger back",
        28, (202, 232), (342, 22), (97, 97), (122, 62)),
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, (cn, en, lean, la, ra, ll, rl) in POSES.items():
        img = Image.new("RGBA", (SIZE, SIZE), (250, 250, 250, 255))
        d = ImageDraw.Draw(img)
        draw_figure(d, SIZE // 2, lean, la, ra, ll, rl)
        label(d, f"萧峰 · {cn}", f"POSE: {en}")
        out = os.path.join(OUT_DIR, f"{name}.png")
        img.save(out)
        print("已生成:", out)


if __name__ == "__main__":
    main()
