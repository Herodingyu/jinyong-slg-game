# 每日改进队列 IMPROVE

> 由 AUDIT.md（严苛玩家评审）派生，按严重度排序。
> 规则：**每天从队首取 1-3 项，做完才准碰下一项**；每项必须验证+录屏/截图证据。
> 完成一项在方框打勾、在 DEV_PLAN.md 对应位置补完成记录。
> 新发现的问题追加到 AUDIT.md 末尾，由评审人（每日任务）重新定级入队。

## P0 · 体验断裂（每局必遇，最先修）

- [x] **P0-1 miss/闪避演出** ✅ 2026-10-19（证据 /tmp/p0_miss_dodge.jpg，commit 021ea14）
- [x] **P0-2 敌方回合反击自动化**：敌方攻击我方时不再弹 modal 冻结流程；按设定自动决策（默认最优反击，可被「演出开关」旁新增「手动反击」开关切回）。「取消」按钮语义一并理清。 ✅ 2026-10-19（附带修复：手动模式点「取消」Promise 永不 resolve 的卡死 bug；证据 /tmp/p0_enemy.jpg）
- [x] **P0-3 悬停地形信息**：鼠标悬停格子，右侧面板显示地形名/回避/防御/移动成本（数据从 TERRAIN 读，FE 式）。 ✅ 2026-10-19（证据 /tmp/p0_enemy.jpg 右侧面板）
- [x] **P0-4 选中面板立绘头像**：showInfo 时显示 portraits/ 头像（无立绘角色用 sprite 放大回退）。✅ 2026-10-20（证据 /tmp/fday2/after_p04_xiaofeng.jpg · after_p04_liaobing.jpg）

## P1 · 演出补齐

- [x] **P0-4 选中面板立绘头像**：showInfo 时显示 portraits/ 头像（无立绘角色用 sprite 放大回退）。✅ 2026-10-20（同上）
- [x] **P1-5 击破定格+台词**：FIGHT 内 ev.killed 时白闪定格 ~500ms + 攻方 motto 大字（data.js 已备 motto 字段）。✅ 2026-10-20（白闪定格500ms→击破金字→攻方胜利台词错峰入场；证据 /tmp/fday2/after_p15_freeze.jpg · text.jpg · text2.jpg）
- [x] **P1-6 运功演出**：发动时「凝神！」「热血！」等 buff 名大字+角色色闪，地图单位头顶小字。✅ 2026-10-20（立绘cutin复用/无立绘大字居中/角色色双扩散环覆盖层置顶/头顶小字；证据 /tmp/fday2/ring_150.jpg · after_p16_spirit_hero.jpg · after_p16_enemy.jpg）
- [x] **P1-7 合体技双立绘同框**：萧左郭右同时入画、组合技大字、双动机接力。✅ 2026-10-22（ev.partner 注入(规则层零改动)；FIGHT.comboPartner 双立绘同框+蓄力光球双人间聚合；接力=主攻命中后搭档晚130ms突进46px+13°前送再回弹(静止帧可读)；金色「双侠镇襄阳」48px+合璧副题；底部血条「萧峰·郭靖」合璧名；证据 evidence/fday4_before/combo_*.jpg → fday4_after/combo_*.jpg）
- [x] **P1-8 开场镜头调度**：开场横幅后镜头扫场（或敌我位置脉冲高亮一圈），让玩家第一眼定位。✅ 2026-10-22（点「踏入江湖」触发3.4s镜头: 推近1.45x→我方(蓝圈点名)→敌方(红圈)→BOSS(金圈压轴)→ease回全图; 画布=地图尺寸故变焦换扫场空间, pan钳制不留空边; 点击跳过+吞点击不误触选中; endTurn 开场期禁用; 演出关直接跳过; 证据 evidence/fday4_after/intro_*.jpg）
- [x] **P1-9 战斗立绘"人带招"·puppet 分层动画**（🔴 丁工 10-20 点名：人物不会动——**已升队首并完成**）

  机战A 是逐帧动作，我们零新素材，用 canvas 立绘 puppet（伪骨骼）逼近：
  1. **三层切分**：立绘按 头(顶~22%)/躯干(中56%)/腿(底22%) 三层 drawImage 独立变换（比例做成常量可调，不同立绘姿势差异靠常量修正）
  2. **攻方动作时间轴**（接入现有 FT enter/charge/strike/hit/out）：
     - 待机：躯干 scaleY 1±0.012 呼吸 + 头部微侧 1.5°
     - 蓄力(charge)：整体下蹲 scaleY 0.95 + 头部前倾 4°（沉身运劲）
     - 出招(strike)：躯干 rotate −8° 前送 + 头部 −5° + 腿部后蹬（攻击动作的核心帧）
     - 收招：easeOutBack 过冲回弹归位
  3. **守方受击**：头部后仰 +12° + 躯干 rotate +10° + scaleY 0.94（被打弯腰）→ 回弹颤动两次（crit 加双影+白闪加强）
  4. **miss 侧闪**：整体 rotate 配合现有位移，身体侧倾
  5. **验收**：改前/改后录屏同一段攻击对比，丁工的标准="看得出这个人在出招/在挨打"；自评一句哪里还不像机战
- [x] **P1-10 演出可跳过**（机战 × 键）：FIGHT 期间点击 canvas → 立即收招回战场。✅ 2026-10-21

## P2 · 地图活性

- [x] **P2-9 地块微动效**：选中格呼吸高亮 + 水面/旗帜动态（程序动画，零素材）。✅ 2026-10-23（范围高亮/选中框/水波/雪闪/竹影/草叶全部走 sin(now) 相位程序动画：移动范围蓝格 240ms 相位整体明灭、选中黄框外加 200ms 金光呼吸圈、水泽三条波线各自相位明暗+一条~4s 周期流动波光、雪地每格一颗冰晶明灭+峰值十字星光、竹林竹影/草叶微风按格相位错开；纯表现层，engine/data 零改动）
- [x] **P2-10 单位占比**：sprite 绘制 64→80px 或镜头 1.25x，对齐 SRW 单位占比。✅ 2026-10-23（取 78px 脚底锚定——底部对齐格底-2、头顶探入上一格，FE/SRW 惯例的格边微溢出；框/HP条/名字仍按 64px 格子画，格子标记≠人物轮廓；78 而非 80 是给 sprite 顶部留白留余量，防贴脸溢出到上格单位名）

## P3 · 系统层（与 DEV_PLAN C/D/E 并轨）

- [x] **P3-11a 剧情对白演出**（AUDIT#14，机战式第一话标配）：立绘对白框系统（portraits 已有 5 张）+ 章节标题卡 + 出击画面。先于存档/经验做——这是老玩家长期记忆点。✅ 2026-10-24（标题卡 2.6s 擦拭+点击跳过 → 镜头扫场与 7 句对白同播（打字机 42ms/字，首击补全再击翻页，空格/回车同权）→ 出击画面名册滑入+「出击！」爆字 → 开战横幅；内容全在 data.js STORY，main.js 纯演出；fxOff 直开战；inputPulse 计数器驱动与选中/攻击输入隔离）
- [x] **P1-11 机战式出招流程重构**（丁工 2026-10-23 08:36 点名）：SRW 流程=发招阶段**只有攻方自己在画面**（招式演完）→ **击打瞬间守方才登场**（受击姿态入场+白闪）→ 受击完毕守方退场收势。✅ 2026-10-25（三段重排: 发招期守方完全不绘制+攻方推近1.16x向中央偏移[脚底锚定不飘]独占镜头位; tStrike-80ms守方从右屏外被打入画面[tStrike+40ms到位]+白闪遮住入画点; 峰值落定后驻留~130ms随即右滑退场+淡出, 攻方独占收势; 击破改定格在场→击破大字播放时倒下淡出[defSink44px]; 守方HP条随登场/退场淡入出; FT.out 1740→2080退场段可读; 命中帧切回双人对峙位; 纯表现层engine/data零改动; 证据 evidence/fday8_before/*.jpg → fday8_after/*.jpg[hit_0800独占→hit_1150登场→hit_1700退场中→hit_exit_1900独占收势→kill_2200击破定格+消散] · test_fx_b1 17/17 · regress_day6 五幕全绿零pageerror[剧情链接管+evaluate-await陷阱修复]）
- [x] **P1-12 每招式差异化动作编排**（丁工 2026-10-23 同条）："每一种招式动作是不一样的"。✅ 2026-10-26（fightAttPose 改 9 套专属编舞分发(ATT_POSES): dash两记快拳连打/ sweep扭身后抡横扫/ dragon最深马步沉身双掌前推18°/ wave云手慢摇柔推/ beam头部锁定瞄准速点/ bullet贴腮瞄准+击发后坐力震仰+重心后错/ stab深蹲弹射大弓箭步突刺20°+后腿蹬直/ smash抡起上挺→俯身砸落/ slashx一正一反双快斩扭腰; drawWeaponFx 全 kind 强化: dash速度线+守方处第二拳小爆+sence层一次性火花补爆+轻震/ sweep延迟尾弧风声+命中横斩冲击带/ dragon掌风压地雪尘双环涟漪/ wave六环+阴阳双游光点反向流转/ beam六脉beams:6六道剑气扇形散开错峰收束汇聚爆光[data.js唯一新增]vs一阳指单道粗光束+端点余辉/ bullet枪口星形焰+三团硝烟缓升/ stab瞬闪整条白芒+命中四尖星芒/ smash八颗碎石确定性抛物线迸起/ slashx两道月牙剑气错峰飞出+第二斩反向小X; stab/dash/slashx攻方双层渐淡残影; fightPartnerPose经fightAttPose天然继承; 纯表现层engine零改动)（证据 evidence/fday9_before/*.jpg → fday9_after/*.jpg 逐张目验 · test_fx_b1 17/17 + 20连跑全绿 · regress_day6 五幕OK）
- [ ] **P2-13 FE 式地图单位动画**（丁工 2026-10-23 点名）：火纹大地图人物会动——待机呼吸 squash-stretch、移动时步伐摆动+扬尘、选中状态专用快节奏踏步、敌进入射程摆攻击架势、按行动方向翻转朝向。零素材 canvas transform。
- [ ] **P3-11b 评价结算画面**（AUDIT#14）：过关后击坠数/说得数/回合数评价（SRW 的 SR 点机制可后补）。
- [ ] P3-11 演出/音乐开关持久化（=DEV_PLAN B4）
- [ ] P3-12 存档/经验/道具/结算（=DEV_PLAN D1-D4，拆日推进）
- [ ] **P3-12a BOSS 阶段机制**（AUDIT#15）：半血换招/召唤援军，策划案阶段机制接入序章。
- [ ] **P3-12b 强招取舍复核**（AUDIT#16）：六脉是否无脑最优，按平衡清单逐条过。
- [ ] P3-13 第 2 话框架（=DEV_PLAN C1-C2，拆日推进）

## 执行记录

| 日期 | 完成项 | 证据 |
|------|--------|------|
| 2026-10-19 | P0-1 miss演出 / P0-2 反击自动化+卡死修复 / P0-3 悬停地形；立 AUDIT+IMPROVE 机制，每日 cron(01:17)；机战A标杆调研(references/srw-a-battle-benchmark.md)；闭环铁律入任务书（测试/修改/看效果/再测试/再修改） | /tmp/p0_miss_dodge.jpg · /tmp/p0_enemy.jpg · commit 021ea14 |
| 2026-10-20 | P0-4 选中立绘头像 / P1-5 击破定格+台词 / P1-6 运功演出；test_fx_b1 修复(B2重写后 miniOn 断言脱节→改验 FIGHT 生命周期)；击破时间轴探针校正(killAt=zeroTicks*per 真值)；环挪覆盖层防立绘遮挡 | /tmp/fday2/*.jpg · test 17/17 · commit 见报告 |
| 2026-10-21 | **P1-9 立绘puppet分层动画**（头/躯干/腿三层切分+伪骨骼；攻方 呼吸/沉身蓄力/前送出招/过冲收招；守方 快起-峰值定格-颤动回落×2，crit×1.25+双影；击破定格锁受击峰值帧；sprite 守方改整图变换×1.5补偿——64px 源图切三层会裂）+ **P1-10 演出可跳过**（点击即收招+右下角提示，敌我演出通用）+ **engine 必中bug修复**（mustHit=100 被 clamp(≤97) 压回→3%落空率，forecast 两行互换）；评审三轮迭代：蓄力幅度 5%→7%、受击正弦波→平台定格(停得住)、像素小人加幅 | /tmp/fday3_before/*.jpg · /tmp/fday3_after/*.jpg · test 6/6 · verify_skip PASS · commit 见报告 |
| 2026-10-22 | **P1-7 合体技双立绘同框**（萧左郭右入画/金色组合名/接力突进）+ **P1-8 开场镜头调度**（3.4s 推镜扫场+敌我BOSS脉冲点名+点击跳过）+ **AUDIT#21 测试修脆**（test_fx_b1_case 锁 RNG，20连跑全绿）；评审一轮迭代：接力静止帧读不出→前送9°→13°+突进46px | evidence/fday4_before/*.jpg · evidence/fday4_after/*.jpg · test 20/20 · commit 见报告 |
| 2026-10-23 | **P2-9 地块微动效**（水波明暗+流动波光/雪面冰晶闪光/竹影草叶微风/选中范围+黄框呼吸高亮，六项全程序动画零素材）+ **P2-10 单位占比**（sprite 64→78px 脚底锚定，格边微溢出）；五幕回归全绿零 pageerror；图像模型服务端持续 abort，目验以量化对比兜底（水泽区帧间RMSE 2.2×、雪地 0→86.5、单位占位区 1224px 变化），明日补目验复核 | evidence/fday6_before/*.jpg · evidence/fday6_after/*.jpg · test_fx_b1 17/17 · regress_day6 五幕OK · commit 见报告 |
| 2026-10-24 | **P3-11a 剧情对白演出**（章节标题卡「序章·破庙残谱」2.6s 左→右擦拭+金漆线+点击跳过 → 镜头扫场与 7 句对白同播（打字机 42ms/字，首击补全/再击翻页，空格回车同权，立绘半身 cover 取景+无立绘角色 sprite 像素回退）→ 出击画面（深蓝底斜光带+我方名册依次滑入+「出击！」爆字速度线+号角音）→ 开战横幅；内容全在 data.js STORY，演出全在 main.js，fxOff 直开战；inputPulse 计数器与选中/攻击输入完全隔离；AUDIT#24 关闭） | evidence/fday7_before/*.jpg · evidence/fday7_after/*.jpg（10帧逐张目验） · test_fx_b1 17/17 · probe_title/probe_fxoff 全绿 · commit 见报告 |
| 2026-10-25 | **P1-11 机战式出招流程重构**（攻方独占→命中登场→退场收势三段重排+推近镜头位+击破倒下淡出；FT.out 1740→2080；纯表现层）+ 测试修脆两件（regress_day6 剧情链接管+幕4轮询改waitForFunction+幕5 evaluate-await陷阱修复；record_demo.js waitIdle 升级） | evidence/fday8_before/*.jpg → fday8_after/*.jpg（逐张目验） · hit_exit_1900/2050 补帧 · test_fx_b1 17/17 · regress_day6 五幕全绿 · commit 见报告 |
| 2026-10-26 | **P1-12 每招式差异化动作编排**（9套专属身段+9套专属特效+残影/二段打击；data.js 仅liumai加beams:6；引擎零改动）+ capture_fday9.js 十案例同管线对比截帧 + run20_test.sh 连跑脚本沉淀 | evidence/fday9_before/*.jpg → fday9_after/*.jpg（9kind×3帧逐张目验） · test_fx_b1 17/17+20连跑 · regress_day6 五幕OK · commit 见报告 |
