/* ============================================================
 * js/tests/test-evidence.js — CppLab.Evidence / CppLab.Report 测试
 * owner: evidence-report ｜ 运行: node js/tests/test-evidence.js
 * 约定见 CONTRACT §15：零依赖，失败 exit 1 输出 FAIL，成功输出 PASS。
 * ============================================================ */
'use strict';

var path = require('path');
var Evidence = require(path.join(__dirname, '..', 'engine', 'evidence.js'));
var Report = require(path.join(__dirname, '..', 'engine', 'report.js'));

var assertions = 0;
function assert(cond, msg) {
  assertions += 1;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}
function assertThrows(fn, msg) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  assert(threw, msg);
}

function reset() { Evidence._reset(); }

/* 快捷造证据 */
function rec(dimension, outcome, opts) {
  opts = opts || {};
  return Evidence.record({
    dimension: dimension,
    outcome: outcome,
    activityId: opts.activityId || 'trial-01-demo',
    taskPrompt: opts.taskPrompt || '课堂任务',
    childAction: opts.childAction || '',
    answerOrCode: opts.answerOrCode || '',
    supportLevel: opts.supportLevel || 'S0',
    variant: opts.variant || 'S',
    attemptCount: opts.attemptCount,
    selfCorrection: opts.selfCorrection,
    transferResult: opts.transferResult,
    teacherNote: opts.teacherNote,
    confidence: opts.confidence
  });
}

/* ============ 1. record：字段完整性与 append-only ============ */
reset();
var r1 = rec('D3', 2, { taskPrompt: '追踪能量三步变化', supportLevel: 'S1' });
assert(typeof r1.id === 'string' && r1.id.length > 0, 'record 应生成 id');
assert(typeof r1.sessionId === 'string' && r1.sessionId.length > 0, 'record 应带 sessionId');
assert(typeof r1.timestamp === 'string' && r1.timestamp.length > 0, 'record 应带 timestamp');
assert(r1.dimension === 'D3' && r1.outcome === 2, 'record 应保留 dimension/outcome');
assert(r1.attemptCount === 1, 'attemptCount 默认 1');
assert(r1.selfCorrection === false, 'selfCorrection 默认 false');
assert(r1.confidence === 'medium', 'confidence 默认 medium');
assert(r1.supportLevel === 'S1', 'supportLevel 应保留');
var r2 = rec('D2', 1);
assert(Evidence.getAll().length === 2, 'append-only：两次 record 后应有 2 条');
assert(r1.id !== r2.id, '两条记录 id 应不同');
assertThrows(function () { rec('D13', 1); }, '非法维度应抛错');
assertThrows(function () { rec('D3', 5); }, '非法 outcome 应抛错');

/* ============ 2. summarize：N 处理 ============ */
reset();
rec('D3', 'N');
var sum = Evidence.summarize();
assert(sum.D3.best === 'N', '只有 N 结果的维度 best 应为 N（不解释为不会）');
assert(sum.D3.count === 1 && sum.D3.evidenceIds.length === 1, 'N 记录也计入 count 与 evidenceIds');
assert(sum.D5.best === 'N' && sum.D5.count === 0, '未观察维度 best=N 且 count=0');
rec('D3', 1);
rec('D3', 3);
sum = Evidence.summarize();
assert(sum.D3.best === 3 && sum.D3.count === 3, 'best 取数字结果最大值，count 含 N 记录');

/* ============ 3. pathSuggestion：探索线 ============ */
reset();
rec('D2', 1, { supportLevel: 'S2' });
rec('D3', 0, { supportLevel: 'S4' });
rec('D4', 1, { supportLevel: 'S3' });
rec('D8', 2, { supportLevel: 'S1' });
rec('D9', 2, { supportLevel: 'S1' });
var ps = Evidence.pathSuggestion();
assert(ps.suggested === 'E', '三个核心维度 0-1 应推荐探索线');
assert(Array.isArray(ps.reasons) && ps.reasons.length > 0, '探索线应给出理由');
assert(ps.confidence === 'medium' || ps.confidence === 'high', '五个核心维度均观察，置信度不应为 low');

reset();
rec('D2', 2); rec('D3', 2); rec('D4', 2); rec('D8', 2);
rec('D9', 1, { supportLevel: 'S4' });
ps = Evidence.pathSuggestion();
assert(ps.suggested === 'E', '迁移仍需逐步示范（D9 用到 S4）应推荐探索线');

reset();
rec('D2', 2); rec('D3', 2); rec('D4', 2); rec('D8', 2); rec('D9', 2);
rec('D12', 0, { supportLevel: 'S4' });
ps = Evidence.pathSuggestion();
assert(ps.suggested === 'E', '电脑操作明显妨碍表达应推荐探索线');

/* ============ 4. pathSuggestion：标准线（中间态） ============ */
reset();
rec('D2', 2, { supportLevel: 'S1' });
rec('D3', 2, { supportLevel: 'S1' });
rec('D4', 2, { supportLevel: 'S2' });
rec('D8', 2, { supportLevel: 'S2' });
rec('D9', 2, { supportLevel: 'S1' });
ps = Evidence.pathSuggestion();
assert(ps.suggested === 'S', '未触发探索线且加速证据不全时应为标准线');
assert(ps.reasons.join('').indexOf('加速线') >= 0, '标准线理由应说明缺哪些加速证据');

/* ============ 5. pathSuggestion：加速线（全部证据同时出现） ============ */
reset();
rec('D3', 3, { supportLevel: 'S0', taskPrompt: '同时追踪能量和分数两个状态' });
rec('D5', 3, { supportLevel: 'S1', childAction: '解释了为什么 >= 会让边界值开门' });
rec('D8', 2, { supportLevel: 'S0', answerOrCode: '自己修好了缺分号的程序' });
rec('D9', 3, { supportLevel: 'S1' });
rec('D6', 2, { transferResult: 'experience-verified', teacherNote: '既往作品经验已验证' });
ps = Evidence.pathSuggestion();
assert(ps.suggested === 'A', '五项加速证据同时出现应推荐加速线');
assert(ps.reasons.length > 0, '加速线应列出证据理由');

/* ============ 6. 限制 1：D1 好不升级路径 ============ */
reset();
rec('D1', 3, { supportLevel: 'S0', taskPrompt: '能量四则运算全对' });
rec('D2', 2, { supportLevel: 'S1' });
rec('D3', 2, { supportLevel: 'S1' });
rec('D4', 2, { supportLevel: 'S2' });
rec('D8', 2, { supportLevel: 'S2' });
rec('D9', 2, { supportLevel: 'S1' });
ps = Evidence.pathSuggestion();
assert(ps.suggested === 'S', '数学 D1=3 不能把路径抬到加速线');
assert(ps.reasons.join('').indexOf('不单独提升') >= 0, '理由应说明数学好不单独提升路径');

/* ============ 7. 限制 2：自称学过但 D3 弱不进加速线 ============ */
reset();
rec('D3', 1, { supportLevel: 'S2', childAction: '我学过C++，但数了两遍还是说不出能量现在是几' });
rec('D5', 3, { supportLevel: 'S1' });
rec('D8', 2, { supportLevel: 'S0' });
rec('D9', 3, { supportLevel: 'S0' });
rec('D6', 2, { transferResult: 'experience-verified' });
ps = Evidence.pathSuggestion();
assert(ps.suggested !== 'A', '自称学过但状态追踪弱不得进入加速线');
assert(ps.reasons.join('').indexOf('自称学过') >= 0, '理由应引用限制 2');

/* ============ 8. setTeacherOverride：保留原值 ============ */
reset();
var r3 = rec('D3', 1, { supportLevel: 'S2' });
Evidence.setTeacherOverride(r3.id, { outcome: 3, teacherNote: '现场复核：其实能独立解释' });
var e3 = Evidence.getById(r3.id);
assert(e3.outcome === 3, '覆盖后 outcome 应为新值');
assert(e3.overridden && e3.overridden.original.outcome === 1, '原 outcome 应保留在 overridden.original');
assert(e3.overridden.original.teacherNote === '', '原 teacherNote 应保留');
assert(Evidence.summarize().D3.best === 3, 'summarize 应使用覆盖后的值');
Evidence.setTeacherOverride(r3.id, { outcome: 2 });
e3 = Evidence.getById(r3.id);
assert(e3.outcome === 2 && e3.overridden.original.outcome === 1, '再次覆盖不得丢失最初原值');
assertThrows(function () { Evidence.setTeacherOverride('no-such-id', { outcome: 1 }); }, '覆盖不存在的记录应抛错');

/* ============ 9. Report.childFeedback：徽章与儿童端红线 ============ */
reset();
rec('D3', 2, { activityId: 'lesson1-02-energy', taskPrompt: '让能量刚好到 10' });
rec('D2', 1, { activityId: 'lesson1-01-order', selfCorrection: true });
rec('D8', 0, { activityId: 'lesson1-03-bug', supportLevel: 'S4' });
var fb = Report.childFeedback('lesson1');
var titles = fb.badges.map(function (b) { return b.title; });
assert(titles.indexOf('能量管理员') >= 0, 'D3 达成应发能量管理员徽章');
assert(titles.indexOf('顺序导航员') >= 0, 'D2=1 且自我修正应发顺序导航员徽章');
assert(titles.indexOf('错误侦探') < 0, 'D8=0 不应发错误侦探徽章');
assert(fb.learnedOne && fb.learnedOne.options.length >= 2, 'learnedOne 应提供可选项');
assert(fb.nextPreview.indexOf('舱门') >= 0, 'lesson1 的下节预告应指向舱门规则');
var fbText = JSON.stringify(fb);
assert(!/D(1[0-2]|[1-9])\b/.test(fbText), '儿童端输出不得出现 D 维度编号');
assert(!/探索线|标准线|加速线|支架|档位|分数|得分/.test(fbText), '儿童端输出不得出现路径/支架/分数字样');

var fb2 = Report.childFeedback('lesson2');
assert(fb2.badges.length === 1 && fb2.badges[0].title === '勇敢探索者', '无达成证据时应给鼓励性兜底徽章');

/* ============ 10. teacherProfile ============ */
reset();
rec('D3', 2); rec('D11', 2);
var memSession = (typeof globalThis !== 'undefined' ? globalThis : this).CppLab.__memSession;
memSession.hintsUsed = { 'trial-03-energy': ['H1', 'H2'], 'lesson1-02-energy': ['H1'] };
memSession.lessons.trial.interests = ['机器人与机械', '调试解谜'];
var tp = Report.teacherProfile();
assert(tp.dimensions.length === 12, '教师画像应含 12 个维度');
assert(tp.dimensions[2].dimension === 'D3' && tp.dimensions[2].best === 2, '维度向量应带 best');
assert(tp.hintStats.total === 3 && tp.hintStats.byLevel.H1 === 2, '提示统计应按级别汇总');
assert(tp.interests.indexOf('调试解谜') >= 0, '教师画像应含兴趣类别');
assert(tp.pathSuggestion && tp.pathSuggestion.suggested, '教师画像应附路径建议');

/* ============ 11. parentReportDraft：九节、三标签、证据回链 ============ */
reset();
rec('D3', 1, { activityId: 'trial-03-energy', taskPrompt: '能量三步变化', supportLevel: 'S3' });
rec('D3', 2, { activityId: 'trial-05-energy2', taskPrompt: '新的能量任务', supportLevel: 'S1' });
rec('D2', 2, { activityId: 'trial-01-order', taskPrompt: '排列指令', supportLevel: 'S0', selfCorrection: true });
rec('D8', 1, { activityId: 'trial-06-bug', taskPrompt: '找出开门规则的问题', supportLevel: 'S3', attemptCount: 2 });
memSession = (typeof globalThis !== 'undefined' ? globalThis : this).CppLab.__memSession;
memSession.lessons.trial.interests = ['游戏规则'];
memSession.nickname = '小星';
var draft = Report.parentReportDraft();
assert(draft.sections.length === 9, '家长报告草稿应有九个 section');
var validTags = { '已观察': 1, '初步判断': 1, '待验证': 1 };
var allIds = {};
Evidence.getAll().forEach(function (e) { allIds[e.id] = true; });
var refsOk = true, tagsOk = true;
draft.sections.forEach(function (sec) {
  sec.items.forEach(function (it) {
    if (!validTags[it.tag]) { tagsOk = false; }
    if (!Array.isArray(it.evidenceRefs)) { refsOk = false; return; }
    it.evidenceRefs.forEach(function (id) { if (!allIds[id]) { refsOk = false; } });
  });
});
assert(tagsOk, '每条 item 的 tag 必须是 已观察/初步判断/待验证 之一');
assert(refsOk, 'evidenceRefs 必须能回链到真实证据 id');
var observedSec = draft.sections[1];
var hasRefs = observedSec.items.some(function (it) { return it.evidenceRefs.length > 0; });
assert(hasRefs, '已观察能力条目必须带证据回链');
var learnedSec = draft.sections[2];
assert(learnedSec.items.some(function (it) { return it.text.indexOf('现场学会') >= 0; }),
  'D3 从 1 提升到 2 应识别为现场学会');
assert(!/智力|智商|人格|天赋|长期能力/.test(JSON.stringify(draft)), '报告不得含智力/人格/长期能力类表述');
var hypoSec = draft.sections[7];
assert(hypoSec.items.some(function (it) { return it.text.indexOf('未观察') >= 0; }),
  '待复核假设应包含未观察维度说明');

/* ============ 12. confirmReport 与 printableHTML：确认闸门 ============ */
assertThrows(function () { Report.printableHTML(); }, '未确认前打印应抛错');
assertThrows(function () { Report.printableHTML(draft); }, '草稿（无 confirmedAt）直接打印应抛错');
var badDraft = JSON.parse(JSON.stringify(draft));
badDraft.sections[0].items[0].text = '孩子智力水平很高';
assertThrows(function () { Report.confirmReport(badDraft); }, '含禁用表述的报告不得确认');
var confirmed = Report.confirmReport(draft);
assert(typeof confirmed.confirmedAt === 'string' && confirmed.confirmedBy === 'teacher', '确认报告应带确认信息');
var html = Report.printableHTML(confirmed);
assert(html.indexOf('<!DOCTYPE html') === 0, '打印页应是完整 HTML 文档');
assert(html.indexOf('已观察') >= 0 && html.indexOf('待验证') >= 0, '打印页应渲染标签');
assert(html.indexOf('小星') >= 0, '打印页应含学员昵称');
assert(html.indexOf('style=') >= 0 && html.indexOf('<link') < 0 && html.indexOf('src=') < 0,
  '打印页必须自包含内联样式，无外部资源');
var html2 = Report.printableHTML();
assert(html2.indexOf('<!DOCTYPE html') === 0, '确认后不带参数也应能取 confirmed 打印');

/* ============ 收尾 ============ */
if (process.exitCode === 1) {
  console.error('测试未通过');
} else {
  console.log('PASS (' + assertions + ' assertions)');
}
