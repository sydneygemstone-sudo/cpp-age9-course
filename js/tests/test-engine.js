/**
 * test-engine.js — CppLab.Engine / CppLab.Storage 零依赖测试
 *
 * 运行：node js/tests/test-engine.js
 * 约定（CONTRACT §15）：失败输出 FAIL 并 exit 1；成功输出 PASS (n assertions)。
 *
 * 本测试不依赖真实内容文件与真实 IR：
 * - 注入最小 fixture 课程（lesson1 / lesson2）验证状态机、预测门、支架建议、
 *   跨课承接替换、evidence 挂钩、进度持久化。
 * - CppLab.IR 用一个只覆盖 fixture 所需指令的迷你解释器桩替代。
 */

'use strict';

var assertCount = 0;
function assert(cond, msg) {
  assertCount += 1;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

// ---------- 加载被测模块（共享 globalThis.CppLab 命名空间） ----------

var Storage = require('../engine/storage.js');
var Engine = require('../engine/lessonEngine.js');
var CppLab = globalThis.CppLab;

assert(CppLab && CppLab.Storage === Storage, 'storage.js 应挂载 CppLab.Storage');
assert(CppLab && CppLab.Engine === Engine, 'lessonEngine.js 应挂载 CppLab.Engine');

// ---------- IR 桩：只支持 fixture 用到的 declare/assign/output 与 lit/var/bin ----------

function evalExpr(expr, vars) {
  if (!expr) return undefined;
  if (expr.kind === 'lit') return expr.value;
  if (expr.kind === 'var') return vars[expr.name];
  if (expr.kind === 'bin') {
    var l = evalExpr(expr.left, vars);
    var r = evalExpr(expr.right, vars);
    switch (expr.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '>=': return l >= r;
      case '>': return l > r;
    }
  }
  throw new Error('IR 桩不支持的表达式: ' + JSON.stringify(expr));
}

CppLab.IR = {
  execute: function (program) {
    var vars = {};
    var stdout = '';
    var trace = [];
    for (var i = 0; i < program.length; i++) {
      var step = program[i];
      var before = JSON.parse(JSON.stringify(vars));
      var desc = '';
      if (step.op === 'declare') {
        vars[step.name] = evalExpr(step.expr, vars);
        desc = '创建变量 ' + step.name + '，初始值 ' + vars[step.name];
      } else if (step.op === 'assign') {
        vars[step.name] = evalExpr(step.expr, vars);
        desc = '把新值 ' + vars[step.name] + ' 写回 ' + step.name;
      } else if (step.op === 'output') {
        stdout += String(evalExpr(step.expr, vars));
        desc = '输出 ' + stdout;
      } else {
        throw new Error('IR 桩不支持的指令: ' + step.op);
      }
      trace.push({
        index: i, lineNo: i + 1, kind: step.op,
        varsBefore: before, varsAfter: JSON.parse(JSON.stringify(vars)),
        outputSoFar: stdout, description: desc
      });
    }
    return { trace: trace, finalVars: vars, stdout: stdout };
  }
};

// ---------- Evidence 桩 ----------

var recordedEvidence = [];
CppLab.Evidence = {
  record: function (evt) { recordedEvidence.push(evt); }
};

// ---------- fixture 内容（三档共用同一变体工厂，聚焦引擎逻辑） ----------

function litExpr(v) { return { kind: 'lit', value: v }; }

function makeVariants(variant) {
  return { E: variant, S: variant, A: variant };
}

var energyProgram = [
  { op: 'declare', varType: 'int', name: 'energy', expr: litExpr(3) },
  { op: 'assign', name: 'energy', expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'energy' }, right: litExpr(4) } }
];

CppLab.content = CppLab.content || {};
CppLab.content.lesson1 = {
  lessonId: 'lesson1',
  intro: '给机器人充电的一天开始啦！',
  activities: [
    {
      id: 'lesson1-01-energy-predict', lessonId: 'lesson1', order: 1,
      title: '能量预测', childPrompt: '先猜猜运行后能量是多少？',
      dimensions: ['D3'], activityType: 'predict', visualModel: 'energy',
      evidenceRule: { dimension: 'D3', note: '状态追踪' },
      variants: makeVariants({
        intro: '看看能量会变成多少。',
        program: energyProgram,
        interaction: { question: '运行后 energy 是多少？', inputType: 'number', correct: 7 },
        prediction: { question: '运行后 energy 是多少？', inputType: 'number', correct: 7 },
        successCriteria: '预测并验证能量终值'
      })
    },
    {
      id: 'lesson1-02-name-choice', lessonId: 'lesson1', order: 2,
      title: '选变量名', childPrompt: '哪个名字最适合装能量？',
      dimensions: ['D4'], activityType: 'choice', visualModel: 'none',
      evidenceRule: { dimension: 'D4', note: '变量命名意识' },
      variants: makeVariants({
        intro: '给盒子起个好名字。',
        program: null,
        interaction: { question: '选哪个？', options: [{ id: 'a', label: 'energy', correct: true }, { id: 'b', label: 'x' }] },
        prediction: null,
        successCriteria: '选出合适的变量名'
      })
    },
    {
      id: 'lesson1-03-free-run', lessonId: 'lesson1', order: 3,
      title: '自由运行', childPrompt: '让程序跑起来看看吧！',
      dimensions: ['D3'], activityType: 'trace', visualModel: 'energy',
      evidenceRule: { dimension: 'D3', note: '逐行追踪' },
      variants: makeVariants({
        intro: '这次不用先猜，直接单步看。',
        program: energyProgram,
        interaction: { checkpoints: [] },
        prediction: null,
        successCriteria: '完整跑完一次程序'
      })
    }
  ]
};

CppLab.content.lesson2 = {
  lessonId: 'lesson2',
  intro: '智能舱门正在等你。',
  activities: [
    {
      id: 'lesson2-01-door-inherit', lessonId: 'lesson2', order: 1,
      title: '带着能量来开门', childPrompt: '你的能量能打开舱门吗？',
      dimensions: ['D5'], activityType: 'predict', visualModel: 'door',
      evidenceRule: { dimension: 'D5', note: '条件判断' },
      variants: makeVariants({
        intro: '舱门只认能量数。',
        dynamic: { initFromLesson1Energy: true },
        program: [
          { op: 'declare', varType: 'int', name: 'energy', expr: litExpr(5) },
          { op: 'output', expr: { kind: 'var', name: 'energy' } }
        ],
        interaction: { question: '现在 energy 是多少？', inputType: 'number', correct: null },
        prediction: { question: '现在 energy 是多少？', inputType: 'number', correct: null, correctFromInherited: true },
        successCriteria: '说出继承来的能量值'
      })
    }
  ]
};

// ================= 1. Storage 基础 =================

Storage.clear();
var s0 = Storage.load();
assert(typeof s0.sessionId === 'string' && s0.sessionId.length > 0, 'load 应生成 sessionId');
assert(s0.lessons && s0.lessons.trial && s0.lessons.lesson1 && s0.lessons.lesson2, '默认会话应含三课容器');
assert(Array.isArray(s0.scaffoldHistory) && Array.isArray(s0.evidence), '默认会话应含 scaffoldHistory/evidence 数组');

Storage.update(function (s) { s.nickname = '小北'; });
assert(Storage.load().nickname === '小北', 'update 写入应持久化');
assert(Storage.load().sessionId === s0.sessionId, 'update 不应更换 sessionId');

var exported = JSON.parse(Storage.exportJSON());
assert(exported.nickname === '小北', 'exportJSON 应导出当前会话');

Storage.clear();
assert(Storage.load().nickname === '', 'clear 后应回到全新会话');

// ================= 2. 状态机与预测门 =================

Storage.clear();
var traceEvents = [];
var eng = Engine.createSession({ lessonId: 'lesson1', scaffold: 'S' });
eng.on('trace-step', function (e) { traceEvents.push(e); });

assert(eng.getActivities().length === 3, 'lesson1 fixture 应有 3 个活动');
assert(eng.getActivityState().status === 'idle', '初始状态应为 idle');

var r1 = eng.step();
assert(r1.blocked === 'need-prediction', '未预测时 step 应被拦截');
var r2 = eng.runAll();
assert(r2.blocked === 'need-prediction', '未预测时 runAll 应被拦截');
assert(traceEvents.length === 0, '被拦截时不应发出 trace-step');

var p = eng.submitPrediction('7');
assert(p.ok === true && p.correct === true, '预测 7（字符串）应判为正确');
assert(eng.getActivityState().status === 'predicted', '提交预测后状态应为 predicted');

var st1 = eng.step();
assert(st1.entry && st1.entry.kind === 'declare' && st1.done === false, '第一步应为 declare 且未结束');
assert(eng.getActivityState().status === 'running', '单步后状态应为 running');
var st2 = eng.step();
assert(st2.done === true, '第二步后应结束');
assert(eng.getActivityState().status === 'done', '跑完后状态应为 done');
assert(traceEvents.length === 2, '应逐条发出 2 个 trace-step 事件');
assert(traceEvents[1].varsAfter.energy === 7, 'trace 应算出 energy=7');

// lesson1 执行完毕应自动保存 finalEnergy（承接源头）
assert(Storage.load().lessons.lesson1.finalEnergy === 7, 'lesson1 运行完应保存 finalEnergy=7');

// ================= 3. reset 不丢课程进度 =================

var done1 = eng.completeActivity({ outcome: 3, selfCorrection: false });
assert(done1.ok === true, 'completeActivity 应成功');
assert(Storage.load().lessons.lesson1.activityStates['lesson1-01-energy-predict'].status === 'done',
  '完成状态应持久化');

eng.next();
assert(eng.getCurrentActivity().id === 'lesson1-02-name-choice', 'next 应进入第二个活动');
var noProg = eng.runAll();
assert(noProg.noProgram === true, '无 program 的活动 runAll 应返回 noProgram');

eng.reset();
assert(eng.getActivityState().status === 'idle', 'reset 应回到 idle');
assert(Storage.load().lessons.lesson1.activityStates['lesson1-01-energy-predict'].status === 'done',
  'reset 不应丢已完成活动的进度');

// ================= 4. evidence 挂钩与 supportLevel 映射 =================

assert(recordedEvidence.length === 1, '完成活动应记录 1 条证据');
var ev1 = recordedEvidence[0];
assert(ev1.activityId === 'lesson1-01-energy-predict', '证据应带 activityId');
assert(ev1.dimension === 'D3', '证据维度应取 evidenceRule.dimension');
assert(ev1.variant === 'S', '证据应记录当前支架档');
assert(ev1.supportLevel === 'S0', '未用提示应映射为 S0');
assert(ev1.outcome === 3 && ev1.attemptCount >= 1, '证据应含 outcome 与 attemptCount');
assert(String(ev1.answerOrCode) === '7', '证据 answerOrCode 应默认取预测值');

// 模拟提示使用：H1+H3 → S3；H5 → S4
Storage.update(function (s) {
  s.hintsUsed['lesson1-02-name-choice'] = ['H1', 'H3'];
  s.hintsUsed['lesson1-03-free-run'] = ['H5'];
});
eng.completeActivity({ outcome: 2 });
assert(recordedEvidence[1].supportLevel === 'S3', 'H1+H3 应映射为 S3');

eng.next();
eng.runAll();
var done3 = eng.completeActivity({ outcome: 1 });
assert(recordedEvidence[2].supportLevel === 'S4', 'H5 应映射为 S4');
assert(done3.lessonDone === true, '三个活动全完成应触发课程完成');
assert(Storage.load().lessons.lesson1.completed === true, '课程完成应持久化');

// ================= 5. lesson-done 事件 =================

Storage.clear();
recordedEvidence.length = 0;
var engB = Engine.createSession({ lessonId: 'lesson1', scaffold: 'E' });
var lessonDoneFired = 0;
var activityDoneFired = 0;
engB.on('lesson-done', function () { lessonDoneFired += 1; });
engB.on('activity-done', function () { activityDoneFired += 1; });

engB.submitPrediction(7);
engB.runAll();
engB.completeActivity({ outcome: 3 });
engB.next();
engB.completeActivity({ outcome: 3 });
engB.next();
engB.runAll();
engB.completeActivity({ outcome: 3 });
assert(activityDoneFired === 3, '应发出 3 次 activity-done');
assert(lessonDoneFired === 1, '应发出 1 次 lesson-done');
assert(engB.next().lessonDone === true, '最后一个活动后 next 应返回 lessonDone');

// ================= 6. 支架自动建议：升档（只建议不切换） =================

Storage.clear();
var engUp = Engine.createSession({ lessonId: 'lesson1', scaffold: 'E' });
var suggestions = [];
engUp.on('scaffold-suggest', function (sug) { suggestions.push(sug); });

engUp.submitPrediction(7);
engUp.runAll();
engUp.completeActivity({ outcome: 3 });      // 第 1 个高分，无提示
assert(suggestions.length === 0, '单个活动表现不应触发建议（方案：单题不分流）');
engUp.next();
engUp.completeActivity({ outcome: 2 });      // 第 2 个高分，无提示
assert(suggestions.length === 1, '连续两个高分低提示应触发升档建议');
assert(suggestions[0].direction === 'up' && suggestions[0].from === 'E' && suggestions[0].to === 'S',
  '建议应为 E 升 S');
assert(engUp.scaffold === 'E', '自动建议不应实际切换支架');

// ================= 7. 支架自动建议：降档 =================

Storage.clear();
var engDown = Engine.createSession({ lessonId: 'lesson1', scaffold: 'S' });
var downSugs = [];
engDown.on('scaffold-suggest', function (sug) { downSugs.push(sug); });

Storage.update(function (s) {
  s.hintsUsed['lesson1-01-energy-predict'] = ['H2'];
  s.hintsUsed['lesson1-02-name-choice'] = ['H2', 'H3'];
});
engDown.submitPrediction(7);
engDown.runAll();
engDown.completeActivity({ outcome: 1 });    // S2 提示后仍偏低
engDown.next();
engDown.completeActivity({ outcome: 0 });    // S3 提示后仍偏低
assert(downSugs.length === 1, '连续两个强提示低完成应触发降档建议');
assert(downSugs[0].direction === 'down' && downSugs[0].to === 'E', '建议应为 S 降 E');
assert(engDown.scaffold === 'S', '降档建议同样不应自动切换');

// E 档不应再建议降档
Storage.clear();
var engFloor = Engine.createSession({ lessonId: 'lesson1', scaffold: 'E' });
var floorSugs = [];
engFloor.on('scaffold-suggest', function (sug) { floorSugs.push(sug); });
Storage.update(function (s) {
  s.hintsUsed['lesson1-01-energy-predict'] = ['H3'];
  s.hintsUsed['lesson1-02-name-choice'] = ['H3'];
});
engFloor.submitPrediction(7);
engFloor.runAll();
engFloor.completeActivity({ outcome: 0 });
engFloor.next();
engFloor.completeActivity({ outcome: 0 });
assert(floorSugs.length === 0, 'E 档到底后不应再建议降档');

// ================= 8. setScaffold 记录 scaffoldHistory =================

Storage.clear();
var engT = Engine.createSession({ lessonId: 'lesson1', scaffold: 'S' });
var setRes = engT.setScaffold('A', { reason: '孩子自述学过 Python 且解释准确', by: 'teacher' });
assert(setRes.ok === true && engT.scaffold === 'A', 'setScaffold 应切换成功');
var hist = Storage.load().scaffoldHistory;
assert(hist.length === 1, 'scaffoldHistory 应有 1 条记录');
assert(hist[0].from === 'S' && hist[0].to === 'A' && hist[0].by === 'teacher', '历史应记录 from/to/by');
assert(typeof hist[0].at === 'string' && hist[0].reason.indexOf('Python') >= 0, '历史应记录时间与原因');
assert(Storage.load().path === 'A', 'setScaffold 应同步 session.path');
assert(engT.setScaffold('X', {}).ok === false, '非法档位应被拒绝');

// ================= 9. 跨课承接：lesson2 动态替换 =================

// 9a. Storage 有 lesson1.finalEnergy=9 → 替换为 9，prediction.correct 同步
Storage.clear();
Storage.update(function (s) {
  s.robotSkin = 'robo-dog';
  s.theme = 'pet';
  s.lessons.lesson1.finalEnergy = 9;
});
var eng2 = Engine.createSession({ lessonId: 'lesson2', scaffold: 'S' });
var act2 = eng2.getActivity(0);
var v2 = eng2.getVariant(act2);
assert(v2.program[0].expr.kind === 'lit' && v2.program[0].expr.value === 9,
  '承接：第一个 declare(energy) 应替换为 lesson1.finalEnergy=9');
assert(v2.prediction.correct === 9, '承接：correctFromInherited 应同步 prediction.correct=9');
assert(CppLab.content.lesson2.activities[0].variants.S.program[0].expr.value === 5,
  '承接替换不得改写内容文件原始对象');

// 开场文案应注入皮肤/主题/上次能量
var intro2 = eng2.getLessonIntro();
assert(intro2.indexOf('绿色小狗机器人') >= 0, '开场文案应包含机器人皮肤名称');
assert(intro2.indexOf('宠物乐园') >= 0, '开场文案应包含主题名称');
assert(intro2.indexOf('9') >= 0, '开场文案应包含上次能量值');
var carry = eng2.getCarryOver();
assert(carry.finalEnergy === 9 && carry.robotSkin === 'robo-dog' && carry.theme === 'pet',
  'getCarryOver 应返回承接状态');

// 承接后的预测门：用继承值预测应判对，且执行 trace 用的是替换后的程序
eng2.on('trace-step', function () {});
var p2 = eng2.submitPrediction(9);
assert(p2.correct === true, '用继承能量 9 预测应判对');
var run2 = eng2.runAll();
assert(run2.finalVars.energy === 9 && run2.stdout === '9', '执行应使用替换后的 energy=9');

// 9b. Storage 无值 → 用内容文件默认值 5
Storage.clear();
var eng2b = Engine.createSession({ lessonId: 'lesson2', scaffold: 'S' });
var v2b = eng2b.getVariant(eng2b.getActivity(0));
assert(v2b.program[0].expr.value === 5, 'Storage 无 finalEnergy 时应用内容文件默认值 5');
assert(v2b.prediction.correct === 5, '默认值场景 prediction.correct 应同步为 5');
var intro2b = eng2b.getLessonIntro();
assert(intro2b.indexOf('机器人伙伴') >= 0, '无皮肤记录时开场文案应用通用称呼');

// ================= 10. 错误预测也放行执行（预测门只管"有没有预测"） =================

Storage.clear();
var engW = Engine.createSession({ lessonId: 'lesson1', scaffold: 'S' });
var pw = engW.submitPrediction(100);
assert(pw.ok === true && pw.correct === false, '错误预测应提交成功且判为不正确');
var rw = engW.runAll();
assert(Array.isArray(rw.trace) && rw.finalVars.energy === 7, '错误预测后仍应正常执行');

// ================= 收尾 =================

if (process.exitCode === 1) {
  console.error('测试未全部通过。');
} else {
  console.log('PASS (' + assertCount + ' assertions)');
}
