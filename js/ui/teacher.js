/* =============================================================================
 * teacher.js — CppLab.TeacherApp 教师控制台
 * =============================================================================
 * 契约依据：docs/CONTRACT.md §2/§13/§14；docs/方案定稿.md §9.2/§9.3/§4.2/§5.6/§12.2。
 *
 * 职责：
 *   - PIN 门（默认 8888，可改，存 localStorage）
 *   - 实时区：当前课程/活动/目标、支架档 + 系统建议 + 一键调档（覆盖需原因）、
 *     孩子的预测/代码/解释、提示使用与教师代读
 *   - 教师六卡（teacherCards）
 *   - 证据流（时间倒序，可修订 outcome/teacherNote，可标记 N 未观察）
 *   - 控制区：正确轨迹 / 重置活动 / H5 解锁 / AI 开关(一期未启用) / 改 PIN
 *   - 报告区：路径建议、能力向量、家长报告草稿逐条编辑 → 确认 → 打印/导出/删除
 *
 * 双 tab 准实时：window storage 事件 + 2 秒轮询兜底（对比原始 JSON 串）。
 * 红线：本页允许显示 E/S/A 与 D 维度（教师内部信息），但绝不混入儿童端。
 * ========================================================================== */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* 本文件是纯浏览器 UI；Node 下（node --check / 误 require）直接空实现返回 */
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) { module.exports = {}; }
    return;
  }

  /* ------------------------------------------------------------------ *
   * 常量与文案映射
   * ------------------------------------------------------------------ */

  var SESSION_KEY = 'cpplab_session_v1';
  var PIN_KEY = 'cpplab_teacher_pin_v1';
  var DEFAULT_PIN = '8888';

  var LESSON_ORDER = ['trial', 'lesson1', 'lesson2'];
  var LESSON_NAMES = {
    trial: '试听诊断课',
    lesson1: '第1课 · 机器人能量站',
    lesson2: '第2课 · 智能舱门'
  };

  var PATH_LABEL = { E: 'E 探索支架', S: 'S 标准支架', A: 'A 加速支架' };
  var PATH_DESC = {
    E: '图块、点选、动画具象化，一次只追踪一个变量',
    S: '填空、拼代码、修改数字和条件，少量键盘输入',
    A: '自由编辑、双变量、边界测试、开放调试'
  };

  /* 方案 §5.1 统一评分尺度 */
  var OUTCOME_LABEL = {
    'N': 'N · 本次未观察',
    '0': '0 · 帮助后仍未建立',
    '1': '1 · 仿照范例下完成',
    '2': '2 · 新题独立完成',
    '3': '3 · 能解释与迁移'
  };
  var SUPPORT_LABEL = {
    S0: 'S0 无提示', S1: 'S1 重复题意', S2: 'S2 概念提示',
    S3: 'S3 部分结构', S4: 'S4 演示步骤'
  };
  var CONF_LABEL = { low: '低', medium: '中', high: '高' };

  var TYPE_LABEL = {
    choice: '选择与对话', ordering: '排序', predict: '预测', trace: '状态追踪',
    slots: '代码槽', freeEdit: '自由编辑', bughunt: '找错',
    'teach-transfer': '现场教学—迁移', explain: '解释与反思', build: '搭建作品'
  };

  var HINT_MEANING = {
    H1: '重述目标并提出一个问题',
    H2: '指向相关变量、代码行或概念',
    H3: '给出部分结构或排除一个错误方向',
    H4: '给一个不同数字、不同场景的近似例子',
    H5: '展示部分解法并要求孩子补全解释（需教师解锁）'
  };

  /* ------------------------------------------------------------------ *
   * 页面状态
   * ------------------------------------------------------------------ */

  var state = {
    authed: false,
    session: null,
    rawSnapshot: '',
    storageOk: true,
    lessonId: null,
    activityIndex: 0,
    followAuto: true,          // 自动跟随第一个未完成活动
    editingEvidenceId: null,   // 正在编辑的证据行（编辑时暂停证据流重绘）
    draft: null,               // 家长报告草稿工作副本
    draftDirty: false,
    lastSyncAt: null
  };

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 主题化（CONTRACT §13-3）：六卡/实时区/证据流里教师要照着读的口播词过 T()，
   * 让教师读到的故事词与孩子屏幕一致；报告区/家长报告保持正本，不过 T()。
   * 主题取 session.theme（robot 恒等）。
   */
  function T(text) {
    if (text === null || text === undefined) return text;
    var themeId = (state.session && state.session.theme) || 'robot';
    return (CppLab.Theme && typeof CppLab.Theme.t === 'function')
      ? CppLab.Theme.t(String(text), themeId) : String(text);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function fmtClock(d) {
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function outcomeBadge(v) {
    var key = String(v);
    var label = OUTCOME_LABEL[key] || esc(key);
    var cls = 'badge-mut';
    if (key === '3' || key === '2') cls = 'badge-ok';
    else if (key === '1') cls = 'badge-warn';
    else if (key === '0') cls = 'badge-err';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function dimText(d) {
    var info = (CppLab.Evidence && CppLab.Evidence.DIM_INFO) || {};
    return info[d] ? (d + ' ' + info[d].name) : String(d || '—');
  }

  function readRaw() {
    try { return window.localStorage.getItem(SESSION_KEY) || ''; }
    catch (e) { return ''; }
  }

  function checkStorage() {
    try {
      window.localStorage.setItem('__cpplab_probe__', '1');
      window.localStorage.removeItem('__cpplab_probe__');
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ *
   * 弹窗
   * ------------------------------------------------------------------ */

  function closeModal() { $('modal-root').innerHTML = ''; }

  /**
   * openModal(title, bodyHTML, buttons)
   * buttons = [{label, primary?, danger?, onClick(box, close)}]，为空时只给「关闭」。
   */
  function openModal(title, bodyHTML, buttons) {
    var root = $('modal-root');
    var btns = (buttons && buttons.length) ? buttons : [{ label: '关闭', onClick: function (box, close) { close(); } }];
    var footer = btns.map(function (b, i) {
      var cls = 'btn' + (b.primary ? ' btn-primary' : '') + (b.danger ? ' btn-danger' : '');
      return '<button class="' + cls + '" data-mbtn="' + i + '">' + esc(b.label) + '</button>';
    }).join('');
    root.innerHTML =
      '<div class="modal-mask"><div class="modal-box">' +
      '<h3>' + esc(title) + '</h3>' +
      '<div class="modal-body">' + bodyHTML + '</div>' +
      '<div class="modal-foot">' + footer + '</div>' +
      '</div></div>';
    var box = root.querySelector('.modal-box');
    root.querySelector('.modal-mask').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeModal();
    });
    btns.forEach(function (b, i) {
      root.querySelector('[data-mbtn="' + i + '"]').addEventListener('click', function () {
        b.onClick(box, closeModal);
      });
    });
    return box;
  }

  /** 需要教师填写原因的操作（覆盖调档等）。原因不能为空。 */
  function askReason(title, tip, defaultText, onOk) {
    var box = openModal(title,
      '<p class="muted" style="font-size:13px;margin:0 0 8px;">' + esc(tip) + '</p>' +
      '<textarea id="reason-input" rows="3" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-family:inherit;font-size:13px;">' +
      esc(defaultText || '') + '</textarea>' +
      '<div class="muted" id="reason-err" style="color:var(--c-err);font-size:12px;min-height:18px;"></div>',
      [
        { label: '取消', onClick: function (b, close) { close(); } },
        {
          label: '确认', primary: true,
          onClick: function (b, close) {
            var v = b.querySelector('#reason-input').value.trim();
            if (!v) { b.querySelector('#reason-err').textContent = '原因不能为空——记录会写入支架调整历史。'; return; }
            close();
            onOk(v);
          }
        }
      ]);
    var ta = box.querySelector('#reason-input');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function askConfirm(title, html, okLabel, danger, onOk) {
    openModal(title, html, [
      { label: '取消', onClick: function (b, close) { close(); } },
      { label: okLabel, primary: !danger, danger: !!danger, onClick: function (b, close) { close(); onOk(); } }
    ]);
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#0f172a;color:#fff;padding:8px 18px;border-radius:999px;font-size:13px;' +
      'z-index:2000;box-shadow:0 6px 20px rgba(15,23,42,.3);';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  /** HTTP(S) 下教师写入先发 op；发送失败时静默执行原本的本地写入。 */
  function remoteSyncActive() {
    if (!CppLab.Sync || typeof CppLab.Sync.status !== 'function' ||
        typeof CppLab.Sync.pushOp !== 'function') return false;
    if (!window.location || !/^https?:$/.test(window.location.protocol)) return false;
    var net = CppLab.Sync.status();
    return net.role === 'teacher' && (net.connected || !net.lastError);
  }

  function teacherWrite(type, payload, localWrite, onDone, onError) {
    if (!remoteSyncActive()) {
      localWrite();
      if (onDone) onDone(false);
      return;
    }
    CppLab.Sync.pushOp(type, payload).then(function () {
      try { if (onDone) onDone(true); }
      catch (err) { if (onError) onError(err); }
    }, function () {
      /* 降级红线：网络失败不提示技术错误，直接恢复原 localStorage 流程。 */
      try {
        localWrite();
        if (onDone) onDone(false);
      } catch (err) {
        if (onError) onError(err);
      }
    });
  }

  /** 调用会写 Storage 的报告 API，但在联网教师端只取返回值、不落本机会话。 */
  function withoutStorageWrite(fn) {
    var originalUpdate = CppLab.Storage.update;
    var temp = deepClone(CppLab.Storage.load());
    CppLab.Storage.update = function (mutator) {
      var result = mutator(temp);
      temp = (result && typeof result === 'object') ? result : temp;
      return temp;
    };
    try { return fn(); }
    finally { CppLab.Storage.update = originalUpdate; }
  }

  /* ------------------------------------------------------------------ *
   * 会话读取与课程/活动定位
   * ------------------------------------------------------------------ */

  function loadSession() {
    state.session = CppLab.Storage.load();
    state.rawSnapshot = readRaw();
    state.lastSyncAt = new Date();
    syncTeacherControls();
    syncTrialGate();
  }

  /** 把持久化的教师控制状态同步进 Hints 内存（跨 tab/刷新恢复 H5 解锁） */
  function syncTeacherControls() {
    var tc = (state.session && state.session.teacherControls) || {};
    var un = tc.h5Unlocked || {};
    for (var id in un) {
      if (!Object.prototype.hasOwnProperty.call(un, id)) continue;
      if (un[id]) CppLab.Hints.unlockH5(id); else CppLab.Hints.relockH5(id);
    }
  }

  /** 教师端本地重算试听提示闸门（核心诊断活动是否全部完成），保证状态显示准确 */
  function syncTrialGate() {
    var acts = getActivities('trial');
    if (!acts.length) return;
    var states = getLessonStates('trial');
    var core = acts.filter(function (a) { return a.coreDiagnostic; });
    var done = core.length > 0 && core.every(function (a) {
      return states[a.id] && states[a.id].status === 'done';
    });
    CppLab.Hints.setTrialGate(done);
  }

  function setTeacherControl(fn) {
    CppLab.Storage.update(function (s) {
      s.teacherControls = s.teacherControls || { h5Unlocked: {} };
      s.teacherControls.h5Unlocked = s.teacherControls.h5Unlocked || {};
      fn(s.teacherControls);
    });
  }

  function availableLessons() {
    var content = CppLab.content || {};
    return LESSON_ORDER.filter(function (id) { return !!content[id]; });
  }

  function getActivities(lessonId) {
    var pack = (CppLab.content || {})[lessonId];
    if (!pack) return [];
    var acts = Array.isArray(pack) ? pack.slice() : (pack.activities || []).slice();
    acts.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return acts;
  }

  function getLessonStates(lessonId) {
    var s = state.session || {};
    return ((s.lessons || {})[lessonId] || {}).activityStates || {};
  }

  /** 默认课程：第一门有内容且未完成的课；全完成则停在最后一门 */
  function defaultLessonId() {
    var avail = availableLessons();
    if (!avail.length) return null;
    for (var i = 0; i < avail.length; i++) {
      var l = (state.session.lessons || {})[avail[i]];
      if (!l || !l.completed) return avail[i];
    }
    return avail[avail.length - 1];
  }

  /** 进行中的活动 = 第一个未 done 的；全 done 则停在最后一个 */
  function inProgressIndex(lessonId) {
    var acts = getActivities(lessonId);
    var states = getLessonStates(lessonId);
    for (var i = 0; i < acts.length; i++) {
      var st = states[acts[i].id];
      if (!st || st.status !== 'done') return i;
    }
    return Math.max(0, acts.length - 1);
  }

  function ensurePosition() {
    var avail = availableLessons();
    if (state.lessonId === null || avail.indexOf(state.lessonId) < 0) {
      state.lessonId = defaultLessonId();
      state.followAuto = true;
    }
    if (!state.lessonId) return;
    var acts = getActivities(state.lessonId);
    if (state.followAuto) {
      state.activityIndex = inProgressIndex(state.lessonId);
    }
    if (state.activityIndex >= acts.length) state.activityIndex = Math.max(0, acts.length - 1);
    if (state.activityIndex < 0) state.activityIndex = 0;
  }

  function currentActivity() {
    var acts = getActivities(state.lessonId);
    return acts[state.activityIndex] || null;
  }

  /**
   * 按当前支架档取变体（S→E→A 兜底），并复刻引擎的 lesson2 能量承接替换，
   * 使「正确轨迹」和正确答案显示与孩子端实际运行完全一致。只读，不写内容对象。
   */
  function variantFor(activity) {
    if (!activity || !activity.variants) return null;
    var path = (state.session && state.session.path) || 'S';
    var v = activity.variants[path];
    if (!v) {
      var order = ['S', 'E', 'A'];
      for (var i = 0; i < order.length; i++) {
        if (activity.variants[order[i]]) { v = activity.variants[order[i]]; break; }
      }
    }
    if (!v) return null;
    if (v.dynamic && v.dynamic.initFromLesson1Energy) {
      var clone = deepClone(v);
      var inherited = ((state.session.lessons || {}).lesson1 || {}).finalEnergy;
      var value;
      if (Array.isArray(clone.program)) {
        for (var j = 0; j < clone.program.length; j++) {
          var stp = clone.program[j];
          if (stp && stp.op === 'declare' && stp.name === 'energy') {
            var fallback = (stp.expr && stp.expr.kind === 'lit') ? stp.expr.value : undefined;
            value = (inherited != null) ? inherited : fallback;
            if (value !== undefined) stp.expr = { kind: 'lit', value: value };
            break;
          }
        }
      }
      if (clone.prediction && clone.prediction.correctFromInherited === true && value !== undefined) {
        clone.prediction.correct = value;
      }
      return clone;
    }
    return v;
  }

  /* ------------------------------------------------------------------ *
   * 支架建议（方案 §4.2；与引擎同一规则，从持久化数据重算，跨 tab 可用）
   * ------------------------------------------------------------------ */

  function slNum(supportLevel) {
    var n = parseInt(String(supportLevel || 'S0').slice(1), 10);
    return isNaN(n) ? 0 : n;
  }

  function computeSuggestion() {
    var cur = (state.session && state.session.path) || 'S';
    var states = getLessonStates(state.lessonId);
    var list = [];
    for (var id in states) {
      if (!Object.prototype.hasOwnProperty.call(states, id)) continue;
      var st = states[id];
      if (st && st.status === 'done' && st.completedAt) list.push(st);
    }
    list.sort(function (a, b) { return String(a.completedAt).localeCompare(String(b.completedAt)); });

    if (list.length < 2) {
      return { action: 'keep', to: cur, reason: '本课已完成活动不足两个，按规则暂不调档（单题表现不触发分流）。' };
    }
    var a = list[list.length - 2];
    var b = list[list.length - 1];
    if (typeof a.outcome !== 'number' || typeof b.outcome !== 'number') {
      return { action: 'keep', to: cur, reason: '最近两个活动中有「N 未观察」记录，连续表现被中断，建议保持当前档。' };
    }
    var sa = slNum(a.supportLevel), sb = slNum(b.supportLevel);
    if (a.outcome >= 2 && b.outcome >= 2 && sa <= 1 && sb <= 1) {
      if (cur === 'A') {
        return { action: 'keep', to: cur, reason: '连续两个活动轻提示下完成度高，但已在最高档 A，保持并给加速扩展任务。' };
      }
      var up = cur === 'E' ? 'S' : 'A';
      return {
        action: 'up', to: up,
        reason: '连续两个活动在无提示或轻提示（不超过 H1）下完成度 ≥2，建议上调一档（' + cur + ' → ' + up + '）。'
      };
    }
    if (sa >= 2 && sb >= 2 && a.outcome <= 1 && b.outcome <= 1) {
      if (cur === 'E') {
        return { action: 'keep', to: cur, reason: '连续两个活动强提示后仍偏低，已在最低档 E，保持并按六卡「三步降阶」现场教学。' };
      }
      var down = cur === 'A' ? 'S' : 'E';
      return {
        action: 'down', to: down,
        reason: '连续两个活动在概念提示（H2 及以上）后完成度仍 ≤1，建议下调一档（' + cur + ' → ' + down + '）。'
      };
    }
    return { action: 'keep', to: cur, reason: '最近两个活动的表现没有触发升/降档规则，建议保持当前档。' };
  }

  /** 写入支架切换（含「保持」的覆盖留痕），结构与引擎 setScaffold 完全一致 */
  function applyScaffold(to, reason) {
    var from = (state.session && state.session.path) || 'S';
    var at = new Date().toISOString();
    teacherWrite('setTier', { path: to, from: from, reason: reason || '', at: at }, function () {
      CppLab.Storage.update(function (s) {
        s.scaffoldHistory = s.scaffoldHistory || [];
        s.scaffoldHistory.push({
          at: at,
          from: from, to: to, by: 'teacher', reason: reason || ''
        });
        s.path = to;
      });
    }, function (remote) {
      if (!remote) refresh();
      toast(from === to ? '已记录：保持 ' + PATH_LABEL[to] : '支架已切换：' + from + ' → ' + to + '（几秒内自动同步孩子端）');
    });
  }

  /* ------------------------------------------------------------------ *
   * 顶栏
   * ------------------------------------------------------------------ */

  function renderTopbar() {
    var s = state.session;
    var info = $('topbar-info');
    var nick = s.nickname ? esc(s.nickname) : '<span class="muted">（孩子还没填昵称）</span>';
    var path = s.path || 'S';
    var storageWarn = state.storageOk ? '' :
      '<span class="badge badge-err">浏览器存储不可用：无法与儿童端同步</span>';
    var syncLine = '<span class="topbar-sub"><span class="sync-dot"></span>已同步 ' +
      fmtClock(state.lastSyncAt || new Date()) + '（每 2 秒自动检查）</span>';
    if (CppLab.Sync && typeof CppLab.Sync.status === 'function') {
      var net = CppLab.Sync.status();
      if (net.role === 'teacher') {
        syncLine = net.connected
          ? '<span class="topbar-sub"><span class="sync-dot"></span>局域网已连接 ' + fmtTime(net.lastSyncAt) + '</span>'
          : '<span class="topbar-sub"><span class="sync-dot" style="background:var(--c-accent);"></span>本机模式（局域网连接中断）</span>';
      }
    }
    info.innerHTML =
      '<span class="topbar-title">教师控制台</span>' +
      '<span class="topbar-sub">学员：' + nick + '</span>' +
      '<span class="badge badge-path" title="当前支架档（教师内部信息，儿童端不显示）">' + esc(PATH_LABEL[path] || path) + '</span>' +
      storageWarn +
      '<span class="top-spacer"></span>' +
      syncLine +
      '<a class="btn btn-sm" href="index.html" target="_blank" title="在新标签页打开孩子使用的课程页面">打开儿童端</a>';

    /* 课程切换 */
    var tabs = $('lesson-tabs');
    var avail = availableLessons();
    if (!avail.length) {
      tabs.innerHTML = '<span class="muted" style="font-size:13px;">未找到任何课程内容包（js/content/*.js 未加载）。</span>';
    } else {
      tabs.innerHTML = avail.map(function (id) {
        var done = ((s.lessons || {})[id] || {}).completed;
        return '<button class="lesson-tab' + (id === state.lessonId ? ' active' : '') + '" data-lesson="' + id + '" ' +
          'title="切换查看这门课的活动、六卡与控制">' +
          esc(T(LESSON_NAMES[id] || id)) + (done ? ' ✓' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-lesson]'), function (btn) {
        btn.addEventListener('click', function () {
          state.lessonId = btn.getAttribute('data-lesson');
          state.followAuto = true;
          refresh();
        });
      });
    }

    /* 活动前后切换 */
    var nav = $('activity-nav');
    var acts = getActivities(state.lessonId);
    if (!acts.length) { nav.innerHTML = ''; return; }
    var progIdx = inProgressIndex(state.lessonId);
    nav.innerHTML =
      '<button class="btn btn-sm" id="act-prev" title="查看上一个活动（只影响本页显示，不影响孩子端）">◀ 上一个</button>' +
      '<span class="topbar-sub">第 ' + (state.activityIndex + 1) + ' / ' + acts.length + ' 个活动</span>' +
      '<button class="btn btn-sm" id="act-next" title="查看下一个活动（只影响本页显示，不影响孩子端）">下一个 ▶</button>' +
      '<button class="btn btn-sm' + (state.followAuto ? ' btn-primary' : '') + '" id="act-follow" ' +
      'title="回到并跟随孩子正在进行的活动（第 ' + (progIdx + 1) + ' 个）">跟随进度</button>';
    $('act-prev').addEventListener('click', function () {
      state.followAuto = false;
      state.activityIndex = Math.max(0, state.activityIndex - 1);
      refresh();
    });
    $('act-next').addEventListener('click', function () {
      state.followAuto = false;
      state.activityIndex = Math.min(acts.length - 1, state.activityIndex + 1);
      refresh();
    });
    $('act-follow').addEventListener('click', function () {
      state.followAuto = true;
      refresh();
    });
  }

  /* ------------------------------------------------------------------ *
   * 实时区
   * ------------------------------------------------------------------ */

  function activityEvidence(activityId) {
    var all = (state.session.evidence || []).filter(function (e) { return e.activityId === activityId; });
    all.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
    return all;
  }

  function renderLive() {
    var panel = $('live-panel');
    var act = currentActivity();
    if (!act) {
      panel.innerHTML = '<div class="card"><div class="empty-tip">当前课程没有可显示的活动内容。</div></div>';
      return;
    }
    var variant = variantFor(act);
    var states = getLessonStates(state.lessonId);
    var actState = states[act.id] || null;
    var sugg = computeSuggestion();
    var s = state.session;
    var path = s.path || 'S';

    /* --- 卡1：当前课程 / 活动 / 学习目标 --- */
    var dims = (act.dimensions || []).map(function (d) {
      return '<span class="badge badge-mut" title="诊断维度（教师内部信息）">' + esc(dimText(d)) + '</span>';
    }).join(' ');
    var minutes = (act.minutes && act.minutes.length === 2) ? ('第 ' + act.minutes[0] + '–' + act.minutes[1] + ' 分钟') : '';
    var stateLine;
    if (actState && actState.status === 'done') {
      stateLine = '<span class="badge badge-ok">已完成</span> ' + outcomeBadge(actState.outcome) +
        ' <span class="badge badge-mut">' + esc(SUPPORT_LABEL[actState.supportLevel] || actState.supportLevel || '') + '</span>' +
        ' <span class="kv">尝试 ' + (actState.attempts || 1) + ' 次 · ' + fmtTime(actState.completedAt) + '</span>';
    } else {
      stateLine = '<span class="badge badge-warn">进行中 / 未开始</span>';
    }
    var card1 =
      '<div class="card">' +
      '<h3>' + esc(T(LESSON_NAMES[state.lessonId] || state.lessonId)) + ' · 活动 ' + esc(act.order) + '：' + esc(T(act.title || '')) + '</h3>' +
      '<div class="kv" style="margin-bottom:6px;">' +
      '<span class="badge badge-mut">' + esc(TYPE_LABEL[act.activityType] || act.activityType || '') + '</span> ' +
      (minutes ? '<span class="badge badge-mut">' + esc(minutes) + '</span> ' : '') + dims + '</div>' +
      '<p style="margin:4px 0;"><b>学习目标：</b>' + esc(T(act.learningObjective || '—')) + '</p>' +
      '<p style="margin:4px 0;"><b>孩子看到的任务：</b>' + esc(T(act.childPrompt || '—')) + '</p>' +
      (act.evidenceRule && act.evidenceRule.note
        ? '<p style="margin:4px 0;"><b>观察要点：</b>' + esc(T(act.evidenceRule.note)) + '</p>' : '') +
      '<p style="margin:4px 0;">' + stateLine + '</p>' +
      (variant && variant.successCriteria
        ? '<p class="kv" style="margin:4px 0;"><b>完成标准（当前档）：</b>' + esc(T(variant.successCriteria)) + '</p>' : '') +
      '</div>';

    /* --- 卡2：支架档 + 系统建议 + 一键调档 --- */
    var actionText = { up: '上调', down: '下调', keep: '保持' };
    var suggBadgeCls = sugg.action === 'up' ? 'badge-ok' : (sugg.action === 'down' ? 'badge-warn' : 'badge-mut');
    var histHtml = (s.scaffoldHistory || []).slice(-3).reverse().map(function (h) {
      return '<div class="kv">' + fmtTime(h.at) + ' · ' + esc(h.from) + ' → ' + esc(h.to) +
        '（' + (h.by === 'auto' ? '系统' : '教师') + '）' + (h.reason ? ' · ' + esc(h.reason) : '') + '</div>';
    }).join('') || '<div class="kv">（还没有调档记录）</div>';
    var card2 =
      '<div class="card">' +
      '<h3>支架档与系统建议</h3>' +
      '<p style="margin:4px 0;">当前：<span class="badge badge-path">' + esc(PATH_LABEL[path]) + '</span> ' +
      '<span class="kv">' + esc(PATH_DESC[path] || '') + '</span></p>' +
      '<p style="margin:6px 0;">系统建议：<span class="badge ' + suggBadgeCls + '">' + actionText[sugg.action] +
      (sugg.action !== 'keep' ? '（→ ' + esc(sugg.to) + '）' : '') + '</span></p>' +
      '<p class="kv" style="margin:2px 0 8px;">理由：' + esc(sugg.reason) + '</p>' +
      '<div class="btn-row">' +
      '<button class="btn' + (sugg.action === 'up' ? ' btn-primary' : '') + '" id="sc-up" ' + (path === 'A' ? 'disabled' : '') +
      ' title="切换到更放手的一档。与系统建议不一致时需要填写原因。">上调一档</button>' +
      '<button class="btn' + (sugg.action === 'down' ? ' btn-primary' : '') + '" id="sc-down" ' + (path === 'E' ? 'disabled' : '') +
      ' title="切换到支撑更多的一档。与系统建议不一致时需要填写原因。">下调一档</button>' +
      '<button class="btn" id="sc-keep" title="明确记录一次「保持当前档」的决定（写入调档历史）。">保持当前档</button>' +
      '</div>' +
      '<div class="ctl-tip"><b>请在两个活动之间调档</b>（等孩子点完「下一个任务！」再调）。孩子<b>还没开始</b>的活动会立即换用新档变体；但如果他<b>已经在做</b>这个活动，引擎会当场切到新档的程序，而屏幕上还留着旧档的题面和代码——你会照着旧题讲，数字却对不上。已完成的记录不受影响。每次调档（含覆盖建议）都会连同原因写入历史。</div>' +
      '<hr class="sep">' + histHtml +
      '</div>';

    /* --- 卡3：孩子的预测 / 代码 / 解释 --- */
    var evList = activityEvidence(act.id);
    var childBits = [];
    if (actState && actState.prediction) {
      childBits.push('<p style="margin:4px 0;"><b>预测：</b>' + esc(String(actState.prediction.value)) +
        (actState.prediction.correct ? ' <span class="badge badge-ok">✓ 与程序一致</span>'
          : ' <span class="badge badge-warn">✗ 与程序不一致（这本身是好的诊断材料）</span>') + '</p>');
    }
    if (variant && variant.prediction) {
      childBits.push('<p class="kv" style="margin:2px 0;">预测题（当前档）：' + esc(T(variant.prediction.question || '')) +
        ' · 正确答案：<b>' + esc(String(variant.prediction.correct)) + '</b>（仅教师可见）</p>');
    }
    if (evList.length) {
      var shown = evList.slice(0, 3).map(function (e) {
        var answer = (e.answerOrCode == null || e.answerOrCode === '') ? '' : String(e.answerOrCode);
        var answerHtml = answer
          ? (answer.indexOf('\n') >= 0 || answer.length > 60
            ? '<pre class="code">' + esc(answer) + '</pre>'
            : ' <b>' + esc(answer) + '</b>')
          : ' <span class="muted">（无书面作答）</span>';
        return '<div style="margin:6px 0;padding:6px 10px;background:#f8fafc;border-radius:8px;">' +
          '<div class="kv">' + fmtTime(e.timestamp) + ' · ' + outcomeBadge(e.outcome) + '</div>' +
          '<div style="font-size:13px;"><b>做了什么：</b>' + esc(T(e.childAction || '—')) + '</div>' +
          '<div style="font-size:13px;"><b>作答/代码：</b>' + answerHtml + '</div>' +
          '</div>';
      }).join('');
      childBits.push('<p style="margin:8px 0 2px;"><b>本活动最近证据（最多 3 条，全量见证据流）：</b></p>' + shown);
    }
    if (!childBits.length) {
      childBits.push('<div class="empty-tip">孩子还没有在这个活动留下预测或作答。完成活动后这里会自动出现。</div>');
    }
    var card3 =
      '<div class="card">' +
      '<h3>孩子的预测 / 代码 / 解释</h3>' +
      childBits.join('') +
      '</div>';

    /* --- 卡4：提示使用与教师代读 --- */
    var ladderInfo = CppLab.Hints.teacherLadder(act.id, act);
    var usedLevels = CppLab.Hints.getUsed(act.id);
    var gateLine = ladderInfo.aiDisabledForChild
      ? '<span class="badge badge-warn" title="方案 11.2：试听核心诊断完成前，儿童端不开放提示阶梯；H1/H2 由教师代读">儿童端提示：诊断期锁定（由教师代读）</span>'
      : '<span class="badge badge-ok">儿童端提示：开放</span>';
    var ladderHtml = (ladderInfo.ladder || []).map(function (e) {
      var mark = e.used ? '<span class="badge badge-ok">已发</span>' : '<span class="badge badge-mut">未发</span>';
      var lockNote = '';
      if (e.teacherOnly) {
        lockNote = ladderInfo.h5Unlocked
          ? ' <span class="badge badge-warn">H5 已解锁</span>'
          : ' <span class="badge badge-mut">H5 锁定中（控制区可解锁）</span>';
      }
      var readBtn = e.used ? '' :
        ' <button class="btn btn-sm" data-hint-read="' + esc(e.level) + '" ' +
        'title="你已经口头把这条提示讲给孩子后点这里：计入提示统计，影响支持等级记录">记为已代读</button>';
      return '<tr><td style="white-space:nowrap;"><b>' + esc(e.level) + '</b><div class="kv">' + esc(HINT_MEANING[e.level] || '') + '</div></td>' +
        '<td>' + esc(T(e.text)) + lockNote + '</td>' +
        '<td style="white-space:nowrap;">' + mark + readBtn + '</td></tr>';
    }).join('');
    var card4 =
      '<div class="card">' +
      '<h3>提示使用（本活动）</h3>' +
      '<p style="margin:4px 0;">' + gateLine +
      ' <span class="kv">已用 ' + usedLevels.length + ' 档：' + (usedLevels.length ? esc(usedLevels.join('、')) : '无') + '</span></p>' +
      '<table class="tbl"><tr><th style="width:130px;">阶梯</th><th>提示文案</th><th style="width:150px;">状态</th></tr>' +
      (ladderHtml || '<tr><td colspan="3" class="muted">本活动没有配置提示阶梯。</td></tr>') +
      '</table>' +
      '<div class="ctl-tip">「记为已代读」用于你口头讲过某条提示之后补记：它会写入提示统计并抬高该活动的支持等级（S1–S4），让证据保持真实。</div>' +
      '</div>';

    /* --- 卡2.5：教师笔记（方案 §9.2 实时面板明列项；课中随手记，不依赖证据产生） --- */
    var notes = (s.teacherNotes || []).slice().reverse().slice(0, 5);
    var notesHtml = notes.map(function (n) {
      return '<div class="kv" style="margin:3px 0;">' + fmtTime(n.at) + ' · ' +
        esc(T(LESSON_NAMES[n.lessonId] || n.lessonId || '—')) +
        (n.activityId ? ' · ' + esc(n.activityId) : '') + '：' + esc(n.text) + '</div>';
    }).join('') || '<div class="kv">（还没有笔记）</div>';
    var cardNote =
      '<div class="card">' +
      '<h3>教师笔记（课中随手记）</h3>' +
      '<div class="ctl-tip">活动进行中随时可写，不必等证据出现；笔记带时间与当前课程/活动一起留档，写家长报告草稿时可对照参考。逐条证据的备注请用证据流里的「编辑」。</div>' +
      '<textarea id="tnote-input" rows="2" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-family:inherit;font-size:13px;" ' +
      'placeholder="例：孩子主动提出想试能量 4 和 6——边界意识萌芽。">' + esc(state.noteDraft || '') + '</textarea>' +
      '<div class="btn-row" style="margin-top:6px;"><button class="btn btn-primary btn-sm" id="tnote-save">保存笔记</button></div>' +
      '<hr class="sep"><p class="kv" style="margin:2px 0;"><b>最近笔记（最多显示 5 条）：</b></p>' + notesHtml +
      '</div>';

    /* --- 卡2.6：真实编译通道状态（QA P2：降级不可无声，失败原因透出教师端） --- */
    var lc = s.lastCompile || null;
    var lcHtml;
    if (!lc) {
      lcHtml = '<div class="kv">（本会话还没有发起过真实 C++ 验证）</div>';
    } else if (lc.real) {
      lcHtml = '<div class="kv">' + fmtTime(lc.at) + ' · ' + esc(lc.activityId || '') +
        ' · <span class="badge badge-ok">真实编译 ' + esc(lc.status) + '</span>' +
        (lc.compilerVersion ? ' · ' + esc(lc.compilerVersion) : '') + '</div>';
    } else {
      lcHtml = '<div class="kv">' + fmtTime(lc.at) + ' · ' + esc(lc.activityId || '') +
        ' · <span class="badge badge-warn">已降级为概念演示</span></div>' +
        (lc.remoteError
          ? '<div class="kv"><b>最近一次远程验证失败原因：</b>' + esc(lc.remoteError) + '</div>'
          : '<div class="kv">失败原因未知（可能是断网或浏览器拦截）。</div>');
    }
    var cardCompile =
      '<div class="card">' +
      '<h3>真实编译通道</h3>' +
      '<div class="ctl-tip">课程核心卖点「真实 C++ 验证」失败时会自动降级为概念演示（孩子端有明确标记）。这里显示最近一次验证的通道状态，持续失败请联系课程维护者。</div>' +
      lcHtml +
      '</div>';

    panel.innerHTML = card1 + card2 + cardNote + '<div class="grid-2">' + card3 + card4 + '</div>' + cardCompile;

    /* 事件绑定 */
    var tnoteTa = $('tnote-input');
    if (tnoteTa) {
      // 输入草稿暂存 state：孩子端写入触发的自动刷新不会吃掉正在输入的笔记
      tnoteTa.addEventListener('input', function () { state.noteDraft = tnoteTa.value; });
    }
    var tnoteSave = $('tnote-save');
    if (tnoteSave) {
      tnoteSave.addEventListener('click', function () {
        var text = (tnoteTa && tnoteTa.value || '').trim();
        if (!text) { toast('先写点内容再保存'); return; }
        var noteLesson = state.lessonId;
        var noteAct = act ? act.id : null;
        var note = {
          id: 'tn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          at: new Date().toISOString(),
          lessonId: noteLesson,
          activityId: noteAct,
          text: text
        };
        teacherWrite('teacherNote', note, function () {
          CppLab.Storage.update(function (ss) {
            ss.teacherNotes = ss.teacherNotes || [];
            ss.teacherNotes.push(note);
          });
        }, function (remote) {
          state.noteDraft = '';
          if (tnoteTa) tnoteTa.value = '';
          if (!remote) refresh();
          toast('教师笔记已保存');
        });
      });
    }
    var scUp = $('sc-up'), scDown = $('sc-down'), scKeep = $('sc-keep');
    if (scUp) scUp.addEventListener('click', function () { scaffoldClick('up', sugg, path); });
    if (scDown) scDown.addEventListener('click', function () { scaffoldClick('down', sugg, path); });
    if (scKeep) scKeep.addEventListener('click', function () { scaffoldClick('keep', sugg, path); });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-hint-read]'), function (btn) {
      btn.addEventListener('click', function () {
        var lv = btn.getAttribute('data-hint-read');
        if (lv === 'H5' && !CppLab.Hints.isH5Unlocked(act.id)) {
          toast('H5 需要先在控制区解锁');
          return;
        }
        teacherWrite('markHintUsed', { activityId: act.id, level: lv, at: new Date().toISOString() }, function () {
          CppLab.Hints.markUsedByTeacher(act.id, lv);
        }, function (remote) {
          if (!remote) refresh();
          toast('已记录代读 ' + lv);
        });
      });
    });
  }

  function scaffoldClick(action, sugg, path) {
    var order = ['E', 'S', 'A'];
    var idx = order.indexOf(path);
    var to = path;
    if (action === 'up') to = order[Math.min(2, idx + 1)];
    if (action === 'down') to = order[Math.max(0, idx - 1)];

    if (action === sugg.action) {
      /* 与系统建议一致：原因预填建议理由，教师可修改 */
      askReason(
        action === 'keep' ? '记录：保持当前档' : '按建议' + (action === 'up' ? '上调' : '下调') + '到 ' + PATH_LABEL[to],
        '与系统建议一致。原因已预填，可直接确认或补充你的现场观察。',
        sugg.reason,
        function (reason) { applyScaffold(to, reason); }
      );
    } else {
      /* 覆盖系统建议：必须填原因（方案 4.2：老师可随时覆盖，覆盖原因记入记录） */
      askReason(
        '覆盖系统建议：' + (action === 'keep' ? '保持 ' + PATH_LABEL[to] : '切换到 ' + PATH_LABEL[to]),
        '系统建议是「' + ({ up: '上调', down: '下调', keep: '保持' })[sugg.action] + '」，你选择了不同的操作。请写下现场依据（必填），将与调档记录一起留档。',
        '',
        function (reason) { applyScaffold(to, '[覆盖系统建议] ' + reason); }
      );
    }
  }

  /* ------------------------------------------------------------------ *
   * 教师六卡
   * ------------------------------------------------------------------ */

  function renderCards() {
    var panel = $('cards-panel');
    var act = currentActivity();
    if (!act || !act.teacherCards) {
      panel.innerHTML = '<div class="card"><div class="empty-tip">当前活动没有配置教师卡。</div></div>';
      return;
    }
    var c = act.teacherCards;
    // 六卡是教师口播词：过 T() 让教师读到的故事词与孩子屏幕一致（§13-3）
    function listOf(arr, ordered) {
      if (!arr || !arr.length) return '<p class="muted">（无）</p>';
      var tag = ordered ? 'ol' : 'ul';
      return '<' + tag + '>' + arr.map(function (x) { return '<li>' + esc(T(x)) + '</li>'; }).join('') + '</' + tag + '>';
    }
    panel.innerHTML =
      '<div class="tcards">' +
      '<div class="tcard"><h4><span class="tcard-no">①</span>30 秒知识真相</h4><p>' + esc(T(c.truth || '—')) + '</p></div>' +
      '<div class="tcard"><h4><span class="tcard-no">②</span>推荐演示</h4><p>' + esc(T(c.demo || '—')) + '</p></div>' +
      '<div class="tcard"><h4><span class="tcard-no">③</span>三个追问</h4>' + listOf(c.questions, true) + '</div>' +
      '<div class="tcard"><h4><span class="tcard-no">④</span>常见误区</h4>' + listOf(c.misconceptions, false) + '</div>' +
      '<div class="tcard"><h4><span class="tcard-no">⑤</span>三步降阶</h4>' + listOf(c.rescueSteps, true) + '</div>' +
      '<div class="tcard"><h4><span class="tcard-no">⑥</span>加速扩展</h4><p>' + esc(T(c.extension || '—')) + '</p></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 证据流
   * ------------------------------------------------------------------ */

  function renderEvidence() {
    var panel = $('evidence-panel');
    var list = (state.session.evidence || []).slice();
    list.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });

    if (!list.length) {
      panel.innerHTML = '<div class="card"><div class="empty-tip">还没有任何证据记录。孩子每完成一个活动，这里会自动出现一条。</div></div>';
      return;
    }

    var rows = list.map(function (e) {
      var editing = state.editingEvidenceId === e.id;
      var overridden = e.overridden
        ? '<span class="badge badge-warn" title="原值：outcome=' +
          esc(String(e.overridden.original && e.overridden.original.outcome !== undefined ? e.overridden.original.outcome : '—')) +
          '（' + esc(fmtTime(e.overridden.overriddenAt)) + ' 修订）">已修订</span>'
        : '';
      var answer = (e.answerOrCode == null || e.answerOrCode === '') ? '' : String(e.answerOrCode);
      var answerHtml = answer
        ? (answer.indexOf('\n') >= 0 || answer.length > 60
          ? '<pre class="code">' + esc(answer) + '</pre>'
          : '<b>' + esc(answer) + '</b>')
        : '<span class="muted">（无）</span>';

      var head =
        '<div class="evi-head">' +
        '<span class="kv">' + fmtTime(e.timestamp) + '</span>' +
        '<span class="badge badge-mut">' + esc(e.activityId || '') + '</span>' +
        '<span class="badge badge-mut">' + esc(dimText(e.dimension)) + '</span>' +
        '<span class="badge badge-path">' + esc(e.variant || '') + ' 档</span>' +
        outcomeBadge(e.outcome) +
        '<span class="badge badge-mut">' + esc(SUPPORT_LABEL[e.supportLevel] || e.supportLevel || '') + '</span>' +
        '<span class="badge badge-mut">置信度：' + esc(CONF_LABEL[e.confidence] || e.confidence || '—') + '</span>' +
        overridden +
        '<span class="top-spacer"></span>' +
        (editing ? '' :
          '<button class="btn btn-sm" data-evi-edit="' + esc(e.id) + '" title="修改完成度、置信度或补写教师备注（原值自动留档）">编辑</button>' +
          '<button class="btn btn-sm" data-evi-n="' + esc(e.id) + '" title="把这条改为「N 本次未观察」：适用于误记、被打断或证据不足的情况">标记未观察</button>') +
        '</div>';

      var body =
        '<div class="evi-body">' +
        '<div><b>任务：</b>' + esc(T(e.taskPrompt || '—')) + '</div>' +
        '<div><b>孩子的做法：</b>' + esc(T(e.childAction || '—')) + '</div>' +
        '<div><b>作答/代码：</b>' + answerHtml + '</div>' +
        '<div class="kv">尝试 ' + esc(String(e.attemptCount || 1)) + ' 次' +
        (e.selfCorrection ? ' · <span style="color:#166534;">出现自我修正（正向证据）</span>' : '') +
        (e.transferResult != null && e.transferResult !== '' ? ' · 迁移结果：' + esc(String(e.transferResult)) : '') +
        '</div>' +
        (e.teacherNote ? '<div class="evi-note">教师备注：' + esc(e.teacherNote) + '</div>' : '') +
        '</div>';

      var editForm = '';
      if (editing) {
        var opts = ['N', '3', '2', '1', '0'].map(function (k) {
          var val = k === 'N' ? 'N' : k;
          var sel = String(e.outcome) === k ? ' selected' : '';
          return '<option value="' + val + '"' + sel + '>' + esc(OUTCOME_LABEL[k]) + '</option>';
        }).join('');
        var confOpts = ['low', 'medium', 'high'].map(function (k) {
          return '<option value="' + k + '"' + (e.confidence === k ? ' selected' : '') + '>' + esc(CONF_LABEL[k]) + '</option>';
        }).join('');
        editForm =
          '<div class="evi-edit">' +
          '<div class="btn-row" style="margin-bottom:6px;">' +
          '<label class="kv">完成度：<select id="evi-outcome">' + opts + '</select></label>' +
          '<label class="kv">置信度：<select id="evi-conf">' + confOpts + '</select></label>' +
          '</div>' +
          '<textarea id="evi-note" rows="2" placeholder="教师备注：写你现场看到的关键细节，会进入证据留档，供报告引用。">' + esc(e.teacherNote || '') + '</textarea>' +
          '<div class="btn-row" style="margin-top:6px;">' +
          '<button class="btn btn-primary btn-sm" data-evi-save="' + esc(e.id) + '">保存修订</button>' +
          '<button class="btn btn-sm" data-evi-cancel="1">取消</button>' +
          '<span class="kv">保存后原值仍留档在记录里，报告可回溯。</span>' +
          '</div></div>';
      }

      return '<div class="evi-row">' + head + body + editForm + '</div>';
    }).join('');

    panel.innerHTML =
      '<div class="card" style="padding:10px 12px;"><span class="kv">共 ' + list.length +
      ' 条证据，最新在最上。完成度尺度：3 能解释迁移 / 2 新题独立完成 / 1 仿照范例完成 / 0 帮助后仍未建立 / N 本次未观察（不得解读为不会）。</span></div>' +
      rows;

    Array.prototype.forEach.call(panel.querySelectorAll('[data-evi-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        state.editingEvidenceId = btn.getAttribute('data-evi-edit');
        renderEvidence();
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-evi-n]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-evi-n');
        askConfirm('标记为「N 本次未观察」',
          '<p style="font-size:13px;">这条证据的完成度将改为 <b>N</b>（原值自动留档）。适用于误记、任务被打断、或你判断证据不足。要继续吗？</p>',
          '标记为 N', false,
          function () {
            try {
              var patch = { outcome: 'N', confidence: 'low' };
              teacherWrite('evidenceRevise', {
                evidenceId: id, patch: patch, at: new Date().toISOString()
              }, function () {
                CppLab.Evidence.setTeacherOverride(id, patch);
              }, function (remote) {
                if (!remote) refresh();
                toast('已标记为 N 未观察');
              }, function (err) { toast('操作失败：' + err.message); });
            } catch (err) { toast('操作失败：' + err.message); }
          });
      });
    });
    var cancelBtn = panel.querySelector('[data-evi-cancel]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        state.editingEvidenceId = null;
        renderEvidence();
      });
    }
    var saveBtn = panel.querySelector('[data-evi-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var id = saveBtn.getAttribute('data-evi-save');
        var outSel = panel.querySelector('#evi-outcome').value;
        var outcome = outSel === 'N' ? 'N' : parseInt(outSel, 10);
        var patch = {
          outcome: outcome,
          confidence: panel.querySelector('#evi-conf').value,
          teacherNote: panel.querySelector('#evi-note').value.trim()
        };
        try {
          teacherWrite('evidenceRevise', {
            evidenceId: id, patch: patch, at: new Date().toISOString()
          }, function () {
            CppLab.Evidence.setTeacherOverride(id, patch);
          }, function (remote) {
            state.editingEvidenceId = null;
            if (!remote) refresh();
            toast('修订已保存（原值留档）');
          }, function (err) { toast('保存失败：' + err.message); });
        } catch (err) { toast('保存失败：' + err.message); }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * 控制区
   * ------------------------------------------------------------------ */

  function renderControls() {
    var panel = $('controls-panel');
    var act = currentActivity();
    var actId = act ? act.id : null;
    var h5On = actId ? CppLab.Hints.isH5Unlocked(actId) : false;
    var llm = CppLab.Hints.LLMHintProvider || { enabled: false, note: 'feature flag, 一期不启用' };

    panel.innerHTML =
      '<div class="grid-3">' +

      '<div class="card"><h3>展示正确轨迹</h3>' +
      '<div class="ctl-tip">在弹窗里显示当前活动（当前支架档）的程序逐行执行说明、最终变量和输出。给你自己看，或在需要示范时朗读给孩子；不会代替孩子操作。</div>' +
      '<button class="btn btn-primary" id="ctl-traj"' + (act ? '' : ' disabled') + '>查看正确轨迹</button>' +
      '</div>' +

      '<div class="card"><h3>重置当前活动</h3>' +
      '<div class="ctl-tip">清除这个活动的完成状态，让孩子可以重做一遍。已记录的证据和提示历史保留不动（课程红线：重置不丢证据）。孩子端刷新或切活动后生效。</div>' +
      '<button class="btn btn-danger" id="ctl-reset"' + (act ? '' : ' disabled') + '>重置「' + esc(act ? T(act.title) : '') + '」</button>' +
      '</div>' +

      '<div class="card"><h3>锁定答案（H5 终极提示）</h3>' +
      '<div class="ctl-tip">H5 是「展示部分解法」级别的提示，默认锁定。只有你解锁后，孩子端的提示按钮才能领到 H5。建议只在 H1–H4 都试过之后解锁。</div>' +
      '<button class="btn' + (h5On ? ' btn-danger' : ' btn-primary') + '" id="ctl-h5"' + (act ? '' : ' disabled') + '>' +
      (h5On ? '重新锁定本活动的 H5' : '解锁本活动的 H5') + '</button>' +
      '<div class="kv" style="margin-top:6px;">当前状态：' +
      (h5On ? '<span class="badge badge-warn">已解锁</span>' : '<span class="badge badge-mut">锁定中</span>') + '</div>' +
      '</div>' +

      '<div class="card"><h3>AI 助教开关</h3>' +
      '<div class="ctl-tip">LLM 提示助手是二期功能，本期为功能开关占位：' + esc(llm.note || '一期未启用') +
      '。当前提示全部来自课程内置的规则阶梯，断网也能用。</div>' +
      '<button class="btn" disabled>AI 助教：一期未启用</button>' +
      '<div class="kv" style="margin-top:6px;">当前提示来源：' +
      esc(CppLab.Hints.getProviderName() === 'rule-based' ? '规则阶梯（离线可用）' : CppLab.Hints.getProviderName()) + '</div>' +
      '</div>' +

      '<div class="card"><h3>修改教师 PIN</h3>' +
      '<div class="ctl-tip">PIN 只存在本机浏览器里（默认 8888）。换电脑或清浏览器数据后会恢复默认。</div>' +
      '<div class="btn-row" style="margin-bottom:6px;">' +
      '<input type="password" id="pin-old" placeholder="当前 PIN" style="width:110px;" maxlength="8">' +
      '<input type="password" id="pin-new" placeholder="新 PIN（4–8 位数字）" style="width:160px;" maxlength="8">' +
      '</div>' +
      '<button class="btn" id="ctl-pin">保存新 PIN</button>' +
      '<div class="kv" id="pin-msg" style="min-height:18px;margin-top:4px;"></div>' +
      '</div>' +

      '<div class="card"><h3>课堂小抄</h3>' +
      '<div class="ctl-tip">每个核心任务的固定节奏：先预测 → 再运行 → 再解释 → 必要时现场教学 → 换新情境迁移。诊断看的不是第一次对错，而是接受何种提示后能推进。</div>' +
      '<div class="kv">提示阶梯：H1 重述目标 → H2 指向概念 → H3 部分结构 → H4 近似例子 → H5 部分解法（需解锁）。</div>' +
      '</div>' +

      '</div>';

    var trajBtn = $('ctl-traj');
    if (trajBtn) trajBtn.addEventListener('click', showTrajectory);
    var resetBtn = $('ctl-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!act) return;
        askConfirm('重置活动「' + T(act.title) + '」',
          '<p style="font-size:13px;">将清除这个活动的完成状态（完成度、预测记录），孩子可以重做。<br>' +
          '<b>不会</b>删除任何证据记录和提示历史。要继续吗？</p>',
          '确认重置', true,
          function () {
            var lessonId = state.lessonId;
            teacherWrite('resetActivity', { lessonId: lessonId, activityId: act.id }, function () {
              CppLab.Storage.update(function (s) {
                var lesson = (s.lessons || {})[lessonId];
                if (lesson && lesson.activityStates && lesson.activityStates[act.id]) {
                  delete lesson.activityStates[act.id];
                  lesson.completed = false;
                }
              });
            }, function (remote) {
              if (!remote) refresh();
              toast('活动已重置，孩子端刷新后可重做');
            });
          });
      });
    }
    var h5Btn = $('ctl-h5');
    if (h5Btn) {
      h5Btn.addEventListener('click', function () {
        if (!actId) return;
        var next = !CppLab.Hints.isH5Unlocked(actId);
        teacherWrite(next ? 'unlockH5' : 'relockH5', { activityId: actId }, function () {
          if (next) CppLab.Hints.unlockH5(actId); else CppLab.Hints.relockH5(actId);
          setTeacherControl(function (tc) { tc.h5Unlocked[actId] = next; });
        }, function (remote) {
          if (!remote) refresh();
          toast(next ? '本活动 H5 已解锁' : '本活动 H5 已重新锁定');
        });
      });
    }
    var pinBtn = $('ctl-pin');
    if (pinBtn) {
      pinBtn.addEventListener('click', function () {
        var msg = $('pin-msg');
        var oldV = $('pin-old').value;
        var newV = $('pin-new').value;
        if (oldV !== getPin()) { msg.textContent = '当前 PIN 不正确。'; msg.style.color = 'var(--c-err)'; return; }
        if (!/^\d{4,8}$/.test(newV)) { msg.textContent = '新 PIN 需为 4–8 位数字。'; msg.style.color = 'var(--c-err)'; return; }
        try { window.localStorage.setItem(PIN_KEY, newV); } catch (e) { msg.textContent = '保存失败：浏览器存储不可用。'; return; }
        msg.textContent = '已保存。下次进入本页时使用新 PIN。';
        msg.style.color = 'var(--c-ok)';
        $('pin-old').value = ''; $('pin-new').value = '';
      });
    }
  }

  /** 正确轨迹弹窗：与孩子端同一 IR，同一变体（含 lesson2 能量承接），保证一致 */
  function showTrajectory() {
    var act = currentActivity();
    if (!act) return;
    var variant = variantFor(act);
    if (!variant || !Array.isArray(variant.program) || !variant.program.length) {
      openModal('正确轨迹 · ' + T(act.title),
        '<p style="font-size:13px;">当前支架档（' + esc((state.session.path || 'S')) + '）的这个活动没有可执行程序' +
        '（例如选择、排序、口头解释类活动），没有逐行轨迹可以展示。<br>' +
        '需要示范时请使用教师六卡里的「推荐演示」。</p>');
      return;
    }
    var IR = CppLab.IR;
    var result, focus;
    try {
      result = IR.execute(variant.program);
      focus = IR.toFocusCpp(variant.program);
    } catch (e) {
      openModal('正确轨迹', '<p>轨迹生成失败：' + esc(e.message) + '</p>');
      return;
    }
    var steps = (result.trace || []).map(function (t, i) {
      return '<tr><td class="kv" style="white-space:nowrap;">第 ' + esc(String(t.lineNo)) + ' 行</td>' +
        '<td>' + esc(t.description || '') + '</td></tr>';
    }).join('');
    var vars = Object.keys(result.finalVars || {}).map(function (k) {
      return esc(k) + ' = ' + esc(String(result.finalVars[k]));
    }).join('，') || '（无变量）';
    var expected = (act.compilerCheck && act.compilerCheck.enabled) ? act.compilerCheck.expectedStdout : null;
    var expectedLine = '';
    if (act.activityType === 'bughunt') {
      // bughunt 的 program 是带 bug 版（教学设计）：直接运行的输出是修复前的表现；
      // expectedStdout 是孩子修好 bug、真实编译后的预期输出，两者不同是设计使然。
      expectedLine = (expected != null && expected !== '')
        ? '<p class="kv" style="margin:4px 0;">本活动程序为<b>带 bug 版</b>（教学设计）：上面是修复前的表现；孩子修好 bug 并真实编译后，预期输出为 <code>' + esc(expected) + '</code>。</p>'
        : '';
    } else if (expected != null && expected !== '') {
      var same = String(expected) === String(result.stdout || '');
      if (!same && act.activityType === 'slots') {
        // slots 的存档 program 可以是未解版：解出目标后才等于 expectedStdout（产品验证时机）
        expectedLine = '<p class="kv" style="margin:4px 0;">本活动为槽位调整任务：上面是初始（未解）程序的输出；孩子调对槽位达成目标后，预期输出为 <code>' + esc(expected) + '</code>。</p>';
      } else {
        expectedLine = '<p class="kv" style="margin:4px 0;">与真实编译预期输出' +
          (same ? '一致 <span class="badge badge-ok">✓ 一致</span>'
                : '不一致 <span class="badge badge-err">✗ 请报告给课程维护者</span>') + '</p>';
      }
    }
    openModal('正确轨迹 · ' + T(act.title) + '（' + (state.session.path || 'S') + ' 档）',
      '<p class="kv" style="margin:0 0 4px;">聚焦代码（孩子端看到的同一份）：</p>' +
      '<pre class="code">' + esc(focus) + '</pre>' +
      '<p class="kv" style="margin:8px 0 4px;">逐行执行说明（可以照着读给孩子听）：</p>' +
      '<table class="tbl">' + (steps || '<tr><td class="muted">（无执行步骤）</td></tr>') + '</table>' +
      '<hr class="sep">' +
      '<p style="font-size:13px;margin:4px 0;"><b>结束时变量：</b>' + vars + '</p>' +
      '<p style="font-size:13px;margin:4px 0;"><b>程序输出：</b><code>' + esc(result.stdout || '（无输出）') + '</code></p>' +
      expectedLine +
      (result.error ? '<p style="color:var(--c-err);font-size:13px;">执行错误：' + esc(result.error) + '</p>' : ''));
  }

  /* ------------------------------------------------------------------ *
   * 报告区
   * ------------------------------------------------------------------ */

  function renderReport() {
    var panel = $('report-panel');
    var s = state.session;
    var parts = [];

    /* --- 路径建议 --- */
    var lesson2Done = !!((s.lessons || {}).lesson2 || {}).completed;
    var pathConfirmed = !!((s.lessons || {}).lesson2 || {}).pathConfirmed;
    var suggHtml;
    try {
      var ps = CppLab.Evidence.pathSuggestion();
      var reasons = (ps.reasons || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
      suggHtml =
        '<p style="margin:4px 0;">系统建议路径：<span class="badge badge-path">' + esc(PATH_LABEL[ps.suggested] || ps.suggested) + '</span>' +
        ' <span class="badge badge-mut">置信度：' + esc(CONF_LABEL[ps.confidence] || ps.confidence) + '</span></p>' +
        (reasons ? '<ul style="margin:4px 0;padding-left:20px;font-size:13px;">' + reasons + '</ul>'
                 : '<p class="kv">（暂无判定理由——证据还太少）</p>');
    } catch (e) {
      suggHtml = '<p class="kv">路径建议暂不可用：' + esc(e.message) + '</p>';
    }
    var reviewBanner = '';
    if (lesson2Done) {
      reviewBanner = pathConfirmed
        ? '<div class="hi-banner">✅ 路径确认（第 2 课后确认点）已完成：当前路径 ' + esc(PATH_LABEL[s.path] || s.path) + ' 已由教师确认。</div>'
        : '<div class="hi-banner">📌 第 2 课已完成——请做「路径确认（第 2 课后确认点）」：对照下方建议与两课证据，点击按钮确认或调整正式路径。（「第 2 次路径复核」在第 6 课，见课程地图。）</div>';
    }
    parts.push(
      '<div class="card">' +
      '<h3>路径建议与确认</h3>' +
      '<div class="ctl-tip">试听给出的是临时路径；第 2 课结束后做「路径确认」，第 6 课才是「第 2 次路径复核」（课程地图术语）。建议只是参考，最终由你拍板，调整会连同原因留档。</div>' +
      reviewBanner + suggHtml +
      '<p style="margin:8px 0 4px;">当前正式路径：<span class="badge badge-path">' + esc(PATH_LABEL[s.path] || s.path) + '</span></p>' +
      '<div class="btn-row">' +
      ['E', 'S', 'A'].map(function (p) {
        return '<button class="btn btn-sm" data-path-set="' + p + '" title="' + esc(PATH_DESC[p]) + '">定为 ' + esc(PATH_LABEL[p]) + '</button>';
      }).join('') +
      (lesson2Done && !pathConfirmed
        ? '<button class="btn btn-primary btn-sm" data-path-confirm="1" title="确认当前路径为第 2 次复核结果">确认当前路径（完成复核）</button>'
        : '') +
      '</div>' +
      '</div>');

    /* --- 能力向量 --- */
    var profHtml;
    try {
      var prof = CppLab.Report.teacherProfile();
      var rows = (prof.dimensions || []).map(function (d) {
        var bestHtml = d.best === 'N'
          ? '<span class="badge badge-mut">未观察</span>'
          : outcomeBadge(d.best);
        return '<tr><td style="white-space:nowrap;">' + esc(d.dimension) + '</td><td>' + esc(d.name) + '</td>' +
          '<td>' + bestHtml + '</td><td class="kv">' + d.count + ' 条</td></tr>';
      }).join('');
      var hs = prof.hintStats || { total: 0, byLevel: {} };
      var byLevel = ['H1', 'H2', 'H3', 'H4', 'H5'].map(function (k) {
        return k + '×' + (hs.byLevel[k] || 0);
      }).join('　');
      profHtml =
        '<table class="tbl"><tr><th>维度</th><th>名称</th><th>最好表现</th><th>证据数</th></tr>' + rows + '</table>' +
        '<p class="kv" style="margin:8px 0 2px;">兴趣类别（单独记录，不打能力分）：' +
        (prof.interests && prof.interests.length ? esc(prof.interests.join('、')) : '（未记录）') + '</p>' +
        '<p class="kv" style="margin:2px 0;">提示使用合计 ' + hs.total + ' 次：' + esc(byLevel) + '</p>';
    } catch (e) {
      profHtml = '<p class="kv">能力向量暂不可用：' + esc(e.message) + '</p>';
    }
    parts.push(
      '<div class="card">' +
      '<h3>能力向量（D1–D12，教师内部）</h3>' +
      '<div class="ctl-tip">「最好表现」是各维度证据里的最高完成度；「未观察」表示本次没采到证据，不能解读为不会。此表不出现在儿童端与家长报告。</div>' +
      profHtml +
      '</div>');

    /* --- 家长报告 --- */
    var confirmed = s.reports && s.reports.confirmed;
    var hasDraftStored = !!(s.reports && s.reports.draft);
    var draftStatus;
    if (confirmed) {
      draftStatus = '<span class="badge badge-ok">已确认（' + fmtTime(confirmed.confirmedAt) + '）</span>';
    } else if (state.draft) {
      draftStatus = '<span class="badge badge-warn">草稿编辑中（未确认，不能打印）</span>';
    } else if (hasDraftStored) {
      draftStatus = '<span class="badge badge-warn">已有草稿（未确认）</span>';
    } else {
      draftStatus = '<span class="badge badge-mut">尚未生成</span>';
    }
    parts.push(
      '<div class="card">' +
      '<h3>家长报告</h3>' +
      '<div class="ctl-tip">流程：生成草稿 → 在下方逐条修改 → 确认 → 打印。未经你确认的内容不会进入打印页（课程红线）。' +
      '报告只写「已观察 / 初步判断 / 待验证」，不会出现分数、支架档或维度代号。</div>' +
      '<p style="margin:4px 0;">状态：' + draftStatus + '</p>' +
      '<div class="btn-row" style="margin-top:6px;">' +
      '<button class="btn btn-primary" id="rp-gen" title="按当前全部证据重新生成一份草稿（覆盖旧草稿，已确认版不受影响）">生成/重新生成草稿</button>' +
      (hasDraftStored && !state.draft
        ? '<button class="btn" id="rp-load" title="载入上次保存的草稿继续编辑">继续编辑已有草稿</button>' : '') +
      '<button class="btn" id="rp-print" ' + (confirmed ? '' : 'disabled') +
      ' title="在新窗口打开已确认报告的打印版（浏览器里按 Ctrl/Cmd+P 打印）">打印家长报告</button>' +
      '</div>' +
      '</div>');

    /* --- 数据管理 --- */
    parts.push(
      '<div class="card">' +
      '<h3>数据管理</h3>' +
      '<div class="ctl-tip">导出：把整个会话（证据、进度、报告）存成 JSON 文件交接或备份。删除：清空本浏览器里这名孩子的全部数据，删除前请先导出。</div>' +
      '<div class="btn-row">' +
      '<button class="btn" id="rp-export" title="下载完整会话 JSON（含证据流与报告）">导出会话 JSON</button>' +
      '<button class="btn btn-danger" id="rp-delete" title="永久删除本浏览器中的会话数据（需两次确认）">删除会话数据</button>' +
      '</div>' +
      '</div>');

    panel.innerHTML = parts.join('');

    /* 事件 */
    Array.prototype.forEach.call(panel.querySelectorAll('[data-path-set]'), function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-path-set');
        if (p === s.path) { toast('当前已是 ' + PATH_LABEL[p]); return; }
        askReason('把正式路径定为 ' + PATH_LABEL[p],
          '请写下调整依据（会与路径记录一起留档，家长报告的「推荐起点」也应与此一致）。',
          '', function (reason) {
            applyScaffold(p, '[路径调整] ' + reason);
          });
      });
    });
    var confirmBtn = panel.querySelector('[data-path-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        askConfirm('路径确认（第 2 课后确认点）',
          '<p style="font-size:13px;">将把当前路径 <b>' + esc(PATH_LABEL[s.path] || s.path) +
          '</b> 记录为第 2 课后确认点的确认结果。之后仍可调整（第 6 课还有「第 2 次路径复核」），但建议同步告知家长。</p>',
          '确认路径', false,
          function () {
            teacherWrite('confirmPath', { at: new Date().toISOString() }, function () {
              CppLab.Storage.update(function (ss) {
                ss.lessons = ss.lessons || {};
                ss.lessons.lesson2 = ss.lessons.lesson2 || { completed: false, customRule: null, activityStates: {}, pathConfirmed: false };
                ss.lessons.lesson2.pathConfirmed = true;
              });
            }, function (remote) {
              if (!remote) refresh();
              toast('路径确认（第 2 课后）已记录');
            });
          });
      });
    }
    $('rp-gen').addEventListener('click', function () {
      try {
        if (remoteSyncActive()) {
          var remoteDraft = withoutStorageWrite(function () { return CppLab.Report.parentReportDraft(); });
          teacherWrite('saveReportDraft', { draft: remoteDraft }, function () {
            CppLab.Storage.update(function (ss) {
              ss.reports = ss.reports || { draft: null, confirmed: null };
              ss.reports.draft = deepClone(remoteDraft);
            });
          }, function (remote) {
            state.draft = deepClone(remoteDraft);
            state.draftDirty = false;
            if (!remote) refresh();
            renderDraftPanel();
            toast('草稿已生成，请逐条检查修改');
            var remoteDp = $('draft-panel');
            if (remoteDp) remoteDp.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        } else {
          var draft = CppLab.Report.parentReportDraft();
          state.draft = deepClone(draft);
          state.draftDirty = false;
          refresh();
          renderDraftPanel();
          toast('草稿已生成，请逐条检查修改');
          var dp = $('draft-panel');
          if (dp) dp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (e) {
        openModal('草稿生成失败', '<p style="font-size:13px;">' + esc(e.message) + '</p>');
      }
    });
    var loadBtn = $('rp-load');
    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        state.draft = deepClone(s.reports.draft);
        state.draftDirty = false;
        renderDraftPanel();
      });
    }
    $('rp-print').addEventListener('click', printReport);
    $('rp-export').addEventListener('click', exportJSON);
    $('rp-delete').addEventListener('click', deleteSession);
  }

  /* ---------- 家长报告草稿编辑器 ---------- */

  var TAGS = ['已观察', '初步判断', '待验证'];

  function renderDraftPanel() {
    var panel = $('draft-panel');
    if (!state.draft) { panel.innerHTML = ''; return; }
    var d = state.draft;

    var secHtml = (d.sections || []).map(function (sec, si) {
      var items = (sec.items || []).map(function (it, ii) {
        var tagOpts = TAGS.map(function (t) {
          return '<option value="' + esc(t) + '"' + (it.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('');
        var refs = (it.evidenceRefs && it.evidenceRefs.length)
          ? '<span class="kv" title="这条判断回链的证据编号">证据 ×' + it.evidenceRefs.length + '</span>'
          : '<span class="kv">无证据回链</span>';
        return '<div class="draft-item">' +
          '<textarea rows="2" data-dsec="' + si + '" data-ditem="' + ii + '">' + esc(it.text || '') + '</textarea>' +
          '<div class="draft-item-ctl">' +
          '<select data-dtag-sec="' + si + '" data-dtag-item="' + ii + '" title="标注这条内容的性质">' + tagOpts + '</select>' +
          refs +
          '<button class="btn btn-sm btn-danger" data-ddel-sec="' + si + '" data-ddel-item="' + ii + '" title="从报告中删掉这一条">删除</button>' +
          '</div></div>';
      }).join('');
      return '<div class="draft-sec">' +
        '<h4>' + (si + 1) + '. ' + esc(sec.title || sec.key || '') + '</h4>' +
        (items || '<p class="muted" style="font-size:13px;">（本节暂无内容，可添加）</p>') +
        '<button class="btn btn-sm" data-dadd="' + si + '" title="给本节添加一条新内容（默认标为「初步判断」）">＋ 添加一条</button>' +
        '</div>';
    }).join('');

    panel.innerHTML =
      '<div class="card">' +
      '<h3>家长报告草稿（逐条编辑）</h3>' +
      '<div class="ctl-tip">直接改文字、换标签或删除；确认前请通读：报告不得出现智力、人格或长期能力结论（系统会再拦一道）。' +
      '「已观察」必须有课堂证据；拿不准就改成「初步判断」或「待验证」。</div>' +
      secHtml +
      '<div class="btn-row" style="margin-top:10px;">' +
      '<button class="btn" id="draft-save" title="保存当前修改为草稿（还不生成最终版）">保存草稿</button>' +
      '<button class="btn btn-primary" id="draft-confirm" title="确认为最终家长版：之后才能打印">确认报告（最终家长版）</button>' +
      '<button class="btn" id="draft-close" title="关闭编辑器（未保存的修改会丢弃）">关闭编辑器</button>' +
      (state.draftDirty ? '<span class="kv" style="color:var(--c-accent);">有未保存的修改</span>' : '') +
      '</div>' +
      '</div>';

    /* 输入绑定 */
    Array.prototype.forEach.call(panel.querySelectorAll('textarea[data-dsec]'), function (ta) {
      ta.addEventListener('input', function () {
        var si = +ta.getAttribute('data-dsec'), ii = +ta.getAttribute('data-ditem');
        state.draft.sections[si].items[ii].text = ta.value;
        state.draftDirty = true;
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('select[data-dtag-sec]'), function (sel) {
      sel.addEventListener('change', function () {
        var si = +sel.getAttribute('data-dtag-sec'), ii = +sel.getAttribute('data-dtag-item');
        state.draft.sections[si].items[ii].tag = sel.value;
        state.draftDirty = true;
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-ddel-sec]'), function (btn) {
      btn.addEventListener('click', function () {
        var si = +btn.getAttribute('data-ddel-sec'), ii = +btn.getAttribute('data-ddel-item');
        state.draft.sections[si].items.splice(ii, 1);
        state.draftDirty = true;
        renderDraftPanel();
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-dadd]'), function (btn) {
      btn.addEventListener('click', function () {
        var si = +btn.getAttribute('data-dadd');
        state.draft.sections[si].items.push({ text: '', tag: '初步判断', evidenceRefs: [] });
        state.draftDirty = true;
        renderDraftPanel();
      });
    });
    $('draft-save').addEventListener('click', function () {
      var snapshot = deepClone(state.draft);
      teacherWrite('saveReportDraft', { draft: snapshot }, function () {
        CppLab.Storage.update(function (s) {
          s.reports = s.reports || { draft: null, confirmed: null };
          s.reports.draft = snapshot;
        });
      }, function (remote) {
        state.draftDirty = false;
        if (!remote) refresh();
        renderDraftPanel();
        toast('草稿已保存');
      });
    });
    $('draft-confirm').addEventListener('click', function () {
      askConfirm('确认为最终家长版',
        '<p style="font-size:13px;">确认后这份报告将成为可打印的家长版。请确保你已逐条读过：' +
        '每条「已观察」都有课堂依据，没有夸大或负面标签。要确认吗？</p>',
        '确认报告', false,
        function () {
          try {
            if (remoteSyncActive()) {
              var confirmed = withoutStorageWrite(function () { return CppLab.Report.confirmReport(state.draft); });
              teacherWrite('confirmReport', { report: confirmed }, function () {
                CppLab.Storage.update(function (ss) {
                  ss.reports = ss.reports || { draft: null, confirmed: null };
                  ss.reports.confirmed = deepClone(confirmed);
                });
              }, function (remote) {
                state.draft = null;
                state.draftDirty = false;
                if (!remote) refresh();
                renderDraftPanel();
                toast('报告已确认，可以打印了');
              }, function (err) {
                openModal('确认被拦截', '<p style="font-size:13px;">' + esc(err.message) + '</p>' +
                  '<p class="kv">请修改相应条目后重试。</p>');
              });
            } else {
              CppLab.Report.confirmReport(state.draft);
              state.draft = null;
              state.draftDirty = false;
              refresh();
              renderDraftPanel();
              toast('报告已确认，可以打印了');
            }
          } catch (e) {
            openModal('确认被拦截', '<p style="font-size:13px;">' + esc(e.message) + '</p>' +
              '<p class="kv">请修改相应条目后重试。</p>');
          }
        });
    });
    $('draft-close').addEventListener('click', function () {
      if (state.draftDirty) {
        askConfirm('关闭编辑器', '<p style="font-size:13px;">有未保存的修改，关闭后将丢弃。确定关闭吗？</p>', '丢弃并关闭', true, function () {
          state.draft = null; state.draftDirty = false; renderDraftPanel();
        });
      } else {
        state.draft = null; renderDraftPanel();
      }
    });
  }

  /* ---------- 打印 / 导出 / 删除 ---------- */

  function printReport() {
    var confirmed = CppLab.Report.getConfirmedReport();
    if (!confirmed) { toast('还没有已确认的报告'); return; }
    var html;
    try { html = CppLab.Report.printableHTML(confirmed); }
    catch (e) { openModal('打印失败', '<p>' + esc(e.message) + '</p>'); return; }
    var w = window.open('', '_blank');
    if (!w) {
      openModal('无法打开打印窗口', '<p style="font-size:13px;">浏览器拦截了新窗口。请允许本页面打开弹出窗口后重试。</p>');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function exportJSON() {
    var json;
    try { json = CppLab.Storage.exportJSON(); }
    catch (e) { toast('导出失败：' + e.message); return; }
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'cpplab-session-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    toast('会话 JSON 已导出');
  }

  function deleteSession() {
    askConfirm('删除会话数据（第 1 次确认）',
      '<p style="font-size:13px;">将删除本浏览器中这名孩子的<b>全部</b>课程数据：进度、证据流、提示记录和报告。' +
      '<br>此操作不可恢复。建议先点「导出会话 JSON」留档。</p>',
      '我已了解，继续', true,
      function () {
        var box = openModal('删除会话数据（第 2 次确认）',
          '<p style="font-size:13px;">请在下面输入「<b>删除</b>」两个字以最终确认：</p>' +
          '<input type="text" id="del-confirm-input" style="width:100%;padding:8px;" placeholder="输入：删除">' +
          '<div class="kv" id="del-err" style="color:var(--c-err);min-height:18px;"></div>',
          [
            { label: '取消', onClick: function (b, close) { close(); } },
            {
              label: '永久删除', danger: true,
              onClick: function (b, close) {
                var v = b.querySelector('#del-confirm-input').value.trim();
                if (v !== '删除') { b.querySelector('#del-err').textContent = '输入不匹配，请输入「删除」。'; return; }
                close();
                teacherWrite('resetSession', {}, function () {
                  CppLab.Storage.clear();
                }, function (remote) {
                  state.draft = null;
                  state.draftDirty = false;
                  state.editingEvidenceId = null;
                  state.lessonId = null;
                  if (remote) renderFreshEmpty(); else refresh();
                  renderDraftPanel();
                  toast('会话数据已删除，已新建空白会话');
                });
              }
            }
          ]);
        box.querySelector('#del-confirm-input').focus();
      });
  }

  /* ------------------------------------------------------------------ *
   * 刷新与跨 tab 同步
   * ------------------------------------------------------------------ */

  /** 无会话：孩子端从未开始（无昵称、无证据、无任何活动状态） */
  function isFreshSession() {
    var s = state.session || {};
    if (s.nickname) return false;
    if ((s.evidence || []).length) return false;
    var lessons = s.lessons || {};
    for (var id in lessons) {
      if (!Object.prototype.hasOwnProperty.call(lessons, id)) continue;
      var st = (lessons[id] || {}).activityStates || {};
      for (var k in st) {
        if (Object.prototype.hasOwnProperty.call(st, k)) return false;
      }
    }
    return true;
  }

  /** §13-2：无会话时给一句话空态，而不是满屏空卡 */
  function renderFreshEmpty() {
    $('live-panel').innerHTML =
      '<div class="card"><div class="empty-tip">还没有学员会话：在同一浏览器打开儿童端（index.html），' +
      '孩子填好昵称、进入任务后，这里会自动出现全部课堂面板（每 2 秒自动检查）。</div></div>';
    ['cards-panel', 'evidence-panel', 'controls-panel', 'report-panel', 'draft-panel'].forEach(function (id) {
      var n = $(id);
      if (n) n.innerHTML = '';
    });
  }

  function refresh() {
    if (!state.authed) return;
    loadSession();
    ensurePosition();
    renderTopbar();
    if (isFreshSession()) { renderFreshEmpty(); return; }
    renderLive();
    renderCards();
    if (!state.editingEvidenceId) renderEvidence();
    renderControls();
    renderReport();
    /* 草稿编辑器独立于轮询刷新：只有显式操作才重绘，避免打断教师输入 */
  }

  function startSyncLoop() {
    /* 双 tab 准实时（桌面同浏览器场景）：storage 事件 + 2 秒轮询兜底 */
    window.addEventListener('storage', function (e) {
      if (!e || e.key === null || e.key === SESSION_KEY) {
        if (readRaw() !== state.rawSnapshot) refresh();
      }
    });
    setInterval(function () {
      if (!state.authed) return;
      if (readRaw() !== state.rawSnapshot) refresh();
      else if (CppLab.Sync && typeof CppLab.Sync.status === 'function' &&
               CppLab.Sync.status().role === 'teacher') renderTopbar();
    }, 2000);
  }

  /* ------------------------------------------------------------------ *
   * PIN 门
   * ------------------------------------------------------------------ */

  function getPin() {
    try { return window.localStorage.getItem(PIN_KEY) || DEFAULT_PIN; }
    catch (e) { return DEFAULT_PIN; }
  }

  function initPinGate() {
    var input = $('pin-input');
    var err = $('pin-err');
    var box = $('pin-box');

    function tryEnter() {
      if (input.value === getPin()) {
        state.authed = true;
        $('pin-gate').style.display = 'none';
        $('teacher-root').hidden = false;
        refresh();
      } else {
        err.textContent = 'PIN 不正确，请重试。';
        input.value = '';
        box.classList.remove('shake');
        void box.offsetWidth; /* 重启动画 */
        box.classList.add('shake');
        input.focus();
      }
    }
    $('pin-submit').addEventListener('click', tryEnter);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryEnter();
    });
    input.focus();
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  function checkDeps() {
    var missing = [];
    if (!CppLab.Storage) missing.push('storage.js');
    if (!CppLab.Evidence) missing.push('evidence.js');
    if (!CppLab.Hints) missing.push('hints.js');
    if (!CppLab.Report) missing.push('report.js');
    if (!CppLab.IR) missing.push('ir.js');
    return missing;
  }

  function boot() {
    var missing = checkDeps();
    if (missing.length) {
      document.body.innerHTML =
        '<div style="max-width:560px;margin:80px auto;background:#fff;border-radius:14px;padding:24px 28px;' +
        'font-family:system-ui,sans-serif;color:#1e293b;border:1px solid #e2e8f0;">' +
        '<h2 style="margin:0 0 8px;">教师控制台无法启动</h2>' +
        '<p style="font-size:14px;">以下必需模块未加载：<b>' + missing.join('、') + '</b>。<br>' +
        '请确认是从课程文件夹直接双击打开 teacher.html，且 js 文件夹完整。</p></div>';
      return;
    }
    state.storageOk = checkStorage();
    if (CppLab.Sync && typeof CppLab.Sync.start === 'function' &&
        window.location && /^https?:$/.test(window.location.protocol)) {
      CppLab.Sync.start({ role: 'teacher', pollMs: 2000 });
    }
    initPinGate();
    startSyncLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ------------------------------------------------------------------ *
   * 导出（调试与集成用；教师日常不需要接触）
   * ------------------------------------------------------------------ */

  CppLab.TeacherApp = {
    refresh: refresh,
    getState: function () { return state; },
    _computeSuggestion: computeSuggestion,
    _variantFor: variantFor
  };

})();
