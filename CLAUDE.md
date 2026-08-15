# CLAUDE.md · C++ 课线（给 9 岁孩子的 C++ 编程课）

## 定位
Dean 本人给 9 岁孩子面授的 C++ 编程课课件仓库（试听课 + 第 1、2 课；第 3 课未做）。纯前端 + Node 内置模块，零 npm 依赖。主通道＝局域网 HTTP 服务器（方式 A）；应急＝`file://` 单机（方式 B）；真编译走远程 Compiler Explorer（godbolt.org）。**本仓库（A 版）是唯一开发主干**；旧对照 B 版（`/Users/Shared/最后冲刺/C++课`）经实测为 A 严格子集，Dean 拍板后已于 2026-08-14 删除，取证链见知识图谱。

## 硬闸门（Dean 原话写死，碰到就停、等 Dean，不许自己决定）
- **服务器只在测试时起，测完必关**——持久进程属闸门项。起服前确认端口空闲（可靠检查＝`0.0.0.0` 绑定或直接起服；`127.0.0.1` 探测不充分，已踩坑）。
- **不改全局系统配置**（不动 git 全局配置、不装系统组件、不设 daemon/持久 socket）。
- 不许为让测试通过而删测试/改断言；不许留后台进程；不许用 lsof/kill 绕安全门。
- **允许**：读、新建文件、改代码、跑测试、`git commit`（在本仓库内）。

## 当前状态与待办（2026-08-15 首课后更新）
- [x] **首课（第 1 课）2026-08-15 用剧场版实战完成**，Dean 评价好；剧场版已**转正合并进 main**（`0751dfb`，合并后 7 测试 2033 断言全绿），theater-mode 分支已删（远端留档）。旧版 main 已按 Dean 要求**雪藏**：`.old/旧版main-剧场合并前-79ef79a-20260815.tar.gz`（`.old/` gitignored，新 session 勿读勿解压）。
- [x] **常驻种子已就位**：`server/seed.json`（学生真名昵称，gitignored 不入库；单学生、不做账户系统——Dean 定案）。已标 trial+lesson1 completed。起服：`node server/server.js --port 8099 --seed server/seed.json`（续档时**不要**带 `--fresh`，`--fresh` 会重置回种子态）。
- [x] **第 2 课 Mac 侧线升级完成**（`984e1af`，2026-08-15 晚）：开场「工作台仪式」+ 文件与工坊 A 档「亲手改一字再编译」；7 测试 2062 断言全绿。注：glm 通道（ccglm/z.ai）当晚从本网络不可达，本单经 Dean 拍板破例由 Claude 子代理完成；glm 恢复后回归「编码活派 glm」规矩（派前先探活 api.z.ai）。**难度阶梯目标：两三节课后孩子自己输入代码编程**。
- [ ] 同步链路疑似 bug：2026-08-15 首课当堂进度未回写服务器（version 停 0），要不要排查等 Dean 拍板。
- [ ] 第 3 课（string/cin，引擎有缺口挡 S/A 路径）——孩子「自己敲码」阶梯的下一步，需先补引擎。
- 派工规矩：编码实现活派 **glm 通道**（`ccglm`），网络探针派 **agy**；主 session 负责规格、验收、commit。

## 知识图谱（docs/kb/，按需读取，别全量灌上下文）
| 节点 | 何时读 |
|---|---|
| `docs/kb/versions-a-b.md` | 碰到 B 版/「最后冲刺」/合并类问题时——已定案的取证链 |
| `docs/kb/qa-snapshot-20260813.md` | 需要测试基线、8099/PID 取证、机制核实结论时 |
| `docs/kb/runbook-server.md` | 要起服、跑测试、查端口时 |

## 路径速查
- 本仓库结构：`index.html`/`teacher.html`/`setup.html`/`周六课前checklist.html`、`js/{ui,content,engine,tests}/`、`server/`（seed.json 与 data/ gitignored）、`tools/make-seed.js`、`qa/cdp-*.mjs`、`docs/`（教案、使用手册、kb）。
- 批次产出（仓库外）：`~/Gemstone Kingdom/ops/wf/startup-20260813/out/cpp/`（QA-RESULT.md）、`ops/lines/cpp/out/`（复查取证）；QA 验收清单：`~/Gemstone Kingdom/ops/wf/biz/cppcourse/QA-CHECKLIST.md`。

> 维护约定：本文件只留「定位 / 闸门 / 活待办 / 图谱索引 / 路径」五块；事实快照、取证、历史 milestone 一律沉到 `docs/kb/` 带日期落盘。状态类事实（端口、进程、HEAD）易变，引用前重验。
