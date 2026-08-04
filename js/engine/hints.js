/* =============================================================================
 * hints.js — CppLab.Hints（提示阶梯系统）
 * =============================================================================
 * 职责（CONTRACT §10 + 方案 §11）：
 *   - 逐级发放 H1→H2→H3→H4→H5 的确定性提示（读 activity.hintLadder）。
 *   - H5 需教师解锁；每次发放记入 session.hintsUsed。
 *   - 试听（lessonId==='trial'）核心诊断未完成时，儿童端 aiDisabled，
 *     但教师端仍可通过 teacherLadder() 看到完整阶梯并代读 H1/H2（方案 §11.2）。
 *   - HintProvider 接口：RuleBasedHintProvider 默认；LLMHintProvider 只留
 *     feature-flag 占位，一期不启用。
 *
 * 红线：
 *   - §14.7 试听核心诊断完成前不开放提示阶梯给儿童端（教师端可见）。
 *   - 默认不直接给完整最终程序（方案 §11.3）。
 *
 * Node 兼容：顶层不触碰 document/window；末尾导出 module.exports。
 * ========================================================================== */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * HintProvider 接口
   * provider = { name, getLadder(activity) -> [{level, text, teacherOnly?}] }
   * ------------------------------------------------------------------ */

  /**
   * RuleBasedHintProvider —— 默认提供者，完全离线可用（方案 §11.6）。
   * 阶梯语义（方案 §11.3）：
   *   H1 重述目标并提出一个问题
   *   H2 指向相关变量、代码行或概念
   *   H3 给出部分结构或排除一个错误方向
   *   H4 给一个不同数字、不同场景的近似例子
   *   H5 教师解锁后展示部分解法，并要求孩子补全和解释
   * 文案本身由内容文件（activity.hintLadder）提供，这里不硬编码任何
   * 课程知识（红线 §14.8 内容与引擎分离）。
   */
  var RuleBasedHintProvider = {
    name: 'rule-based',
    getLadder: function (activity) {
      return (activity && activity.hintLadder) ? activity.hintLadder : [];
    }
  };

  /**
   * LLMHintProvider —— 仅 feature-flag 占位，一期不启用（方案 §11.6）。
   *
   * 二期若启用，必须遵守以下边界：
   *   可以做（方案 §11.4）：用另一种比喻解释；针对真实编译错误做适龄翻译；
   *     生成测试输入；检查孩子的解释是否与代码一致；指出可能需要检查的行；
   *     对孩子已完成的代码提出一个改进建议；扮演展示观众提出问题。
   *   不得做（方案 §11.5）：直接完成课堂挑战；在孩子未尝试前输出完整答案；
   *     自动替换孩子的全部代码；独立给出能力等级或家长评价；询问真实姓名、
   *     学校、地址、联系方式；开放网页搜索和与课程无关的自由聊天；
   *     把一次错误解释为能力或性格问题。
   *   并且：即使 LLM 服务失效，课程仍须完整可用 —— 因此 getLadder 永远
   *   以规则阶梯为兜底，enabled:false 时行为与 RuleBasedHintProvider 一致。
   */
  var LLMHintProvider = {
    name: 'llm',
    enabled: false,
    note: 'feature flag, 一期不启用',
    getLadder: function (activity) {
      // 一期：无条件退回规则阶梯（enabled 永远为 false）。
      return RuleBasedHintProvider.getLadder(activity);
    }
  };

  /* ------------------------------------------------------------------ *
   * 内部状态
   * ------------------------------------------------------------------ */

  var provider = RuleBasedHintProvider;
  var h5Unlocked = {};        // {activityId: true}，教师端解锁记录（会话内）
  var usedFallback = {};      // Storage 不可用时的内存兜底 {activityId: [levels]}
  // 试听核心诊断是否已全部完成：由引擎/应用层通过 setTrialGate 告知。
  // 默认 false = 儿童端提示关闭（安全侧，红线 §14.7）。
  var trialGate = false;

  var TRIAL_DISABLED_TEXT = '试听诊断阶段提示由老师给出';

  /* ------------------------------------------------------------------ *
   * hintsUsed 读写：优先走 CppLab.Storage（session.hintsUsed），
   * Storage 未加载（如单模块 Node 测试）时用内存兜底，接口行为一致。
   * ------------------------------------------------------------------ */

  function storageAvailable() {
    return !!(CppLab.Storage &&
      typeof CppLab.Storage.load === 'function' &&
      typeof CppLab.Storage.update === 'function');
  }

  function getUsed(activityId) {
    if (storageAvailable()) {
      var s = CppLab.Storage.load();
      if (s && s.hintsUsed && s.hintsUsed[activityId]) {
        return s.hintsUsed[activityId].slice();
      }
      return [];
    }
    return (usedFallback[activityId] || []).slice();
  }

  function recordUsed(activityId, level) {
    if (storageAvailable()) {
      CppLab.Storage.update(function (s) {
        s.hintsUsed = s.hintsUsed || {};
        s.hintsUsed[activityId] = s.hintsUsed[activityId] || [];
        if (s.hintsUsed[activityId].indexOf(level) < 0) {
          s.hintsUsed[activityId].push(level);
        }
        return s;
      });
      return;
    }
    usedFallback[activityId] = usedFallback[activityId] || [];
    if (usedFallback[activityId].indexOf(level) < 0) {
      usedFallback[activityId].push(level);
    }
  }

  /* ------------------------------------------------------------------ *
   * 内部逻辑
   * ------------------------------------------------------------------ */

  function isTrialLocked(activity) {
    return !!(activity && activity.lessonId === 'trial' && !trialGate);
  }

  function findNextEntry(ladder, used) {
    for (var i = 0; i < ladder.length; i++) {
      var entry = ladder[i];
      if (entry && entry.level && used.indexOf(entry.level) < 0) return entry;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 对外 API
   * ------------------------------------------------------------------ */

  var Hints = {

    /**
     * next(activityId, activity)
     *   -> {level, text}                       正常发放（同时记入 hintsUsed）
     *    | {aiDisabled:true, text}             试听诊断期，儿童端提示关闭
     *    | {locked:'H5需教师解锁'}              下一档是 H5 且教师未解锁
     *    | {exhausted:true}                    阶梯已用完
     */
    next: function (activityId, activity) {
      // 试听核心诊断未完成 → 儿童端不开放提示阶梯（红线 §14.7）。
      // 注意：教师端不走本方法，用 teacherLadder() 查看/代读。
      if (isTrialLocked(activity)) {
        return { aiDisabled: true, text: TRIAL_DISABLED_TEXT };
      }

      var ladder = provider.getLadder(activity);
      var used = getUsed(activityId);
      var entry = findNextEntry(ladder, used);

      if (!entry) return { exhausted: true };

      if (entry.teacherOnly && !h5Unlocked[activityId]) {
        return { locked: 'H5需教师解锁' };
      }

      recordUsed(activityId, entry.level);
      return { level: entry.level, text: entry.text };
    },

    /**
     * setProvider(p) —— 切换 HintProvider。
     * 接受 'rule-based' | 'llm' 或自定义 provider 对象（需含 getLadder）。
     * 一期 LLMHintProvider.enabled 恒为 false，切过去行为也与规则版一致。
     */
    setProvider: function (p) {
      if (p === 'rule-based') { provider = RuleBasedHintProvider; return; }
      if (p === 'llm') { provider = LLMHintProvider; return; }
      if (p && typeof p.getLadder === 'function') { provider = p; return; }
      throw new Error('CppLab.Hints.setProvider: 无效的 provider');
    },

    getProviderName: function () { return provider.name; },

    /** 教师端解锁/回收某活动的 H5（记录仅在当前会话内存中）。 */
    unlockH5: function (activityId) { h5Unlocked[activityId] = true; },
    relockH5: function (activityId) { delete h5Unlocked[activityId]; },
    isH5Unlocked: function (activityId) { return !!h5Unlocked[activityId]; },

    /**
     * setTrialGate(done) —— 引擎在试听核心诊断活动全部完成时调用
     * setTrialGate(true) 打开儿童端提示；开课/重置时调 setTrialGate(false)。
     * 默认 false（安全侧）。
     */
    setTrialGate: function (done) { trialGate = !!done; },
    getTrialGate: function () { return trialGate; },

    /**
     * teacherLadder(activityId, activity)
     * 教师端专用：无视试听闸门，返回完整阶梯 + 已用档位 + H5 解锁状态。
     * （方案 §11.2：诊断期 H1/H2 预写提示可由教师代读，故教师必须可见全部。）
     * 注意：本方法只读，不记入 hintsUsed —— 教师代读后若要计入，
     * 由教师端界面显式调用 markUsedByTeacher()。
     */
    teacherLadder: function (activityId, activity) {
      var ladder = provider.getLadder(activity);
      var used = getUsed(activityId);
      return {
        h5Unlocked: !!h5Unlocked[activityId],
        aiDisabledForChild: isTrialLocked(activity),
        ladder: ladder.map(function (e) {
          return {
            level: e.level,
            text: e.text,
            teacherOnly: !!e.teacherOnly,
            used: used.indexOf(e.level) >= 0
          };
        })
      };
    },

    /**
     * markUsedByTeacher(activityId, level) —— 教师代读某档提示后计入
     * hintsUsed（供支架映射与证据记录使用，CONTRACT §6）。
     */
    markUsedByTeacher: function (activityId, level) {
      recordUsed(activityId, level);
    },

    /** 某活动已用的提示档位（只读副本）。 */
    getUsed: function (activityId) { return getUsed(activityId); },

    /** 已用最高档位 -> 支架映射用（无提示=null，'H1'...'H5'）。 */
    highestUsed: function (activityId) {
      var order = ['H1', 'H2', 'H3', 'H4', 'H5'];
      var used = getUsed(activityId);
      var best = null;
      for (var i = 0; i < order.length; i++) {
        if (used.indexOf(order[i]) >= 0) best = order[i];
      }
      return best;
    },

    /* 供测试与教师端引用 */
    RuleBasedHintProvider: RuleBasedHintProvider,
    LLMHintProvider: LLMHintProvider,

    /* ---- 仅供测试的钩子 ---- */
    _resetForTests: function () {
      provider = RuleBasedHintProvider;
      h5Unlocked = {};
      usedFallback = {};
      trialGate = false;
    }
  };

  CppLab.Hints = Hints;

})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CppLab.Hints; }
