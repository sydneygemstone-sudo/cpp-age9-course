# CLAUDE.md · C++ 课线（给 9 岁孩子的 C++ 编程课）

## 定位
Dean 本人给 9 岁孩子面授的 C++ 编程课课件仓库（试听课 + 第 1、2 课；第 3 课未做）。纯前端 + Node 内置模块，零 npm 依赖。主通道＝局域网 HTTP 服务器（方式 A）；应急＝`file://` 单机（方式 B）；真编译走远程 Compiler Explorer（godbolt.org）。**本仓库（A 版）是唯一开发主干**；旧对照 B 版（`/Users/Shared/最后冲刺/C++课`）经实测为 A 严格子集，Dean 拍板后已于 2026-08-14 删除，取证链见知识图谱。

## 硬闸门（Dean 原话写死，碰到就停、等 Dean，不许自己决定）
- **周六首课前不做破坏性重构**（能跑就别大改；产品缺口靠口头把关，不靠改代码）。
- **服务器只在测试时起，测完必关**——持久进程属闸门项。起服前确认端口空闲（可靠检查＝`0.0.0.0` 绑定或直接起服；`127.0.0.1` 探测不充分，已踩坑）。
- **不改全局系统配置**（不动 git 全局配置、不装系统组件、不设 daemon/持久 socket）。
- 不许为让测试通过而删测试/改断言；不许留后台进程；不许用 lsof/kill 绕安全门。
- **允许**：读、新建文件、改代码、跑测试、`git commit`（在本仓库内）。

## 当前待办（2026-08-14 晚更新）
- [x] 8099 遗留进程：2026-08-14 晚复验**已自行消失**，`0.0.0.0` 绑定实测端口空闲，无需再清。
- [ ] **Dean 明天（8-15 首课）当堂**：决定第 2 课 bughunt E 档(§3.1)/活动7(§3.2) 是否当堂亲手点。
- [ ] 三条侧线 + 产品化——**方向已拍板**（2026-08-14）：内容中文为主、编程术语中英双语；剧场模式方案 A；调研见 `docs/调研-三侧线与产品化-20260814.md`。阶段 2 已派工（design tokens + 3 样板页 + agy 补查），样板页等 Dean 过目后批量落地（周六后）。
- [ ] 第 3 课（string/cin，引擎有缺口）——未排期。

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
