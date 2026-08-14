# 知识节点：QA 事实快照（2026-08-13 实测）

> 节点属性：`type: 事实快照` · `status: 截至 2026-08-13 有效，端口/进程类事实易变，用前重验` · 关联节点：[[versions-a-b]] · [[runbook-server]]
> 详细取证：`ops/lines/cpp/out/REPORT.md`、`/Users/gemstone/Gemstone Kingdom/ops/wf/startup-20260813/out/cpp/QA-RESULT.md`

## 运行环境
- node v22.22.0；Chrome 151（CDP 可用）；g++ 在 `/usr/bin/g++`（App 不用本地 g++，真编译走远程 Compiler Explorer godbolt.org，断网降级为概念演示）。

## 测试基线
- **7 个单元测试全过 / 1936 断言 / 0 失败**：test-ir 114 / test-engine 71 / test-content-schema 1513 / test-evidence 64 / test-theme 63 / test-compiler 91 / test-sync 20。跑法：`node js/tests/test-*.js` 逐个跑。
- **CDP 第 1 课闭环 19 通过 / 0 失败**：无未捕获异常、真编译 verified=true、活动 7→8 正常衔接、无 Chrome 残留。脚本 `qa/cdp-lesson1.mjs`（对 8100 干净服务器跑的副本仅改 BASE 端口）。

## 机制核实
- **方式 A 首屏机制成立**：`--fresh`+种子 → HTML 内联 `window.__CPPLAB_SEED__`（`server.js:293-311`），`app.js:522` 渲染「你好，<昵称>！」；GET /api/state 返回 nickname=闪电小队长 / path=A / theme=robot。
- **file:// 加载机制安全**（方式 B 应急）：`index.html:27-40` 纯 `<script src>`；fetch 仅 `js/engine/sync.js`、`js/engine/compiler.js`；无 module/Worker。

## 8099 遗留进程（等 Dean 清）
- 8099 被遗留课堂服务器占用，**PID=88236**：`node server/server.js --port 8099 --seed server/seed.json --fresh`，PPID=1，启动 2026-08-12 01:54:15；`curl localhost:8099/api/state` → 200，是 2026-08-11 旧种子的彩排会话（sessionId=sess-seed-mso3zlaq，version=11，lesson1.completed=true）。
- 定位手段只用了只读命令（`curl` + `ps -ax -o pid,ppid,user,lstart,command`，命令行自带 `--port 8099` 即坐实），**未用 lsof、未杀（闸门）**。处置命令见 `ops/lines/cpp/out/SPEC.md` T1（`kill 88236`），或当堂换端口。
- 端口空闲的可靠检查＝`0.0.0.0` 绑定或直接起服；`127.0.0.1` 探测不充分（已踩坑：8099 对 127.0.0.1 探测看似可用，起服才 EADDRINUSE）。

## milestone 已完成项（历史）
- [x] 第 1、2 课内容 + 试听课上线；主题三变体；iPad/笔记本适配
- [x] 跨机双端（服务器模式方式 A）+ 课前种子 + 课堂阻断修复（8/12 提交 a4e87b0）
- [x] 2026-08-13 QA 实测 + 复查批次（A=1936 / B=1916 断言全过；新鲜行号复核第 2 课 §3.1/§3.2/§3.6）
