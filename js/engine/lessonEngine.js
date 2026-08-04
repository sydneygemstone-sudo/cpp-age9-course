/**
 * lessonEngine.js — 课程引擎（CppLab.Engine）
 *
 * 契约依据：docs/CONTRACT.md §6；docs/方案定稿.md §4.2（支架自动建议）、§8.2（状态承接）。
 *
 * 职责：
 * - 活动状态机 idle -> (predicted) -> running(stepIndex) -> done
 * - 有 prediction 未提交时 step()/runAll() 返回 {blocked:'need-prediction'}
 * - step()/runAll() 内部调 CppLab.IR.execute 得 trace，逐条发 trace-step 事件
 * - reset() 只重置当前活动的运行态，不丢课程进度
 * - 支架自动建议（只建议不切换）；setScaffold 记录 scaffoldHistory
 * - completeActivity 自动调 CppLab.Evidence.record（存在性 typeof 保护）
 * - lesson2 状态承接：读取 lesson1 的皮肤/主题/能量/作品卡/路径，注入开场文案与初始 energy
 *
 * 红线（CONTRACT §14.8）：课程知识文案不进本文件；此处仅有允许的"开场白模板"。
 */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  var SCAFFOLD_ORDER = ['E', 'S', 'A'];

  // 提示档 -> 支架记录档位映射（CONTRACT §6：无=S0, H1=S1, H2=S2, H3=S3, H4/H5=S4）
  var HINT_TO_SUPPORT = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 4 };

  // 开场白模板用的展示名（允许的模板素材，非课程知识文案）
  var SKIN_NAMES = {
    'robo-blue': '蓝色圆滚机器人',
    'robo-orange': '橙色方块机器人',
    'robo-dog': '绿色小狗机器人'
  };
  var THEME_NAMES = {
    robot: '机器人世界',
    pet: '宠物乐园',
    adventure: '探险王国'
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getStorage() {
    if (!CppLab.Storage) throw new Error('Engine: CppLab.Storage 未加载（脚本顺序见 CONTRACT §2）');
    return CppLab.Storage;
  }

  function getIR() {
    if (!CppLab.IR || typeof CppLab.IR.execute !== 'function') {
      throw new Error('Engine: CppLab.IR 未加载（脚本顺序见 CONTRACT §2）');
    }
    return CppLab.IR;
  }

  /** 支架升/降一档；越界返回 null */
  function shiftScaffold(level, delta) {
    var i = SCAFFOLD_ORDER.indexOf(level);
    if (i < 0) return null;
    var j = i + delta;
    if (j < 0 || j >= SCAFFOLD_ORDER.length) return null;
    return SCAFFOLD_ORDER[j];
  }

  /** 由某活动已用提示列表映射支架记录档位数值（0-4） */
  function supportLevelNum(hintsList) {
    var max = 0;
    if (Array.isArray(hintsList)) {
      for (var i = 0; i < hintsList.length; i++) {
        var n = HINT_TO_SUPPORT[hintsList[i]];
        if (typeof n === 'number' && n > max) max = n;
      }
    }
    return max;
  }

  /** 宽松等值比较：预测答案 7 与 '7' 视为一致 */
  function valueEquals(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    var na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
      return na === nb;
    }
    return String(a) === String(b);
  }

  /** 读取 lesson1 承接状态（CONTRACT §6 / 方案 §8.2） */
  function readCarryOver() {
    var s = getStorage().load();
    var l1 = (s.lessons && s.lessons.lesson1) || {};
    return {
      robotSkin: s.robotSkin || null,
      theme: s.theme || null,
      finalEnergy: (typeof l1.finalEnergy === 'number') ? l1.finalEnergy : null,
      artifactCard: l1.artifactCard || null,
      path: s.path || null,
      lesson1Completed: !!l1.completed
    };
  }

  /** lesson2 开场白模板：注入皮肤/主题/上次能量（红线允许的模板文案） */
  function buildLesson2Intro(carry) {
    var skin = SKIN_NAMES[carry.robotSkin] || '机器人伙伴';
    var head;
    if (carry.finalEnergy != null) {
      head = '欢迎回来！你的' + skin + '还带着上次攒下的 ' + carry.finalEnergy + ' 格能量呢。';
    } else {
      head = '欢迎回来！你的' + skin + '已经充好了能量，随时可以出发。';
    }
    var place = THEME_NAMES[carry.theme] ? ('在' + THEME_NAMES[carry.theme] + '里，') : '现在，';
    return head + place + '它来到了一扇会自己思考的智能舱门前——能量够不够，舱门说了算！';
  }

  /**
   * 创建一次课程会话引擎。
   * options: {lessonId?, scaffold?}
   */
  function createSession(options) {
    options = options || {};
    var Storage = getStorage();
    var session = Storage.load(); // 确保会话存在

    var engine = {
      lessonId: null,
      scaffold: options.scaffold || session.path || 'S',
      currentIndex: 0,
      lessonIntro: '',
      carryOver: null,

      _activities: [],
      _listeners: {},
      _act: null,     // 当前活动运行态
      _streak: []     // 支架建议用的连续完成记录 [{outcome, sl}]
    };

    if (SCAFFOLD_ORDER.indexOf(engine.scaffold) < 0) engine.scaffold = 'S';

    // ---------- 事件 ----------

    engine.on = function (event, cb) {
      if (typeof cb !== 'function') return function () {};
      (engine._listeners[event] = engine._listeners[event] || []).push(cb);
      return function off() {
        var arr = engine._listeners[event] || [];
        var i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      };
    };

    engine._emit = function (event, payload) {
      var arr = engine._listeners[event] || [];
      for (var i = 0; i < arr.length; i++) {
        try { arr[i](payload); } catch (e) { /* 单个监听器出错不阻断引擎 */ }
      }
    };

    // ---------- 课程装载 ----------

    engine.loadLesson = function (lessonId) {
      var pack = (CppLab.content || {})[lessonId];
      if (!pack) throw new Error('Engine.loadLesson: 找不到课程内容 "' + lessonId + '"');

      var acts = Array.isArray(pack) ? pack.slice() : (pack.activities || []).slice();
      acts.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

      engine.lessonId = lessonId;
      engine._activities = acts;
      engine.currentIndex = 0;
      engine._streak = [];
      engine._resetActState();

      // 状态承接（方案 §8.2）：lesson2 读取 lesson1 状态并注入开场文案
      if (lessonId === 'lesson2') {
        engine.carryOver = readCarryOver();
        var packIntro = (!Array.isArray(pack) && pack.intro) ? String(pack.intro) : '';
        engine.lessonIntro = buildLesson2Intro(engine.carryOver) + (packIntro ? ('\n' + packIntro) : '');
      } else {
        engine.carryOver = null;
        engine.lessonIntro = (!Array.isArray(pack) && pack.intro) ? String(pack.intro) : '';
      }

      // 确保存储里有该课的进度容器（reset 不丢进度的前提）
      getStorage().update(function (s) {
        s.lessons = s.lessons || {};
        s.lessons[lessonId] = s.lessons[lessonId] || { completed: false, activityStates: {} };
        s.lessons[lessonId].activityStates = s.lessons[lessonId].activityStates || {};
      });

      return engine;
    };

    engine.getActivities = function () { return engine._activities.slice(); };

    engine.getActivity = function (i) { return engine._activities[i] || null; };

    engine.getCurrentActivity = function () { return engine._activities[engine.currentIndex] || null; };

    engine.getLessonIntro = function () { return engine.lessonIntro; };

    engine.getCarryOver = function () { return engine.carryOver ? deepClone(engine.carryOver) : null; };

    // ---------- 变体解析（含 lesson2 动态承接替换） ----------

    /**
     * 按当前支架取变体；找不到按 S -> E -> A 兜底。
     * 变体带 dynamic:{initFromLesson1Energy:true} 时（跨课承接契约补充）：
     * - program 中第一个 declare(name==='energy') 的 expr 替换为
     *   {kind:'lit', value: lesson1.finalEnergy}；Storage 无值则用内容文件默认值；
     * - prediction.correctFromInherited === true 时把 prediction.correct 同步为该值。
     * 动态替换走深拷贝，绝不改写内容文件里的原始对象。
     */
    engine.getVariant = function (activity) {
      if (!activity || !activity.variants) return null;
      var v = activity.variants[engine.scaffold];
      if (!v) {
        var order = ['S', 'E', 'A'];
        for (var i = 0; i < order.length; i++) {
          if (activity.variants[order[i]]) { v = activity.variants[order[i]]; break; }
        }
      }
      if (!v) return null;

      if (v.dynamic && v.dynamic.initFromLesson1Energy) {
        var clone = deepClone(v);
        var inherited = readCarryOver().finalEnergy;
        var value;
        if (Array.isArray(clone.program)) {
          for (var j = 0; j < clone.program.length; j++) {
            var step = clone.program[j];
            if (step && step.op === 'declare' && step.name === 'energy') {
              var fallback = (step.expr && step.expr.kind === 'lit') ? step.expr.value : undefined;
              value = (inherited != null) ? inherited : fallback;
              if (value !== undefined) {
                step.expr = { kind: 'lit', value: value };
              }
              break; // 只替换第一个
            }
          }
        }
        if (clone.prediction && clone.prediction.correctFromInherited === true && value !== undefined) {
          clone.prediction.correct = value;
        }
        return clone;
      }
      return v;
    };

    // ---------- 活动状态机 ----------

    engine._resetActState = function () {
      var prevAttempts = (engine._act && engine._act.activityIndex === engine.currentIndex)
        ? engine._act.attempts : 0;
      engine._act = {
        activityIndex: engine.currentIndex,
        status: 'idle',            // idle | predicted | running | done
        cursor: 0,                 // 已发出的 trace 条数
        trace: null,
        execResult: null,
        prediction: null,          // {value, correct}
        attempts: prevAttempts     // 同一活动跨 reset 累计
      };
    };

    engine.getActivityState = function () {
      var a = engine._act;
      return {
        status: a.status,
        stepIndex: a.cursor,
        totalSteps: a.trace ? a.trace.length : null,
        prediction: a.prediction ? deepClone(a.prediction) : null,
        attempts: a.attempts
      };
    };

    /** 提交预测。变体没有 prediction 时返回 {ok:false, reason:'no-prediction'}。 */
    engine.submitPrediction = function (value) {
      var activity = engine.getCurrentActivity();
      if (!activity) return { ok: false, reason: 'no-activity' };
      var variant = engine.getVariant(activity);
      if (!variant || !variant.prediction) return { ok: false, reason: 'no-prediction' };
      if (engine._act.status === 'running' || engine._act.status === 'done') {
        return { ok: false, reason: 'already-running' };
      }
      var correct = valueEquals(value, variant.prediction.correct);
      engine._act.prediction = { value: value, correct: correct };
      engine._act.status = 'predicted';
      return { ok: true, correct: correct };
    };

    /** 预测门：有 prediction 且未提交时拦截 */
    engine._predictionGate = function (variant) {
      if (variant && variant.prediction && !engine._act.prediction) {
        return { blocked: 'need-prediction' };
      }
      return null;
    };

    /** 惰性执行：第一次 step/runAll 时调 IR.execute 拿 trace */
    engine._ensureTrace = function (variant) {
      if (engine._act.trace) return null;
      if (!variant || !Array.isArray(variant.program) || variant.program.length === 0) {
        return { noProgram: true };
      }
      var result;
      try {
        result = getIR().execute(variant.program);
      } catch (e) {
        result = { trace: [], finalVars: {}, stdout: '', error: String(e && e.message || e) };
      }
      engine._act.trace = (result && Array.isArray(result.trace)) ? result.trace : [];
      engine._act.execResult = result || { trace: [], finalVars: {}, stdout: '' };
      engine._act.cursor = 0;
      engine._act.attempts += 1;
      engine._act.status = 'running';
      return null;
    };

    /** trace 全部发完后的收尾：状态置 done；lesson1 顺手保存 finalEnergy（承接源头） */
    engine._finishRun = function () {
      engine._act.status = 'done';
      var res = engine._act.execResult;
      if (engine.lessonId === 'lesson1' && res && res.finalVars &&
          typeof res.finalVars.energy === 'number') {
        var e = res.finalVars.energy;
        getStorage().update(function (s) {
          s.lessons.lesson1 = s.lessons.lesson1 || { completed: false, activityStates: {} };
          s.lessons.lesson1.finalEnergy = e;
        });
      }
    };

    /**
     * 单步执行：发出下一条 trace-step 事件。
     * 返回 {entry, done} | {blocked:'need-prediction'} | {noProgram:true} | {done:true}
     */
    engine.step = function () {
      var activity = engine.getCurrentActivity();
      if (!activity) return { done: true, noActivity: true };
      var variant = engine.getVariant(activity);

      var gate = engine._predictionGate(variant);
      if (gate) return gate;

      if (engine._act.status === 'done' && engine._act.trace &&
          engine._act.cursor >= engine._act.trace.length) {
        return { done: true };
      }

      var noProg = engine._ensureTrace(variant);
      if (noProg) return noProg;

      var a = engine._act;
      if (a.cursor >= a.trace.length) {
        engine._finishRun();
        return { done: true, error: a.execResult ? a.execResult.error : undefined };
      }
      var entry = a.trace[a.cursor];
      a.cursor += 1;
      engine._emit('trace-step', entry);
      var finished = a.cursor >= a.trace.length;
      if (finished) engine._finishRun();
      return { entry: entry, done: finished, error: finished && a.execResult ? a.execResult.error : undefined };
    };

    /**
     * 运行到底：把剩余 trace 逐条发完。
     * 返回 {trace, finalVars, stdout, error?} | {blocked:'need-prediction'} | {noProgram:true}
     */
    engine.runAll = function () {
      var activity = engine.getCurrentActivity();
      if (!activity) return { done: true, noActivity: true };
      var variant = engine.getVariant(activity);

      var gate = engine._predictionGate(variant);
      if (gate) return gate;

      var noProg = engine._ensureTrace(variant);
      if (noProg) return noProg;

      var a = engine._act;
      while (a.cursor < a.trace.length) {
        var entry = a.trace[a.cursor];
        a.cursor += 1;
        engine._emit('trace-step', entry);
      }
      engine._finishRun();
      var res = a.execResult || {};
      return {
        trace: a.trace.slice(),
        finalVars: res.finalVars || {},
        stdout: res.stdout || '',
        error: res.error
      };
    };

    /**
     * 重置当前活动运行态（回到 idle、清空预测与 trace）。
     * 只动运行态，绝不清课程进度/证据/提示记录（验收项：重置不丢进度）。
     */
    engine.reset = function () {
      engine._resetActState();
      return { ok: true };
    };

    // ---------- 支架 ----------

    /**
     * 切换支架档位并记录 scaffoldHistory（CONTRACT §7）。
     * meta: {reason, by:'auto'|'teacher'}。注意：自动规则只建议不调用本方法。
     */
    engine.setScaffold = function (level, meta) {
      if (SCAFFOLD_ORDER.indexOf(level) < 0) {
        return { ok: false, reason: 'invalid-level' };
      }
      meta = meta || {};
      var from = engine.scaffold;
      engine.scaffold = level;
      engine._streak = []; // 换档后重新累计连续表现
      getStorage().update(function (s) {
        s.scaffoldHistory = s.scaffoldHistory || [];
        s.scaffoldHistory.push({
          at: new Date().toISOString(),
          from: from,
          to: level,
          by: meta.by === 'auto' ? 'auto' : 'teacher',
          reason: meta.reason || ''
        });
        s.path = level;
      });
      return { ok: true, from: from, to: level };
    };

    /**
     * 支架自动建议（方案 §4.2，只建议不切换）：
     * - 连续 2 个活动 outcome>=2 且该活动 supportLevel<=S1，且当前不在 A 档 → 建议升一档
     * - 连续 2 个活动 supportLevel>=S2 且 outcome<=1，且当前不在 E 档 → 建议降一档
     * 触发建议后清空连续计数，避免同一串表现反复弹建议。
     */
    engine._maybeSuggestScaffold = function () {
      var st = engine._streak;
      if (st.length < 2) return null;
      var a = st[st.length - 2];
      var b = st[st.length - 1];

      if (typeof a.outcome !== 'number' || typeof b.outcome !== 'number') return null;

      var suggestion = null;
      if (a.outcome >= 2 && b.outcome >= 2 && a.sl <= 1 && b.sl <= 1) {
        var up = shiftScaffold(engine.scaffold, +1);
        if (up) {
          suggestion = {
            direction: 'up', from: engine.scaffold, to: up, by: 'auto',
            reason: '连续两个活动在无提示或轻提示（不超过 H1）下完成度高（outcome≥2），建议上调一档支架'
          };
        }
      } else if (a.sl >= 2 && b.sl >= 2 && a.outcome <= 1 && b.outcome <= 1) {
        var down = shiftScaffold(engine.scaffold, -1);
        if (down) {
          suggestion = {
            direction: 'down', from: engine.scaffold, to: down, by: 'auto',
            reason: '连续两个活动在较强提示（H2 及以上）后完成度仍偏低（outcome≤1），建议下调一档支架'
          };
        }
      }
      if (suggestion) {
        engine._streak = [];
        engine._emit('scaffold-suggest', suggestion);
      }
      return suggestion;
    };

    // ---------- 活动完成与证据 ----------

    /**
     * 完成当前活动。
     * opts: {outcome:'N'|0|1|2|3, selfCorrection?, transferResult?, answerOrCode?, childAction?, teacherNote?}
     * - 持久化 activityStates（reset 不丢的"进度"本体）
     * - 自动调 CppLab.Evidence.record（typeof 保护）
     * - 维护支架建议连续计数；全部活动完成时发 lesson-done
     */
    engine.completeActivity = function (opts) {
      opts = opts || {};
      var activity = engine.getCurrentActivity();
      if (!activity) return { ok: false, reason: 'no-activity' };

      var Storage = getStorage();
      var session = Storage.load();
      var hintsList = (session.hintsUsed || {})[activity.id] || [];
      var slNum = supportLevelNum(hintsList);
      var supportLevel = 'S' + slNum;
      var outcome = (opts.outcome === undefined) ? 'N' : opts.outcome;
      var act = engine._act;
      var attemptCount = Math.max(1, act.attempts);
      var lessonId = engine.lessonId;
      var completedAt = new Date().toISOString();

      // 1) 持久化活动进度
      Storage.update(function (s) {
        s.lessons = s.lessons || {};
        var lesson = s.lessons[lessonId] = s.lessons[lessonId] || { completed: false, activityStates: {} };
        lesson.activityStates = lesson.activityStates || {};
        lesson.activityStates[activity.id] = {
          status: 'done',
          outcome: outcome,
          supportLevel: supportLevel,
          attempts: attemptCount,
          prediction: act.prediction ? { value: act.prediction.value, correct: act.prediction.correct } : null,
          selfCorrection: !!opts.selfCorrection,
          completedAt: completedAt
        };
      });

      // 2) 证据记录（Evidence 模块可能尚未加载/未启用，用存在性保护）
      var evidenceRecorded = false;
      if (CppLab.Evidence && typeof CppLab.Evidence.record === 'function') {
        var answerOrCode = (opts.answerOrCode !== undefined)
          ? opts.answerOrCode
          : (act.prediction ? act.prediction.value : null);
        var childAction = opts.childAction ||
          ('完成活动（类型：' + (activity.activityType || '未知') +
           (act.prediction ? ('；预测值：' + act.prediction.value) : '') + '）');
        try {
          CppLab.Evidence.record({
            activityId: activity.id,
            dimension: (activity.evidenceRule && activity.evidenceRule.dimension) ||
                       (Array.isArray(activity.dimensions) ? activity.dimensions[0] : null),
            variant: engine.scaffold,
            taskPrompt: activity.childPrompt || activity.title || '',
            childAction: childAction,
            answerOrCode: answerOrCode,
            attemptCount: attemptCount,
            supportLevel: supportLevel,
            outcome: outcome,
            selfCorrection: !!opts.selfCorrection,
            transferResult: (opts.transferResult === undefined) ? null : opts.transferResult,
            teacherNote: opts.teacherNote || '',
            confidence: (outcome === 'N') ? 'low' : 'medium'
          });
          evidenceRecorded = true;
        } catch (e) { /* 证据模块内部错误不阻断课程主流程 */ }
      }

      // 3) 支架建议连续计数（outcome 非数值视为中断连续性）
      if (typeof outcome === 'number') {
        engine._streak.push({ outcome: outcome, sl: slNum });
      } else {
        engine._streak = [];
      }
      var suggestion = engine._maybeSuggestScaffold();

      engine._act.status = 'done';
      engine._emit('activity-done', {
        activityId: activity.id,
        index: engine.currentIndex,
        outcome: outcome,
        supportLevel: supportLevel
      });

      // 4) 全部活动完成 → 课程完成
      var after = Storage.load();
      var states = ((after.lessons || {})[lessonId] || {}).activityStates || {};
      var allDone = engine._activities.length > 0 && engine._activities.every(function (a2) {
        return states[a2.id] && states[a2.id].status === 'done';
      });
      if (allDone) {
        Storage.update(function (s) {
          s.lessons[lessonId].completed = true;
        });
        engine._emit('lesson-done', { lessonId: lessonId });
      }

      return { ok: true, evidenceRecorded: evidenceRecorded, supportLevel: supportLevel, suggestion: suggestion, lessonDone: allDone };
    };

    /** 进入下一个活动；没有更多活动时返回 {lessonDone:true} */
    engine.next = function () {
      if (engine.currentIndex + 1 >= engine._activities.length) {
        return { lessonDone: true };
      }
      engine.currentIndex += 1;
      engine._resetActState();
      return { ok: true, index: engine.currentIndex, activity: engine.getCurrentActivity() };
    };

    if (options.lessonId) {
      engine.loadLesson(options.lessonId);
    }

    return engine;
  }

  var Engine = {
    createSession: createSession,
    // 供教师端/测试复用的纯函数
    _supportLevelNum: supportLevelNum,
    _shiftScaffold: shiftScaffold
  };

  CppLab.Engine = Engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
  }
})();
