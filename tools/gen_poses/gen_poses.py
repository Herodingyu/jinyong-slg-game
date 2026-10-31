#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
萧峰 4 姿势立绘一键生成脚本（素材线 B 打样，真 AI 图管线）
==============================================================
生图 API key 到位后运行本脚本即可生成真 AI 姿势图，替换占位灰模：

    export IMAGE_API_KEY='sk-...'          # 必填：生图 API key（见 PIPELINE.md）
    export IMAGE_API_BASE='https://gen.pollinations.ai/v1'   # 默认：pollinations gen（OpenAI 兼容）
    export IMAGE_MODEL='black-forest-labs/flux.1-kontext-pro'  # 默认：支持垫图的角色一致性模型
    python3 tools/gen_poses/gen_poses.py

输出：
    app/assets/portraits/poses/<pose>.png        每姿势第 1 张（终选候选）
    app/assets/portraits/poses/alts/<pose>_2.png 备选（--alts N 控制张数，默认 2）

一致性策略（简报要求"同脸同衣装同画风"）：
    1. 垫图：把 app/assets/portraits/xiaofeng.png 以 data URI 传给支持参考图的模型
       （flux.1-kontext-pro / gpt-image-1.5 等，OpenAI 兼容 images API 的 image 参数）。
    2. 画风锁定词：STYLE_LOCK 固定"16-bit pixel art / SNES JRPG battle portrait /
       粗黑描边 / 白底"，与原版立绘一致。
    3. 每姿势生成 N 张备选，人工目验后选终选（见 QA.md 流程）。

依赖：纯标准库（urllib/base64/json），无需 pip。
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
REF_IMG = os.path.join(HERE, "..", "..", "app", "assets", "portraits", "xiaofeng.png")
OUT_DIR = os.path.join(HERE, "..", "..", "app", "assets", "portraits", "poses")
ALT_DIR = os.path.join(OUT_DIR, "alts")

API_KEY = os.environ.get("IMAGE_API_KEY", "")
API_BASE = os.environ.get("IMAGE_API_BASE", "https://gen.pollinations.ai/v1")
MODEL = os.environ.get("IMAGE_MODEL", "black-forest-labs/flux.1-kontext-pro")
SIZE = os.environ.get("IMAGE_SIZE", "1024x1024")

# 画风锁定词（与 app/assets/portraits/xiaofeng.png 一致：16-bit 像素、粗黑描边、白底）
STYLE_LOCK = (
    "detailed 16-bit pixel art, retro SNES JRPG battle portrait, chunky visible pixels, "
    "thick black outlines, cel shading, white plain background"
)
# 角色锁定词（垫图的第一道保险，描述与原版一致的外观）
CHAR_LOCK = (
    "the exact same character as the reference image: a fierce muscular Chinese wuxia "
    "warrior man around 30 years old, square jaw, short full black beard, intense eyes, "
    "long messy dark-brown hair tied with a RED headband, rough brown robe with white "
    "fur trim, red waist sash"
)
POSES = {
    "xiaofeng_idle":   "standing in alert combat-ready guard pose, both palms open at his sides",
    "xiaofeng_ready":  "sinking into a low horse stance, fists chambered at waist, charging power",
    "xiaofeng_strike": "lunging forward with BOTH palms thrust straight out in a powerful palm strike",
    "xiaofeng_hit":    "recoiling backward from a heavy hit, torso leaning far back, arms flung, pained stagger",
}


def data_uri(path: str) -> str:
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def request_image(prompt: str, ref_data_uri: str, retries: int = 4) -> bytes:
    """调用 OpenAI 兼容 images API，支持 429/402 重试（尊重 Retry-After）。"""
    body = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "image": ref_data_uri,          # 垫图（kontext/gpt-image 类模型支持）
        "size": SIZE,
        "response_format": "b64_json",
        "n": 1,
    }).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            API_BASE.rstrip("/") + "/images/generations",
            data=body, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + API_KEY})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.loads(r.read())
            item = resp["data"][0]
            if item.get("b64_json"):
                return base64.b64decode(item["b64_json"])
            if item.get("url"):          # 某些渠道只回 URL
                with urllib.request.urlopen(item["url"], timeout=120) as r:
                    return r.read()
            raise RuntimeError("响应里没有图像: " + json.dumps(resp)[:200])
        except urllib.error.HTTPError as e:
            wait = 30
            if e.headers.get("Retry-After"):
                try:
                    wait = int(e.headers["Retry-After"])
                except ValueError:
                    pass
            print(f"  HTTP {e.code}，{wait}s 后重试（{attempt + 1}/{retries}）…")
            if e.code in (401, 403):
                sys.exit("key 无效或无权限，请检查 IMAGE_API_KEY / IMAGE_MODEL。")
            time.sleep(wait)
    sys.exit("多次重试失败，放弃。可查 PROVIDER 文档或换 IMAGE_API_BASE。")


def main():
    if not API_KEY:
        sys.exit("请先 export IMAGE_API_KEY=...（获取方式见 tools/gen_poses/PIPELINE.md）")
    alts = int(sys.argv[sys.argv.index("--alts") + 1]) if "--alts" in sys.argv else 2
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(ALT_DIR, exist_ok=True)
    ref = data_uri(os.path.abspath(REF_IMG))
    for name, pose in POSES.items():
        prompt = f"{STYLE_LOCK}. {CHAR_LOCK}, {pose}. Keep the same face, same outfit and same pixel-art style as the reference image."
        for i in range(1, alts + 1):
            out = os.path.join(OUT_DIR if i == 1 else ALT_DIR,
                               f"{name}.png" if i == 1 else f"{name}_{i}.png")
            print(f"[{name}] 生成第 {i}/{alts} 张 → {out}")
            img = request_image(prompt, ref)
            with open(out, "wb") as f:
                f.write(img)
            time.sleep(3)                # 温和限速，避免触发 RPM
    print("完成。请按 tools/gen_poses/QA.md 流程人工目验选终选。")


if __name__ == "__main__":
    main()
