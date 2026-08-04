/* ============================================================
 * js/engine/evidence.js — CppLab.Evidence
 * 证据记录（append-only）、维度汇总、路径建议、教师覆盖
 * owner: evidence-report ｜ 依据: CONTRACT §9 / 方案定稿 §5.1-5.4
 *
 * 纯逻辑模块：Node 兼容，顶层不访问 document/window。
 * 会话读写优先走 CppLab.Storage（update 防覆盖）；Storage 未加载时
 * 退回共享内存会话 CppLab.__memSession（Node 测试 / 极端加载失败兜底）。
 * ============================================================ */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ---------- 维度常量（方案 5.2） ---------- */
  var DIM_INFO = {
    D1:  { name: '数学与符号基础' },
    D2:  { name: '顺序执行' },
    D3:  { name: '状态追踪' },
    D4:  { name: '变量抽象' },
    D5:  { name: '条件与规则' },
    D6:  { name: '模式识别与分解' },
    D7:  { name: '函数输入—处理—输出' },
    D8:  { name: '调试与解释' },
    D9:  { name: '学习后迁移' },
    D10: { name: '独立性与坚持度' },
    D11: { name: '求助与元认知' },
    D12: { name: '电脑操作熟练度' }
  };
  var DIMENSIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'];
  /* 探索线判定所用核心维度（方案 5.3） */
  var CORE_DIMS = ['D2', 'D3', 'D4', 'D8', 'D9'];

  var PATH_NAMES = { E: '探索线', S: '标准线', A: '加速线' };

  /* ---------- 会话获取（Storage 优先，内存兜底） ---------- */
  function defaultSession() {
    return {
      sessionId: 'local-' + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      nickname: '',
      theme: '',
      robotSkin: '',
      path: 'S',
      scaffoldHistory: [],
      lessons: {
        trial:   { completed: false, activityStates: {}, interests: [], aiHabit: null },
        lesson1: { completed: false, finalEnergy: null, artifactCard: null, activityStates: {} },
        lesson2: { completed: false, customRule: null, activityStates: {}, pathConfirmed: false }
      },
      evidence: [],
      teacherNotes: [],
      hintsUsed: {},
      reports: { draft: null, confirmed: null },
      settings: { anim: true, sound: false }
    };
  }

  function hasStorage() {
    return !!(CppLab.Storage && typeof CppLab.Storage.load === 'function' && typeof CppLab.Storage.update === 'function');
  }

  function fallbackSession() {
    if (!CppLab.__memSession) { CppLab.__memSession = defaultSession(); }
    return CppLab.__memSession;
  }

  function getSession() {
    if (hasStorage()) {
      var s = CppLab.Storage.load();
      if (s && typeof s === 'object') {
        if (!Array.isArray(s.evidence)) { s.evidence = []; }
        return s;
      }
    }
    return fallbackSession();
  }

  function updateSession(mutator) {
    if (hasStorage()) {
      CppLab.Storage.update(function (s) {
        if (!s || typeof s !== 'object') { s = defaultSession(); }
        if (!Array.isArray(s.evidence)) { s.evidence = []; }
        mutator(s);
        return s;
      });
      return;
    }
    mutator(fallbackSession());
  }

  /* ---------- 工具 ---------- */
  var idCounter = 0;
  function genId() {
    idCounter += 1;
    return 'ev-' + Date.now().toString(36) + '-' + idCounter + '-' + Math.floor(Math.random() * 1e4).toString(36);
  }

  function asText(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v);
  }

  function isNumericOutcome(v) {
    return v === 0 || v === 1 || v === 2 || v === 3;
  }

  function normalizeOutcome(v) {
    if (v === 'N') { return 'N'; }
    if (isNumericOutcome(v)) { return v; }
    /* 容错：'0'-'3' 字符串按数字处理 */
    if (typeof v === 'string' && /^[0-3]$/.test(v)) { return Number(v); }
    throw new Error('Evidence.record: outcome 必须是 \'N\' 或 0/1/2/3，收到: ' + v);
  }

  function dimName(d) {
    return DIM_INFO[d] ? DIM_INFO[d].name : String(d);
  }

  /* ============================================================
   * record(evt) — append-only 写入 session.evidence
   * 字段严格按方案 5.4（CONTRACT §9）。返回写入后的记录。
   * ============================================================ */
  function record(evt) {
    if (!evt || typeof evt !== 'object') {
      throw new Error('Evidence.record: 需要一个证据对象');
    }
    if (!DIM_INFO[evt.dimension]) {
      throw new Error('Evidence.record: 非法维度 "' + evt.dimension + '"（应为 D1–D12）');
    }
    var outcome = normalizeOutcome(evt.outcome);
    var session = getSession();

    var rec = {
      id: evt.id ? String(evt.id) : genId(),
      sessionId: evt.sessionId ? String(evt.sessionId) : (session.sessionId || 'local-session'),
      timestamp: evt.timestamp ? String(evt.timestamp) : new Date().toISOString(),
      activityId: asText(evt.activityId),
      dimension: evt.dimension,
      variant: (evt.variant === 'E' || evt.variant === 'S' || evt.variant === 'A') ? evt.variant : (session.path || 'S'),
      taskPrompt: asText(evt.taskPrompt),
      childAction: asText(evt.childAction),
      answerOrCode: asText(evt.answerOrCode),
      attemptCount: (typeof evt.attemptCount === 'number' && evt.attemptCount >= 1) ? Math.floor(evt.attemptCount) : 1,
      supportLevel: (typeof evt.supportLevel === 'string' && /^S[0-4]$/.test(evt.supportLevel)) ? evt.supportLevel : 'S0',
      outcome: outcome,
      selfCorrection: evt.selfCorrection === true,
      transferResult: (evt.transferResult === null || evt.transferResult === undefined) ? null : evt.transferResult,
      teacherNote: asText(evt.teacherNote),
      confidence: (evt.confidence === 'low' || evt.confidence === 'medium' || evt.confidence === 'high') ? evt.confidence : 'medium'
    };

    updateSession(function (s) {
      s.evidence.push(rec);
    });
    return rec;
  }

  function getAll() {
    var list = getSession().evidence;
    return Array.isArray(list) ? list.slice() : [];
  }

  function getById(evtId) {
    var list = getSession().evidence;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === evtId) { return list[i]; }
    }
    return null;
  }

  /* ============================================================
   * summarize() -> {D1:{best,count,evidenceIds}, ..., D12:{...}}
   * 未观察维度 best='N'（绝不解释为不会）。
   * 只有 'N' 结果的维度也保持 best='N'。
   * 教师覆盖后的 outcome 以当前值为准（原值在 overridden 里）。
   * ============================================================ */
  function summarize() {
    var out = {};
    var i, d;
    for (i = 0; i < DIMENSIONS.length; i++) {
      out[DIMENSIONS[i]] = { best: 'N', count: 0, evidenceIds: [] };
    }
    var list = getSession().evidence;
    for (i = 0; i < list.length; i++) {
      var evt = list[i];
      var slot = out[evt.dimension];
      if (!slot) { continue; }
      slot.count += 1;
      slot.evidenceIds.push(evt.id);
      if (isNumericOutcome(evt.outcome)) {
        slot.best = (slot.best === 'N') ? evt.outcome : Math.max(slot.best, evt.outcome);
      }
    }
    return out;
  }

  /* ---------- pathSuggestion 内部判定 ---------- */

  /* 观察到且处于 0-1（'N' 不算——未观察不得解释为不会） */
  function isLow(best) { return best === 0 || best === 1; }

  /* 是否存在"迁移仍需逐步示范"的证据：D9 记录里出现 S4（演示一个步骤）
   * 或 D9 结果为 0（已示范仍未建立） */
  function transferNeedsDemo(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dimension !== 'D9') { continue; }
      if (e.supportLevel === 'S4') { return true; }
      if (e.outcome === 0) { return true; }
    }
    return false;
  }

  /* "能独立完成"的记录：结果>=2 且支持等级不超过 S1（无提示/仅重复题意） */
  function hasIndependent(list, dim, minOutcome) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dimension === dim && isNumericOutcome(e.outcome) && e.outcome >= minOutcome &&
          (e.supportLevel === 'S0' || e.supportLevel === 'S1')) {
        return true;
      }
    }
    return false;
  }

  /* 既往作品经验是否"经任务验证"（约定：transferResult='experience-verified'
   * 或教师备注中明确写了验证字样） */
  function experienceVerified(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.transferResult === 'experience-verified') { return true; }
      if (typeof e.teacherNote === 'string' && /作品经验.{0,6}(已验证|经任务验证|验证通过)/.test(e.teacherNote)) { return true; }
    }
    return false;
  }

  /* 是否自称学过 C++（约定：transferResult='claimed-experience' 或孩子发言里出现"学过C++"类表述） */
  function claimedExperience(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.transferResult === 'claimed-experience') { return true; }
      var said = (e.childAction || '') + ' ' + (e.teacherNote || '');
      if (/(学过|上过).{0,6}(C\+\+|编程课)/.test(said)) { return true; }
    }
    return false;
  }

  /* ============================================================
   * pathSuggestion() -> {suggested:'E'|'S'|'A', reasons:[..], confidence}
   * 严格按方案 5.3：探索线任一命中即 E；加速线全部证据同时出现才 A；
   * 其余为标准线 S。外加两条硬限制。
   * ============================================================ */
  function pathSuggestion() {
    var sum = summarize();
    var list = getSession().evidence;
    var reasons = [];
    var i;

    /* ---- 探索线：任一命中 ---- */
    var lowCoreDims = [];
    for (i = 0; i < CORE_DIMS.length; i++) {
      if (isLow(sum[CORE_DIMS[i]].best)) { lowCoreDims.push(CORE_DIMS[i]); }
    }
    var exploreHits = [];
    if (lowCoreDims.length >= 3) {
      exploreHits.push('核心维度中有 ' + lowCoreDims.length + ' 个处于 0–1：' +
        lowCoreDims.map(function (d) { return dimName(d); }).join('、'));
    }
    if (transferNeedsDemo(list)) {
      exploreHits.push('迁移任务仍需要逐步示范才能推进');
    }
    if (sum.D12.best === 0) {
      exploreHits.push('电脑操作明显妨碍表达，需要先用图块和单步动画');
    }

    /* ---- 加速线：五项证据必须同时出现 ---- */
    var accel = {
      multiState: hasIndependent(list, 'D3', 2),
      canExplain: (sum.D4.best === 3 || sum.D5.best === 3 || sum.D7.best === 3),
      selfEditDebug: hasIndependent(list, 'D8', 2),
      transfer: (isNumericOutcome(sum.D9.best) && sum.D9.best >= 2),
      verifiedWorks: experienceVerified(list)
    };
    var accelLabels = {
      multiState: '能独立追踪状态变化（含两个及以上状态的任务）',
      canExplain: '能解释赋值、分支或函数中的至少一个概念',
      selfEditDebug: '能自行编辑或调试短文本程序',
      transfer: '新情境迁移达到 2–3',
      verifiedWorks: '既往作品经验已经实际任务验证'
    };
    var accelMissing = [];
    var k;
    for (k in accel) {
      if (Object.prototype.hasOwnProperty.call(accel, k) && !accel[k]) {
        accelMissing.push(accelLabels[k]);
      }
    }
    var accelAll = (accelMissing.length === 0);

    /* ---- 两条硬限制 ---- */
    /* 限制 2：自称学过但状态追踪弱（D3 未观察或 0-1）→ 不进加速线 */
    var limit2Hit = false;
    if (claimedExperience(list) && (sum.D3.best === 'N' || isLow(sum.D3.best))) {
      limit2Hit = true;
      accelAll = false;
    }

    /* ---- 决策 ---- */
    var suggested;
    if (exploreHits.length > 0) {
      suggested = 'E';
      reasons = exploreHits.slice();
      reasons.push('建议先在' + PATH_NAMES.E + '用图块、可视化和代码槽建立核心概念，随时可以上调');
    } else if (accelAll) {
      suggested = 'A';
      reasons.push('加速线全部证据同时出现：');
      for (k in accel) {
        if (Object.prototype.hasOwnProperty.call(accel, k)) {
          reasons.push('· ' + accelLabels[k]);
        }
      }
    } else {
      suggested = 'S';
      reasons.push('未触发探索线条件（核心维度没有出现三个及以上 0–1）');
      if (accelMissing.length > 0) {
        reasons.push('尚未同时满足加速线全部证据，缺少：' + accelMissing.join('；'));
      }
      if (limit2Hit) {
        reasons.push('限制生效：自称学过 C++，但状态追踪证据不足（弱或未观察），按规则不进入加速线');
      }
      /* 限制 1：数学表现好不能单独提升路径（判定中本就不使用 D1，这里显式说明） */
      if (isNumericOutcome(sum.D1.best) && sum.D1.best >= 2) {
        reasons.push('限制生效：数学与符号基础表现好，但按规则不单独提升编程路径');
      }
    }
    if (suggested === 'E' && limit2Hit) {
      reasons.push('另：自称学过 C++，但状态追踪证据不足，同样不满足加速线条件');
    }

    /* ---- 置信度：核心维度覆盖 + 数字结果数量 ---- */
    var observedCore = 0;
    for (i = 0; i < CORE_DIMS.length; i++) {
      if (sum[CORE_DIMS[i]].best !== 'N') { observedCore += 1; }
    }
    var numericCount = 0;
    for (i = 0; i < list.length; i++) {
      if (isNumericOutcome(list[i].outcome)) { numericCount += 1; }
    }
    var confidence;
    if (observedCore >= 4 && numericCount >= 6) {
      confidence = 'high';
    } else if (observedCore >= 3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { suggested: suggested, reasons: reasons, confidence: confidence };
  }

  /* ============================================================
   * setTeacherOverride(evtId, patch)
   * 教师修改 outcome / teacherNote 等；原值保留在 overridden.original，
   * 只在第一次覆盖时快照，反复覆盖不会丢最初的原值。
   * ============================================================ */
  var OVERRIDABLE = ['outcome', 'teacherNote', 'confidence', 'transferResult', 'selfCorrection'];

  function setTeacherOverride(evtId, patch) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('Evidence.setTeacherOverride: 需要 patch 对象');
    }
    var found = null;
    updateSession(function (s) {
      var evt = null;
      for (var i = 0; i < s.evidence.length; i++) {
        if (s.evidence[i].id === evtId) { evt = s.evidence[i]; break; }
      }
      if (!evt) { return; }
      if (!evt.overridden) {
        evt.overridden = { original: {}, overriddenAt: null, overriddenBy: 'teacher' };
      }
      for (var j = 0; j < OVERRIDABLE.length; j++) {
        var key = OVERRIDABLE[j];
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          if (key === 'outcome') { patch.outcome = normalizeOutcome(patch.outcome); }
          if (!Object.prototype.hasOwnProperty.call(evt.overridden.original, key)) {
            evt.overridden.original[key] = evt[key];
          }
          evt[key] = patch[key];
        }
      }
      evt.overridden.overriddenAt = new Date().toISOString();
      found = evt;
    });
    if (!found) {
      throw new Error('Evidence.setTeacherOverride: 找不到证据记录 ' + evtId);
    }
    return found;
  }

  /* ---------- 导出 ---------- */
  CppLab.Evidence = {
    record: record,
    getAll: getAll,
    getById: getById,
    summarize: summarize,
    pathSuggestion: pathSuggestion,
    setTeacherOverride: setTeacherOverride,
    /* 常量供 Report / 教师端复用（儿童端不得展示） */
    DIMENSIONS: DIMENSIONS,
    DIM_INFO: DIM_INFO,
    CORE_DIMS: CORE_DIMS,
    PATH_NAMES: PATH_NAMES,
    /* 仅测试用：清空兜底内存会话（有 Storage 时请用 Storage.clear） */
    _reset: function () { CppLab.__memSession = null; }
  };

})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CppLab.Evidence; }
