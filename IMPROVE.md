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

> **⚠️ 丁工 2026-10-30 08:21 再次打回战斗演出**："跟机器人大战PSP版相差太远，每一种招式是不同的动作，不能只是震屏"。P1-12 的 9 套身段+特效已完成，但**出招全程 ~1s、pose 一闪而过读不出、全程单镜头无分镜**——观感就是"换皮特效+震屏"。P1-14 按下面规格重做演出节奏与镜头，是今晚 cron 最高优先。

- [x] **P1-14 演出分镜与节奏重排**（丁工 10-30 点名，SRW PSP 级规格）✅ 2026-10-31
  **核心诊断**：机战每武器演出 3~5 秒三镜流，我们 1 秒单镜。不是加特效，是加"时间"和"机位"。
  - **总时长**：每武器演出拉到 2.8~4s（FT.strike 拉长；必杀/合体 4.5s+）。宁可少打一场，不砍演出。
  - **三镜分镜**（镜间 120~180ms 黑场切镜——机战标志性剪辑手法）：
    - **镜1 起手特写**（1.0~1.4s）：镜头推攻方半身（scale 1.0→1.28 缓推），出起手 pose——剑系拔剑式/拳系沉身/六脉抬指凝气/火枪举枪。pose 峰值**定格 ≥250ms**（机战关键 pose 必须停得住，这是"像不像"的分水岭）。可叠加头部以上 cut-in 条。
    - **镜2 攻击全景**（0.8~1.2s）：拉回全身位（scale 1.28→1.0），身段动作播完（dash三连/sweep大摆/beam五指轮弹/smash抡砸），武器特效在此镜爆发。
    - **镜3 命中特写**（0.6~0.8s）：切守方中景（scale ~1.15），受击后仰+白闪+震屏 3 帧+伤害数字；击破时定格+击破大字。
  - **独立相机状态**：FIGHT 加 cam 字段（scale/offset/黑场 alpha），三镜各 spline 插值，切镜点黑场 alpha 1→0。
  - **pose 可读性硬指标**：9 套 ATT_POSES 在拉长的时间轴上逐套复核，key pose 至少停 200ms；看不清就加幅度。
  - **六脉神剑专项**：指尖凝聚光球 ≥0.5s 且人物全程在画（修 10-30 录影 f0006 光束阶段攻方不可读）；五指轮弹与六道剑气一一对应错峰。
  - **验收（三层硬门槛之视觉层）**：每 kind 截起手/攻击/命中三镜各一帧（9 kind×3=27 张）+击破 3 张，逐张亲看；判定线=**不看 HP 条能认出这是哪一招**，认不出的 kind 返工，不准写完成。→ **已达成**：fday14_after 10kind×3=30 帧 + fday14_after_fight 24 帧（hit/crit/miss/kill）全部逐张亲看，10/10 招式三镜可辨；新发现两件打磨项记 AUDIT#41（slashx 紫气爆团盖主角脸）/#42（大立绘 charge 光球锚点偏脸侧），不阻塞。

## P2 · 地图活性

- [x] **P2-9 地块微动效**：选中格呼吸高亮 + 水面/旗帜动态（程序动画，零素材）。✅ 2026-10-23（范围高亮/选中框/水波/雪闪/竹影/草叶全部走 sin(now) 相位程序动画：移动范围蓝格 240ms 相位整体明灭、选中黄框外加 200ms 金光呼吸圈、水泽三条波线各自相位明暗+一条~4s 周期流动波光、雪地每格一颗冰晶明灭+峰值十字星光、竹林竹影/草叶微风按格相位错开；纯表现层，engine/data 零改动）
- [x] **P2-10 单位占比**：sprite 绘制 64→80px 或镜头 1.25x，对齐 SRW 单位占比。✅ 2026-10-23（取 78px 脚底锚定——底部对齐格底-2、头顶探入上一格，FE/SRW 惯例的格边微溢出；框/HP条/名字仍按 64px 格子画，格子标记≠人物轮廓；78 而非 80 是给 sprite 顶部留白留余量，防贴脸溢出到上格单位名）

## P3 · 系统层（与 DEV_PLAN C/D/E 并轨）

- [x] **P3-11a 剧情对白演出**（AUDIT#14，机战式第一话标配）：立绘对白框系统（portraits 已有 5 张）+ 章节标题卡 + 出击画面。先于存档/经验做——这是老玩家长期记忆点。✅ 2026-10-24（标题卡 2.6s 擦拭+点击跳过 → 镜头扫场与 7 句对白同播（打字机 42ms/字，首击补全再击翻页，空格/回车同权）→ 出击画面名册滑入+「出击！」爆字 → 开战横幅；内容全在 data.js STORY，main.js 纯演出；fxOff 直开战；inputPulse 计数器驱动与选中/攻击输入隔离）
- [x] **P1-11 机战式出招流程重构**（丁工 2026-10-23 08:36 点名）：SRW 流程=发招阶段**只有攻方自己在画面**（招式演完）→ **击打瞬间守方才登场**（受击姿态入场+白闪）→ 受击完毕守方退场收势。✅ 2026-10-25（三段重排: 发招期守方完全不绘制+攻方推近1.16x向中央偏移[脚底锚定不飘]独占镜头位; tStrike-80ms守方从右屏外被打入画面[tStrike+40ms到位]+白闪遮住入画点; 峰值落定后驻留~130ms随即右滑退场+淡出, 攻方独占收势; 击破改定格在场→击破大字播放时倒下淡出[defSink44px]; 守方HP条随登场/退场淡入出; FT.out 1740→2080退场段可读; 命中帧切回双人对峙位; 纯表现层engine/data零改动; 证据 evidence/fday8_before/*.jpg → fday8_after/*.jpg[hit_0800独占→hit_1150登场→hit_1700退场中→hit_exit_1900独占收势→kill_2200击破定格+消散] · test_fx_b1 17/17 · regress_day6 五幕全绿零pageerror[剧情链接管+evaluate-await陷阱修复]）
- [x] **P1-12 每招式差异化动作编排**（丁工 2026-10-23 同条）："每一种招式动作是不一样的"。✅ 2026-10-26（fightAttPose 改 9 套专属编舞分发(ATT_POSES): dash两记快拳连打/ sweep扭身后抡横扫/ dragon最深马步沉身双掌前推18°/ wave云手慢摇柔推/ beam头部锁定瞄准速点/ bullet贴腮瞄准+击发后坐力震仰+重心后错/ stab深蹲弹射大弓箭步突刺20°+后腿蹬直/ smash抡起上挺→俯身砸落/ slashx一正一反双快斩扭腰; drawWeaponFx 全 kind 强化: dash速度线+守方处第二拳小爆+sence层一次性火花补爆+轻震/ sweep延迟尾弧风声+命中横斩冲击带/ dragon掌风压地雪尘双环涟漪/ wave六环+阴阳双游光点反向流转/ beam六脉beams:6六道剑气扇形散开错峰收束汇聚爆光[data.js唯一新增]vs一阳指单道粗光束+端点余辉/ bullet枪口星形焰+三团硝烟缓升/ stab瞬闪整条白芒+命中四尖星芒/ smash八颗碎石确定性抛物线迸起/ slashx两道月牙剑气错峰飞出+第二斩反向小X; stab/dash/slashx攻方双层渐淡残影; fightPartnerPose经fightAttPose天然继承; 纯表现层engine零改动)（证据 evidence/fday9_before/*.jpg → fday9_after/*.jpg 逐张目验 · test_fx_b1 17/17 + 20连跑全绿 · regress_day6 五幕OK）
- [x] **P2-13 FE 式地图单位动画**（丁工 2026-10-23 点名）：火纹大地图人物会动——待机呼吸 squash-stretch、移动时步伐摆动+扬尘、选中状态专用快节奏踏步、敌进入射程摆攻击架势、按行动方向翻转朝向。零素材 canvas transform。✅ 2026-10-27（纯表现层 engine/data 零改动：FX.dust 扬尘数组+UAN 常量组+FACE 朝向表+MAP_MOVE 全局态；unitFace/setFace/stanceTarget/spawnDust/animUnitMove 四辅助——插值移动落定才提交坐标、落定+每格中点落足各一团扬尘；单位绘制块重写：待机呼吸 squash-stretch 相位按 id 错开(breatheA0.022/T1100)、选中快节奏踏步(240ms半周期hop2.6px+squash3%轮替)、敌入射程攻击架势(squash0.96+lean0.06+朝向最近目标)、移动步伐(squash0.07+lean0.05+face对齐)、ctx.scale(face,1)水平翻转(默认我右敌左/萧峰素材本身朝左故FACE表单记-1)、HP条/气势/名字/扣血全部改用gx/gy插值坐标；玩家移动与enemyPhase两处瞬移替换为animUnitMove；连带修复移动中菜单不隐藏+演出期可点穿两个输入洞——移动分支补hideMenus+点击总线加MAP_MOVE锁；扬尘可见度二档微调alpha0.35→0.5/r3+5.5px(石板地上读不出→可读)；证据 evidence/fday10_before/*.jpg → fday10_after/*.jpg[sel/idle帧差PSNR量化+stance(5,2)沉身前倾vs(7,2)直立+flip萧峰左行setFace(-1)+mv_mid插值中途非格点对齐+mv_dust落定尘团7颗随步伐生成再衰减] · 移动状态日志my7.91→4.97落定提交gy=5 · test_fx_b1 17/17 · run20全绿 · regress_day6 五幕OK零pageerror · record_demo 五幕VERIFY全OK[菜单轮询改等真出现替固定sleep]）
- [x] **P3-11b 评价结算画面**（AUDIT#14）：过关后击坠数/说得数/回合数评价（SRW 的 SR 点机制可后补）。✅ 2026-10-28（机战式战斗结果： 夜幕底+章名/任务完成金字→战绩三行错峰[击破敌军x/6·说得x/1·使用回合x]→评价大字弹入过冲[S≤6/A≤9/B≤13/C档位在data.js RESULT_CFG]→收尾旁白+点击重开； G.stats引擎层计数[resolveAttack击破/doSpeak说得]; 原生alert删除； 演出关同样显示=结算属游戏闭环非可选演出； 证据 evidence/fday11_before/*.jpg → fday11_after/*.jpg[0300章名/1200三行/2300评价A/4300落定] · 计数真实核对[布置击破1+说得1+回合7→画面2/6·1/1·7·A] · 点击重开归零PASS）
- [x] P3-11 演出/音乐开关持久化（=DEV_PLAN B4）✅ 2026-10-28（fxOn/bgmOn/AUTO_COUNTER三开关入localStorage[jy_fx/jy_bgm/jy_counter]，载入恢复+按钮文案同步； node测试台无localStorage静默降级； probe_fday11_store PERSIST PASS； 关闭AUDIT#11）
- [x] **P3-12a BOSS 阶段机制**（AUDIT#15）✅ 2026-10-29（段延庆HP≤50%触发【狂怒】: 恰50.0%边界也触发[探针锁]; atk+30/def+20/will→130/解锁「一阳指·透骨」pow3900赤红指劲/召唤2辽兵援军[(11,4)(12,5)环形扫描防叠格]; 结算敌总数6→8随援军累加; 防重入phaseIdx; 演出=赤红压屏闪+BOSS立绘右侧入画面向玩家[镜像修正, 首版画反出屏已修]+「狂怒！」金漆大字+底部台词台词条+怒吼+援军扬尘; fxOff退化横幅+日志不锁玩家; 证据 evidence/fday12_before→fday12_after同时间戳对照[0200: 改前平静继续 vs 改后满屏阶段演出] · probe_fday12_phase全绿 · regress_day6五幕OK · test_fx_b1+20连跑+probe_musthit绿）
- [x] **P3-12b 强招取舍复核**（AUDIT#16）✅ 2026-10-29（复核判定修前六脉违反「强招代价」+「每回合决策密度」[35真气/200池=5.7发+回气5≈每回合无脑最优, 2900威力97%命中2-4射程严格优于长拳]; 修复cost35→45[池深比4.4对齐降龙4.3]; 五条平衡清单逐条结论记AUDIT#16关闭段; 残余风险=97%封顶过快记#37; 探针锁cost=45+池深比+武器命中生效）
- [x] **P3-12 D1 存档/读档**（=DEV_PLAN D1，AUDIT#12 上篇）✅ 2026-10-30（engine 纯函数 serialize/deserialize 全字段快照[收服side/弹药/buff/位置/acted/BOSS阶段phaseIdx/UID]+开场&每回合开始自动档+顶栏手动档读档[准入=玩家回合无演出]; 读档恢复演出开关+清全部 transient; 往返逐字节一致+反复读档不互污+老档缺字段兜底+UID防援军撞号; 败北刷新读档回回合检查点）
- [x] **P3-12 D2 经验与升级**（=DEV_PLAN D2，AUDIT#12 中篇·#35 前置）✅ 2026-10-30（EXP_CFG 全数值入 data.js[门槛100/命中2/击破=敌方lv×10/单步hp+150·sp+6·atk+6·def+5·hit+4·evd+4]; 八角色 growth 成长率按人设分档[主角.80hp 萧峰atk向 郭靖def向 段誉evd向 韦小宝低成长]; gainExp 可注入RNG+溢出结转+体力成长同步回血; 升级摘要 ev.levelUps→LVFX 金漆大字[升级!]+Lv跃迁+成长明细+脚下金环; 面板 Lv/经验行; 说得收服单位天然可升级[验收达成]）
- [x] **P3-12 D3 道具系统**（=DEV_PLAN D3）✅ 2026-11-01
  ITEMS 四件(金创药回血35%/九花回内45%/女儿红气势+25/石灰粉邻敌命中-40)全数值入 data.js；engine itemTargets/useItem 纯规则(邻接校验/库存消耗/部分生效封顶)；全队共享道具袋 G.items 随档走(老档按 init 兜底)；指令菜单「道具」→二级目标列表(自身直用/多目标再选)；使用=消耗本回合行动+绿飘字+角色色环；石灰粉 dust 走 forecast 命中-40 且入 clearBuffs(敌方行动后清除)；**顺手修 AUDIT#46 玩家运功buff永不消退**(castTurn 标记+finishUnit 时到期，热血永久×2 无脑最优堵死)；test_items 21断言+probe_fday15 20断言全绿；证据 evidence/fday15_before/menu.jpg → fday15_after/menu|item_menu|lose|loaddone.jpg 逐张目验
- [x] **P3-12 D4 序章scope·体面败北出口**（AUDIT#39）✅ 2026-11-01
  败北 confirm+整页刷新 → DOM 败北画面(「雪还在下…」+读档回回合检查点/重开两出口, 无存档时读档禁用)；**连带修 AUDIT#47**：败北可从敌方回合触发，残留道具/预测模态会挡住败北画面入口(探针截图实锤)，showLose 统一收起
- [ ] P3-12 D4 余量：三线最终刻度/侠名评价 + 通关→片尾→主界面 CHAPTERS 串联（依赖 P3-13 第 2 话框架，随其一起推进）
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
| 2026-10-27 | **P2-13 FE式地图单位动画**（待机呼吸squash-stretch+选中快节奏踏步+敌入射程攻击架势+移动步伐插值+落足扬尘+朝向翻转；纯表现层engine/data零改动；连带修复移动中菜单可见+MAP_MOVE期输入锁两个洞；record_demo.js 菜单交互改轮询等真出现替固定sleep——移动动画拉长暴露的时序脆点） | evidence/fday10_before/*.jpg → fday10_after/*.jpg（sel/idle PSNR帧差·stance·flip·mv_mid·mv_dust 逐张目验+移动状态日志） · demo_2026-10-27.mp4 五幕VERIFY全OK · test_fx_b1 17/17 · run20全绿 · regress_day6 五幕OK · commit 见报告 |
| 2026-10-28 | **P3-11b 评价结算画面**（机战式战斗结果三段编排： 章名/任务完成金字→战绩三行错峰[击破x/6·说得x/1·回合x]→评价大字弹入过冲[S≤6/A≤9/B≤13/C]→收尾旁白+点击重开； G.stats引擎层计数； 替原生alert; 关闭AUDIT#14）+ **P3-11 开关持久化**（演出/音乐/反击三开关localStorage[jy_fx/jy_bgm/jy_counter]+按钮文案同步； node台静默降级； 关闭AUDIT#11） | evidence/fday11_before/*.jpg → fday11_after/*.jpg[0300章名/1200三行/2300评价A/4300落定 四帧目验+计数真实核对[布置击破1+说得1+回合7→画面2/6·1/1·7·A]+点击重开归零] · probe_fday11_store PERSIST PASS · demo_2026-10-28.mp4 五幕VERIFY全OK · test_fx_b1 17/17 · run20全绿 · regress_day6 五幕OK零pageerror · commit 见报告 |
| 2026-10-29 | **P3-12a BOSS 阶段机制**（AUDIT#15关闭； 段延庆半血【狂怒】阶段: 恰50%边界触发+atk30/def20/will130+解锁一阳指·透骨+2辽兵援军+全套SRW式阶段演出[赤红压屏/右入画立绘/金漆大字/台词台词条/怒吼/援军扬尘]; foes随援军6→8; 镜像绘制首版出屏已修) + **P3-12b 强招取舍复核**（AUDIT#16关闭； 六脉35→45真气[池深比4.4对齐降龙4.3]+激活武器命中死字段; 五条平衡清单结论记AUDIT) + 新发现#36(武器命中死数据已修)/#37(97%封顶过快记账)/#38(敌方真气不回观察) | evidence/fday12_before→fday12_after同时间戳[0200平静vs满屏演出 目验] · probe_fday12_phase 5/5+零pageerror · capture+probe过程发现镜像bug已修并重截 · regress_day6 五幕OK · test_fx_b1 17/17 · run20全绿 · probe_musthit 20000次零非命中 · demo_2026-10-29.mp4 五幕VERIFY · commit 见报告 |
| 2026-10-30 | **P3-12 D1 存档/读档**（engine serialize/deserialize 纯函数+自动档[开场/回合开始]+顶栏手动档; 读档清transient恢复开关; 败北读档回检查点） + **P3-12 D2 经验与升级**（EXP_CFG+八角色growth入data.js; gainExp注入RNG/溢出结转/升级回血; LVFX金漆大字+成长明细+金环; 面板Lv/经验行; 说得单位可升级验收达成） + 新发现#39(败北流程confirm+reload不够体面, D4统一)/#40(EXP首版参数待真机回合经济复评) | evidence/fday13_before[顶栏无档/面板无Lv] → fday13_after[after_panel Lv.6·经验0/100 + after_save_banner 存档/读档钮+进度已存档 + lvup_fx 升级大字/Lv1→2/六项明细/金环 逐张目验] · test_fday13_engine 24/24 · probe_fday13_save 12/12零pageerror · test_fx_b1 17/17 · run20全绿 · HANDOFF§5基线一致(移动22格/预测/AI) · commit 见报告 |
| 2026-10-31 | **P1-14 演出分镜与节奏重排**（丁工 10-30 打回「跟机战PSP版相差太远」；FT 重排 3640ms 三镜时间轴+170ms 黑场切镜+fightCam 三镜相机[镜1 推近1.30 起手定格320ms/镜2 拉回全景出招/镜3 守方1.16 受击同框]+命中反馈全锚 FT.impact+六脉指尖凝气光球≈1.9s+会心+120ms+合体+940ms+击破 killAt+1480；删除 soloP 立绘自推近；纯表现层 engine/data 零改动） + 新发现#41(slashx 爆团糊脸)/#42(大立绘 charge 光球偏脸侧) 记账打磨 + **P1-14 对照复验 & B方案姿势挂接钩子**（Agent 3：t0钉帧法截 9kind×3镜+击破=30帧逐张亲看[VERDICT.md 7/9可辨·stab/slashx勉强·bullet/smash镜2特效不可读记#43/#44返工，未动演出逻辑；定格320ms/六脉凝气1.9s人物在画/双黑场均亲证]；main.js 只加 drawCombatant 包装[攻方主绘制点+守方受击绘制点，window.POSE_RENDERERS 可插拔，att phase=windup/strike/impact/out·def恒impact]+docs/POSE_HOOK.md 接线文档；零变化验证=test_fx_b1 17/17+hook_before/after 6帧同时间戳对照[非冲击帧PSNR 36~41dB、冲击帧随机震屏/火花致 18~26dB，逐对目验无系统性差异]+探针验证 phase 分发 att 全四段/def 恒 impact) | evidence/fday14_after 30帧[10kind×3 逐张目验: 镜1 起手全可读·六脉指尖光球人物完整入画·镜2 相机拉远确认·镜3 双人同框受击] + fday14_after_fight 24帧[hit/crit/miss/kill 全目验: 会心!大字/闪避/击破白闪定格+击破!+胜利台词] · 10-30 录像缺失改看 demo_2026-10-29.mp4 32帧佐证旧版不可读 · test_fx_b1 17/17 · regress_day6 五幕全绿零pageerror · commit 见报告 |
| 2026-10-31 | **P1-14 复验+姿势钩子（Agent 3 worktree feat/p1-14-cinema）** | evidence/fday14_accept 30帧+VERDICT.md（7/9可辨，bullet/smash 记 AUDIT#43/#44）+ hook_before/after 6帧 + hook_probe 3帧 · capture_cinema.js(t0钉帧) · test_fx_b1 17/17 · docs/POSE_HOOK.md |
| 2026-11-01 | **P3-12 D3 道具系统**（四道具全配置驱动/共享道具袋随档/道具=一指令/石灰粉forecast-40/clearBuffs清dust/修AUDIT#46玩家buff永久挂账[castTurn到期]）+ **D4序章scope败北画面**（体面双出口替confirm+reload, 修AUDIT#47模态挡败北入口）+ 新发现#46已修/#47已修 | evidence/fday15_before/menu.jpg[菜单仅攻击/运功/待机] → fday15_after/menu.jpg[+道具]/item_menu.jpg[四件带库存+可用目标]/lose.jpg[败北画面双按钮]/loaddone.jpg[读档复活5人] 逐张目验 · test_items 21断言 · probe_fday15 20断言零pageerror · test_fx_b1 17/17 · run20全绿 · regress_day6 五幕OK · record_demo 五幕VERIFY · demo_2026-11-01.mp4 当天新构建 |
| 2026-11-02 | **P1-16 演出特效返工日（AUDIT#41/#42/#43/#44 四项同区一批）**（①出手锚点逐张立绘标定 ATT_ANCHOR——旧默认锚(attW 0.64/0.42H)恰落脸部, slashx 主角紫球糊脸+萧峰拳端光球贴脸; 按"离敌方最近的前手"逐图标定: 萧峰右拳(0.85,0.60)/韦小宝烟枪口(0.87,0.44)/段誉指尖(0.62,0.40)/段延庆爪手(0.45,0.48)/郭靖前手(0.77,0.53)/sprite 双手(0.62,0.70), 蓄力光球+全部武器 FX 出手点统一切到锚点; ②bullet 镜2 不可读返工——枪口星形焰窗口 0.22→0.45(≈140ms→280ms)+峰值强化, 弹丸 5px 白点→16px 角色色光晕+白芯 6px, 拖尾前两节纯白/间距 9→11/衰减 0.82→0.86; ③smash 镜2 无挥杖特效返工——二次贝塞尔挥杖轨迹(抡起身后下方→过头→砸落守方, 凸包内任意时刻在画; 首版圆弧方案两轮迭代: 手算在画内但实际 tx=守方滑入位(屏右 842)致弧全飞出屏顶→弃圆弧改贝塞尔), 24 段采样折线+杖头彗星引领, 命中后 0.82→1.0 淡出; 碎石窗口 0.92→1.0/重力 260→190/体量 3.5→4.5px; 纯表现层 engine/data 零改动） | 改前 evidence/fday14_accept(slashx_1250 糊脸/bullet_2400 空镜/smash_2400 近空镜) → 改后 evidence/fday16_after 10kind×3-7 帧逐张目验: slashx 脸部全可读·紫球蓄于身前/dash 拳端凝气/dragon 拳端发劲/wave 前手出环/beam 指尖六道剑气(全组最佳)/bullet 枪口焰+弹丸弹道读得出/stab 白芒从手出/smash 挥杖轨迹 2330 起全程可读/kill 定格正常 · test_fx_b1 17/17 · run20 全绿 · regress_day6 五幕 OK 零 pageerror · record_demo 五幕 VERIFY 全 OK · demo_2026-11-02.mp4 当天新构建 · 自评欠账: 碎石在镜3 仍偏弱(被守方立绘遮+衰减早), 郭靖/萧峰立绘掌心朝左与攻向右的构图张力属素材级问题记 AUDIT |
