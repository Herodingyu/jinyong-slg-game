# 萧峰姿势立绘生成管线调查（PIPELINE.md）

> 调查日期：2026-10-31 ｜ 调查人：素材线 Agent 1 ｜ 分支：feat/pose-assets
> 结论先行：**本机当前没有任何可用的"带额度生图 API"，无法产出合格的真 AI 姿势图，
> 已按降级方案交付占位灰模（见第 5 节）。key 到位后一键替换流程见第 6 节。**

---

## 1. 需求回顾

以 `app/assets/portraits/xiaofeng.png`（1024px 16-bit 像素风半身立绘）为角色一致性参考，
生成同脸同衣装同画风的 4 张姿势图（idle 戒备 / ready 马步蓄力 / strike 双掌前推 / hit 受击后仰），
每姿势 2-3 张备选，存入 `app/assets/portraits/poses/`。

**关键约束：需要"垫图/参考图"能力**（img2img 或角色参考），纯文生图保证不了"像同一个人"。

## 2. 当初 5 张立绘是怎么生成的（考古结论）

- `HANDOFF.md §6 素材管线` 记载：战斗立绘与地图 sprite 均用 **openclaw 的 `image_generation` 插件**生成，
  提示词风格为"机战风格战斗立绘 pixel art 16-bit 粗黑描边"。
- 该插件是当时的 clawhub/openclaw 插件，**现已不在本机**（`~/.openclaw/extensions/` 无此插件，
  clawhub 已安装列表里也没有），当初用的渠道/额度未留下 key，无法复用。
- 项目 `tools/`、`scripts/` 里没有任何生图脚本（只有截图/录屏/测试脚本），
  立绘在首个快照 commit（c99df84）中就已是成品 PNG。

## 3. 本机图像生成能力排查（逐项实测）

| # | 渠道 | 实测结果 | 判定 |
|---|------|----------|------|
| 1 | env 变量 | 仅有 `KIMI_API_KEY`/`KIMI_PLUGIN_API_KEY`（sk-kimi，文本网关）与 openclaw 内部 token；无 OPENAI/GEMINI/BFL/REPLICATE/LEONARDO/IDEOGRAM/MODELSCOPE/DASHSCOPE 等任何生图 key | ❌ |
| 2 | `~/.config`、`~/.openclaw`、`~/.opencode.json`、`/root` 点文件 | 无可用生图凭证（feishu 凭证与图片无关） | ❌ |
| 3 | Kimi 网关 `agent-gw.kimi.com/coding`（key 有效） | 模型列表仅 `k3-agent`/`k2d8-preview` 纯文本（支持图片**输入**）；`/v1/images/generations` → 404；chat 探针直答 NO_IMAGE | ❌ 不能生图 |
| 4 | Pollinations **Classic**（免费免 key，`image.pollinations.ai`） | 真 AI 图，但：固定 sana 单模型、**实测忽略垫图参数**（传了 xiaofeng 图完全无效）、像素艺术风格崩坏、限 768×768 面积、45s/IP 且高峰持续 503、右下角带 logo | ❌ 一致性不达标 |
| 5 | Pollinations **gen**（`gen.pollinations.ai`，OpenAI 兼容，全模型含 flux.1-kontext-pro 垫图） | 接口正常但**生成必须 sk_ key**（enter.pollinations.ai 注册，GitHub 登录有免费 pollen 额度） | ⚠️ **推荐渠道，缺 key** |
| 6 | kimi-webbridge 浏览器通道（用丁工浏览器登录态生图） | daemon 可启动，但**浏览器扩展未连接**（丁工浏览器不在线）；且依赖 Kimi 网页版生图额度 | ⚠️ 需丁工在线配合 |
| 7 | Hugging Face Spaces（FLUX.1-Kontext 等免费 Space） | 本机网络**连不上 huggingface.co/hf-mirror.com**（Errno 101） | ❌ 网络不通 |
| 8 | 国内官方生图 API（ModelScope/SiliconFlow/智谱/阿里 DashScope） | 网络可达，但全部需要 key，本机均无 | ❌ 缺 key |

**补充：clawhub 上有现成生图 skill**（`image-generation`、`imgforge` 等）已调研，
其本质同样是调上述官方 API——没有 key 一样跑不通，key 到位后可直接用或参考其提示词工程。

## 4. 可用渠道速查表（key 到位后）

| 渠道 | 模型（角色一致性） | 调用方式 | 成本 | 速率限制 |
|------|--------------------|----------|------|----------|
| **Pollinations gen**（推荐，接入最快） | `black-forest-labs/flux.1-kontext-pro`（垫图编辑） | OpenAI 兼容 `POST https://gen.pollinations.ai/v1/images/generations` | GitHub 登录送免费 pollen；超额按 pollen 计费 | 按 key，无 IP 共享限制 |
| OpenAI | `gpt-image-1.5`（支持 references） | 官方 Images API | $0.13-0.19/张（1024²） | 按 tier RPM |
| Google | `gemini-2.5-flash-image`（Nano Banana，多轮编辑） | Gemini API generateContent | 免费档有日额度 | 免费档 10 RPM |
| BFL | `flux-kontext-pro` | `api.bfl.ml` | ~$0.04-0.08/张 | 按账户 |

示例（curl 即可验证，垫图用 data URI 或公网 URL）：

```bash
curl https://gen.pollinations.ai/v1/images/generations \
  -H "Authorization: Bearer $IMAGE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "black-forest-labs/flux.1-kontext-pro",
    "prompt": "16-bit pixel art SNES JRPG battle portrait, same character as reference, standing guard pose",
    "image": "data:image/png;base64,<xiaofeng.png 的 base64>",
    "size": "1024x1024"
  }'
```

## 5. 降级方案交付（本次已完成）

因上述渠道全部不可用，**不伪造 AI 图**，已按简报第 3 条执行：

- `app/assets/portraits/poses_placeholder/xiaofeng_{idle,ready,strike,hit}.png`
  —— Python PIL 程序化生成的**剪影级灰模人形**（头/躯干/四肢/关节可辨），
  4 个姿势差异明确，图上大字标注"PLACEHOLDER 占位灰模 — 非 AI 立绘"+红色警示框，
  杜绝与真立绘混淆。生成脚本：`tools/gen_poses/make_placeholders.py`（可复现）。

## 6. 需要丁工提供 & 一键替换流程

**需要丁工提供（任一即可）：**
1. 【推荐】GitHub 账号在 https://enter.pollinations.ai 登录拿一个 pollinations sk_ key
   （免费 pollen 额度足够 4 姿势 × 3 备选打样）；
2. 或任意官方生图 key（OpenAI / Gemini / BFL 等）+ 角色一致性模型名。

**拿到 key 后（全自动，约 5-10 分钟）：**

```bash
cd /tmp/jy-assets
export IMAGE_API_KEY='sk-...'                # pollinations key 直接用默认 BASE/MODEL
python3 tools/gen_poses/gen_poses.py --alts 3   # 4 姿势 × 3 备选 → poses/ 与 poses/alts/
# 人工目验（QA.md 流程），把终选覆盖为 poses/<pose>.png
# 确认后删除占位灰模：
git rm -r app/assets/portraits/poses_placeholder
```

`gen_poses.py` 已内置：垫图（xiaofeng.png data URI）+ 画风/角色双锁定提示词 +
429/402 重试（尊重 Retry-After）。换官方渠道只需改 `IMAGE_API_BASE`/`IMAGE_MODEL` 环境变量，
脚本接口是 OpenAI 兼容 `images/generations`，三家通用。

## 7. 已知风险与提示词教训

- 安全策略会 403：避免"杀/残废/恶贯满盈"等词（HANDOFF.md 既有教训）。
- AI 生成图可能带水印：对外发布前裁掉/覆盖。
- 像素风 consistency 最稳的做法是 kontext 垫图 + 锁定词双保险；
  备选之间差异大属正常，按 QA.md 目验选终选，脸崩/衣装变色/画风漂移的直接重生成。
