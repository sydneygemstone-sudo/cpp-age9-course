/**
 * test-content-schema.js — 内容文件契约校验（CONTRACT §5）
 *
 * 校验三个内容包（trial / lesson1 / lesson2）里的每个活动：
 * 1. §5 必填字段齐全且类型正确（id 命名、minutes、dimensions、evidenceRule…）
 * 2. E/S/A 三变体齐全，每个变体有 intro/interaction/successCriteria
 * 3. hintLadder 恰好 5 级 H1-H5，H5 必须 teacherOnly
 * 4. teacherCards 六件套：truth/demo/questions/misconceptions/rescueSteps/extension
 * 5. activityType（含 variant.activityTypeOverride）合法
 * 6. 有 program 的变体 IR.execute 无 error；compilerCheck.enabled 时
 *    expectedStdout === 实际 stdout（dynamic 承接活动按内容文件默认值直接执行）。
 *    slots 活动特例：产品流程里「真实C++验证」比对的是孩子改完槽位、达成目标后的
 *    workProgram（见 app.js renderCompileResult），因此存档 program 允许是未解版
 *    （prediction 依赖未解时的输出）——此时测试改为求解验证：存在单槽位整数解使
 *    goal 达成，且解出程序的 stdout === expectedStdout。直接匹配的（如 trial-08-S
 *    存『正确值已填入』版）仍走直接比对。
 *
 * 运行：node js/tests/test-content-schema.js
 */
'use strict';

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var IR = require(path.join(ROOT, 'js', 'engine', 'ir.js'));
var packs = {
  trial: require(path.join(ROOT, 'js', 'content', 'trial.js')),
  lesson1: require(path.join(ROOT, 'js', 'content', 'lesson1.js')),
  lesson2: require(path.join(ROOT, 'js', 'content', 'lesson2.js'))
};

var count = 0;
function assert(cond, msg) {
  count++;
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
}

var LEGAL_TYPES = ['choice', 'ordering', 'predict', 'trace', 'slots', 'freeEdit',
  'bughunt', 'teach-transfer', 'explain', 'build'];
var LEGAL_VISUALS = ['energy', 'door', 'sequence', 'function', 'scene', 'none'];
var TEACHER_CARD_KEYS = ['truth', 'demo', 'questions', 'misconceptions', 'rescueSteps', 'extension'];
var HINT_LEVELS = ['H1', 'H2', 'H3', 'H4', 'H5'];

function isNonEmptyString(x) { return typeof x === 'string' && x.length > 0; }

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

/** 按 slots[].path 把目标节点整体替换为 {kind:'lit', value}（与 app.js slotWriteValue 同语义） */
function slotWrite(step, path, value) {
  var segs = String(path || '').split('.');
  var node = step;
  for (var i = 0; i < segs.length - 1; i++) node = node[segs[i]];
  node[segs[segs.length - 1]] = { kind: 'lit', value: value };
}

/**
 * slots 求解验证：尝试只改一个 number 槽位达成 finalVar 目标。
 * 目标变量对单个字面量槽位是仿射函数（程序只含 +/-/*），用 f(0)/f(1) 求斜率解出整数值，
 * 再实际执行复核。成功返回 {stdout}，失败返回 null。
 */
function solveSlotsForGoal(program, slots, goal) {
  if (!goal || goal.type !== 'finalVar') return null;
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (slot.inputType !== 'number') continue;
    var probe = function (v) {
      var p = deepClone(program);
      slotWrite(p[slot.stepIndex], slot.path, v);
      var r = IR.execute(p);
      return r.error ? null : r;
    };
    var r0 = probe(0), r1 = probe(1);
    if (!r0 || !r1) continue;
    var f0 = r0.finalVars[goal.name], f1 = r1.finalVars[goal.name];
    if (typeof f0 !== 'number' || typeof f1 !== 'number' || f1 === f0) continue;
    var need = (goal.value - f0) / (f1 - f0);
    if (!isFinite(need) || need !== Math.round(need)) continue;
    var solved = probe(need);
    if (solved && solved.finalVars[goal.name] === goal.value) return solved;
  }
  return null;
}

Object.keys(packs).forEach(function (lessonId) {
  var pack = packs[lessonId];
  var activities = Array.isArray(pack) ? pack : pack.activities;
  assert(Array.isArray(activities) && activities.length > 0, lessonId + ': activities 非空数组');
  assert(Array.isArray(pack) || pack.lessonId === lessonId, lessonId + ': pack.lessonId 一致');

  activities.forEach(function (a) {
    var tag = a && a.id ? a.id : (lessonId + '#?');

    // ---- 1. 必填字段 ----
    assert(isNonEmptyString(a.id), tag + ': id 存在');
    assert(new RegExp('^' + lessonId + '-\\d\\d-[a-z0-9-]+$').test(a.id),
      tag + ': id 符合 <lessonId>-<nn>-<slug> 命名（childFeedback 前缀过滤依赖它）');
    assert(a.lessonId === lessonId, tag + ': lessonId 与包一致');
    assert(typeof a.order === 'number', tag + ': order 为数字');
    assert(Array.isArray(a.minutes) && a.minutes.length === 2 &&
      typeof a.minutes[0] === 'number' && typeof a.minutes[1] === 'number' &&
      a.minutes[0] <= a.minutes[1], tag + ': minutes 为 [start,end]');
    ['title', 'concept', 'learningObjective', 'childPrompt'].forEach(function (k) {
      assert(isNonEmptyString(a[k]), tag + ': ' + k + ' 非空');
    });
    assert(Array.isArray(a.dimensions) && a.dimensions.length > 0 &&
      a.dimensions.every(function (d) { return /^D([1-9]|1[0-2])$/.test(d); }),
      tag + ': dimensions 为合法 D1-D12 数组');
    assert(a.evidenceRule && /^D([1-9]|1[0-2])$/.test(a.evidenceRule.dimension) &&
      isNonEmptyString(a.evidenceRule.note), tag + ': evidenceRule {dimension,note} 合规');
    assert(a.compilerCheck && typeof a.compilerCheck.enabled === 'boolean' &&
      typeof a.compilerCheck.expectedStdout === 'string',
      tag + ': compilerCheck {enabled:Boolean, expectedStdout:String}');
    assert(LEGAL_VISUALS.indexOf(a.visualModel) !== -1, tag + ': visualModel 合法');

    // ---- 5. activityType 合法 ----
    assert(LEGAL_TYPES.indexOf(a.activityType) !== -1, tag + ': activityType 合法');

    // ---- 3. hintLadder ----
    assert(Array.isArray(a.hintLadder) && a.hintLadder.length === 5, tag + ': hintLadder 恰好 5 级');
    if (Array.isArray(a.hintLadder) && a.hintLadder.length === 5) {
      a.hintLadder.forEach(function (h, i) {
        assert(h.level === HINT_LEVELS[i] && isNonEmptyString(h.text),
          tag + ': hintLadder[' + i + '] 为 ' + HINT_LEVELS[i] + ' 且有文案');
      });
      assert(a.hintLadder[4].teacherOnly === true, tag + ': H5 必须 teacherOnly');
      a.hintLadder.slice(0, 4).forEach(function (h) {
        assert(h.teacherOnly !== true, tag + ': ' + h.level + ' 不得 teacherOnly');
      });
    }

    // ---- 4. teacherCards 六件套 ----
    assert(a.teacherCards && typeof a.teacherCards === 'object', tag + ': teacherCards 存在');
    if (a.teacherCards) {
      TEACHER_CARD_KEYS.forEach(function (k) {
        assert(k in a.teacherCards, tag + ': teacherCards.' + k + ' 存在');
      });
      assert(Array.isArray(a.teacherCards.questions) && a.teacherCards.questions.length >= 3,
        tag + ': teacherCards.questions 至少 3 问');
      assert(Array.isArray(a.teacherCards.misconceptions) && a.teacherCards.misconceptions.length > 0,
        tag + ': teacherCards.misconceptions 非空');
      assert(Array.isArray(a.teacherCards.rescueSteps) && a.teacherCards.rescueSteps.length >= 3,
        tag + ': teacherCards.rescueSteps 至少 3 步');
    }

    // ---- 2. E/S/A 三变体 ----
    assert(a.variants && typeof a.variants === 'object', tag + ': variants 存在');
    ['E', 'S', 'A'].forEach(function (lv) {
      var v = a.variants && a.variants[lv];
      assert(!!v, tag + ': 变体 ' + lv + ' 存在');
      if (!v) return;
      assert(isNonEmptyString(v.intro), tag + '/' + lv + ': intro 非空');
      assert(v.interaction && typeof v.interaction === 'object', tag + '/' + lv + ': interaction 存在');
      assert(isNonEmptyString(v.successCriteria), tag + '/' + lv + ': successCriteria 非空');
      if (v.activityTypeOverride !== undefined) {
        assert(LEGAL_TYPES.indexOf(v.activityTypeOverride) !== -1,
          tag + '/' + lv + ': activityTypeOverride 合法');
      }

      // ---- 6. program 可执行 + expectedStdout 对齐 ----
      if (v.program != null) {
        assert(Array.isArray(v.program) && v.program.length > 0, tag + '/' + lv + ': program 为非空 Step 数组');
        var res = null, threw = null;
        try { res = IR.execute(v.program); } catch (e) { threw = e; }
        assert(!threw, tag + '/' + lv + ': IR.execute 不抛异常' + (threw ? '（' + threw.message + '）' : ''));
        if (res) {
          // dynamic 承接活动：内容文件里的 lit 即默认值，直接执行即为"用默认值算"
          assert(!res.error, tag + '/' + lv + ': IR.execute 无 error' + (res.error ? '（' + res.error + '）' : ''));
          if (a.compilerCheck.enabled && !res.error) {
            var eff = a.activityType === 'slots' ? (v.activityTypeOverride || 'slots') : a.activityType;
            if (res.stdout === a.compilerCheck.expectedStdout) {
              assert(true, tag + '/' + lv + ': expectedStdout 直接匹配');
            } else if (eff === 'slots' && v.interaction && v.interaction.goal) {
              // 未解版存档：求解一个槽位达成目标后比对（与产品验证时机一致）
              var solved = solveSlotsForGoal(v.program, v.interaction.slots || [], v.interaction.goal);
              assert(!!solved && solved.stdout === a.compilerCheck.expectedStdout,
                tag + '/' + lv + ': slots 达成目标后 stdout 应为 ' + JSON.stringify(a.compilerCheck.expectedStdout) +
                '（实际 ' + JSON.stringify(solved && solved.stdout) + '，未解版直接输出 ' + JSON.stringify(res.stdout) + '）');
            } else {
              assert(false,
                tag + '/' + lv + ': expectedStdout 匹配（期望 ' + JSON.stringify(a.compilerCheck.expectedStdout) +
                '，实际 ' + JSON.stringify(res.stdout) + '）');
            }
          }
          // toFullCpp / toFocusCpp 至少可生成（内容送真实编译的前提）
          var full = IR.toFullCpp(v.program);
          assert(typeof full === 'string' && full.indexOf('#include <iostream>') === 0 &&
            full.charAt(full.length - 1) === '\n', tag + '/' + lv + ': toFullCpp 以换行结尾');
        }
      }
      // bughunt 的 wrongPiece 必须真实出现在聚焦代码里（文本替换与真实编译依赖）
      if (a.activityType === 'bughunt' && v.program && v.interaction && v.interaction.bug) {
        var focus = IR.toFocusCpp(v.program);
        assert(focus.indexOf(v.interaction.bug.wrongPiece) !== -1,
          tag + '/' + lv + ': bug.wrongPiece 与 toFocusCpp 产出逐字符一致');
      }
    });

    // compilerCheck.enabled 的活动至少要有一个变体带 program
    if (a.compilerCheck.enabled) {
      var hasProg = ['E', 'S', 'A'].some(function (lv) {
        return a.variants && a.variants[lv] && a.variants[lv].program;
      });
      assert(hasProg, tag + ': compilerCheck.enabled 但无任何变体带 program');
    }
  });
});

if (process.exitCode) {
  console.error('FAIL: content schema 校验未通过');
} else {
  console.log('PASS (' + count + ' assertions)');
}
