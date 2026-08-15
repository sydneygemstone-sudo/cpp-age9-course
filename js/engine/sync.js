/**
 * sync.js — 局域网会话同步模块（CppLab.Sync）
 *
 * - student：本机 Storage 是唯一会话写者；上传变化并逐条应用教师指令。
 * - teacher：只拉取服务器会话；写操作通过 pushOp() 进入教师指令队列。
 * - 任何网络错误都只记入 status()，不抛到界面、不阻断本地课程。
 */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  var DEFAULT_POLL_MS = 2000;
  var PUT_DEBOUNCE_MS = 1000;
  var DEFAULT_TIMEOUT_MS = 5000;
  var SEQ_KEY_PREFIX = 'cpplab_sync_last_seq_v1_';

  var running = false;
  var generation = 0;
  var role = null;
  var pollMs = DEFAULT_POLL_MS;
  var timeoutMs = DEFAULT_TIMEOUT_MS;
  var baseUrl = '';
  var fetchFn = null;
  var pollTimer = null;
  var putTimer = null;
  var pendingRaw = null;
  var lastObservedRaw = null;
  var stateVersion = 0;
  var teacherSeenVersion = -1;
  var lastAppliedSeq = 0;
  var putBusy = false;
  var opsBusy = false;
  var stateBusy = false;
  var connected = false;
  var lastSyncAt = null;
  var lastError = null;
  var memorySeq = {};

  function nowISO() { return new Date().toISOString(); }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonNegativeInt(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function errorOf(value) {
    if (value && value.message) return String(value.message);
    return String(value || '同步请求失败');
  }

  function markSuccess() {
    connected = true;
    lastSyncAt = nowISO();
    lastError = null;
  }

  function markFailure(err) {
    connected = false;
    lastError = errorOf(err);
  }

  function defaultBaseUrl() {
    if (typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol)) {
      if (window.location.origin) return window.location.origin;
      return window.location.protocol + '//' + window.location.host;
    }
    return '';
  }

  function normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function defaultFetch() {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return function (requestUrl, options) { return window.fetch(requestUrl, options); };
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return function (requestUrl, options) { return globalThis.fetch(requestUrl, options); };
    }
    return null;
  }

  function apiUrl(pathname) { return baseUrl + pathname; }

  function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('同步请求超时'));
      }, timeoutMs);
      Promise.resolve(promise).then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function requestJSON(pathname, options) {
    if (!fetchFn) return Promise.reject(new Error('浏览器不支持网络同步'));
    var request;
    try {
      request = fetchFn(apiUrl(pathname), options || {});
    } catch (err) {
      return Promise.reject(err);
    }
    return withTimeout(request).then(function (response) {
      if (!response || typeof response.json !== 'function') {
        throw new Error('同步服务器响应格式无效');
      }
      return withTimeout(response.json()).then(function (data) {
        return { response: response, data: data };
      });
    });
  }

  function responseOK(result) {
    var status = result && result.response && result.response.status;
    if (typeof status === 'number') return status >= 200 && status < 300;
    return !!(result && result.response && result.response.ok);
  }

  function rawSession() {
    var Storage = CppLab.Storage;
    if (!Storage || typeof Storage.load !== 'function') return null;
    try {
      if (typeof window !== 'undefined' && window.localStorage && Storage.KEY) {
        var raw = window.localStorage.getItem(Storage.KEY);
        if (raw !== null) return raw;
      }
    } catch (ignore) { /* Storage.load 自带内存兜底 */ }
    try {
      return JSON.stringify(Storage.load());
    } catch (err) {
      markFailure(err);
      return null;
    }
  }

  function seqKey() {
    var input = baseUrl || 'same-origin';
    var hash = 0;
    var i;
    for (i = 0; i < input.length; i += 1) {
      hash = ((hash * 31) + input.charCodeAt(i)) >>> 0;
    }
    return SEQ_KEY_PREFIX + hash.toString(36);
  }

  function readLastSeq() {
    var key = seqKey();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var raw = window.localStorage.getItem(key);
        if (raw !== null && /^\d+$/.test(raw)) return Number(raw);
      }
    } catch (ignore) { /* 使用进程内兜底 */ }
    return memorySeq[key] || 0;
  }

  function writeLastSeq(value) {
    var key = seqKey();
    memorySeq[key] = value;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, String(value));
      }
    } catch (ignore) { /* 无 localStorage 时本次页面内仍保持幂等 */ }
  }

  function validPath(pathValue) {
    return pathValue === 'E' || pathValue === 'S' || pathValue === 'A';
  }

  function teacherNoteExists(notes, id) {
    var i;
    for (i = 0; i < notes.length; i += 1) {
      if (notes[i] && notes[i].id === id) return true;
    }
    return false;
  }

  /** 所有已知教师指令都通过 Storage.update 合并，绝不整包覆盖学生会话。 */
  function applyOp(op) {
    var Storage = CppLab.Storage;
    if (!Storage || typeof Storage.update !== 'function' || !op) return;
    var payload = isObject(op.payload) ? op.payload : {};

    Storage.update(function (session) {
      var i;
      if (op.type === 'setTier') {
        if (!validPath(payload.path)) return session;
        var from = validPath(payload.from) ? payload.from : (validPath(session.path) ? session.path : 'S');
        session.scaffoldHistory = Array.isArray(session.scaffoldHistory) ? session.scaffoldHistory : [];
        session.scaffoldHistory.push({
          at: payload.at || op.at || nowISO(),
          from: from,
          to: payload.path,
          by: 'teacher',
          reason: typeof payload.reason === 'string' ? payload.reason : ''
        });
        session.path = payload.path;
      } else if (op.type === 'unlockH5' || op.type === 'relockH5') {
        if (typeof payload.activityId !== 'string' || !payload.activityId) return session;
        session.teacherControls = isObject(session.teacherControls) ? session.teacherControls : { h5Unlocked: {} };
        session.teacherControls.h5Unlocked = isObject(session.teacherControls.h5Unlocked)
          ? session.teacherControls.h5Unlocked : {};
        session.teacherControls.h5Unlocked[payload.activityId] = op.type === 'unlockH5';
      } else if (op.type === 'teacherNote') {
        if (typeof payload.text !== 'string' || !payload.text) return session;
        session.teacherNotes = Array.isArray(session.teacherNotes) ? session.teacherNotes : [];
        var noteId = typeof payload.id === 'string' && payload.id ? payload.id : 'tn-op-' + op.seq;
        if (!teacherNoteExists(session.teacherNotes, noteId)) {
          session.teacherNotes.push({
            id: noteId,
            at: payload.at || op.at || nowISO(),
            lessonId: payload.lessonId || null,
            activityId: payload.activityId || null,
            text: payload.text
          });
        }
      } else if (op.type === 'evidenceRevise') {
        var evidenceId = payload.evidenceId || payload.evtId || payload.id;
        var patch = isObject(payload.patch) ? payload.patch : payload;
        var evidence = Array.isArray(session.evidence) ? session.evidence : [];
        var evt = null;
        for (i = 0; i < evidence.length; i += 1) {
          if (evidence[i] && evidence[i].id === evidenceId) { evt = evidence[i]; break; }
        }
        if (!evt) return session;
        if (!isObject(evt.overridden)) {
          evt.overridden = { original: {}, overriddenAt: null, overriddenBy: 'teacher' };
        }
        evt.overridden.original = isObject(evt.overridden.original) ? evt.overridden.original : {};
        var fields = ['outcome', 'teacherNote', 'confidence', 'transferResult', 'selfCorrection'];
        for (i = 0; i < fields.length; i += 1) {
          var field = fields[i];
          if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
          var value = patch[field];
          if (field === 'outcome') {
            if (typeof value === 'string' && /^[0-3]$/.test(value)) value = Number(value);
            if (value !== 'N' && value !== 0 && value !== 1 && value !== 2 && value !== 3) continue;
          }
          if (!Object.prototype.hasOwnProperty.call(evt.overridden.original, field)) {
            evt.overridden.original[field] = evt[field];
          }
          evt[field] = value;
        }
        evt.overridden.overriddenAt = payload.at || op.at || nowISO();
        evt.overridden.overriddenBy = 'teacher';
      } else if (op.type === 'markHintUsed') {
        if (typeof payload.activityId !== 'string' || !/^H[1-5]$/.test(payload.level || '')) return session;
        session.hintsUsed = isObject(session.hintsUsed) ? session.hintsUsed : {};
        session.hintsUsed[payload.activityId] = Array.isArray(session.hintsUsed[payload.activityId])
          ? session.hintsUsed[payload.activityId] : [];
        if (session.hintsUsed[payload.activityId].indexOf(payload.level) < 0) {
          session.hintsUsed[payload.activityId].push(payload.level);
        }
      } else if (op.type === 'resetActivity') {
        var lessons = isObject(session.lessons) ? session.lessons : {};
        var lesson = lessons[payload.lessonId];
        if (lesson && isObject(lesson.activityStates) && typeof payload.activityId === 'string') {
          delete lesson.activityStates[payload.activityId];
          lesson.completed = false;
        }
      } else if (op.type === 'confirmPath') {
        session.lessons = isObject(session.lessons) ? session.lessons : {};
        session.lessons.lesson2 = isObject(session.lessons.lesson2)
          ? session.lessons.lesson2
          : { completed: false, customRule: null, activityStates: {}, pathConfirmed: false };
        session.lessons.lesson2.pathConfirmed = true;
      } else if (op.type === 'saveReportDraft') {
        if (!isObject(payload.draft)) return session;
        session.reports = isObject(session.reports) ? session.reports : { draft: null, confirmed: null };
        session.reports.draft = clone(payload.draft);
      } else if (op.type === 'confirmReport') {
        if (!isObject(payload.report)) return session;
        session.reports = isObject(session.reports) ? session.reports : { draft: null, confirmed: null };
        session.reports.confirmed = clone(payload.report);
      } else if (op.type === 'resetSession') {
        if (typeof Storage.defaultSession === 'function') return Storage.defaultSession();
      }
      return session;
    });
  }

  function schedulePut(delay) {
    if (!running || role !== 'student' || pendingRaw === null || putBusy) return;
    if (putTimer !== null) clearTimeout(putTimer);
    putTimer = setTimeout(function () {
      putTimer = null;
      flushPut(generation);
    }, delay);
  }

  function queuePut(raw) {
    pendingRaw = raw;
    schedulePut(PUT_DEBOUNCE_MS);
  }

  function observeLocal() {
    if (!running || role !== 'student') return;
    var raw = rawSession();
    if (raw === null || raw === lastObservedRaw) return;
    lastObservedRaw = raw;
    queuePut(raw);
  }

  function putRaw(raw, version, token, retryConflict) {
    var session;
    try {
      session = JSON.parse(raw);
    } catch (err) {
      return Promise.reject(err);
    }
    return requestJSON('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: session, version: version })
    }).then(function (result) {
      if (!running || token !== generation) return null;
      var status = result.response && result.response.status;
      var data = result.data || {};
      if (status === 409 && retryConflict && isNonNegativeInt(data.version)) {
        markSuccess();
        stateVersion = data.version;
        return putRaw(raw, data.version, token, false);
      }
      if (!responseOK(result) || data.ok !== true || !isNonNegativeInt(data.version)) {
        throw new Error(data.error || '上传会话失败');
      }
      stateVersion = data.version;
      markSuccess();
      return data;
    });
  }

  function flushPut(token) {
    if (!running || role !== 'student' || token !== generation || putBusy || pendingRaw === null) return;
    var raw = pendingRaw;
    pendingRaw = null;
    putBusy = true;
    putRaw(raw, stateVersion, token, true).then(function () {
      if (token !== generation) return;
      putBusy = false;
      if (pendingRaw !== null) schedulePut(PUT_DEBOUNCE_MS);
    }, function (err) {
      if (token !== generation) return;
      putBusy = false;
      markFailure(err);
      if (pendingRaw === null) pendingRaw = raw;
      schedulePut(Math.max(PUT_DEBOUNCE_MS, pollMs));
    });
  }

  function pollOps(token) {
    if (!running || role !== 'student' || token !== generation || opsBusy) return;
    opsBusy = true;
    requestJSON('/api/ops?since=' + encodeURIComponent(String(lastAppliedSeq)), { method: 'GET' }).then(function (result) {
      if (!running || token !== generation) return;
      var data = result.data || {};
      if (!responseOK(result) || data.ok !== true || !Array.isArray(data.ops) || !isNonNegativeInt(data.lastSeq)) {
        throw new Error(data.error || '拉取教师指令失败');
      }
      markSuccess();
      if (data.lastSeq < lastAppliedSeq) {
        lastAppliedSeq = 0;
        writeLastSeq(0);
        return;
      }
      data.ops.slice().sort(function (a, b) { return Number(a.seq) - Number(b.seq); }).forEach(function (op) {
        if (!op || !isNonNegativeInt(op.seq) || op.seq <= lastAppliedSeq) return;
        applyOp(op);
        lastAppliedSeq = op.seq;
        writeLastSeq(lastAppliedSeq);
      });
      observeLocal();
    }).then(function () {
      if (token !== generation) return;
      opsBusy = false;
    }, function (err) {
      if (token !== generation) return;
      opsBusy = false;
      markFailure(err);
    });
  }

  function pollState(token) {
    if (!running || role !== 'teacher' || token !== generation || stateBusy) return;
    stateBusy = true;
    requestJSON('/api/state', { method: 'GET' }).then(function (result) {
      if (!running || token !== generation) return;
      var data = result.data || {};
      if (!responseOK(result) || data.ok !== true || !isNonNegativeInt(data.version)) {
        throw new Error(data.error || '拉取学生会话失败');
      }
      markSuccess();
      if (isObject(data.session) && data.version > teacherSeenVersion &&
          CppLab.Storage && typeof CppLab.Storage.save === 'function') {
        CppLab.Storage.save(data.session);
        teacherSeenVersion = data.version;
      } else if (data.version > teacherSeenVersion) {
        teacherSeenVersion = data.version;
      }
    }).then(function () {
      if (token !== generation) return;
      stateBusy = false;
    }, function (err) {
      if (token !== generation) return;
      stateBusy = false;
      markFailure(err);
    });
  }

  function stop() {
    generation += 1;
    running = false;
    if (pollTimer !== null) clearInterval(pollTimer);
    if (putTimer !== null) clearTimeout(putTimer);
    pollTimer = null;
    putTimer = null;
    pendingRaw = null;
    lastObservedRaw = null;
    putBusy = false;
    opsBusy = false;
    stateBusy = false;
    connected = false;
    role = null;
  }

  function start(options) {
    options = options || {};
    stop();
    role = options.role === 'teacher' ? 'teacher' : (options.role === 'student' ? 'student' : null);
    pollMs = typeof options.pollMs === 'number' && options.pollMs > 0 ? Math.floor(options.pollMs) : DEFAULT_POLL_MS;
    timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? Math.floor(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    baseUrl = normalizeBaseUrl(options.baseUrl !== undefined ? options.baseUrl : defaultBaseUrl());
    fetchFn = typeof options.fetchFn === 'function' ? options.fetchFn : defaultFetch();
    stateVersion = 0;
    teacherSeenVersion = -1;
    lastAppliedSeq = readLastSeq();
    lastSyncAt = null;
    lastError = null;

    if (!role) {
      lastError = 'Sync.start: role 必须是 student 或 teacher';
      return Sync.status();
    }
    if (!fetchFn) {
      lastError = '当前环境没有可用的 fetch';
      return Sync.status();
    }
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:' &&
        options.baseUrl === undefined && options.fetchFn === undefined) {
      return Sync.status();
    }

    running = true;
    generation += 1;
    var token = generation;
    if (role === 'student') {
      observeLocal();
      pollOps(token);
      pollTimer = setInterval(function () {
        observeLocal();
        pollOps(token);
      }, pollMs);
    } else {
      pollState(token);
      pollTimer = setInterval(function () { pollState(token); }, pollMs);
    }
    return Sync.status();
  }

  function pushOp(type, payload) {
    if (!running || role !== 'teacher' || typeof type !== 'string' || !type || !isObject(payload)) {
      return Promise.reject(new Error('教师同步未启动或指令格式无效'));
    }
    return requestJSON('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, payload: payload })
    }).then(function (result) {
      var data = result.data || {};
      if (!responseOK(result) || data.ok !== true || !isNonNegativeInt(data.seq)) {
        throw new Error(data.error || '发送教师指令失败');
      }
      markSuccess();
      return data;
    }).then(null, function (err) {
      markFailure(err);
      throw err;
    });
  }

  /**
   * 事件级触发：立即观察本地变化并跳过防抖直发 PUT。
   * 供「活动完成 / 证据落库 / 主题切换」等关键时刻调用——进度刚产生就推，
   * 不把回写押在 2s 轮询 + 1s 防抖的整堂课存活上（2026-08-15 首课实测：
   * 轮询通道停摆时进度全程没回写服务器，version 停 0）。
   * 例外：恰有 PUT 在途（putBusy）时不抢道，新变化入队后由在途请求
   * 落定时的重排发出（最多多等 1s 防抖，不丢数据）。
   * 轮询仍保留作兜底；非 student 或未启动时安全返回。
   */
  function poke() {
    if (!running || role !== 'student') return false;
    observeLocal();
    if (pendingRaw !== null && !putBusy) {
      if (putTimer !== null) {
        clearTimeout(putTimer);
        putTimer = null;
      }
      flushPut(generation);
    }
    return true;
  }

  var Sync = {
    start: start,
    pushOp: pushOp,
    poke: poke,
    status: function () {
      return {
        connected: connected,
        role: role,
        lastSyncAt: lastSyncAt,
        lastError: lastError
      };
    },
    stop: stop
  };

  CppLab.Sync = Sync;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sync;
  }
})();
