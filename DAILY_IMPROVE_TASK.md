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
