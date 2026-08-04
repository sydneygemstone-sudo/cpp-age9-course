/**
 * storage.js — 会话存取模块（CppLab.Storage）
 *
 * 契约依据：docs/CONTRACT.md §7
 * - key: cpplab_session_v1（浏览器用 localStorage；Node 环境用内存 shim）
 * - API: load() / save(session) / update(fn) / clear() / exportJSON()
 * - 所有写入必须走 update(fn) 防覆盖（save 仅供 update 内部与恢复场景使用）
 *
 * 隐私红线（CONTRACT §14.3）：只存昵称，不存真实姓名/学校/生日/音频。
 */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  var KEY = 'cpplab_session_v1';

  // Node / 无 localStorage 环境的内存 shim（进程内持久）
  var memoryStore = {};

  function hasLocalStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      // 某些浏览器隐私模式下 localStorage 存在但不可写，探测一次
      var probe = '__cpplab_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function rawGet() {
    if (hasLocalStorage()) return window.localStorage.getItem(KEY);
    return Object.prototype.hasOwnProperty.call(memoryStore, KEY) ? memoryStore[KEY] : null;
  }

  function rawSet(str) {
    if (hasLocalStorage()) {
      window.localStorage.setItem(KEY, str);
    } else {
      memoryStore[KEY] = str;
    }
  }

  function rawRemove() {
    if (hasLocalStorage()) {
      window.localStorage.removeItem(KEY);
    }
    delete memoryStore[KEY];
  }

  function genSessionId() {
    return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /** 新建一份符合 CONTRACT §7 结构的空白会话 */
  function defaultSession() {
    return {
      sessionId: genSessionId(),
      createdAt: new Date().toISOString(),
      nickname: '',
      theme: null,
      robotSkin: null,
      path: 'S',
      scaffoldHistory: [],
      lessons: {
        trial: { completed: false, activityStates: {}, interests: [], aiHabit: null },
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

  /** 防御性补全：旧数据/被外部改动的数据缺字段时按契约结构补齐，不覆盖已有值 */
  function ensureShape(session) {
    var base = defaultSession();
    if (!session || typeof session !== 'object') return base;

    function fill(target, tpl) {
      for (var k in tpl) {
        if (!Object.prototype.hasOwnProperty.call(tpl, k)) continue;
        if (target[k] === undefined || target[k] === null) {
          // null 有语义的叶子字段（如 finalEnergy）不强行覆盖
          if (target[k] === undefined) target[k] = tpl[k];
        } else if (typeof tpl[k] === 'object' && tpl[k] !== null && !Array.isArray(tpl[k]) &&
                   typeof target[k] === 'object' && target[k] !== null && !Array.isArray(target[k])) {
          fill(target[k], tpl[k]);
        }
      }
    }
    fill(session, base);
    return session;
  }

  var Storage = {
    /**
     * 读取当前会话；不存在或损坏时创建并持久化一份新会话。
     * 返回的是深拷贝语义（每次 parse），调用方修改后必须走 update/save 才会写回。
     */
    load: function () {
      var raw = rawGet();
      if (raw != null) {
        try {
          var parsed = JSON.parse(raw);
          return ensureShape(parsed);
        } catch (e) {
          // 数据损坏：不吞掉孩子进度以外的选择——损坏即重建（无法恢复的 JSON 无进度可保）
        }
      }
      var fresh = defaultSession();
      Storage.save(fresh);
      return fresh;
    },

    /** 整体写入。常规写入请走 update(fn)。 */
    save: function (session) {
      if (!session || typeof session !== 'object') {
        throw new Error('Storage.save: session 必须是对象');
      }
      rawSet(JSON.stringify(session));
      return session;
    },

    /**
     * 原子式更新：load → fn(session) → save。
     * fn 可以就地修改 session，也可以返回一个新 session 对象（返回值优先）。
     * 返回写入后的 session。
     */
    update: function (fn) {
      if (typeof fn !== 'function') {
        throw new Error('Storage.update: 参数必须是函数');
      }
      var session = Storage.load();
      var result = fn(session);
      var next = (result && typeof result === 'object') ? result : session;
      Storage.save(next);
      return next;
    },

    /** 删除会话（家长/教师端"删除数据"入口用） */
    clear: function () {
      rawRemove();
    },

    /** 导出 JSON 字符串（数据导出验收项） */
    exportJSON: function () {
      return JSON.stringify(Storage.load(), null, 2);
    },

    /** 暴露给测试/教师端重建用 */
    defaultSession: defaultSession,

    /** 存储 key（只读约定，教师端导入导出可引用） */
    KEY: KEY
  };

  CppLab.Storage = Storage;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  }
})();
