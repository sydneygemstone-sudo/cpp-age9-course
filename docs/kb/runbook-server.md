# 知识节点：服务器/课堂运行 runbook

> 节点属性：`type: 操作手册` · 关联节点：[[qa-snapshot-20260813]] · 面向用户的完整手册见 `docs/`（使用手册）与 `周六课前checklist.html`

## 两种通道
- **方式 A（主用，跨机）**：老师 Mac 起服，学生机/平板浏览器连 `http://<老师IP>:8099/index.html`。
- **方式 B（应急，单机）**：`file://` 双击 `index.html`。纯 `<script src>` 加载，已核实安全。

## 起服
```bash
node server/server.js --port 8099 --seed server/seed.json          # 上课/续档（保留已存进度）
node server/server.js --port 8099 --seed server/seed.json --fresh  # 重置回种子态（慎用）
```
- `server/seed.json` 是**常驻种子**（2026-08-15 起，学生真名昵称，gitignored 勿入库；trial+lesson1 已标 completed）。重新生成：`node tools/make-seed.js --nickname "<昵称>" --path A --theme robot > server/seed.json`，再按需改 lessons.*.completed。
- 种子 → 首屏 HTML 内联 `window.__CPPLAB_SEED__`（server.js），前端 app.js 直接渲染欢迎语。
- ⚠️ 已知坑（2026-08-15 首课实测）：当堂进度可能不回写服务器 latest.json（version 停 0）——课后想留进度先 `curl localhost:<port>/api/state` 落盘取证，勿直接 `--fresh` 覆盖。
- 种子生成：`tools/make-seed.js`；`server/seed.json` 与 `server/data/` 均 gitignored。
- **闸门：测完必关，不留任何后台进程。**

## 端口检查（踩过的坑）
- 可靠检查＝尝试 `0.0.0.0` 绑定或直接起服看是否 EADDRINUSE；**`127.0.0.1` curl 探测不充分**（8099 曾探测"空闲"、起服才炸）。
- 不许用 lsof/kill 绕安全门；定位占用方用只读 `ps -ax -o pid,ppid,user,lstart,command` 看命令行参数。

## 测试与 QA 入口
```bash
for f in js/tests/test-*.js; do node "$f"; done   # 7 个文件 / 1936 断言基线
node qa/cdp-lesson1-theater.mjs                    # CDP 第 1 课闭环·剧场版 28 项（需 Chrome，BASE 8100，先起服后跑、跑完杀服）
```
