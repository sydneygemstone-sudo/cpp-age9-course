# 一期纵向样片 · 技术契约（CONTRACT v1）

权威优先级：`docs/方案定稿.md` > 本契约 > 各文件内注释。发现冲突时以方案为准，并在返回值 deviations 中说明。

## 0. 运行方式（硬约束）

- **纯静态、零构建、零依赖**：双击 `index.html` 即可在 Chrome 运行（必须 file:// 兼容）。
- 禁止：ES modules（import/export 语法）、fetch 本地文件、任何 CDN/外部 JS/CSS/字体、npm、eval。
- 所有 JS 通过普通 `<script>` 标签加载，共享全局命名空间 `window.CppLab`。
- **纯逻辑文件必须 Node 兼容**（用于测试）：`ir.js / storage.js / evidence.js / hints.js / compiler.js / report.js / lessonEngine.js / content/*.js` 顶层不得直接访问 `document`/`window`（需 `typeof window !== 'undefined'` 保护），文件末尾加：
  ```js
  if (typeof module !== 'undefined' && module.exports) { module.exports = <本模块对象>; }
  ```
  同时在浏览器环境挂到 `window.CppLab.<名字>`。文件开头用 `var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});` 统一获取命名空间。

## 1. 文件清单与所有权（每个文件只有一个 owner，只许写自己的文件）

| 文件 | owner |
|---|---|
| `index.html`, `css/main.css`, `js/ui/app.js` | ui-app |
| `teacher.html`, `js/ui/teacher.js` | ui-teacher |
| `js/ui/visualizer.js` | visualizer |
| `js/engine/ir.js`, `js/tests/test-ir.js` | ir |
| `js/engine/lessonEngine.js`, `js/engine/storage.js`, `js/tests/test-engine.js` | engine-core |
| `js/engine/compiler.js`, `js/engine/hints.js`, `js/tests/test-compiler.js` | compiler-hints |
| `js/engine/evidence.js`, `js/engine/report.js`, `js/tests/test-evidence.js` | evidence-report |
| `js/content/trial.js` | content-trial |
| `js/content/lesson1.js` | content-lesson1 |
| `js/content/lesson2.js` | content-lesson2 |
| `README.md`, `docs/课程地图.md`, `docs/教师手册.md`, `docs/验收对照.md` | docs |

## 2. 脚本加载顺序（index.html 与 teacher.html 必须一致）

```html
<script src="js/engine/ir.js"></script>
<script src="js/engine/storage.js"></script>
<script src="js/engine/evidence.js"></script>
<script src="js/engine/hints.js"></script>
<script src="js/engine/compiler.js"></script>
<script src="js/engine/report.js"></script>
<script src="js/content/trial.js"></script>
<script src="js/content/lesson1.js"></script>
<script src="js/content/lesson2.js"></script>
<script src="js/engine/lessonEngine.js"></script>
<script src="js/ui/visualizer.js"></script>
<script src="js/ui/app.js"></script><!-- teacher.html 最后一行换成 js/ui/teacher.js -->
```

## 3. 全局命名空间

- `CppLab.IR`（ir.js）、`CppLab.Storage`、`CppLab.Evidence`、`CppLab.Hints`、`CppLab.Compiler`、`CppLab.Report`、`CppLab.Engine`（lessonEngine.js）、`CppLab.Visualizer`、`CppLab.App` / `CppLab.TeacherApp`
- `CppLab.content = { trial, lesson1, lesson2 }`（各 content 文件挂自己那份，形如 `CppLab.content.lesson1 = {...}`，注意不要整体覆盖 `CppLab.content`，用 `CppLab.content = CppLab.content || {};` 保护）

## 4. LessonIR（教学中间表示）

`program = Step[]`

```
Step:
  {op:'declare', varType:'int'|'bool', name:string, expr:Expr}
  {op:'assign',  name:string, expr:Expr}
  {op:'output',  expr:Expr}                       // std::cout << expr;
  {op:'if',      cond:Expr, then:Step[], else?:Step[]}

Expr:
  {kind:'lit', value:number|boolean|string}        // 字符串仅用于 output
  {kind:'var', name:string}
  {kind:'bin', op:'+'|'-'|'*'|'/'|'>'|'>='|'<'|'<='|'=='|'!='|'&&'|'||', left:Expr, right:Expr}
```

`CppLab.IR` API：

- `evalExpr(expr, vars) -> value`
- `execute(program) -> {trace: TraceEntry[], finalVars: Object, stdout: string, error?: string}`
  - `TraceEntry = {index, lineNo, kind, varsBefore, varsAfter, outputSoFar, condValue?, branchTaken?:'then'|'else', description}`；`description` 是给孩子看的中文一句话，例如"读取旧值 3，计算 3+4=7，把 7 写回 energy"。if 的 then/else 内部每个 Step 也产生自己的 TraceEntry。
- `toFocusCpp(program) -> string`（聚焦代码；`getLineMap` 保证 step↔行号稳定映射；if/else 花括号按 K&R 风格，与方案 7.3/8.3 的样例产出完全一致）
- `toFullCpp(program) -> string`（包裹 `#include <iostream>` + `int main()` + 缩进的聚焦代码 + `return 0;`）
- `getLineMap(program) -> {stepIndex: lineNo}`（针对聚焦代码）
- `exprToCpp(expr) -> string`

## 5. Activity schema（内容与引擎分离的核心）

```js
Activity = {
  id: 'lesson1-05-reach-ten',        // <lessonId>-<nn>-<slug>
  lessonId: 'trial'|'lesson1'|'lesson2',
  order: Number,
  minutes: [start, end],             // 对应方案时间表
  title, concept, learningObjective, childPrompt,   // 全中文、童趣、准确
  dimensions: ['D3','D8'],           // 主诊断维度
  activityType: 'choice'|'ordering'|'predict'|'trace'|'slots'|'freeEdit'|'bughunt'|'teach-transfer'|'explain'|'build',
  visualModel: 'energy'|'door'|'sequence'|'function'|'scene'|'none',
  variants: { E: Variant, S: Variant, A: Variant },
  hintLadder: [{level:'H1', text}, {level:'H2', text}, {level:'H3', text}, {level:'H4', text}, {level:'H5', text, teacherOnly:true}],
  evidenceRule: {dimension:'D3', note:'观察要点(给引擎/教师)'},
  teacherCards: { truth, demo, questions:[q1,q2,q3], misconceptions:[..], rescueSteps:[s1,s2,s3], extension },
  compilerCheck: {enabled:Boolean, expectedStdout:String}   // 有 program 的活动尽量开
}

Variant = {
  intro: '本变体的开场引导(中文)',
  program: Step[]|null,              // 本变体用的 IR 程序
  interaction: {...按 activityType, 见下},
  prediction: {question, inputType:'number'|'choice', options?, correct}|null,  // 有则引擎强制先预测
  successCriteria: '中文描述何为完成',
}
```

各 activityType 的 `interaction` 字段：

- `choice`: `{question, options:[{id,label,correct?:true}], multi?:false}`
- `ordering`: `{items:[{id,label,icon?}], correctOrder:[id,...]}`
- `predict`: `{question, inputType:'number'|'choice', options?, correct}`
- `trace`: `{checkpoints:[{afterStep:Number, question, inputType, options?, correct}]}`（需 program）
- `slots`: `{goal:{type:'finalVar', name, value} | {type:'stdout', value}, slots:[{stepIndex, path:'expr'|'expr.right'|'cond.right'等, label, inputType:'number'|'choice', choices?}]}`（需 program）
- `freeEdit`: `{starterCode:String, goal:String, consoleMode:true, expectedStdout?:String}`（自由文本 C++，不逐行可视化，UI 显示"控制台模式"；`expectedStdout` 由内容侧提供，UI 侧完成判定用，见 §13-2 C）
- `bughunt`: `{bug:{stepIndex, wrongPiece, rightPiece, whyChild:'中文解释'}}`（需 program，program 里放的是**带 bug 版**）
- `teach-transfer`: `{teach:{title, script:[{say,show?}]}, transfer:{question, inputType, options?, correct}}`
- `explain`: `{prompt, sentenceStarters:[..], minWords?:0}`（口头/打字皆可，老师记录）
- `build`: `{choices:{skin:[..], initialEnergy:[..], events:[..]}, saveAs:'artifactCard'}`

## 6. Engine（lessonEngine.js）

`CppLab.Engine.createSession({lessonId, scaffold}) -> engine`

- 活动状态机：`idle -> (predicted) -> running(stepIndex) -> done`；有 `prediction` 而未提交时 `step()/runAll()` 返回 `{blocked:'need-prediction'}`。
- API：`loadLesson(lessonId)`、`getActivities()`、`getActivity(i)`、`getVariant(activity)`（按当前支架取 E/S/A）、`submitPrediction(value)`、`step()`、`runAll()`、`reset()`、`setScaffold(level, {reason, by:'auto'|'teacher'})`、`completeActivity({outcome, selfCorrection, transferResult})`、`next()`。
- 事件：`engine.on('trace-step'|'activity-done'|'scaffold-suggest'|'lesson-done', cb)`。
- **支架自动建议**（方案 4.2）：连续 2 个活动 outcome≥2 且 supportLevel≤S1 → 建议升一档；连续 2 个活动在 S2+ 提示后 outcome≤1 → 建议降一档。只建议，不自动切换；教师覆盖记录原因。
- **第 2 课状态承接**（方案 8.2）：`loadLesson('lesson2')` 时从 Storage 读取 lesson1 的 `{robotSkin, theme, finalEnergy, artifactCard, path}`，注入开场文案与初始 energy。
- 活动完成时自动调用 `CppLab.Evidence.record(...)`：`supportLevel` 由该活动已用最高提示档映射（无提示=S0，H1=S1，H2=S2，H3=S3，H4/H5=S4）。

## 7. Storage（storage.js）

- key：`cpplab_session_v1`（localStorage；Node 环境用内存 shim）。
- `CppLab.Storage.load() / save(session) / update(fn) / clear() / exportJSON()`；所有写入走 `update(fn)` 防覆盖。
- session 结构：

```js
{sessionId, createdAt, nickname, theme, robotSkin, path:'E'|'S'|'A',
 scaffoldHistory:[{at, from, to, by, reason}],
 lessons:{trial:{completed, activityStates:{}, interests:[], aiHabit:null},
          lesson1:{completed, finalEnergy, artifactCard, activityStates:{}},
          lesson2:{completed, customRule, activityStates:{}, pathConfirmed}},
 evidence:[], teacherNotes:[], hintsUsed:{activityId:['H1',..]},
 reports:{draft:null, confirmed:null}, settings:{anim:true, sound:false}}
```

## 8. CompilerAdapter（compiler.js）

`CppLab.Compiler.compile({activityId, source, stdin='', mode:'verify'|'free'}) -> Promise<Result>`

```
Result = {status:'ok'|'compile_error'|'runtime_error'|'timeout'|'offline',
          real:Boolean, stdout, stderr, compileOutput,
          friendlyErrors:[{line, message, hint}], compilerVersion, elapsedMs}
```

- **RemoteAdapter（默认）**：调公共编译执行 API 获得真实 g++ 编译与运行。首选 Compiler Explorer（godbolt.org）compile+execute 接口，备选 Wandbox `POST https://wandbox.org/api/compile.json`（`{code, compiler:'gcc-*', options:'', 'compiler-option-raw':'-std=c++17', stdin}`）。实现者必须用 curl 实测选定端点和 payload，跑通再写死。固定 -std=c++17、单文件、15 秒超时（AbortController）、stdout 截断 10KB、每次调用间隔≥1s 节流。
- **断网/失败** → resolve `{status:'offline', real:false}`；UI 必须显示「⚠️ 概念演示——真实编译暂不可用」，**绝不显示"验证成功"**（方案红线）。
- **MockAdapter**：仅 `mode:'verify'` 且活动有 program 时可用，用 `IR.execute` 的 stdout；结果 `real:false`。
- `CppLab.Compiler.setAdapter(name)`；`real:true` 只允许来自远程真实编译。
- **friendly error 规则映射**（9 类，中文儿童化，先规则后 AI；本期无 AI）：缺分号 `expected ';'`、未声明 `was not declared`、引号未闭合 `missing terminating`、括号花括号不匹配 `expected '}'`/`expected ')'`、缺表达式 `expected expression`/`expected primary-expression`、类型不匹配 `invalid conversion`/`cannot convert`、`=`/`==` 可疑（if 条件内赋值 `-Wparentheses` 或规则检测）、超时、输出过多。格式：`{line, message:'编译器在第4行附近没有找到分号。', hint:'先检查第3行的结尾。'}`；教师端可展开原始 stderr。

## 9. Evidence（evidence.js）

- `CppLab.Evidence.record(evt)`：append-only 写入 session.evidence。字段严格按方案 5.4：`{id, sessionId, timestamp, activityId, dimension, variant, taskPrompt, childAction, answerOrCode, attemptCount, supportLevel, outcome:'N'|0|1|2|3, selfCorrection, transferResult, teacherNote, confidence:'low'|'medium'|'high'}`。
- `summarize() -> {D1:{best, count, evidenceIds}, ... D12}`（未观察维度 best='N'）。
- `pathSuggestion() -> {suggested:'E'|'S'|'A', reasons:[..], confidence}`：严格按方案 5.3（含两条限制：D1 好不升级；自称学过但 D3 弱不进 A）。
- `setTeacherOverride(evtId, patch)`：教师改 outcome/note，保留原值于 `overridden` 字段。

## 10. Hints（hints.js）

- `CppLab.Hints.next(activityId, activity) -> {level, text} | {locked:'H5需教师解锁'} | {exhausted:true}`；逐级发放并记入 `session.hintsUsed`。
- `CppLab.Hints.setProvider(p)`；默认 `RuleBasedHintProvider`（读 activity.hintLadder）；`LLMHintProvider` 仅占位：`{enabled:false, note:'feature flag, 一期不启用'}`，并注释方案 11.4/11.5 边界。
- 试听 lessonId==='trial' 且核心诊断活动未全部完成时，`next()` 返回 `{aiDisabled:true, text:'试听诊断阶段提示由老师给出'}`（方案 11.2）——但 H1/H2 级预写提示仍可由**教师端**代读（教师面板可见完整阶梯）。

## 11. Report（report.js）

- `childFeedback(lessonId) -> {badges:[{icon,title,desc}], learnedOne:{options:[..]}, nextPreview}`（方案 5.5；徽章基于 evidence 实际达成）。
- `teacherProfile() -> D1-D12 向量表 + 兴趣类别 + 提示统计`。
- `parentReportDraft() -> {sections:[{key,title,items:[{text, tag:'已观察'|'初步判断'|'待验证', evidenceRefs:[..]}]}]}`，九个 section 按方案 5.6；禁止智力/人格/长期能力结论字样。
- `confirmReport(editedDraft) -> 存 reports.confirmed`；打印页只用 confirmed。
- `printableHTML(report) -> string`（自包含内联样式，供新窗口打印）。

## 12. Visualizer（visualizer.js）

`CppLab.Visualizer.mount(container, visualModel, opts) -> ctrl`

- `ctrl = {applyTraceEntry(entry), setVars(vars), reset(), setSkin(skin), setEnergy(n), showCond(result), setDoor(open), highlightLine(lineNo), branch(taken), celebrate(), destroy()}`
- 全 SVG/CSS：机器人 3 款皮肤（`robo-blue` 蓝色圆滚 / `robo-orange` 橙色方块 / `robo-dog` 绿色小狗）、能量条（0–12 格）、变量盒（旧值淡出→新值写入 ≤600ms）、舱门（开/关 + 真/假灯）、双分支轨道（未走一侧变灰）、函数机器（输入→处理→输出）。
- `document.body.classList.contains('no-anim')` 时所有动画瞬时完成。
- 真=绿✓、假=红✗，**图标与文字并用**，不允许仅颜色区分。
- 组件样式由本文件注入 `<style id="cpplab-visualizer-css">`，使用 §13 的 CSS 变量。

## 13. UI 规范

- 三栏布局：左任务场景 / 中代码台 / 右状态透镜（变量卡+执行时间线+输出+提示按钮）。
- 底部固定按钮：`先预测 · 单步 · 运行 · 重置 · 真实C++验证 · 求提示`；同屏 `.btn-primary`（高亮）≤2 个，由 app.js 按活动阶段切换。
- 代码四模式：`blocks / focus / full / free`，按支架开放（E: blocks+focus；S: +full；A: +free）。
- 首页：继续我的任务 / 进入试听任务 / 第1课 / 第2课 / 我的作品卡 / 右下角小字「教师入口」链到 teacher.html。
- 教师端 PIN 默认 `8888`（可在教师端修改，存 localStorage）。
- 全站中文；C++ 标识符英文，悬停 `title` 显示中文释义（如 energy=能量）。
- `css/main.css` 必须定义 token：`--c-bg:#f7f9fc; --c-card:#fff; --c-primary:#3b82f6; --c-accent:#f59e0b; --c-ok:#22c55e; --c-err:#ef4444; --c-ink:#1e293b; --c-muted:#64748b; --radius:14px;`；字体 system-ui 栈；儿童端正文 ≥17px；按钮大圆角大点击区。
- 右上角固定：动画开关 / 声音开关（本期声音可以只留开关不出声）。

## 14. 硬性红线（违反即 P0）

1. 不伪造真实编译：`real:false` 的结果 UI 一律带「概念演示」标记；离线时明确提示，绝无假"验证成功"。
2. 儿童端不显示 D 维度、分数、支架档位字样（E/S/A 不给孩子看），只显示徽章和鼓励。
3. 不采集真实姓名/学校/生日/音频；只有昵称。
4. LLM 默认关闭；无网络、无 AI 时课程全流程可用。
5. 单屏高亮主按钮 ≤2。
6. 家长报告未经教师确认不得进入打印页。
7. 试听核心诊断完成前不开放提示阶梯给儿童端（教师端可见）。
8. 内容与引擎分离：任何课程知识文案不得硬编码进 engine/ui 文件（开场白模板除外）。

## 15. 测试约定

- 每个纯逻辑模块配 `js/tests/test-<模块>.js`，零依赖，`node js/tests/test-xx.js` 运行，失败时 `process.exit(1)`，输出 `FAIL: 原因`；成功输出 `PASS (n assertions)`。
- 简单断言函数自写：`function assert(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exitCode = 1; } }`。

## §13-2 二轮UI补充（精简与适配）（2026-08-05 追加；不改动原有条款，与 §13/§14 冲突时以原条款红线为准）

### A. UI 精简 —— 当前用不上的东西不出现

1. **底部按钮条按活动动态渲染**（app.js `renderButtonBar`）：
   - 无 `prediction`（含 predict 型 interaction 回退）的活动不渲染「先预测」；
   - 无 `program` 的活动不渲染「单步 / 运行」；
   - 「真实C++验证」的渲染条件（三者满足其一即渲染，其余情况不渲染）：activityType 为 freeEdit；或当前处于 free 代码模式（free 模式例外——即使活动本身没有 `compilerCheck.enabled` 也渲染）；或活动有 program 且 `compilerCheck.enabled`；
   - 无提示入口时「求提示」**不渲染而非置灰**。无提示入口 = 活动没配儿童可见提示阶梯（`hintLadder` 为空或只有 teacherOnly 的 H5），或试听诊断闸门关闭（此时提示由教师端代读，红线 §14.7 不变）；
   - 「重置」始终保留。切换代码模式进入/离开 free 会即时重渲按钮条。
2. **无 program 的活动**（choice / 无程序 ordering / explain / build / teach-transfer / 无程序 predict）：整个代码台栏（`#code-host`）不渲染，场景+交互区占满中栏；freeEdit 例外（代码台 = 自由编辑区）。
3. **代码台模式 tabs**：只渲染当前支架可用且本活动可用的模式；只有一种可用模式时不显示 tabs 只显示内容；「🔭 查看完整程序」透视按钮保留（有 program 时）。
4. **右侧状态透镜**：无 program 时隐藏变量卡+执行时间线+输出屏；提示面板默认折叠成小按钮（`.hint-collapsed`），领到提示内容或孩子点开才展开；无提示入口且未领过提示时提示面板整个不出现；右栏全空时整栏收起（`.lesson-grid.no-lens`，布局重排为两栏不留空栏）。空态文案一律一行以内。
5. **教师端无会话空态**：孩子端从未开始（无昵称、无证据、无活动状态）时，教师端只在实时区给一句话空态（`renderFreshEmpty`），其余面板留空，不渲染满屏空卡；孩子端一开始会话即自动恢复全部面板。

### B. 全屏 slide 式适配（iPad + 笔记本）

1. **meta**：index.html 使用 `viewport-fit=cover` viewport + `apple-mobile-web-app-capable` / `mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style`；`body { touch-action: manipulation; }` 防双击缩放。
2. **应用壳**：`#app` 为 `100dvh`（带 `100vh` 回退）flex 纵向壳；`html/body overflow:hidden` —— 页面永不整体滚动、无横向滚动；`.view` 是唯一的纵向滚动容器，宽内容（代码块/表格）只在自身容器内 `overflow-x:auto`。
3. **断点**：≥1200px 三栏；768–1199px 两栏（场景+交互为主），状态透镜变为右下角浮动「📊 状态」按钮呼出的右侧抽屉（`.state-lens.open`，抽屉内含变量卡/时间线/输出/提示，遮罩或「✕ 收起」关闭）；<768px 前两栏（场景+交互）堆叠为单列 1fr，状态透镜**维持抽屉形态不做整页单栏堆叠改造**（2026-08-05 裁定：目标设备为 iPad/笔记本，<768 仅为兜底）。字号用 `clamp()` 随视口缩放但儿童端正文不低于 17px（§13 红线不破）；触控目标 ≥44px（`pointer:coarse` 下 btn-sm/code-tab/顶栏回首页 `.brand`/抓虫可点代码行 `.code-line.clickable` 等直接绑 click 的元素统一提升到 44px）。状态 FAB（`.lens-fab`）按底部按钮条实际高度定位：app.js 用 ResizeObserver 把按钮条高度写入 CSS 变量 `--btnbar-h`，FAB `bottom = calc(var(--btnbar-h) + 12px)`；顶栏/`.view`/`.btnbar-wrap`/`.lens-fab`/抽屉均补 `env(safe-area-inset-*)` 回退间距（配合 `viewport-fit=cover` 与添加到主屏幕场景）。
4. **全屏**：顶栏「⛶ 全屏」按钮，`requestFullscreen` + `webkitRequestFullscreen` 回退；都不支持（旧 iPad Safari）时 toast 提示「用 Safari 分享→添加到主屏幕，可获得全屏体验」。
5. **可视化**：`#viz-host svg { max-width:100%; max-height:100%; }` 等比缩放不溢出。
6. **教师端**：仅基础响应式（≤760px 卡片堆叠、宽表格容器内横滚、页面可滚），不做 slide 化；PIN 卡宽度 `min(340px, calc(100vw - 24px))` 防窄屏溢出。

### C. freeEdit 完成判定与离线通道（2026-08-05 跨文件约定，内容侧与 UI 侧共同遵守）

1. **完成判定**：freeEdit 的 `interaction` 可带 `expectedStdout:String`（内容侧提供）。UI 侧完成规则——变体带 `prediction` 时必须已提交预测（未提交时「真实C++验证」引导先预测，不发起编译）；真实编译 `real:true && status:'ok'`；配置了 `expectedStdout` 时还需 `stdout.trim() === expectedStdout`，三者齐备才 `completeCurrent`。输出不匹配只展示真实输出并提示再试，绝不自动过关（堵死"不改代码直接验证也能过关"）。
2. **离线通道**：远程编译不可用（`real:false`）时，freeEdit 在「概念演示」卡内显示「📴 现在没网，真实编译用不了。请老师看过你的代码后确认」与「老师确认完成」按钮；点击后 `completeCurrent`，证据 `childAction` 记「离线-教师人工确认」（outcome 记 `N`，由教师在证据流补记完成度）；作品/结果绝不打真实验证标记（红线 §14.1 不变）。
3. **两段式 predict**：predict 型活动同时带 `variants.*.prediction`（热身）与 `interaction.question`（主提问）时，预测+运行完成后由 UI 弹出主提问作答，完成判定看主提问而非热身。例外：内容把同一道题同时写进两处（问题与答案完全相同，如 lesson2-06）视为单段式，不重复提问。bughunt / teach-transfer / slots 带 `prediction` 时，运行结束一律走各自类型的完成判定，预测仅作热身，不得短路 `completeCurrent`。
