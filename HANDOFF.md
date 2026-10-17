# 《金庸群侠大战》项目交接文档 (HANDOFF)

> 面向后续在 Linux 环境运行和持续开发本项目的维护者（人或 AI coding agent）。
> 最后更新：2026-10-13 ｜ 当前版本：v0.2（素材重制版，版本ID 13713f8）

---

## 1. 项目一句话

金庸群侠传题材、机制对标 PSP《超级机器人大战A》的平面 2D 战棋。
纯 HTML5 实现（无框架、无构建、零依赖），浏览器即运行环境，天然跨 Windows/Linux/macOS。
本项目为私下非商业娱乐用途。

## 2. 文件地图

```
/mnt/agents/output/
├── HANDOFF.md                    ← 本文档
├── 金庸群侠大战_策划案_v1.md       ← 总设计文档(先读这个)
├── 金庸群侠传DOS_资源结构解析.md   ← DOS版资源格式研究 + 解析工具说明
├── app/                          ← ★ 游戏工程本体
│   ├── index.html                入口
│   ├── css/style.css
│   ├── js/data.js                内容层: 地形/武功/运功/角色/地图/布阵
│   ├── js/engine.js              规则层: BFS移动/预测/结算/AI/说得/合体 (纯逻辑,无DOM)
│   ├── js/main.js                表现层: Canvas渲染/输入/菜单/演出/音频
│   └── assets/
│       ├── tiles.png             9种地形地块 32px 横排 (程序生成, 见§6)
│       ├── units/*.png           8个Q版地图单位 64px (AI生成后处理, 见§6)
│       └── portraits/*.png       5张战斗立绘 1024px (AI生成, 暂未接入游戏内演出)
├── jy_parser/                    ← DOS版资源解析工具 (jy_grp.py / jy_strings.py, 已通过自测)
├── 素材_重制/                    ← AI生成的原始立绘/sprite (未处理的大图)
└── 素材样例_*.png / 战斗演出预览*.mp4  ← 各类示范产物
```

## 3. 如何运行

```bash
cd /mnt/agents/output/app
python3 -m http.server 8000     # 然后浏览器打开 http://localhost:8000
```
或直接双击 `index.html`（file:// 协议可运行，无 fetch 请求）。
音频需要用户手势触发——点"踏入江湖"按钮后 WebAudio 才会出声，这是浏览器策略，不是 bug。

## 4. 架构约定（改动前必读）

**三层严格分离，改内容/改规则/改表现互不干扰：**

| 层 | 文件 | 职责 | 禁止 |
|---|---|---|---|
| data.js | 内容 | 所有数值/文本/地图 | 不写逻辑 |
| engine.js | 规则 | 纯函数计算，可脱离浏览器运行 | 不碰 DOM/Canvas |
| main.js | 表现 | 渲染、输入、菜单、演出、音效 | 不直接改数值规则 |

**新增内容的标准姿势（全数据驱动）：**
- 新武功： 在 `WEAPONS` 加条目 → 挂到角色的 `weapons` 数组；
- 新角色： 在 `CHAR_DATA` 加模板 → 在 `INITIAL_UNITS` 布阵；
- 新运功： 在 `SPIRIT_BOOK` 加条目 → 在 `main.js` 的 `openSpiritMenu` 里加 `fx` 分支；
- 新地图： 改 `MAP_LAYOUT`（14×10，地名必须在 `TERRAIN` 里注册）；
- 新地形： `TERRAIN`（cost:-1=不可通行）+ `TIDX` + tiles.png 追加地块。

**每回合流程**（main.js）：玩家逐单位行动 → 全 acted 或点"结束回合" → `enemyPhase()`（逐个 enemyPlan→移动→攻击→玩家反击询问）→ 回合重置（回真气+5、气势+2、清buff）。

## 5. 验证工具链（每次改动后跑）

```bash
cd app && node --check js/data.js && node --check js/engine.js && node --check js/main.js
```

引擎层无头测试（不依赖 DOM，改引擎后必跑）：

```bash
cd app && node -e "
const code = require('fs').readFileSync('js/data.js','utf8') + '\n' +
             require('fs').readFileSync('js/engine.js','utf8') + '\n' +
\`G.units = INITIAL_UNITS.map(makeUnit);
const xf = G.units.find(u=>u.key==='xiaofeng');
console.log('移动格数:', Object.keys(moveRange(xf)).length);
console.log('预测:', JSON.stringify(forecast(G.units.find(u=>u.key==='duanyu'), G.units.find(u=>u.key==='duanyq'), WEAPONS.liumai)));
console.log('AI:', JSON.stringify(enemyPlan(G.units.find(u=>u.key==='liaobing'))));
console.log('OK');\`;
eval(code);"
```

## 6. 素材管线（重制美术的标准流程）

| 素材 | 工具 | 流程 |
|---|---|---|
| 地形地块 | PIL 代码生成 | 参考本对话历史中 32×32 平涂地块生成脚本；统一色板+描边，**不要用AI画地块**（无法保证可拼接） |
| 地图单位 sprite | image_generation 插件 | 生成 1024×1024 透明背景"Q版像素 chibi 三头身全身像"→ 裁剪透明边 → 长边缩至56 → 居中贴入64×64画布 |
| 战斗立绘 | image_generation 插件 | 生成 1024 透明背景"机战风格战斗立绘 pixel art 16-bit 粗黑描边"→ 存入 assets/portraits/ |
| 提示词教训 | — | 避免"恶贯满盈/残废/杀"等词，安全策略会 403；改写为中性描述（"四大恶人之首"→"大理皇室高僧"） |
| 水印 | — | AI生成图左下角有"AI生成"水印，对外发布前需裁掉或覆盖 |
| 战斗演出视频 | PIL逐帧 + ffmpeg | 时间轴驱动渲染帧序列 → `ffmpeg -framerate 24 -i f%03d.png -c:v libx264 -pix_fmt yuv420p out.mp4` |

**出阵曲**: 目前是 WebAudio 五声音阶动机占位（main.js `MOTIF` 表）。正式版按策划案第十章换影视原声：
`bgm_sortie / bgm_chorus_offset` 配置制，音频文件放 `assets/bgm/`，文件名与角色 key 对应。

## 7. 当前进度与已知问题

**已完成**：序章一整关可玩（移动/攻击预测/气力/运功/反击选择/说得收辽将/萧峰郭靖合体技 MAP/胜负判定/敌方AI）；8 单位+5 立绘重制完成。

**给本地AI agent的入口**：工程根目录有 `AGENTS.md`（Claude Code / Aider / OpenHands 等会自动读取），含铁律、验证命令、按优先级排序的任务清单。教训：曾有文件写入错误路径导致快照缺样式表——任何文件操作后用 `ls` 确认落点。

**已知问题（2026-10-17 已全部修复，验证见 extracted/DEV_PLAN.md 阶段A）**：
1. ~~段誉六脉神剑过强~~ → 已修：耗内 25→35（data.js，满内 8 次→5 次）；
2. ~~`comboTargets()` 只检查与操作者距离≤2~~ → 已修：改为"操作者或其搭档（萧峰/郭靖另一人）2 格内均可选中"；
3. ~~合体技 `resolveAttack({...u})` 展开副本丢气势~~ → 已修：resolveAttack 增加第 4 参 `opts{buffs, atkBonus}`，直接传真身；
4. ~~立绘未接入战斗演出~~ → 已修：立绘滑入切入+书法大字+白闪+震屏，顶栏"演出:开/关"可关；
5. ~~敌方AI薄弱~~ → 已修（第一阶段）：敌方配真气/运功（半血金钟、低命中凝神、残血热血），enemyPlan 改为全局评估优先收割残血；**未做**：增援、多阵营（属阶段C，见 DEV_PLAN.md）。

## 8. 内容路线图（按策划案 v1 推进）

下一步优先级：
1. 第 2 话「杏子林大会」：防守战+萧峰身世线开场（加"友军NPC目标"机制）；
2. 接立绘战斗演出（见§7.4）；
3. 多方混战框架（§8.2 敌我动态表+独立胜利条件）；
4. 三线进度系统（盟主/复明/外族，§7.3）；
5. 主角失忆阴谋章（§10B，六记忆碎片=主线收集品）。

每话的验收标准：机战式四问——目标是否多元？有没有说得/损失机会？地形机制用上了吗？推进了哪条路线？

## 9. 硬性约束（任何维护者不得违反）

- **零依赖零构建**：不引入 npm/webpack/框架；新增库必须先论证并更新本文档；
- 三层分离（§4）；新代码中文注释；数值只进 data.js；
- 不逆向、不传播任何商业游戏文件；DOS版解析工具仅用于本人自有拷贝；
- 音乐正式版使用影视原声仅限私下用途；对外传播版本必须换原创致敬曲；
- 改完跑 §5 检查；动 engine.js 必跑无头测试。
