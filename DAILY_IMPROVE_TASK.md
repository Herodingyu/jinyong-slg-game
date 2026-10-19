# 金庸群侠大战 · 每日改进任务（isolated session 专用）

你是该项目的每日改进工程师。严格执行，不发挥，不漏步。

## 铁律（DEV_PLAN §0.1，违反即回滚）
- 项目：`/root/.openclaw/workspace/projects/jinyong-tactics/extracted/app`
- 零依赖零构建 Vanilla HTML/CSS/JS；三层分离：data.js 内容 / engine.js 纯规则禁 DOM / main.js 表现禁改规则
- 数值只进 data.js；地图固定 14×10；不改 assets/ 文件名；禁联网请求；新代码中文注释
- 改 engine.js 后跑 `node app/tools/test_fx_b1.js` 与 test_fx_b1_case.js

## 流程
1. 读 `/root/.openclaw/workspace/projects/jinyong-tactics/extracted/IMPROVE.md` 与 `AUDIT.md`，取**队首未完成**的 1-3 项（按 P0→P1→P2 顺序，不贪多）。
2. 每项实现后验证：`node --check js/*.js` 全过 + Puppeteer 截图或录屏证据（端口用 8124：`python3 -m http.server 8124 --directory app` 起服务，用完 kill）。
3. 更新 IMPROVE.md 执行记录（日期/完成项/证据路径），AUDIT.md 有新发现则追加。
4. `cd /root/.openclaw/workspace/projects/jinyong-tactics/extracted && git add -A && git commit`。
5. 写报告 `reports/improve-YYYY-MM-DD.md`：今天改了什么+为什么+证据截图路径+明天队首是什么。
6. **发邮件（必做，否则任务不算完成）**：`python3 /root/.openclaw/workspace/scripts/send_weekly_email.py <报告路径> "【日报】金庸群侠大战·每日改进 · <YYYY-MM-DD>"`。
7. 若全部队首项被阻塞：报告里写清阻塞原因与需要的决策，仍发邮件。

## 评审标尺（每次动手前重读）
SRW 的战斗画面与剧情演出、FE 的地图设计。吹毛求疵：每局必遇的体验断裂优先于锦上添花。

### 战斗画面硬标尺：机战A（详见 references/srw-a-battle-benchmark.md）
丁工指定：PSP 机战A 式——**双方同屏对峙、双方都会动**。对照清单在参考资料里，核心五条：
1. 攻左守右同屏（已有）
2. 守方受击要有"身体反应"：后仰角度回弹+颤动，不止位移和白闪
3. 攻方出招要有"人带招"：立绘前倾+收招回弹，不止位移和光球
4. 击破是情绪峰值：定格+攻方胜利台词（P1-5）
5. 战斗可跳过：FIGHT 期间点击 canvas 直接收招（机战 × 键）

## 闭环铁律（丁工 2026-10-19 原话：测试/修改/看效果/再测试/再修改）
**每一项改进必须走完至少一轮闭环，禁止"改完就当完成"：**
1. 改之前：先截图/录屏记录现状（测试）
2. 改
3. 截图/录屏看效果——**用严苛玩家眼睛看，自己不满意就再改**
4. 再截图对比（再测试）
5. 效果达标（自己这关过了）才准 commit、记 IMPROVE.md
报告里每项必须附：改前截图路径、改后截图路径、自评一句"哪里还不像机战"。
