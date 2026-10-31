# 萧峰 4 姿势打样 QA 报告（QA.md）

> 日期：2026-10-31 ｜ 分支：feat/pose-assets ｜ 结论：**占位灰模交付（真 AI 图被阻塞）**

## 0. 总结论

本机没有任何带额度的生图 API（逐项实测见 `tools/gen_poses/PIPELINE.md`），
按简报铁律"**不伪造 AI 图**"执行降级方案：

- ✅ 交付 4 张**明确标注占位的灰模人形图**（剪影级，姿势差异明确）：
  `app/assets/portraits/poses_placeholder/xiaofeng_{idle,ready,strike,hit}.png`
- ✅ 管线调查 + 一键替换脚本就绪：`tools/gen_poses/gen_poses.py`
  （key 到位后 1 条命令出真 AI 图，流程见 PIPELINE.md 第 6 节）
- ⛔ 阻塞项：**需要丁工提供生图 API 渠道/额度**（推荐 pollinations gen 免费 key，
  GitHub 登录即得）

## 1. 逐姿势验收（目验记录）

目验方式：agent 逐张 read 亲看原始 PNG 与并排对比图（非文字自评）。

| 姿势 | 终选图 | 一句话一致性评价 | 与原版并排对比图 |
|------|--------|------------------|------------------|
| 待机戒备 idle | `app/assets/portraits/poses_placeholder/xiaofeng_idle.png` | 站姿直立、双臂垂于体侧，戒备感弱但轮廓清晰可辨；灰模阶段合格 | `tools/gen_poses/qa_compare/xiaofeng_vs_idle.png` |
| 起手沉身 ready | `app/assets/portraits/poses_placeholder/xiaofeng_ready.png` | 马步大开、双拳收腰，蓄力感强，4 张中姿势语言最到位 | `tools/gen_poses/qa_compare/xiaofeng_vs_ready.png` |
| 双掌前推 strike | `app/assets/portraits/poses_placeholder/xiaofeng_strike.png` | 弓步+双臂前上方推出，发力方向明确；剪影惯例表达"前推" | `tools/gen_poses/qa_compare/xiaofeng_vs_strike.png` |
| 受击后仰 hit | `app/assets/portraits/poses_placeholder/xiaofeng_hit.png` | 躯干明显后仰、单腿后撤、手臂甩出，受击动势清楚 | `tools/gen_poses/qa_compare/xiaofeng_vs_hit.png` |

**目验中发现并已修复的问题**（闭环：改前→改→再看→再改）：
1. 初版中文字为豆腐块（容器字体无 CJK）→ 换 Noto Sans CJK SC；
2. 初版 strike 一臂被躯干遮挡、脚出画 → 绝对角度参数化重写四肢；
3. strike 手掌伸进标题区、长标题溢出红框 → 手臂下压 + 标题自动缩字号；
4. hit 甩臂出红框 → 收角度。
终版 4 张均在框内、无文字遮挡、姿势两两差异明确。

**欠账（灰模方案固有，不视为缺陷但如实记录）：**
- 占位图**不代表**角色长相/衣装/画风，仅约定 4 个姿势的构图与动势；
- 真 AI 图接入后需按"脸崩/衣装变色/画风漂移 → 重生成"流程重新目验（QA 流程复用本表）。

## 2. 真 AI 图接入后的 QA 流程（预留）

1. `python3 tools/gen_poses/gen_poses.py --alts 3` 生成 4 姿势 × 3 备选；
2. 逐张目验：与 `xiaofeng.png` 并排对比（复用 `qa_compare/` 对比图思路），
   终选覆盖 `app/assets/portraits/poses/<pose>.png`；
3. 合格线（简报验收标准）：4 张姿势肉眼可辨差异、与原版萧峰像同一个人
   （重点看：红发带/络腮胡/棕袍白边/红腰带/16-bit 像素粗黑描边）；
4. 通过后 `git rm -r app/assets/portraits/poses_placeholder`。
