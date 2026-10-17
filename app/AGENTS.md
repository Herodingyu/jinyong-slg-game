# AGENTS.md — 本仓库的AI开发规范

你是《金庸群侠大战》的维护者。机战A式金庸战棋,纯HTML5,零依赖零构建。
总设计见上级目录 `金庸群侠大战_策划案_v1.md`,完整交接见 `HANDOFF.md`(先读它再动手)。

## 铁律
1. 不引入 npm/webpack/任何框架; Vanilla HTML/CSS/JS only。
2. 三层分离: `js/data.js`只放内容, `js/engine.js`只放纯规则(禁止DOM), `js/main.js`只管表现。
3. 数值只进 data.js; 地图尺寸固定 14×10(改尺寸需同步改 engine.js 的 W/H 和 main.js 的 canvas 尺寸)。
4. 禁止改动 `assets/` 下现有文件名; 新素材新增文件。
5. 本项目私下娱乐用途; 不要加入任何联网请求/统计/外部CDN。

## 每次改动后必跑
```bash
cd app && node --check js/data.js && node --check js/engine.js && node --check js/main.js
```
改了 engine.js 还要跑 HANDOFF.md §5 的无头测试脚本(验证移动/预测/AI/说得/合体)。

## 运行
```bash
cd app && python3 -m http.server 8000   # 打开 http://localhost:8000
```

## 当前任务优先级(按序做,做完一项更新此清单)
- [x] P1 接入立绘战斗演出: main.js `animateEvent` 换成 预览视频同款(assets/portraits/ 已有5张立绘): 出招时立绘切入+书法大字+白闪+受击抖动+伤害飘字, 可设"演出:开/关"。
- [x] P2 平衡: 六脉神剑耗内25→35; 修 `comboTargets()` 应同时测郭靖位置; 合体技 resolveAttack 副本问题(气势增减丢失)。
- [x] B1 战斗场景化(DEV_PLAN阶段B1): 攻击事件期间战场缩略图置底(缩放40%+暗色遮罩); HP条逐格递减动画(每格40ms, 会心25ms+红字, 机战式大HP条+数字同步跳动); 演出结束恢复战场; 演出关时一切从简; 新增 `node tools/test_fx_b1.js` 演出层冒烟测试。
- [ ] P3 第2话「杏子林大会」: 防守战(护住NPC马夫人5回合)+萧峰离队事件+第二场说得。
- [ ] P4 多关卡框架: data.js 加 CHAPTERS 数组, 过关后进入下一话, localStorage 存档(章节+角色成长)。
- [ ] P5 手机适配: 响应式布局, 横屏提示, 触屏点击优化。

## 已完成记录(2026-10-17)
- HANDOFF §7 全部5项: 六脉神剑耗内35; comboTargets 改为"操作者或搭档2格内可选中"; resolveAttack 增加 opts{buffs,atkBonus} 参数, 合体技不再用展开副本; 立绘切入演出(FX状态机+draw覆盖层, 顶栏"演出"开关); 敌方AI(真气/运功配给+enemySpirit决策: 半血金钟/低命中凝神/残血热血, enemyPlan改为全局面评估优先收割)。
- 验证: node --check ×3 + §5无头测试 + 19项专项断言全过。详见 extracted/DEV_PLAN.md 阶段A。
- B1(2026-10-17): 只动 main.js + 新增 tools/test_fx_b1.js(DOM桩冒烟测试)。engine/data 未动, §5无头测试基线一致(移动22格/预测/AI形状不变), B1演出层测试 17/17 通过。
- B1评审修复(2026-10-17): 逐格语义从"1HP/格"改为"maxhp/10 分段跳变"(原限速到亚毫秒无逐格感); hpAnim 清理移入 finally 防异常残留。

## 提交规范
每次完成一个任务: 更新本文件的勾选框, 并在 git commit message 里写清"做了什么+为什么"。
