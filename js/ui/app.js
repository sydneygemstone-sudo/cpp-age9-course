/* =============================================================================
 * app.js — 儿童端应用（CppLab.App）  owner: ui-app
 * =============================================================================
 * 契约依据：docs/CONTRACT.md §2/§13/§14；docs/方案定稿.md §9.1/§7.2/§12.2/§11.1
 *
 * 职责：
 * - 首页 / 首次进入昵称+主题 / 课程运行页三栏布局 / 课末徽章页
 * - 通用活动渲染器（10 种 activityType，全部由内容数据驱动）
 * - 代码台四模式 blocks/focus/full/free（按支架开放）+「查看完整程序」透视
 * - Engine 事件驱动 Visualizer 与时间线；真实C++验证走 CppLab.Compiler
 * - 求提示走 CppLab.Hints.next；试听诊断闸门 setTrialGate
 * - 动画/声音开关（body.no-anim + settings 持久化）；刷新恢复（Storage）
 *
 * 红线（CONTRACT §14）：
 * - 儿童端绝不显示 D 维度、分数、支架档位（E/S/A）字样，只显示徽章和鼓励。
 * - real:false 的编译结果一律带「概念演示」标记，绝无假"验证成功"。
 * - 同屏 .btn-primary 高亮 <= 2（refreshButtons 统一收口）。
 * - 课程知识文案不硬编码（本文件只有界面框架文案与鼓励语模板）。
 * ========================================================================== */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  var App = { version: '1.0.0' };
  CppLab.App = App;

  // 本文件是纯 UI 模块：Node 下只挂命名空间占位，不触碰 DOM。
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) { module.exports = App; }
    return;
  }

  /* ======================================================================
   * 常量与小工具
   * ==================================================================== */

  // onboarding 主题卡文案单独手改（CONTRACT §13-3）：宠物/探险卡不再自称机器人
  var THEMES = [
    { id: 'robot', name: '机器人世界', icon: '🤖', skin: 'robo-blue', desc: '和蓝色圆滚滚机器人一起冒险' },
    { id: 'pet', name: '宠物乐园', icon: '🐶', skin: 'robo-dog', desc: '绿色小狗是你的乐园搭档' },
    { id: 'adventure', name: '探险王国', icon: '🧭', skin: 'robo-orange', desc: '背着小背包的橙色探险搭档陪你出发' }
  ];

  var LESSON_META = {
    trial: { fallbackTitle: '试听任务', icon: '🎈', desc: '第一次来？从这里出发！' },
    lesson1: { fallbackTitle: '第 1 课', icon: '⚡', desc: '机器人能量站' },
    lesson2: { fallbackTitle: '第 2 课', icon: '🚪', desc: '会思考的智能舱门' }
  };
  var LESSON_ORDER = ['trial', 'lesson1', 'lesson2'];

  var PRAISES = [
    '太棒了，你做到了！',
    '哇！机器人为你欢呼！',
    '漂亮！这一步走得真稳！',
    '真厉害，越来越像小工程师了！',
    '好样的！继续前进吧！'
  ];
  var ENCOURAGES = [
    '没关系，好想法都是试出来的！',
    '差一点点啦，再看一眼线索？',
    '换个角度想想，你可以的！',
    '慢慢来，机器人在等你哦。'
  ];

  // C++ 通用词汇悬停释义（CONTRACT §13：标识符英文 + title 中文释义）
  // 只放语言通用词，不放课程知识。
  var GLOSSARY = {
    'include': '把工具箱装进程序',
    'iostream': '输入输出工具箱',
    'std': '标准工具集',
    'cout': '向屏幕输出',
    'cin': '从键盘读入',
    'endl': '换一行',
    'main': '主程序入口',
    'int': '整数类型',
    'bool': '真假类型',
    'if': '如果',
    'else': '否则',
    'true': '真',
    'false': '假',
    'return': '把结果交回去',
    'energy': '能量'
  };

  /* ---------------------- 主题化（CONTRACT §13-3） ---------------------- *
   * 所有儿童可见的故事文案渲染 sink 过 T()（内容文件保持机器人正本）；
   * 故事图标过 TIcon()。robot 主题恒等；Theme 模块缺失时原样返回。 */
  function T(text, themeId) {
    if (text === null || text === undefined) return text;
    return (CppLab.Theme && typeof CppLab.Theme.t === 'function')
      ? CppLab.Theme.t(String(text), themeId) : String(text);
  }
  function TIcon(emoji) {
    if (!emoji) return emoji;
    return (CppLab.Theme && typeof CppLab.Theme.icon === 'function')
      ? CppLab.Theme.icon(String(emoji)) : String(emoji);
  }

  // pick 只用于表扬/鼓励语模板：随机取一条后按当前主题替换角色词
  function pick(arr) { return T(arr[Math.floor(Math.random() * arr.length)]); }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function valEq(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    var na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
      return na === nb;
    }
    return String(a).trim() === String(b).trim();
  }

  /**
   * 自动评分封顶 outcome=2（方案 5.1：3 级要求「能解释、迁移、自我检查或提出更优方法」，
   * 一次点对选择题不构成 3 级证据；3 级仅由教师在证据修订里基于解释/迁移表现手动升级）。
   */
  function outcomeFromAttempts(n) {
    if (n <= 1) return 2;
    return 1;
  }

  /* ---------------------------- DOM 助手 ---------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function btn(label, cls, onClick) {
    var b = el('button', cls || 'btn', label);
    if (!/(^|\s)btn(\s|$)/.test(b.className) && !/chip|toggle-btn|code-tab|theme-card|home-card|brand/.test(b.className)) {
      b.className = 'btn ' + b.className;
    }
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var t = el('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2600);
  }

  function openModal(titleText, buildBody) {
    var mask = el('div', 'modal-mask');
    var box = el('div', 'modal-box');
    var head = el('div', 'modal-head');
    head.appendChild(el('h3', null, titleText));
    var close = btn('关闭', 'btn btn-sm btn-ghost', function () { closeModal(); });
    head.appendChild(close);
    box.appendChild(head);
    var body = el('div');
    box.appendChild(body);
    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
    function closeModal() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    buildBody(body, closeModal);
    document.body.appendChild(mask);
    return closeModal;
  }

  /* ======================================================================
   * 全局状态
   * ==================================================================== */

  var S = {
    root: null,          // #app
    view: 'home',        // onboard | home | intro | lesson | end
    engine: null,
    lessonId: null,
    viz: null,
    ui: null,            // 当前活动的临时 UI 状态
    dom: {}              // 当前视图关键节点缓存
  };

  function Sto() { return CppLab.Storage; }
  function session() { return Sto().load(); }

  /* ======================================================================
   * 启动
   * ==================================================================== */

  function boot() {
    S.root = document.getElementById('app');
    if (!S.root) return;
    if (!CppLab.Storage) {
      clearNode(S.root);
      S.root.appendChild(el('div', 'view view-narrow card', '实验室零件没装齐（存储模块缺失），请找老师检查脚本加载。'));
      return;
    }
    if (CppLab.Sync && typeof CppLab.Sync.start === 'function' &&
        typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol)) {
      CppLab.Sync.start({ role: 'student', pollMs: 2000 });
    }
    var s = session();
    applyAnimSetting(s.settings && s.settings.anim !== false);
    applyTheme(s.theme);
    refreshTrialGateFromStorage();
    startTeacherControlSync();
    if (!s.nickname) {
      renderOnboarding();
    } else {
      renderHome();
    }
  }

  /**
   * 教师端控制同步：
   * 1. hints.js 的 H5 解锁是每页内存态，教师 tab 通过 session.teacherControls.h5Unlocked
   *    双写传递——孩子端监听 storage 事件 + 轮询兜底，同步调用 Hints.unlockH5/relockH5。
   * 2. 教师中途调档（方案 §4.2 / §12.2 F4-F6）：教师端写 session.path 后，孩子端引擎
   *    支架必须跟随——当前活动尚未开始时立即换变体，已开始则从下一个活动生效。
   */
  function syncScaffoldFromTeacher(s) {
    if (!S.engine || !s || ['E', 'S', 'A'].indexOf(s.path) < 0) return;
    if (S.engine.scaffold === s.path) return;
    // 教师端 applyScaffold 已写入 scaffoldHistory，这里只同步引擎内存档位，不重复留痕
    S.engine.scaffold = s.path;
    S.engine._streak = [];
    var ui = S.ui;
    var untouched = S.view === 'lesson' && ui && !ui.completed && !ui.predicted &&
      ui.emitted === 0 && ui.localCursor === 0 && ui.interactionAttempts === 0 &&
      !ui.runFinished && !ui.pendingCp && !ui.bugFoundLine &&
      S.engine.getActivityState().status === 'idle';
    if (untouched) renderActivity(); // 未开始的活动立即用新档变体重渲染
  }

  function startTeacherControlSync() {
    function syncOnce() {
      var s;
      try { s = session(); } catch (e) { return; }
      syncScaffoldFromTeacher(s);
      if (!CppLab.Hints || typeof CppLab.Hints.unlockH5 !== 'function') return;
      var map = (s && s.teacherControls && s.teacherControls.h5Unlocked) || {};
      var id;
      for (id in map) {
        if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
        var want = !!map[id];
        var now = !!CppLab.Hints.isH5Unlocked(id);
        if (want && !now) {
          CppLab.Hints.unlockH5(id);
          // 当前活动的提示面板即时反映解锁状态
          if (S.ui && S.ui.activity && S.ui.activity.id === id) renderHintPanel();
        } else if (!want && now) {
          CppLab.Hints.relockH5(id);
          if (S.ui && S.ui.activity && S.ui.activity.id === id) renderHintPanel();
        }
      }
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function () {
        syncOnce();
        refreshTrialGateFromStorage();
      });
    }
    setInterval(syncOnce, 4000);
    syncOnce();
  }

  function applyAnimSetting(on) {
    document.body.classList.toggle('no-anim', !on);
  }

  function applyTheme(themeId) {
    if (themeId) document.body.setAttribute('data-theme', themeId);
    else document.body.removeAttribute('data-theme');
    if (CppLab.Theme && typeof CppLab.Theme.setTheme === 'function') {
      CppLab.Theme.setTheme(themeId || 'robot');
    }
    // 浏览器标签标题跟随主题（主题未选时保持 index.html 的中性标题）
    if (themeId) document.title = T('机器人能量站 · C++ 小探险', themeId);
  }

  /** 试听闸门：核心诊断活动全部完成才对儿童开放提示阶梯（红线 §14.7）。 */
  function refreshTrialGateFromStorage() {
    if (!CppLab.Hints || typeof CppLab.Hints.setTrialGate !== 'function') return;
    var pack = (CppLab.content || {}).trial;
    if (!pack) { CppLab.Hints.setTrialGate(false); return; }
    var acts = Array.isArray(pack) ? pack : (pack.activities || []);
    if (!acts.length) { CppLab.Hints.setTrialGate(false); return; }
    var core = acts.filter(function (a) { return a && a.coreDiagnostic === true; });
    if (!core.length) core = acts;
    var states = ((session().lessons || {}).trial || {}).activityStates || {};
    var done = core.every(function (a) {
      return states[a.id] && states[a.id].status === 'done';
    });
    CppLab.Hints.setTrialGate(done);
  }

  /* ======================================================================
   * 顶栏
   * ==================================================================== */

  function buildTopbar(opts) {
    opts = opts || {};
    var bar = el('div', 'topbar');

    var brand = el('button', 'brand');
    brand.type = 'button';
    var dot = el('span', 'brand-dot', '⚡');
    brand.appendChild(dot);
    brand.appendChild(el('span', null, opts.title || 'C++ 小探险'));
    brand.addEventListener('click', function () {
      if (S.view === 'lesson' || S.view === 'intro') {
        stopRunTimer();
        renderHome();
      } else {
        renderHome();
      }
    });
    brand.title = '回到首页（进度会自动保存）';
    bar.appendChild(brand);

    if (opts.dots) bar.appendChild(opts.dots);

    var actions = el('div', 'top-actions');
    var s = session();
    var animOn = !(s.settings && s.settings.anim === false);
    var soundOn = !!(s.settings && s.settings.sound);

    // ⛶ 全屏（§13-2）：requestFullscreen + webkit 回退；都不支持时提示添加到主屏幕
    var fsBtn = el('button', 'toggle-btn', '⛶ 全屏');
    fsBtn.type = 'button';
    fsBtn.title = '切换全屏（iPad 也可以用 Safari 分享→添加到主屏幕）';
    function fsIsOn() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    function fsUpdate() {
      if (!document.body.contains(fsBtn)) {
        document.removeEventListener('fullscreenchange', fsUpdate);
        document.removeEventListener('webkitfullscreenchange', fsUpdate);
        return;
      }
      fsBtn.textContent = fsIsOn() ? '⛶ 退出全屏' : '⛶ 全屏';
    }
    fsBtn.addEventListener('click', function () {
      var rootEl = document.documentElement;
      try {
        if (fsIsOn()) {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else if (rootEl.requestFullscreen) {
          var p = rootEl.requestFullscreen();
          if (p && typeof p.catch === 'function') {
            p.catch(function () { toast('这台设备不让网页全屏：用 Safari 分享→添加到主屏幕，可获得全屏体验'); });
          }
        } else if (rootEl.webkitRequestFullscreen) {
          rootEl.webkitRequestFullscreen();
        } else {
          toast('用 Safari 分享→添加到主屏幕，可获得全屏体验');
        }
      } catch (e) {
        toast('用 Safari 分享→添加到主屏幕，可获得全屏体验');
      }
    });
    document.addEventListener('fullscreenchange', fsUpdate);
    document.addEventListener('webkitfullscreenchange', fsUpdate);
    actions.appendChild(fsBtn);

    var animBtn = el('button', 'toggle-btn' + (animOn ? ' on' : ''), '✨ 动画：' + (animOn ? '开' : '关'));
    animBtn.type = 'button';
    animBtn.addEventListener('click', function () {
      var now = !(session().settings && session().settings.anim !== false);
      Sto().update(function (ss) { ss.settings = ss.settings || {}; ss.settings.anim = now; });
      applyAnimSetting(now);
      animBtn.classList.toggle('on', now);
      animBtn.textContent = '✨ 动画：' + (now ? '开' : '关');
    });
    actions.appendChild(animBtn);

    var soundBtn = el('button', 'toggle-btn' + (soundOn ? ' on' : ''), '🔔 声音：' + (soundOn ? '开' : '关'));
    soundBtn.type = 'button';
    soundBtn.title = '这一期先记住你的选择，声音正在准备中';
    soundBtn.addEventListener('click', function () {
      var now = !(session().settings && session().settings.sound);
      Sto().update(function (ss) { ss.settings = ss.settings || {}; ss.settings.sound = now; });
      soundBtn.classList.toggle('on', now);
      soundBtn.textContent = '🔔 声音：' + (now ? '开' : '关');
    });
    actions.appendChild(soundBtn);

    bar.appendChild(actions);
    return bar;
  }

  /* ======================================================================
   * 首次进入：昵称 + 主题皮肤
   * ==================================================================== */

  function renderOnboarding() {
    S.view = 'onboard';
    clearNode(S.root);
    S.root.appendChild(buildTopbar({ title: 'C++ 小探险' }));

    var view = el('div', 'view view-narrow');
    var card = el('div', 'card onboard-card');
    // 主题选择前用中性吉祥物，选中主题后立即预览该主题的代表形象（§13-3）
    var mascot = el('div', 'mascot', '✨');
    card.appendChild(mascot);
    card.appendChild(el('h1', null, '欢迎来到 C++ 小探险！'));
    card.appendChild(el('p', 'form-hint', '在出发之前，先认识一下吧。不用写真名哦，起一个好玩的昵称就行！'));

    card.appendChild(el('label', 'field-label', '我的昵称'));
    var input = el('input', 'text-input');
    input.type = 'text';
    input.maxLength = 12;
    input.placeholder = '比如：闪电小队长';
    card.appendChild(input);

    card.appendChild(el('label', 'field-label', '挑一个你最喜欢的世界'));
    var grid = el('div', 'theme-grid');
    var selectedTheme = null;
    THEMES.forEach(function (t) {
      var tc = el('button', 'theme-card');
      tc.type = 'button';
      tc.appendChild(el('span', 'theme-icon', t.icon));
      tc.appendChild(el('div', null, t.name));
      tc.appendChild(el('div', 'form-hint', t.desc));
      tc.addEventListener('click', function () {
        selectedTheme = t;
        var all = grid.querySelectorAll('.theme-card');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
        tc.classList.add('selected');
        mascot.textContent = t.icon;
        err.textContent = '';
      });
      grid.appendChild(tc);
    });
    card.appendChild(grid);

    var err = el('div', 'form-err', '');
    card.appendChild(err);

    var go = btn('出发！', 'btn btn-primary', function () {
      var nick = (input.value || '').trim();
      if (!nick) { err.textContent = '先给自己起个昵称吧！'; input.focus(); return; }
      if (!selectedTheme) { err.textContent = '再挑一个你喜欢的世界！'; return; }
      Sto().update(function (ss) {
        ss.nickname = nick;
        ss.theme = selectedTheme.id;
        ss.robotSkin = selectedTheme.skin;
      });
      applyTheme(selectedTheme.id);
      renderHome();
    });
    go.style.marginTop = '18px';
    go.style.minWidth = '220px';
    card.appendChild(go);

    view.appendChild(card);
    S.root.appendChild(view);
    input.focus();
  }

  /* ======================================================================
   * 首页
   * ==================================================================== */

  function packOf(lessonId) {
    var pack = (CppLab.content || {})[lessonId];
    return pack || null;
  }

  function packTitle(lessonId) {
    var pack = packOf(lessonId);
    if (pack && !Array.isArray(pack) && pack.title) return pack.title;
    return LESSON_META[lessonId].fallbackTitle;
  }

  function lessonProgress(lessonId) {
    var s = session();
    var L = (s.lessons || {})[lessonId] || {};
    var states = L.activityStates || {};
    var doneCount = 0;
    for (var k in states) {
      if (states[k] && states[k].status === 'done') doneCount++;
    }
    return { completed: !!L.completed, doneCount: doneCount };
  }

  function findResumeLesson() {
    var s = session();
    var candidates = [];
    if (s.lastVisited && LESSON_ORDER.indexOf(s.lastVisited) >= 0) candidates.push(s.lastVisited);
    LESSON_ORDER.forEach(function (id) { if (candidates.indexOf(id) < 0) candidates.push(id); });
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      var p = lessonProgress(id);
      if (!p.completed && p.doneCount > 0 && packOf(id)) return id;
    }
    return null;
  }

  function renderHome() {
    S.view = 'home';
    S.engine = null;
    S.ui = null;
    destroyViz();
    clearNode(S.root);
    S.root.appendChild(buildTopbar({ title: 'C++ 小探险' }));

    var s = session();
    var view = el('div', 'view');

    var hello = el('div', 'home-hello');
    hello.appendChild(el('span', 'hello-icon', '👋'));
    var hbox = el('div');
    hbox.appendChild(el('h1', null, '你好，' + s.nickname + '！'));
    hbox.appendChild(el('p', 'form-hint', '今天想去哪儿探险？'));
    hello.appendChild(hbox);
    view.appendChild(hello);

    var grid = el('div', 'home-grid');

    // 继续我的任务（有会话进度时）
    var resumeId = findResumeLesson();
    if (resumeId) {
      grid.appendChild(homeCard({
        icon: '🚀',
        title: '继续我的任务',
        desc: '上次玩到「' + T(packTitle(resumeId)) + '」，接着来！',
        cls: 'hc-continue',
        onClick: function () { startLesson(resumeId); }
      }));
    }

    LESSON_ORDER.forEach(function (id) {
      var meta = LESSON_META[id];
      var pack = packOf(id);
      var prog = lessonProgress(id);
      var desc = T(meta.desc);
      if (!pack) desc = '内容正在准备中，敬请期待！';
      else if (prog.completed) desc = '已经完成啦，可以再玩一遍！';
      grid.appendChild(homeCard({
        icon: prog.completed ? '🏅' : meta.icon,
        title: (id === 'trial' ? '进入试听任务' : T(packTitle(id))),
        desc: desc,
        disabled: !pack,
        onClick: function () { startLesson(id); }
      }));
    });

    view.appendChild(grid);

    // 我的作品卡
    view.appendChild(el('h2', 'section-title', '🎨 我的作品卡'));
    var artRow = el('div', 'artifact-row');
    var cards = collectArtifactCards(s);
    if (cards.length) {
      cards.forEach(function (c) { artRow.appendChild(buildArtifactCard(c)); });
    } else {
      artRow.appendChild(el('div', 'artifact-empty', '还没有作品卡。完成课程里的创作任务，就能收获属于你的作品卡啦！'));
    }
    view.appendChild(artRow);

    // 教师入口（右下角小字）
    var tRow = el('div', 'teacher-link-row');
    var tLink = el('a', 'teacher-link', '教师入口');
    tLink.href = 'teacher.html';
    tRow.appendChild(tLink);
    view.appendChild(tRow);

    S.root.appendChild(view);
  }

  function homeCard(opts) {
    var c = el('button', 'home-card' + (opts.cls ? ' ' + opts.cls : ''));
    c.type = 'button';
    c.appendChild(el('span', 'hc-icon', opts.icon));
    c.appendChild(el('span', 'hc-title', opts.title));
    c.appendChild(el('span', 'hc-desc', opts.desc));
    if (opts.disabled) c.disabled = true;
    else c.addEventListener('click', opts.onClick);
    return c;
  }

  function collectArtifactCards(s) {
    var out = [];
    var lessons = s.lessons || {};
    LESSON_ORDER.forEach(function (id) {
      var L = lessons[id];
      if (L && L.artifactCard) out.push(L.artifactCard);
    });
    return out;
  }

  /** 皮肤名跨主题统一（§13-3 保护规则②）：不再使用「××机器人」写法 */
  function skinDisplayName(skin) {
    if (CppLab.Theme && typeof CppLab.Theme.skinName === 'function') {
      return CppLab.Theme.skinName(skin);
    }
    if (skin === 'robo-blue') return '蓝色圆滚滚';
    if (skin === 'robo-orange') return '橙色方块侠';
    if (skin === 'robo-dog') return '绿色电力狗';
    return '我的伙伴';
  }

  function buildArtifactCard(cardData) {
    var c = el('div', 'artifact-card');
    c.appendChild(el('div', 'ac-title', '🏆 ' + (cardData.title || '我的作品')));
    if (cardData.skin) c.appendChild(el('div', 'ac-line', '伙伴：' + skinDisplayName(cardData.skin)));
    if (cardData.initialEnergy !== undefined && cardData.initialEnergy !== null) {
      c.appendChild(el('div', 'ac-line', '出发能量：' + cardData.initialEnergy + ' 格'));
    }
    if (Array.isArray(cardData.events) && cardData.events.length) {
      // 作品卡存的是正本事件文案，展示时按当前主题换词
      c.appendChild(el('div', 'ac-line', '故事事件：' + cardData.events.map(function (ev) { return T(ev); }).join('、')));
    }
    if (typeof cardData.finalEnergy === 'number') {
      c.appendChild(el('div', 'ac-line', '最终能量：' + cardData.finalEnergy + ' 格'));
    }
    if (cardData.explanation) {
      c.appendChild(el('div', 'ac-line', '我的解释：「' + cardData.explanation + '」'));
    }
    if (cardData.verified === true) {
      c.appendChild(el('div', 'ac-line', '✅ 已通过真实 C++ 验证'));
    }
    if (cardData.savedAt) {
      c.appendChild(el('div', 'ac-line', '收藏于 ' + String(cardData.savedAt).slice(0, 10)));
    }
    return c;
  }

  /* ======================================================================
   * 课程装载
   * ==================================================================== */

  function startLesson(lessonId) {
    if (!packOf(lessonId)) { toast('这部分内容还在准备中'); return; }
    if (!CppLab.Engine || typeof CppLab.Engine.createSession !== 'function') {
      toast('课程引擎没有加载好，请找老师看看'); return;
    }
    var engine;
    try {
      engine = CppLab.Engine.createSession({ lessonId: lessonId });
    } catch (e) {
      toast('打开课程时出了点小问题：' + (e && e.message ? e.message : '未知错误'));
      return;
    }
    if (!engine.getActivities().length) { toast('这节课还没有活动内容'); return; }

    S.engine = engine;
    S.lessonId = lessonId;

    Sto().update(function (ss) { ss.lastVisited = lessonId; });
    if (lessonId === 'trial') refreshTrialGateFromStorage();

    // 引擎事件接线（每个 session 只挂一次）
    engine.on('trace-step', function (entry) { onTraceEntry(entry); });
    // scaffold-suggest 是教师侧信息，儿童端不显示（红线 §14.2），此处不监听。

    // 刷新恢复：跳到第一个未完成的活动
    var states = ((session().lessons || {})[lessonId] || {}).activityStates || {};
    var acts = engine.getActivities();
    var idx = 0;
    for (var i = 0; i < acts.length; i++) {
      if (!(states[acts[i].id] && states[acts[i].id].status === 'done')) { idx = i; break; }
      if (i === acts.length - 1) idx = i; // 全部完成：停在最后一个（可重玩）
    }
    engine.currentIndex = idx;
    engine.reset();

    var intro = engine.getLessonIntro();
    if (intro && idx === 0) {
      renderLessonIntro(intro);
    } else {
      renderLesson();
    }
  }

  function renderLessonIntro(introText) {
    S.view = 'intro';
    clearNode(S.root);
    S.root.appendChild(buildTopbar({ title: T(packTitle(S.lessonId)) }));
    var view = el('div', 'view view-narrow');
    var card = el('div', 'card lesson-intro-card');
    card.appendChild(el('div', 'li-icon', LESSON_META[S.lessonId] ? LESSON_META[S.lessonId].icon : '🎒'));
    card.appendChild(el('h1', null, T(packTitle(S.lessonId))));
    introText.split('\n').forEach(function (line) {
      if (line.trim()) card.appendChild(el('p', null, T(line)));
    });
    card.appendChild(btn('开始探险！', 'btn btn-primary', function () { renderLesson(); }));
    view.appendChild(card);
    S.root.appendChild(view);
  }

  /* ======================================================================
   * 课程运行页（三栏）
   * ==================================================================== */

  function buildProgressDots() {
    var engine = S.engine;
    var dots = el('div', 'progress-dots');
    var states = ((session().lessons || {})[S.lessonId] || {}).activityStates || {};
    engine.getActivities().forEach(function (a, i) {
      var d = el('span', 'dot');
      if (states[a.id] && states[a.id].status === 'done') d.classList.add('done');
      if (i === engine.currentIndex) d.classList.add('current');
      d.title = '任务 ' + (i + 1);
      dots.appendChild(d);
    });
    return dots;
  }

  function renderLesson() {
    S.view = 'lesson';
    stopRunTimer();
    clearNode(S.root);
    S.root.appendChild(buildTopbar({ title: T(packTitle(S.lessonId)), dots: buildProgressDots() }));

    var view = el('div', 'view');
    var grid = el('div', 'lesson-grid');

    // ---- 左栏：任务场景 ----
    var left = el('div');
    var scenePanel = el('div', 'panel');
    scenePanel.appendChild(el('div', 'panel-title', '🗺 任务场景'));
    var goal = el('div', 'scene-goal');
    goal.id = 'scene-goal';
    scenePanel.appendChild(goal);
    var vizHost = el('div');
    vizHost.id = 'viz-host';
    scenePanel.appendChild(vizHost);
    left.appendChild(scenePanel);
    grid.appendChild(left);

    // ---- 中栏：代码台 + 活动 ----
    var center = el('div');
    center.id = 'center-col';
    grid.appendChild(center);

    // ---- 右栏：状态透镜（<1200px 折叠成右下角「📊 状态」抽屉，§13-2） ----
    var right = el('div', 'state-lens');

    var lensClose = btn('✕ 收起', 'btn btn-sm lens-close', function () { closeLens(); });
    right.appendChild(lensClose);

    var varsPanel = el('div', 'panel');
    varsPanel.appendChild(el('div', 'panel-title', '📦 变量卡'));
    var varsGrid = el('div', 'vars-grid');
    varsGrid.appendChild(el('div', 'vars-empty', '跑起来才有变量'));
    varsPanel.appendChild(varsGrid);
    right.appendChild(varsPanel);

    var tlPanel = el('div', 'panel');
    tlPanel.appendChild(el('div', 'panel-title', '🕒 执行时间线'));
    var tl = el('ol', 'timeline');
    var tlEmpty = el('div', 'tl-empty', '还没走第一步');
    tlPanel.appendChild(tlEmpty);
    tlPanel.appendChild(tl);
    right.appendChild(tlPanel);

    var outPanel = el('div', 'panel');
    outPanel.appendChild(el('div', 'panel-title', T('🖥 机器人说（输出）')));
    var outBox = el('div', 'output-box');
    outBox.appendChild(el('span', 'output-empty', '还没有输出'));
    outPanel.appendChild(outBox);
    right.appendChild(outPanel);

    // 提示面板：默认折叠成小按钮，有内容才展开（§13-2）
    var hintPanel = el('div', 'panel hint-panel');
    var hintToggle = el('button', 'hint-toggle', '💡 我的提示');
    hintToggle.type = 'button';
    hintToggle.title = '看看我领到的提示';
    hintToggle.addEventListener('click', function () {
      if (!S.ui) return;
      S.ui.hintExpanded = !S.ui.hintExpanded;
      renderHintPanel();
    });
    hintPanel.appendChild(hintToggle);
    var hintList = el('div', 'hint-list');
    hintPanel.appendChild(hintList);
    right.appendChild(hintPanel);

    grid.appendChild(right);
    view.appendChild(grid);

    // ---- 状态抽屉呼出按钮 + 遮罩（仅 <1200px 由 CSS 显示） ----
    var lensMask = el('div', 'lens-mask');
    lensMask.addEventListener('click', function () { closeLens(); });
    view.appendChild(lensMask);
    var lensFab = btn('📊 状态', 'btn lens-fab', function () {
      right.classList.add('open');
      lensMask.classList.add('show');
    });
    view.appendChild(lensFab);

    // ---- 底部按钮条（按活动动态渲染，见 renderButtonBar） ----
    var barWrap = el('div', 'btnbar-wrap');
    var bar = el('div', 'btnbar');
    bar.id = 'btnbar';
    barWrap.appendChild(bar);
    view.appendChild(barWrap);

    S.root.appendChild(view);

    // 状态 FAB 按按钮条实际高度定位（codex-UI P1-5）：把高度写进 CSS 变量 --btnbar-h
    observeBtnbarHeight(barWrap);

    S.dom = {
      center: center, goal: goal, vizHost: vizHost,
      grid: grid, rightCol: right,
      varsPanel: varsPanel, tlPanel: tlPanel, outPanel: outPanel,
      hintPanel: hintPanel, hintToggle: hintToggle,
      lensFab: lensFab, lensMask: lensMask,
      varsGrid: varsGrid, timeline: tl, tlEmpty: tlEmpty, outBox: outBox,
      hintList: hintList,
      btnbar: bar,
      bPredict: null, bStep: null, bRun: null,
      bReset: null, bVerify: null, bHint: null
    };

    renderActivity();
  }

  function closeLens() {
    var d = S.dom;
    if (d.rightCol) d.rightCol.classList.remove('open');
    if (d.lensMask) d.lensMask.classList.remove('show');
  }

  /**
   * 按钮条高度 → CSS 变量 --btnbar-h（codex-UI P1-5）：
   * .lens-fab 的 bottom 用 calc(var(--btnbar-h) + 12px) 定位，按钮换行/字号变化时
   * ResizeObserver 实时跟随；不支持 ResizeObserver 的环境退回一次性测量 + CSS 默认值。
   */
  var btnbarRO = null;
  function observeBtnbarHeight(barWrap) {
    if (btnbarRO) {
      try { btnbarRO.disconnect(); } catch (e) { /* 忽略 */ }
      btnbarRO = null;
    }
    function apply() {
      if (!document.body.contains(barWrap)) return;
      var hgt = barWrap.offsetHeight || 0;
      if (hgt > 0) document.documentElement.style.setProperty('--btnbar-h', hgt + 'px');
    }
    if (typeof ResizeObserver === 'function') {
      btnbarRO = new ResizeObserver(apply);
      btnbarRO.observe(barWrap);
    }
    apply();
  }

  /* ======================================================================
   * 活动装载与状态
   * ==================================================================== */

  function currentActivity() { return S.engine ? S.engine.getCurrentActivity() : null; }

  function renderActivity() {
    stopRunTimer();
    var engine = S.engine;
    var activity = currentActivity();
    if (!activity) { renderLessonEnd(); return; }
    var variant = engine.getVariant(activity);

    var states = ((session().lessons || {})[S.lessonId] || {}).activityStates || {};
    var alreadyDone = !!(states[activity.id] && states[activity.id].status === 'done');

    // 每个活动的 UI 运行态
    S.ui = {
      activity: activity,
      variant: variant,
      // 变体可用 activityTypeOverride 覆盖活动级类型（如 trial-08 三档交互差异化）
      type: (variant && variant.activityTypeOverride) || activity.activityType,
      completed: alreadyDone,          // 已完成的活动允许重玩但不再计证据
      predicted: false,
      predictedCorrect: null,
      predictionAttempts: 0,
      runFinished: false,
      lastRunError: null,
      emitted: 0,
      useLocal: false,
      workProgram: null,               // slots 修改后的程序副本
      localExec: null,
      localCursor: 0,
      pendingCp: null,
      cpResults: [],
      interactionAttempts: 0,
      verifyAttempts: 0,
      followUpDone: false,
      bugFixed: false,
      bugFoundLine: null,
      codeMode: null,
      currentLine: null
    };

    var program = variant && Array.isArray(variant.program) ? variant.program : null;
    if (S.ui.type === 'slots' && program) {
      S.ui.workProgram = deepClone(program);
      S.ui.useLocal = true;
    }
    // ordering+program（如 lesson1-02）：卡片顺序驱动程序执行，
    // 交换顺序后能重跑、看中间状态（方案 7.4 观察点「交换顺序后看结果」）
    if (S.ui.type === 'ordering' && program && orderingProgramMappable(variant)) {
      S.ui.workProgram = deepClone(program);
      S.ui.useLocal = true;
    }

    // 支架决定的代码模式（不向孩子展示档位字样，红线 §14.2）
    var modes = allowedCodeModes();
    S.ui.codeMode = (modes.indexOf('focus') >= 0 && S.engine.scaffold !== 'E') ? 'focus' : modes[0];
    if (S.ui.type === 'freeEdit') S.ui.codeMode = 'free';

    // 左栏：目标 + Visualizer（儿童可见任务文案过主题词典）
    S.dom.goal.textContent = T(activity.childPrompt || activity.title || '');
    mountViz(activity, variant);

    // 中栏
    renderCenter();

    // 底部按钮条：按活动能力动态渲染（§13-2：用不上的按钮不出现）
    renderButtonBar();

    // 右栏：清空运行面板 + 按活动显隐状态透镜
    clearRunPanels();
    updateLensPanels();

    refreshButtons();
    refreshDots();
  }

  /** 本活动是否有可运行的 IR 程序（freeEdit 走真实编译，不算） */
  function activityHasProgram() {
    var ui = S.ui;
    if (!ui || ui.type === 'freeEdit') return false;
    var program = activeProgram();
    return !!(program && program.length);
  }

  /** 本活动是否可以真实 C++ 验证（与 refreshButtons 的 canVerify 同口径） */
  function activityCanVerify() {
    var ui = S.ui;
    if (!ui) return false;
    return !!(
      (ui.type === 'freeEdit') ||
      (ui.codeMode === 'free') ||
      (activityHasProgram() && ui.activity.compilerCheck && ui.activity.compilerCheck.enabled)
    );
  }

  /**
   * 儿童端是否有可用的提示入口（§13-2）：
   * - 活动没配儿童可见的提示阶梯（或只有 teacherOnly 的 H5）→ 无入口；
   * - 试听诊断闸门关闭时，提示由教师在教师端代读，儿童端没有入口。
   * 没有入口时「求提示」按钮整个不渲染（而不是置灰）。
   */
  function hintEntryAvailable() {
    var ui = S.ui;
    if (!ui || !CppLab.Hints || typeof CppLab.Hints.next !== 'function') return false;
    var ladder = (ui.activity && ui.activity.hintLadder) || [];
    var childLevels = ladder.filter(function (h) { return h && !h.teacherOnly; });
    if (!childLevels.length) return false;
    if (S.lessonId === 'trial' &&
        typeof CppLab.Hints.getTrialGate === 'function' && !CppLab.Hints.getTrialGate()) {
      return false;
    }
    return true;
  }

  /**
   * 底部按钮条动态渲染（§13-2）：
   * - 无 prediction → 不渲染「先预测」；无 program → 不渲染「单步/运行」；
   * - 不可验证 → 不渲染「真实C++验证」；无提示入口 → 不渲染「求提示」；
   * - 「重置」始终保留。
   */
  function renderButtonBar() {
    var d = S.dom;
    var ui = S.ui;
    if (!d.btnbar || !ui) return;
    clearNode(d.btnbar);
    d.bPredict = d.bStep = d.bRun = d.bReset = d.bVerify = d.bHint = null;

    if (effPrediction()) {
      d.bPredict = btn('🤔 先预测', 'btn', function () { focusPredict(); });
      d.btnbar.appendChild(d.bPredict);
    }
    if (activityHasProgram()) {
      d.bStep = btn('👣 单步', 'btn', function () { doStep(); });
      d.bRun = btn('▶ 运行', 'btn', function () { doRun(); });
      d.btnbar.appendChild(d.bStep);
      d.btnbar.appendChild(d.bRun);
    }
    d.bReset = btn('🔄 重置', 'btn', function () { doReset(); });
    d.btnbar.appendChild(d.bReset);
    if (activityCanVerify()) {
      d.bVerify = btn(ui.verifyBusy ? '⏳ 验证中…' : '🧪 真实C++验证', 'btn', function () { doVerify(); });
      d.btnbar.appendChild(d.bVerify);
    }
    if (hintEntryAvailable()) {
      d.bHint = btn('💡 求提示', 'btn', function () { doHint(); });
      d.btnbar.appendChild(d.bHint);
    }
  }

  /**
   * 右栏状态透镜显隐（§13-2）：无 program 的活动隐藏变量卡/时间线/输出；
   * 右栏全空时整栏收起（三栏布局重排为两栏），抽屉呼出按钮同步隐藏。
   */
  function updateLensPanels() {
    var d = S.dom;
    if (!d.varsPanel) return;
    var showRun = activityHasProgram();
    d.varsPanel.style.display = showRun ? '' : 'none';
    d.tlPanel.style.display = showRun ? '' : 'none';
    d.outPanel.style.display = showRun ? '' : 'none';
    renderHintPanel(); // 自行决定提示面板显隐/折叠，并在末尾刷新整栏收起状态
  }

  /** 右栏是否还有可见面板：全空时整栏收起、抽屉按钮隐藏（renderHintPanel 末尾调用）。 */
  function refreshLensChrome() {
    var d = S.dom;
    if (!d.rightCol) return;
    var lensHasContent =
      (d.varsPanel && d.varsPanel.style.display !== 'none') ||
      (d.hintPanel && d.hintPanel.style.display !== 'none');
    if (d.grid) d.grid.classList.toggle('no-lens', !lensHasContent);
    if (d.lensFab) d.lensFab.style.display = lensHasContent ? '' : 'none';
    if (!lensHasContent) closeLens();
  }

  function refreshDots() {
    var top = document.querySelector('.topbar');
    if (!top) return;
    var old = top.querySelector('.progress-dots');
    if (old) top.replaceChild(buildProgressDots(), old);
  }

  function allowedCodeModes() {
    var lv = S.engine ? S.engine.scaffold : 'S';
    if (lv === 'E') return ['blocks', 'focus'];
    if (lv === 'A') return ['blocks', 'focus', 'full', 'free'];
    return ['blocks', 'focus', 'full'];
  }

  function activeProgram() {
    var ui = S.ui;
    if (!ui) return null;
    if (ui.workProgram) return ui.workProgram;
    return (ui.variant && Array.isArray(ui.variant.program)) ? ui.variant.program : null;
  }

  /** 有效预测配置：变体 prediction 优先；predict 类型退回 interaction 本体。 */
  function effPrediction() {
    var ui = S.ui;
    if (!ui || !ui.variant) return null;
    if (ui.variant.prediction) return ui.variant.prediction;
    if (ui.type === 'predict' && ui.variant.interaction && ui.variant.interaction.question) {
      return ui.variant.interaction;
    }
    return null;
  }

  /* ======================================================================
   * Visualizer 接线
   * ==================================================================== */

  function destroyViz() {
    if (S.viz && typeof S.viz.destroy === 'function') {
      try { S.viz.destroy(); } catch (e) { /* 可视化销毁失败不阻断流程 */ }
    }
    S.viz = null;
  }

  function findInitialEnergy(program) {
    if (!Array.isArray(program)) return 0;
    for (var i = 0; i < program.length; i++) {
      var st = program[i];
      if (st && st.op === 'declare' && st.name === 'energy' &&
          st.expr && st.expr.kind === 'lit' && typeof st.expr.value === 'number') {
        return st.expr.value;
      }
    }
    return 0;
  }

  function mountViz(activity, variant) {
    destroyViz();
    clearNode(S.dom.vizHost);
    if (!CppLab.Visualizer || typeof CppLab.Visualizer.mount !== 'function') {
      S.dom.vizHost.appendChild(el('div', 'form-hint', '（画面模块还没加载好）'));
      return;
    }
    var model = activity.visualModel || 'none';
    var s = session();
    // 无 program 的活动（含 freeEdit 控制台模式）：场景里的变量盒/输出屏没有数据来源，
    // 传 noProgram 让 Visualizer 不渲染这两块（建造遗留9）。
    var hasProg = !!(variant && Array.isArray(variant.program) && variant.program.length) &&
      S.ui.type !== 'freeEdit';
    try {
      S.viz = CppLab.Visualizer.mount(S.dom.vizHost, model, {
        skin: s.robotSkin || 'robo-blue',
        energy: findInitialEnergy(variant && variant.program),
        noProgram: !hasProg,
        onHighlightLine: function (lineNo) { setCurrentLine(lineNo); }
      });
    } catch (e) {
      S.dom.vizHost.appendChild(el('div', 'form-hint', '（画面暂时打不开，不影响做任务）'));
      S.viz = null;
    }
  }

  /* ======================================================================
   * 运行面板（右栏）更新
   * ==================================================================== */

  function clearRunPanels() {
    var d = S.dom;
    if (!d.varsGrid) return;
    clearNode(d.varsGrid);
    d.varsGrid.appendChild(el('div', 'vars-empty', '跑起来才有变量'));
    clearNode(d.timeline);
    d.tlEmpty.style.display = '';
    clearNode(d.outBox);
    d.outBox.appendChild(el('span', 'output-empty', '还没有输出'));
    setCurrentLine(null);
    if (S.viz) { try { S.viz.reset(); } catch (e) { /* 忽略 */ } }
    if (S.ui) S.ui.emitted = 0;
  }

  function updateVarsPanel(vars) {
    var d = S.dom;
    clearNode(d.varsGrid);
    var names = Object.keys(vars || {});
    if (!names.length) {
      d.varsGrid.appendChild(el('div', 'vars-empty', '还没有变量'));
      return;
    }
    names.forEach(function (name) {
      var v = vars[name];
      var card = el('div', 'var-card');
      if (v === true) card.classList.add('vc-true');
      if (v === false) card.classList.add('vc-false');
      var nm = el('div', 'vc-name', name);
      var zh = GLOSSARY[name];
      var nmTip = zh ? (name + ' = ' + zh) : (name + '：一个装数据的盒子');
      nm.title = nmTip;
      // 触屏没有悬停：点按变量名弹小气泡（建造遗留8）
      nm.addEventListener('click', function () { toast(nmTip); });
      card.appendChild(nm);
      var valText = (v === true) ? '真 ✓' : (v === false) ? '假 ✗' : String(v);
      var val = el('div', 'vc-val flash', valText);
      card.appendChild(val);
      d.varsGrid.appendChild(card);
    });
  }

  function appendTimeline(entry) {
    var d = S.dom;
    d.tlEmpty.style.display = 'none';
    var prev = d.timeline.querySelector('li.latest');
    if (prev) prev.classList.remove('latest');
    var li = el('li', 'latest');
    li.appendChild(el('span', 'tl-no', String(d.timeline.children.length + 1)));
    li.appendChild(el('span', null, entry.description || ('第 ' + entry.lineNo + ' 行')));
    d.timeline.appendChild(li);
    d.timeline.scrollTop = d.timeline.scrollHeight;
  }

  function updateOutput(text) {
    var d = S.dom;
    clearNode(d.outBox);
    if (text) d.outBox.appendChild(document.createTextNode(text));
    else d.outBox.appendChild(el('span', 'output-empty', '还没有输出'));
  }

  /** 每条 trace 的统一入口：引擎事件与本地执行器都走这里。 */
  function onTraceEntry(entry) {
    var ui = S.ui;
    if (!ui) return;
    ui.emitted += 1;
    if (S.viz) { try { S.viz.applyTraceEntry(entry); } catch (e) { /* 忽略 */ } }
    appendTimeline(entry);
    updateVarsPanel(entry.varsAfter || {});
    updateOutput(entry.outputSoFar || '');
    setCurrentLine(typeof entry.lineNo === 'number' ? entry.lineNo : null);

    // trace 型检查点：afterStep 匹配 trace entry.index
    if (ui.type === 'trace' && ui.variant && ui.variant.interaction &&
        Array.isArray(ui.variant.interaction.checkpoints)) {
      var cps = ui.variant.interaction.checkpoints;
      for (var i = 0; i < cps.length; i++) {
        if (cps[i].afterStep === entry.index && !ui.cpResults[i]) {
          ui.pendingCp = { index: i, cp: cps[i] };
          stopRunTimer();
          renderCheckpointCard();
          break;
        }
      }
    }
    refreshButtons();
  }

  /* ======================================================================
   * 运行控制（单步 / 运行 / 重置）
   * ==================================================================== */

  var runTimer = null;

  function stopRunTimer() {
    if (runTimer) { clearTimeout(runTimer); runTimer = null; }
  }

  function animDelay() {
    return document.body.classList.contains('no-anim') ? 0 : 650;
  }

  /** 统一单步：返回 'stepped' | 'done' | 'blocked' | 'paused' | 'noProgram' */
  function stepOnce() {
    var ui = S.ui;
    if (!ui) return 'noProgram';
    if (ui.pendingCp) return 'paused';

    if (ui.useLocal) return localStepOnce();

    var engine = S.engine;
    var st = engine.getActivityState();
    if (st.status === 'idle' || st.status === 'predicted') clearRunPanels();

    var r = engine.step();
    if (r && r.blocked === 'need-prediction') {
      focusPredict();
      return 'blocked';
    }
    if (r && r.noProgram) return 'noProgram';
    if (r && r.done) {
      if (r.entry === undefined || engine.getActivityState().status === 'done') {
        if (!ui.runFinished) {
          ui.runFinished = true;
          ui.lastRunError = r.error || null;
          onRunDone();
        }
        return 'done';
      }
    }
    if (ui.pendingCp) return 'paused';
    return 'stepped';
  }

  function localStepOnce() {
    var ui = S.ui;
    var program = activeProgram();
    if (!program || !program.length) return 'noProgram';

    var pred = effPrediction();
    if (pred && !ui.predicted) { focusPredict(); return 'blocked'; }

    if (!ui.localExec) {
      clearRunPanels();
      try {
        ui.localExec = CppLab.IR.execute(program);
      } catch (e) {
        ui.localExec = { trace: [], finalVars: {}, stdout: '', error: String(e && e.message || e) };
      }
      ui.localCursor = 0;
    }
    var trace = ui.localExec.trace || [];
    if (ui.localCursor >= trace.length) {
      if (!ui.runFinished) {
        ui.runFinished = true;
        ui.lastRunError = ui.localExec.error || null;
        onRunDone();
      }
      return 'done';
    }
    var entry = trace[ui.localCursor];
    ui.localCursor += 1;
    onTraceEntry(entry);
    if (ui.localCursor >= trace.length) {
      ui.runFinished = true;
      ui.lastRunError = ui.localExec.error || null;
      onRunDone();
      return 'done';
    }
    return 'stepped';
  }

  function doStep() {
    var ui = S.ui;
    if (!ui) return;
    if (ui.type === 'freeEdit') { toast('自由代码要用「真实C++验证」来运行哦'); return; }
    stepOnce();
    refreshButtons();
  }

  function doRun() {
    var ui = S.ui;
    if (!ui) return;
    if (ui.type === 'freeEdit') { toast('自由代码要用「真实C++验证」来运行哦'); return; }
    stopRunTimer();
    if (animDelay() === 0) {
      // 动画关闭：瞬时跑完（检查点暂停/阻断除外）
      var guard = 0, r;
      do { r = stepOnce(); guard++; } while (r === 'stepped' && guard < 10000);
      refreshButtons();
      return;
    }
    var tick = function () {
      var res = stepOnce();
      refreshButtons();
      if (res === 'stepped') {
        runTimer = setTimeout(tick, animDelay());
      }
    };
    tick();
  }

  function doReset() {
    var ui = S.ui;
    if (!ui) return;
    stopRunTimer();
    S.engine.reset();
    ui.predicted = false;
    ui.predictedCorrect = null;
    ui.runFinished = false;
    ui.lastRunError = null;
    ui.pendingCp = null;
    ui.cpResults = [];
    ui.localExec = null;
    ui.localCursor = 0;
    clearRunPanels();
    renderCenter();
    refreshButtons();
  }

  /** 运行结束后的按类型收尾。 */
  function onRunDone() {
    var ui = S.ui;
    stopRunTimer();

    if (ui.lastRunError) {
      showFeedback('err', '程序中途停下来了', ui.lastRunError, []);
      refreshButtons();
      return;
    }

    var type = ui.type;
    // 类型分流先于预测收尾：bughunt / teach-transfer / slots 等有自己的完成判定，
    // 即使带 variant.prediction（热身），运行结束也绝不走 finishPredictActivity 短路完成。
    if (type === 'trace') { maybeFinishTrace(); return; }
    if (type === 'slots') { checkSlotsGoal(); return; }
    if (type === 'bughunt') {
      if (!ui.bugFixed) {
        showFeedback('warn', '看出问题了吗？', '程序跑完了，但结果好像不太对劲。点一点代码里可疑的那一行！', []);
      }
      refreshButtons();
      return;
    }
    if (type === 'teach-transfer') {
      // 运行只是演示；完成判定在迁移题（renderTransferQuestion）里
      toast('演示跑完啦！回到上面跟着小老师继续，最后还有挑战题等你～');
      refreshButtons();
      return;
    }
    if (type === 'predict') {
      // 两段式：同时带 variant.prediction（热身）与 interaction.question（主题）时，
      // 预测+运行完成后弹出主提问，完成判定看主题而非热身。
      if (hasTwoStageQuestion()) { renderMainQuestion(); refreshButtons(); return; }
      finishPredictActivity();
      return;
    }
    // ordering 例外：预测只是热身，完成判定始终走「检查顺序」，运行是可反复的探索
    if (effPrediction() && ui.variant.prediction && type !== 'ordering') {
      finishPredictActivity();
      return;
    }
    // 其他带程序的活动：跑完即算探索完成
    if (!ui.completed && ['choice', 'ordering', 'teach-transfer', 'explain', 'build', 'freeEdit'].indexOf(type) < 0) {
      completeCurrent({ outcome: outcomeFromAttempts(1) });
    }
    refreshButtons();
  }

  /* ======================================================================
   * 预测
   * ==================================================================== */

  function focusPredict() {
    var panel = document.getElementById('predict-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.remove('predict-panel');
      // 触发一次注意闪烁（重加类）
      void panel.offsetWidth;
      panel.classList.add('predict-panel');
      var inp = panel.querySelector('input, .chip');
      if (inp) inp.focus();
    } else {
      toast('这个任务先想一想再动手哦');
    }
  }

  function submitPredictionValue(value) {
    var ui = S.ui;
    var pred = effPrediction();
    if (!pred) return;
    ui.predictionAttempts += 1;

    var correct;
    if (ui.variant.prediction) {
      var r = S.engine.submitPrediction(value);
      correct = !!(r && r.correct);
      if (r && r.ok === false && r.reason === 'already-running') {
        toast('程序已经跑起来啦，先重置再改预测');
        return;
      }
    } else {
      correct = valEq(value, pred.correct);
    }
    ui.predicted = true;
    ui.predictedCorrect = correct;
    ui.predictedValue = value;
    renderCenter();
    refreshButtons();
    // 没有可运行程序的活动（如 trial-02）不能说「跑一跑」——那是死指引
    toast(activeProgram()
      ? '预测已经收好！跑一跑看看你猜得对不对～'
      : '预测已经收好！接着完成上面的任务，看看你猜得对不对～');
  }

  function buildPredictPanel() {
    var ui = S.ui;
    var pred = effPrediction();
    if (!pred) return null;

    var panel = el('div', 'predict-panel');
    panel.id = 'predict-panel';

    if (ui.predicted) {
      panel.appendChild(el('div', 'pp-q', '🤔 我的预测'));
      var doneBox = el('div', 'predict-done');
      doneBox.textContent = T('你猜的是：' + String(ui.predictedValue) + ' 。跑一跑，看看机器人怎么说！');
      panel.appendChild(doneBox);
      return panel;
    }

    panel.appendChild(el('div', 'pp-q', '🤔 先想一想：' + T(pred.question || '结果会是什么？')));
    var row = el('div', 'predict-row');

    if (pred.inputType === 'choice' && Array.isArray(pred.options)) {
      pred.options.forEach(function (opt) {
        var label = (opt && typeof opt === 'object') ? (opt.label !== undefined ? opt.label : opt.id) : opt;
        var value = (opt && typeof opt === 'object') ? (opt.id !== undefined ? opt.id : opt.label) : opt;
        var c = el('button', 'chip', T(String(label)));
        c.type = 'button';
        c.addEventListener('click', function () { submitPredictionValue(value); });
        row.appendChild(c);
      });
    } else {
      var input = el('input', 'predict-input');
      input.type = 'number';
      input.placeholder = '?';
      var ok = btn('就猜这个！', 'btn btn-sm btn-accent', function () {
        if (input.value === '') { toast('先填上你的预测数字'); input.focus(); return; }
        submitPredictionValue(input.value);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') ok.click();
      });
      row.appendChild(input);
      row.appendChild(ok);
    }
    panel.appendChild(row);
    return panel;
  }

  /**
   * 两段式 predict：变体同时带 prediction（热身）与 interaction.question（主提问）。
   * 例外：内容把同一道题同时写进两处（如 lesson2-06，问题与答案完全相同）＝单段式，
   * 不在运行后重复提问。
   */
  function hasTwoStageQuestion() {
    var ui = S.ui;
    if (!(ui && ui.type === 'predict' && ui.variant &&
          ui.variant.prediction && ui.variant.interaction && ui.variant.interaction.question)) {
      return false;
    }
    var p = ui.variant.prediction;
    var q = ui.variant.interaction;
    if (String(p.question) === String(q.question) && valEq(p.correct, q.correct)) return false;
    return true;
  }

  /** 两段式主提问：运行结束后弹出，完成判定看主题（interaction.question）而非热身。 */
  function renderMainQuestion() {
    var ui = S.ui;
    if (!ui || ui.completed) return;
    var inter = ui.variant.interaction;
    var host = document.getElementById('interaction-area');
    if (!host) return;
    var old = document.getElementById('main-question');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var box = el('div', 'predict-panel');
    box.id = 'main-question';
    box.style.marginTop = '12px';
    if (ui.predictedCorrect === true) {
      box.appendChild(el('p', 'predict-done', '热身预测答对啦！现在来真正的问题：'));
    } else if (ui.predictedCorrect === false) {
      box.appendChild(el('p', 'predict-done', '热身题差一点点，没关系！现在来真正的问题：'));
    }
    box.appendChild(el('div', 'pp-q', '⭐ 主问题：' + T(inter.question || '')));
    var row = el('div', 'predict-row');

    function submit(value) {
      if (ui.completed) return;
      ui.interactionAttempts += 1;
      if (valEq(value, inter.correct)) {
        disableChips(row);
        completeCurrent({
          outcome: outcomeFromAttempts(ui.interactionAttempts),
          selfCorrection: ui.interactionAttempts > 1,
          answerOrCode: String(value),
          childAction: '两段式主提问，第 ' + ui.interactionAttempts + ' 次答对（热身预测' +
            (ui.predictedCorrect ? '正确' : '未命中') + '）'
        });
      } else if (ui.interactionAttempts >= 3) {
        showFeedback('warn', '这个问题有点狡猾！', '你已经很努力啦。看着左边的画面和时间线，和老师一起再想想？', [
          { label: '知道了，继续', primary: true, onClick: function () {
              completeCurrent({
                outcome: 1,
                answerOrCode: String(value),
                childAction: '两段式主提问多次未命中，观察运行结果后继续'
              });
            } }
        ]);
      } else {
        showFeedback('warn', pick(ENCOURAGES), '再看看刚才程序跑的每一步，然后再试一次！', []);
      }
    }

    if (inter.inputType === 'choice' && Array.isArray(inter.options)) {
      inter.options.forEach(function (opt) {
        var label = (opt && typeof opt === 'object') ? (opt.label !== undefined ? opt.label : opt.id) : opt;
        var value = (opt && typeof opt === 'object') ? (opt.id !== undefined ? opt.id : opt.label) : opt;
        var c = el('button', 'chip', T(String(label)));
        c.type = 'button';
        c.addEventListener('click', function () { submit(value); });
        row.appendChild(c);
      });
    } else {
      var input = el('input', 'predict-input');
      input.type = 'number';
      var ok = btn('就是它！', 'btn btn-sm btn-accent', function () {
        if (input.value === '') { input.focus(); return; }
        submit(input.value);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
      row.appendChild(input);
      row.appendChild(ok);
    }
    box.appendChild(row);
    host.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function finishPredictActivity() {
    var ui = S.ui;
    if (ui.completed) { refreshButtons(); return; }

    if (ui.predictedCorrect) {
      var outcome = outcomeFromAttempts(ui.predictionAttempts);
      completeCurrent({
        outcome: outcome,
        selfCorrection: ui.predictionAttempts > 1,
        answerOrCode: String(ui.predictedValue),
        childAction: '预测后运行验证，预测正确（第 ' + ui.predictionAttempts + ' 次）'
      });
    } else if (ui.predictionAttempts >= 3) {
      showFeedback('warn', '这个问题有点狡猾！', T('你已经很努力啦。看着时间线想一想，机器人每一步都做了什么？'), [
        { label: '知道了，继续', primary: true, onClick: function () {
            completeCurrent({
              outcome: 1,
              answerOrCode: String(ui.predictedValue),
              childAction: '多次预测未命中，观察运行结果后继续'
            });
          } }
      ]);
    } else {
      showFeedback('warn', pick(ENCOURAGES), T('你的预测和机器人做的不一样。看看右边的时间线，再猜一次？'), [
        { label: '我再想一想', primary: true, onClick: function () { doReset(); } },
        { label: '知道了，继续', onClick: function () {
            completeCurrent({
              outcome: 1,
              selfCorrection: false,
              answerOrCode: String(ui.predictedValue),
              childAction: '预测未命中，选择继续'
            });
          } }
      ]);
    }
    refreshButtons();
  }

  /* ======================================================================
   * 中栏渲染（活动头 + 交互区 + 代码台 + 反馈区）
   * ==================================================================== */

  function renderCenter() {
    var ui = S.ui;
    var d = S.dom;
    clearNode(d.center);

    var activity = ui.activity;
    var head = el('div', 'panel activity-head');
    head.appendChild(el('div', 'ah-kicker', '任务 ' + (S.engine.currentIndex + 1) + ' / ' + S.engine.getActivities().length));
    head.appendChild(el('h2', null, T(activity.title || '新任务')));
    if (ui.variant && ui.variant.intro) {
      head.appendChild(el('p', 'activity-prompt', T(ui.variant.intro)));
    }
    d.center.appendChild(head);

    // 预测面板
    var pp = buildPredictPanel();
    if (pp) {
      pp.style.marginTop = '12px';
      d.center.appendChild(pp);
    }

    // 交互区（按 activityType）
    var inter = el('div');
    inter.id = 'interaction-area';
    inter.style.marginTop = '12px';
    d.center.appendChild(inter);
    renderInteraction(inter);

    // 代码台：无 program 且非自由编辑的活动整栏不渲染（§13-2），场景+交互占满
    var program = activeProgram();
    if ((program && program.length) || ui.type === 'freeEdit') {
      var codeHost = el('div', 'panel code-panel');
      codeHost.id = 'code-host';
      d.center.appendChild(codeHost);
      renderCodePanel(codeHost);
    }

    // 反馈 + 编译结果区
    var fb = el('div');
    fb.id = 'feedback-area';
    d.center.appendChild(fb);
    var cr = el('div', 'compile-result');
    cr.id = 'compile-area';
    d.center.appendChild(cr);
  }

  /* ======================================================================
   * 通用活动渲染器
   * ==================================================================== */

  function renderInteraction(host) {
    var ui = S.ui;
    var inter = ui.variant && ui.variant.interaction;
    var type = ui.type;

    if (type === 'predict' || type === 'trace') {
      // predict 的问题在预测面板里；trace 的检查点运行时弹出
      if (type === 'trace') {
        var tipCard = el('div', 'panel');
        tipCard.appendChild(el('div', 'panel-title', '🔍 侦探任务'));
        tipCard.appendChild(el('p', null, '一步一步走，走到关键的地方我会考考你！'));
        host.appendChild(tipCard);
        var cpHost = el('div');
        cpHost.id = 'cp-host';
        host.appendChild(cpHost);
      }
      return;
    }

    if (!inter && ['freeEdit', 'build'].indexOf(type) < 0) {
      var miss = el('div', 'panel');
      miss.appendChild(el('p', null, '这个任务的内容还没有准备好，先跳过它吧。'));
      miss.appendChild(btn('跳过这个任务', 'btn btn-sm', function () {
        completeCurrent({ outcome: 'N', childAction: '内容缺失，跳过' });
      }));
      host.appendChild(miss);
      return;
    }

    switch (type) {
      case 'choice': return renderChoice(host, inter);
      case 'ordering': return renderOrdering(host, inter);
      case 'slots': return renderSlots(host, inter);
      case 'freeEdit': return renderFreeEditIntro(host, inter);
      case 'bughunt': return renderBughuntIntro(host, inter);
      case 'teach-transfer': return renderTeachTransfer(host, inter);
      case 'explain': return renderExplain(host, inter);
      case 'build': return renderBuild(host, inter);
      default:
        host.appendChild(el('div', 'panel form-hint', '这个任务直接用下面的按钮探索就可以啦。'));
    }
  }

  /* ---------------------------- choice ---------------------------- */

  function renderChoice(host, inter) {
    var ui = S.ui;
    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '❓ 选一选'));
    card.appendChild(el('p', 'activity-prompt', T(inter.question || '')));
    var row = el('div', 'chip-row');
    var multi = !!inter.multi;
    var chosen = {};
    // 无 correct 选项 = 纯观察记录（如 trial-01 兴趣选择）：任选即完成，不判对错
    var hasCorrect = (inter.options || []).some(function (o) { return o && o.correct === true; });

    (inter.options || []).forEach(function (opt) {
      var c = el('button', 'chip', T(String(opt.label !== undefined ? opt.label : opt.id)));
      c.type = 'button';
      c.addEventListener('click', function () {
        if (ui.completed && !multi) return;
        if (multi) {
          chosen[opt.id] = !chosen[opt.id];
          c.classList.toggle('selected', !!chosen[opt.id]);
          return;
        }
        ui.interactionAttempts += 1;
        if (!hasCorrect) {
          c.classList.add('selected');
          disableChips(row);
          recordTrialObservation(opt.id);
          if (!ui.completed) {
            completeCurrent({
              outcome: 'N',
              answerOrCode: String(opt.id),
              childAction: '观察类选择：' + String(opt.label !== undefined ? opt.label : opt.id)
            });
          }
          return;
        }
        if (opt.correct === true) {
          c.classList.add('right');
          disableChips(row);
          if (!ui.completed) {
            completeCurrent({
              outcome: outcomeFromAttempts(ui.interactionAttempts),
              selfCorrection: ui.interactionAttempts > 1,
              answerOrCode: String(opt.label !== undefined ? opt.label : opt.id),
              childAction: '选择题作答，第 ' + ui.interactionAttempts + ' 次选对'
            });
          }
        } else {
          c.classList.add('wrong');
          c.disabled = true;
          showFeedback('warn', pick(ENCOURAGES), '再看看别的选项？', []);
        }
      });
      row.appendChild(c);
    });
    card.appendChild(row);

    if (multi) {
      var confirm = btn('就选这些！', 'btn btn-sm btn-accent', function () {
        if (ui.completed) return;
        ui.interactionAttempts += 1;
        var allRight = (inter.options || []).every(function (opt) {
          return !!chosen[opt.id] === (opt.correct === true);
        });
        if (allRight) {
          disableChips(row);
          completeCurrent({
            outcome: outcomeFromAttempts(ui.interactionAttempts),
            selfCorrection: ui.interactionAttempts > 1,
            answerOrCode: Object.keys(chosen).filter(function (k) { return chosen[k]; }).join(','),
            childAction: '多选题作答，第 ' + ui.interactionAttempts + ' 次全对'
          });
        } else {
          showFeedback('warn', pick(ENCOURAGES), '有的选项还不太对，再调整一下！', []);
        }
      });
      confirm.style.marginTop = '10px';
      card.appendChild(confirm);
    }
    host.appendChild(card);
  }

  function disableChips(row) {
    var chips = row.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].disabled = true;
  }

  /* ---------------------------- ordering ---------------------------- */

  /** ordering+program：卡片与程序步一一对应（correctOrder[i] ↔ program[i]）才能按卡序重排执行。 */
  function orderingProgramMappable(variant) {
    var inter = variant && variant.interaction;
    var program = variant && variant.program;
    if (!inter || !Array.isArray(inter.items) || !Array.isArray(inter.correctOrder) || !Array.isArray(program)) return false;
    if (inter.items.length !== program.length || inter.correctOrder.length !== program.length) return false;
    var ids = inter.items.map(function (it) { return it && it.id; });
    return inter.correctOrder.every(function (id) { return ids.indexOf(id) >= 0; });
  }

  /** ordering+program：按当前卡片顺序重排程序副本，并作废旧运行态（可反复交换重跑）。 */
  function syncOrderedProgram() {
    var ui = S.ui;
    if (!ui || ui.type !== 'ordering' || !ui.useLocal || !ui.orderIds) return;
    var inter = (ui.variant && ui.variant.interaction) || {};
    var base = (ui.variant && ui.variant.program) || null;
    if (!base || !Array.isArray(inter.correctOrder)) return;
    ui.workProgram = ui.orderIds.map(function (id) {
      return deepClone(base[inter.correctOrder.indexOf(id)]);
    });
    ui.localExec = null;
    ui.localCursor = 0;
    ui.runFinished = false;
    ui.lastRunError = null;
    if (S.dom && S.dom.varsGrid) clearRunPanels();
    var codeHost = document.getElementById('code-host');
    if (codeHost) renderCodePanel(codeHost);   // 代码台跟着卡片顺序变
    refreshButtons();
  }

  /** 无程序的排序活动（如 trial-02 首胜、trial-08-E）：排对后按正确顺序上演命令动画（方案 §4.3）。 */
  function playSequenceDemo(inter) {
    var ui = S.ui;
    if (!S.viz || !ui) return;
    if (ui.variant && Array.isArray(ui.variant.program) && ui.variant.program.length) return;
    if (!ui.activity) return;
    var byId = {};
    (inter.items || []).forEach(function (it) { if (it) byId[it.id] = it; });
    var ids = (inter.correctOrder || []).slice();
    var gap = animDelay();
    ids.forEach(function (id, i) {
      var it = byId[id] || { label: String(id) };
      var text = '第 ' + (i + 1) + ' 步：' + (it.icon ? TIcon(it.icon) + ' ' : '') + T(it.label) + '！' +
        (i === ids.length - 1 ? ' 任务完成！' : '');
      var show = function () {
        if (!S.viz) return;
        try { S.viz.applyTraceEntry({ kind: 'seq-demo', index: i, description: text }); } catch (e) { /* 忽略 */ }
      };
      if (gap === 0) {
        if (i === ids.length - 1) show(); // 动画关闭：只展示完成旁白
      } else {
        setTimeout(show, 350 + i * Math.max(gap, 700));
      }
    });
  }

  function renderOrdering(host, inter) {
    var ui = S.ui;
    var items = (inter.items || []).slice();
    if (!ui.orderIds) {
      var ids = items.map(function (it) { return it.id; });
      // 打乱，且保证初始顺序不等于正确顺序
      var correct = (inter.correctOrder || []).join('|');
      var guard = 0;
      do {
        for (var i = ids.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        }
        guard++;
      } while (ids.join('|') === correct && guard < 10 && ids.length > 1);
      ui.orderIds = ids;
    }
    syncOrderedProgram(); // ordering+program：代码台/运行按当前卡序执行

    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🧩 排一排'));
    card.appendChild(el('p', 'activity-prompt', '点「上移」「下移」，把步骤排成正确的顺序。' +
      (ui.useLocal ? '每换一次顺序，都可以按「运行」看看能量会走哪条路！' : '')));
    var list = el('ol', 'order-list');

    function itemById(id) {
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
      return { id: id, label: id };
    }

    function draw() {
      clearNode(list);
      ui.orderIds.forEach(function (id, idx) {
        var it = itemById(id);
        var li = el('li', 'order-item');
        li.appendChild(el('span', 'oi-num', String(idx + 1)));
        var lbl = el('span', 'oi-label', (it.icon ? TIcon(it.icon) + ' ' : '') + T(it.label));
        li.appendChild(lbl);
        var btns = el('span', 'oi-btns');
        var up = btn('⬆ 上移', 'btn btn-sm', function () { move(idx, -1); });
        var down = btn('⬇ 下移', 'btn btn-sm', function () { move(idx, +1); });
        if (idx === 0) up.disabled = true;
        if (idx === ui.orderIds.length - 1) down.disabled = true;
        btns.appendChild(up);
        btns.appendChild(down);
        li.appendChild(btns);
        list.appendChild(li);
      });
    }

    function move(idx, delta) {
      // 注意：完成后不再禁止交换——「交换顺序再跑一次」正是本类活动的教学动作
      var j = idx + delta;
      if (j < 0 || j >= ui.orderIds.length) return;
      var t = ui.orderIds[idx];
      ui.orderIds[idx] = ui.orderIds[j];
      ui.orderIds[j] = t;
      syncOrderedProgram();
      draw();
    }

    draw();
    card.appendChild(list);

    var check = btn('✅ 检查顺序', 'btn btn-accent', function () {
      var ok = ui.orderIds.join('|') === (inter.correctOrder || []).join('|');
      if (ui.completed) {
        // 完成后的重玩/交换实验：只反馈，不再计证据
        showFeedback(ok ? 'ok' : 'warn',
          ok ? '顺序又排对啦！' : '这个顺序和标准队伍不一样',
          ui.useLocal
            ? '按「运行」看看这套顺序下能量怎么走——中间的数字和刚才一样吗？'
            : (ok ? '记得越来越牢了！' : '想一想哪一步应该先发生？'),
          []);
        return;
      }
      ui.interactionAttempts += 1;
      if (ok) {
        playSequenceDemo(inter); // 无程序的排序（如 trial-02）：排对后立即上演动作序列
        completeCurrent({
          outcome: outcomeFromAttempts(ui.interactionAttempts),
          selfCorrection: ui.interactionAttempts > 1,
          answerOrCode: ui.orderIds.join(' → '),
          childAction: '排序题，第 ' + ui.interactionAttempts + ' 次排对'
        });
      } else {
        showFeedback('warn', pick(ENCOURAGES), '顺序还差一点点，想想哪一步应该先发生？', []);
      }
    });
    check.style.marginTop = '12px';
    card.appendChild(check);
    host.appendChild(card);
  }

  /* ---------------------------- slots ---------------------------- */

  function slotGetStep(program, stepIndex) {
    return (Array.isArray(program) && program[stepIndex]) ? program[stepIndex] : null;
  }

  function slotReadValue(step, path) {
    if (!step) return undefined;
    var segs = String(path || '').split('.');
    var node = step;
    for (var i = 0; i < segs.length; i++) {
      if (!node) return undefined;
      node = node[segs[i]];
    }
    if (node && node.kind === 'lit') return node.value;
    return undefined;
  }

  /** 按 path 写入原始节点（不包 lit）：用于换整个表达式（choices[].expr）或运算符字符串（choices[].value）。 */
  function slotWriteRaw(step, path, node) {
    var segs = String(path || '').split('.');
    var cur = step;
    for (var i = 0; i < segs.length - 1; i++) {
      if (!cur[segs[i]]) cur[segs[i]] = {};
      cur = cur[segs[i]];
    }
    cur[segs[segs.length - 1]] = node;
  }

  function slotWriteValue(step, path, value) {
    slotWriteRaw(step, path, { kind: 'lit', value: value });
  }

  function renderSlots(host, inter) {
    var ui = S.ui;
    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🎛 调一调'));
    var goalText = '';
    if (inter.goal) {
      if (inter.goal.type === 'finalVar') {
        goalText = '目标：让 ' + inter.goal.name + ' 最后变成 ' + inter.goal.value + '。';
      } else if (inter.goal.type === 'stdout') {
        goalText = T('目标：让机器人最后说出「' + inter.goal.value + '」。');
      }
    }
    card.appendChild(el('p', 'activity-prompt', '点亮下面的魔法槽位，改一改数字，再运行看看！' + (goalText ? ' ' + goalText : '')));

    var row = el('div', 'slot-row');
    var editorHost = el('div');

    (inter.slots || []).forEach(function (slot) {
      var step = slotGetStep(ui.workProgram, slot.stepIndex);
      var cur = slotReadValue(step, slot.path);
      var chip = el('button', 'slot-chip');
      chip.type = 'button';
      chip.appendChild(document.createTextNode(T(slot.label || '槽位') + '：'));
      chip.appendChild(el('span', 'sc-val', cur === undefined ? '?' : String(cur)));
      chip.addEventListener('click', function () {
        openSlotEditor(editorHost, slot, chip);
      });
      row.appendChild(chip);
    });
    card.appendChild(row);
    card.appendChild(editorHost);
    host.appendChild(card);
  }

  function openSlotEditor(hostNode, slot, chip) {
    var ui = S.ui;
    clearNode(hostNode);
    var box = el('div', 'slot-editor');
    box.appendChild(el('span', null, '「' + T(slot.label || '槽位') + '」改成：'));

    function applyValue(v) {
      var step = slotGetStep(ui.workProgram, slot.stepIndex);
      if (!step) { toast('这个槽位好像坏掉了，找老师看看'); return; }
      // choice 槽位约定：{id,label,expr}=整体换成该 IR 表达式；{id,label,value}=写入原始值（如运算符）
      if (v && typeof v === 'object') {
        if (v.expr) slotWriteRaw(step, slot.path, deepClone(v.expr));
        else if ('value' in v) slotWriteRaw(step, slot.path, v.value);
        else { toast('这个选项好像坏掉了，找老师看看'); return; }
      } else {
        slotWriteValue(step, slot.path, v);
      }
      // 程序变了：运行态作废
      ui.localExec = null;
      ui.localCursor = 0;
      ui.runFinished = false;
      var valSpan = chip.querySelector('.sc-val');
      // choice 槽位的值可能是 {id,label,...} 对象：展示 label 而不是 [object Object]
      var shown = (v && typeof v === 'object')
        ? (v.label !== undefined ? v.label : (v.id !== undefined ? v.id : '已选择'))
        : v;
      if (valSpan) valSpan.textContent = T(String(shown));
      clearNode(hostNode);
      clearRunPanels();
      var codeHost = document.getElementById('code-host');
      if (codeHost) renderCodePanel(codeHost);
      refreshButtons();
      toast('改好啦！按「运行」看看新结果');
    }

    if (slot.inputType === 'choice' && Array.isArray(slot.choices)) {
      slot.choices.forEach(function (c) {
        var lbl = (c && typeof c === 'object') ? String(c.label !== undefined ? c.label : c.id) : String(c);
        box.appendChild(btn(T(lbl), 'btn btn-sm', function () { applyValue(c); }));
      });
    } else {
      var input = el('input', 'predict-input');
      input.type = 'number';
      var ok = btn('改好了', 'btn btn-sm btn-accent', function () {
        if (input.value === '') { input.focus(); return; }
        applyValue(Number(input.value));
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
      box.appendChild(input);
      box.appendChild(ok);
    }
    box.appendChild(btn('先不改', 'btn btn-sm btn-ghost', function () { clearNode(hostNode); }));
    hostNode.appendChild(box);
  }

  function checkSlotsGoal() {
    var ui = S.ui;
    var inter = ui.variant.interaction || {};
    var goal = inter.goal;
    var exec = ui.localExec;
    if (!goal || !exec) { refreshButtons(); return; }

    var ok = false;
    if (goal.type === 'finalVar') {
      ok = valEq((exec.finalVars || {})[goal.name], goal.value);
    } else if (goal.type === 'stdout') {
      ok = valEq(exec.stdout, goal.value);
    }
    ui.interactionAttempts += 1;

    if (ok && !ui.completed) {
      // 承接次优来源（方案 §8.2）：lesson1 达标活动（如 act5「正好到达 10」）的最终能量。
      // 作品卡（第一优先来源）已写过最终能量时不覆盖；演示程序重跑不再写 finalEnergy（见 lessonEngine）。
      if (S.lessonId === 'lesson1' && goal.type === 'finalVar' &&
          exec.finalVars && typeof exec.finalVars.energy === 'number') {
        var fe = exec.finalVars.energy;
        Sto().update(function (ss) {
          ss.lessons = ss.lessons || {};
          ss.lessons.lesson1 = ss.lessons.lesson1 || { completed: false, finalEnergy: null, artifactCard: null, activityStates: {} };
          var ac = ss.lessons.lesson1.artifactCard;
          if (!(ac && typeof ac.finalEnergy === 'number')) ss.lessons.lesson1.finalEnergy = fe;
        });
      }
      // 第 2 课：孩子的最终规则（所选门+符号+门槛）存入 session.lessons.lesson2.customRule
      if (S.lessonId === 'lesson2' && CppLab.IR && ui.workProgram) {
        var ruleText = '';
        for (var ri = 0; ri < ui.workProgram.length; ri++) {
          if (ui.workProgram[ri] && ui.workProgram[ri].op === 'if') {
            try { ruleText = CppLab.IR.exprToCpp(ui.workProgram[ri].cond); } catch (e) { ruleText = ''; }
            break;
          }
        }
        if (!ruleText) { try { ruleText = CppLab.IR.toFocusCpp(ui.workProgram); } catch (e2) { ruleText = ''; } }
        if (ruleText) {
          Sto().update(function (ss) {
            ss.lessons = ss.lessons || {};
            ss.lessons.lesson2 = ss.lessons.lesson2 || { completed: false, customRule: null, activityStates: {}, pathConfirmed: false };
            ss.lessons.lesson2.customRule = ruleText;
          });
        }
      }
      completeCurrent({
        outcome: outcomeFromAttempts(ui.interactionAttempts),
        selfCorrection: ui.interactionAttempts > 1,
        answerOrCode: (CppLab.IR && ui.workProgram) ? CppLab.IR.toFocusCpp(ui.workProgram) : '',
        childAction: '调整槽位后运行，第 ' + ui.interactionAttempts + ' 次达成目标'
      });
    } else if (!ok) {
      showFeedback('warn', '还没到目标！', '看看右边的变量卡和输出，想想该把哪个数字改大还是改小？', []);
    }
    refreshButtons();
  }

  /* ---------------------------- freeEdit ---------------------------- */

  function renderFreeEditIntro(host, inter) {
    inter = inter || {};
    var card = el('div', 'panel');
    var title = el('div', 'panel-title');
    title.appendChild(document.createTextNode('⌨️ 自由创作'));
    var badge = el('span', 'console-badge', '控制台模式');
    badge.title = '自由写的代码由真正的 C++ 编译器运行，左边的画面不会跟着动';
    title.appendChild(badge);
    card.appendChild(title);
    if (inter.goal) card.appendChild(el('p', 'activity-prompt', T(inter.goal)));
    card.appendChild(el('p', 'form-hint', '在下面的代码框里写代码，然后按「真实C++验证」，让真正的编译器来运行它！'));
    host.appendChild(card);
  }

  /* ---------------------------- bughunt ---------------------------- */

  function renderBughuntIntro(host, inter) {
    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🐞 抓虫行动'));
    card.appendChild(el('p', 'activity-prompt', '这段程序里藏了一只小虫子（bug）！先跑一跑看看哪里不对，再点一点你觉得可疑的那一行代码。'));
    var noteHost = el('div');
    noteHost.id = 'bug-note-host';
    card.appendChild(noteHost);
    host.appendChild(card);
  }

  function onBugLineClick(lineNo) {
    var ui = S.ui;
    var inter = ui.variant.interaction || {};
    var bug = inter.bug;
    if (!bug || ui.bugFixed) return;

    var lineMap = {};
    try { lineMap = CppLab.IR.getLineMap(activeProgram()) || {}; } catch (e) { /* 忽略 */ }
    var bugLine = lineMap[bug.stepIndex];

    var noteHost = document.getElementById('bug-note-host');
    if (!noteHost) return;
    clearNode(noteHost);

    if (bugLine !== undefined && lineNo === bugLine) {
      ui.bugFoundLine = lineNo;
      var note = el('div', 'bug-note');
      note.appendChild(el('p', null, '🎯 就是这一行！' + T(bug.whyChild || '这里写得不太对。')));
      note.appendChild(el('p', null, '应该把「' + bug.wrongPiece + '」改成什么？'));
      var row = el('div', 'chip-row');
      var options = [bug.rightPiece, bug.wrongPiece];
      if (Math.random() < 0.5) options.reverse();
      options.forEach(function (piece) {
        var c = el('button', 'chip', String(piece));
        c.type = 'button';
        c.addEventListener('click', function () {
          ui.interactionAttempts += 1;
          if (piece === bug.rightPiece) {
            c.classList.add('right');
            disableChips(row);
            ui.bugFixed = true;
            var codeHost = document.getElementById('code-host');
            if (codeHost) renderCodePanel(codeHost);
            if (!ui.completed) {
              completeCurrent({
                outcome: outcomeFromAttempts(ui.interactionAttempts + Math.max(0, ui.bugWrongLineClicks || 0)),
                selfCorrection: (ui.bugWrongLineClicks || 0) > 0 || ui.interactionAttempts > 1,
                answerOrCode: bug.wrongPiece + ' → ' + bug.rightPiece,
                childAction: '找到 bug 行并选对修正方案'
              });
            }
          } else {
            c.classList.add('wrong');
            c.disabled = true;
            showFeedback('warn', pick(ENCOURAGES), '再想想，哪个才能让程序做对事情？', []);
          }
        });
        row.appendChild(c);
      });
      note.appendChild(row);
      noteHost.appendChild(note);
    } else {
      ui.bugWrongLineClicks = (ui.bugWrongLineClicks || 0) + 1;
      var miss = el('div', 'bug-note', '这一行其实没问题哦。跑一跑程序，观察哪一步的结果和你想的不一样？');
      noteHost.appendChild(miss);
    }
  }

  /** bughunt 修好后的展示/验证用源码：把 bug 行的 wrongPiece 换成 rightPiece。 */
  function bugFixedSource(full) {
    var ui = S.ui;
    var inter = ui.variant.interaction || {};
    var bug = inter.bug;
    if (!bug || !ui.bugFixed) return full;
    return full.replace(bug.wrongPiece, bug.rightPiece);
  }

  /* ---- bughunt 的 IR 级修复：用于本地重算「修好版」的预期输出 ---- */

  var BUG_FIX_OPS = ['+', '-', '*', '/', '>', '>=', '<', '<=', '==', '!=', '&&', '||'];

  /** 在表达式树里找到 exprToCpp === wrongPiece 的 bin 节点，换运算符使其变成 rightPiece。 */
  function tryFixExprNode(node, wrong, right) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind !== 'bin') return false;
    var cur = null;
    try { cur = CppLab.IR.exprToCpp(node); } catch (e) { cur = null; }
    if (cur === wrong) {
      var orig = node.op;
      for (var i = 0; i < BUG_FIX_OPS.length; i++) {
        node.op = BUG_FIX_OPS[i];
        try {
          if (CppLab.IR.exprToCpp(node) === right) return true;
        } catch (e2) { /* 忽略 */ }
      }
      node.op = orig;
    }
    return tryFixExprNode(node.left, wrong, right) || tryFixExprNode(node.right, wrong, right);
  }

  function fixStepInPlace(step, wrong, right) {
    if (!step || typeof step !== 'object') return false;
    if (step.expr && tryFixExprNode(step.expr, wrong, right)) return true;
    if (step.cond && tryFixExprNode(step.cond, wrong, right)) return true;
    var branches = ['then', 'else'];
    for (var b = 0; b < branches.length; b++) {
      var arr = step[branches[b]];
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (fixStepInPlace(arr[i], wrong, right)) return true;
        }
      }
    }
    return false;
  }

  /** bughunt：返回修好 bug 后的程序副本（IR 级 wrongPiece→rightPiece），修不了返回 null。 */
  function bugFixedProgram() {
    var ui = S.ui;
    var inter = (ui && ui.variant && ui.variant.interaction) || {};
    var bug = inter.bug;
    var program = activeProgram();
    if (!bug || !program || !CppLab.IR) return null;
    var clone = deepClone(program);
    var step = clone[bug.stepIndex];
    if (!step || !fixStepInPlace(step, bug.wrongPiece, bug.rightPiece)) return null;
    return clone;
  }

  /* ---------------------------- teach-transfer ---------------------------- */

  /**
   * 教学脚本的舞台指令 → Visualizer 演出（建造遗留5）。
   * 认识的标签（feed-<入>-out-<出>）驱动函数机器动画；不认识的指令静默忽略，
   * 绝不把英文原文显示到儿童屏。
   */
  function playTeachShow(showLabel) {
    if (!S.viz) return;
    var m = /^feed-(-?\d+)-out-(-?\d+)$/.exec(showLabel);
    if (m && typeof S.viz.demoFeed === 'function') {
      try { S.viz.demoFeed(m[1], m[2]); } catch (e) { /* 演出失败不阻断教学 */ }
    }
  }

  function renderTeachTransfer(host, inter) {
    var ui = S.ui;
    var teach = inter.teach || { script: [] };
    var script = teach.script || [];
    if (ui.scriptIndex === undefined) ui.scriptIndex = 0;

    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🧑‍🏫 ' + T(teach.title || '小老师时间')));
    var box = el('div', 'teach-box');
    var stepBox = el('div', 'tb-step');
    var showBox = el('div');
    box.appendChild(stepBox);
    box.appendChild(showBox);
    card.appendChild(box);

    var nav = el('div', 'teach-nav');
    var prev = btn('⬅ 上一步', 'btn btn-sm', function () { go(-1); });
    var next = btn('下一步 ➡', 'btn btn-sm btn-accent', function () { go(+1); });
    var count = el('span', 'teach-count');
    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(count);
    card.appendChild(nav);

    var transferHost = el('div');
    transferHost.style.marginTop = '12px';
    card.appendChild(transferHost);

    function draw() {
      var i = ui.scriptIndex;
      var st = script[i];
      clearNode(showBox);
      if (st) {
        stepBox.textContent = T(st.say || '');
        // show 是舞台指令（英文标签），不给孩子看原文：认识的标签映射给 Visualizer 演出，
        // 不认识的直接不显示（建造遗留5）。
        if (st.show) playTeachShow(String(st.show));
      } else {
        stepBox.textContent = '（这一段还没有内容）';
      }
      count.textContent = (i + 1) + ' / ' + Math.max(1, script.length);
      prev.disabled = i <= 0;
      next.disabled = i >= script.length - 1 && !!ui.transferShown;
      if (i >= script.length - 1 && !ui.transferShown) {
        next.textContent = '学完了，来挑战！';
      } else {
        next.textContent = '下一步 ➡';
      }
    }

    function go(delta) {
      var i = ui.scriptIndex + delta;
      if (delta > 0 && ui.scriptIndex >= script.length - 1) {
        ui.transferShown = true;
        renderTransferQuestion(transferHost, inter.transfer || {});
        draw();
        return;
      }
      if (i < 0 || i >= script.length) return;
      ui.scriptIndex = i;
      draw();
    }

    draw();
    if (ui.transferShown) renderTransferQuestion(transferHost, inter.transfer || {});
    host.appendChild(card);
  }

  function renderTransferQuestion(hostNode, transfer) {
    var ui = S.ui;
    clearNode(hostNode);
    var box = el('div', 'predict-panel');
    box.appendChild(el('div', 'pp-q', '💪 换你试试：' + T(transfer.question || '')));
    var row = el('div', 'predict-row');

    function submit(value) {
      if (ui.completed) return;
      ui.interactionAttempts += 1;
      var right = valEq(value, transfer.correct);
      if (right) {
        completeCurrent({
          outcome: outcomeFromAttempts(ui.interactionAttempts),
          selfCorrection: ui.interactionAttempts > 1,
          transferResult: true,
          answerOrCode: String(value),
          childAction: '教学后迁移题，第 ' + ui.interactionAttempts + ' 次答对'
        });
      } else if (ui.interactionAttempts >= 2) {
        // 方案 11.3：默认不直接给答案。D9 是关键诊断位——答案一旦泄露，教师无法用同题复测；
        // 这里给近似例子式的提示，把揭示答案的时机交还给老师。
        showFeedback('warn', '这道题真不简单！', '换个想法试试：先把刚才教搭档的口诀在心里再走一遍，' +
          '用手指头指着数一步一步变。还是拿不准的话，和老师一起看看——老师会用一道很像的小题目带你走通它！', [
          { label: '和老师一起看看', primary: true, onClick: function () {
              completeCurrent({
                outcome: 1,
                transferResult: false,
                answerOrCode: String(value),
                childAction: '迁移题两次未答对，转交老师复盘（答案未向孩子展示，可同题复测）'
              });
            } }
        ]);
      } else {
        showFeedback('warn', pick(ENCOURAGES), '再试一次！回想一下刚才学的方法。', []);
      }
    }

    if (transfer.inputType === 'choice' && Array.isArray(transfer.options)) {
      transfer.options.forEach(function (opt) {
        var label = (opt && typeof opt === 'object') ? (opt.label !== undefined ? opt.label : opt.id) : opt;
        var value = (opt && typeof opt === 'object') ? (opt.id !== undefined ? opt.id : opt.label) : opt;
        row.appendChild((function () {
          var c = el('button', 'chip', T(String(label)));
          c.type = 'button';
          c.addEventListener('click', function () { submit(value); });
          return c;
        })());
      });
    } else {
      var input = el('input', 'predict-input');
      input.type = 'number';
      var ok = btn('提交答案', 'btn btn-sm btn-accent', function () {
        if (input.value === '') { input.focus(); return; }
        submit(input.value);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
      row.appendChild(input);
      row.appendChild(ok);
    }
    box.appendChild(row);
    hostNode.appendChild(box);
  }

  /* ---------------------------- explain ---------------------------- */

  function renderExplain(host, inter) {
    var ui = S.ui;
    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🗣 讲明白'));
    card.appendChild(el('p', 'activity-prompt', T(inter.prompt || '用你自己的话讲一讲吧！')));

    if (Array.isArray(inter.sentenceStarters) && inter.sentenceStarters.length) {
      var row = el('div', 'chip-row');
      inter.sentenceStarters.forEach(function (rawStarter) {
        var starter = T(rawStarter);
        var c = el('button', 'chip', starter + '…');
        c.type = 'button';
        c.addEventListener('click', function () {
          if (area.value.indexOf(starter) < 0) {
            area.value = (area.value ? area.value + '\n' : '') + starter;
          }
          area.focus();
        });
        row.appendChild(c);
      });
      card.appendChild(row);
    }

    var area = el('textarea', 'explain-area');
    area.placeholder = '可以打字，也可以直接讲给老师听～';
    area.style.marginTop = '10px';
    card.appendChild(area);
    card.appendChild(el('p', 'form-hint', '说不清楚也没关系，讲给老师听就行！'));

    var doneBtn = btn('🎤 我讲完啦', 'btn btn-accent', function () {
      if (ui.completed) return;
      var text = (area.value || '').trim();
      var minWords = inter.minWords || 0;
      if (minWords > 0 && text.length > 0 && text.length < minWords) {
        toast('再多讲一点点，把你的想法说完整～');
        return;
      }
      completeCurrent({
        outcome: 'N', // 解释质量由老师判断，不自动打分
        answerOrCode: text || '（口头向老师解释）',
        childAction: text ? '孩子用文字解释了自己的想法' : '孩子选择口头向老师解释'
      });
    });
    doneBtn.style.marginTop = '10px';
    card.appendChild(doneBtn);
    host.appendChild(card);
  }

  /* ---------------------------- build ---------------------------- */

  /** build 选项归一化：内容可给原始值（数字）或 {id,label[,effect]} 对象。 */
  function buildOptId(opt) {
    return (opt && typeof opt === 'object') ? opt.id : opt;
  }
  function buildOptLabel(opt, kind) {
    if (opt && typeof opt === 'object' && opt.label !== undefined) return String(opt.label);
    if (kind === 'skin') return skinDisplayName(String(opt));
    return String(opt);
  }

  /** 把孩子的 build 选择合成 IR 程序：declare 初始能量 + 每事件一行 assign + 末尾 output。 */
  function buildComposeProgram(pick) {
    if (pick.initialEnergy === null || pick.initialEnergy === undefined) return null;
    var steps = [{ op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: Number(pick.initialEnergy) } }];
    pick.events.forEach(function (ev) {
      var eff = ev && ev.effect;
      if (!eff || ['+', '-', '*'].indexOf(eff.op) < 0) return;
      steps.push({
        op: 'assign', name: 'energy',
        expr: { kind: 'bin', op: eff.op, left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: Number(eff.amount) } }
      });
    });
    steps.push({ op: 'output', expr: { kind: 'var', name: 'energy' } });
    return steps;
  }

  function renderBuild(host, inter) {
    var ui = S.ui;
    inter = inter || {};
    var choices = inter.choices || {};
    if (!ui.buildPick) ui.buildPick = { skin: null, initialEnergy: null, events: [] };

    var card = el('div', 'panel');
    card.appendChild(el('div', 'panel-title', '🎨 我的创作'));
    card.appendChild(el('p', 'activity-prompt', '把下面的零件组合起来，做出属于你的作品，然后保存成作品卡！'));

    function group(titleText, options, kind) {
      if (!Array.isArray(options) || !options.length) return;
      var g = el('div', 'build-group');
      g.appendChild(el('div', 'bg-title', titleText));
      var row = el('div', 'chip-row');
      options.forEach(function (opt) {
        var c = el('button', 'chip', T(buildOptLabel(opt, kind)));
        c.type = 'button';
        c.addEventListener('click', function () {
          if (kind === 'events') {
            var idx = ui.buildPick.events.indexOf(opt);
            if (idx >= 0) ui.buildPick.events.splice(idx, 1);
            else ui.buildPick.events.push(opt);
            c.classList.toggle('selected');
            refreshPreview();
          } else {
            ui.buildPick[kind] = (kind === 'initialEnergy') ? Number(buildOptId(opt)) : buildOptId(opt);
            var all = row.querySelectorAll('.chip');
            for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
            c.classList.add('selected');
            // 实时预览
            if (S.viz) {
              try {
                if (kind === 'skin') S.viz.setSkin(String(ui.buildPick.skin));
                if (kind === 'initialEnergy') S.viz.setEnergy(Number(ui.buildPick.initialEnergy));
              } catch (e) { /* 忽略 */ }
            }
            refreshPreview();
          }
        });
        row.appendChild(c);
      });
      g.appendChild(row);
      card.appendChild(g);
    }

    group(T('选一个机器人伙伴'), choices.skin, 'skin');
    group('选择出发能量', choices.initialEnergy, 'initialEnergy');
    group('挑选故事事件（可以多选）', choices.events, 'events');

    // 方案 7.7：作品卡要有「一句自己的解释」——可打字，也可口头说、请老师代填
    var expGroup = el('div', 'build-group');
    expGroup.appendChild(el('div', 'bg-title', '我的一句话解释（会印在作品卡上）'));
    var expInput = el('input', 'text-input');
    expInput.type = 'text';
    expInput.maxLength = 60;
    expInput.placeholder = '比如：能量先加 4 再减 1，最后是 6。也可以说给老师听，请老师帮你打字～';
    if (ui.buildExplain) expInput.value = ui.buildExplain;
    expInput.addEventListener('input', function () { ui.buildExplain = expInput.value; });
    expGroup.appendChild(expInput);
    card.appendChild(expGroup);

    // 故事预览：选择合成 IR 程序，本地跑一遍给孩子看结局能量
    var preview = el('div', 'build-preview form-hint');
    preview.style.marginTop = '10px';
    card.appendChild(preview);
    // 「变成的代码」只读预演区（建造遗留6）：让孩子看到每个选择长成一行 C++
    var codePreview = el('div', 'build-code-preview');
    codePreview.style.marginTop = '10px';
    card.appendChild(codePreview);
    function refreshPreview() {
      clearNode(preview);
      clearNode(codePreview);
      updateVerifyState();
      var prog = buildComposeProgram(ui.buildPick);
      if (!prog || !CppLab.IR) return;
      var exec = CppLab.IR.execute(prog);
      if (exec.error) {
        preview.appendChild(document.createTextNode(T('这个组合让机器人卡住了：') + exec.error));
      } else {
        preview.appendChild(document.createTextNode(T('📖 故事预演：机器人最后的能量是 ' + String(exec.finalVars.energy) + ' 格。')));
      }
      try {
        var focus = CppLab.IR.toFocusCpp(prog);
        codePreview.appendChild(el('div', 'bg-title', '👀 变成的代码：你按的每个按钮都长成了一行 C++'));
        codePreview.appendChild(buildCodeView(focus.split('\n'), null, {}));
      } catch (e) { /* 代码预览失败不阻断创作 */ }
    }
    /** 「用真实C++验证」在拼出有效程序前禁用（codex-UI P1-1）。 */
    function updateVerifyState() {
      if (!verify) return;
      var ready = !!(buildComposeProgram(ui.buildPick) && CppLab.IR && CppLab.Compiler);
      verify.disabled = !ready || !!ui.verifyBusy;
      verify.title = ready
        ? '把你的作品寄给真正的 C++ 编译器运行一遍'
        : '先选好出发能量、拼出你的故事，才能请真编译器来验证';
      if (verifyHint) verifyHint.style.display = ready ? 'none' : '';
    }

    var saveRow = el('div');
    saveRow.style.marginTop = '14px';

    function currentCardData(verified) {
      var s = session();
      var prog = buildComposeProgram(ui.buildPick);
      var exec = null;
      if (prog && CppLab.IR) {
        try { exec = CppLab.IR.execute(prog); } catch (e) { exec = null; }
      }
      var finalEnergy = (exec && !exec.error && exec.finalVars &&
        typeof exec.finalVars.energy === 'number') ? exec.finalVars.energy : null;
      return {
        title: (s.nickname || '我') + ' 的作品',
        skin: ui.buildPick.skin || s.robotSkin,
        initialEnergy: ui.buildPick.initialEnergy,
        events: ui.buildPick.events.map(function (ev) { return buildOptLabel(ev, 'events'); }),
        finalEnergy: finalEnergy,                        // 方案 7.7：最终结果
        explanation: (ui.buildExplain || '').trim(),     // 方案 7.7：一句自己的解释
        focusCode: (prog && CppLab.IR) ? CppLab.IR.toFocusCpp(prog) : '',
        verified: !!verified,
        savedAt: new Date().toISOString()
      };
    }

    function saveCard(verified) {
      var cardData = currentCardData(verified);
      var lessonId = S.lessonId;
      Sto().update(function (ss) {
        ss.lessons = ss.lessons || {};
        ss.lessons[lessonId] = ss.lessons[lessonId] || { completed: false, activityStates: {} };
        ss.lessons[lessonId].artifactCard = cardData;
        // 承接权威第一优先（方案 §8.2）：作品卡的最终能量写入 lesson1.finalEnergy
        if (lessonId === 'lesson1' && typeof cardData.finalEnergy === 'number') {
          ss.lessons[lessonId].finalEnergy = cardData.finalEnergy;
        }
      });
      return cardData;
    }

    var save = btn('💾 保存我的作品卡', 'btn btn-primary', function () {
      var p = ui.buildPick;
      if (Array.isArray(choices.skin) && choices.skin.length && !p.skin) { toast(T('先选一个机器人伙伴')); return; }
      if (Array.isArray(choices.initialEnergy) && choices.initialEnergy.length && p.initialEnergy === null) { toast('再选一个出发能量'); return; }
      var cardData = saveCard(false);
      if (ui.completed) { toast('作品卡更新好啦！'); return; }
      completeCurrent({
        outcome: 2,
        answerOrCode: JSON.stringify(cardData),
        childAction: '完成创作并保存作品卡'
      });
    });
    saveRow.appendChild(save);

    // 真实 C++ 验证：合成程序送真实编译，成功才打「已通过真实 C++ 验证」标记。
    // 拼出有效程序前保持禁用（codex-UI P1-1），禁用原因见按钮 title 与下方小字。
    var verify = btn('🧪 用真实C++验证我的故事', 'btn', function () {
      var prog = buildComposeProgram(ui.buildPick);
      if (!prog || !CppLab.IR || !CppLab.Compiler) { toast('先把作品拼完整（要选出发能量哦）'); return; }
      var localOut = CppLab.IR.execute(prog).stdout;
      verify.disabled = true;
      verify.textContent = '⏳ 验证中…';
      CppLab.Compiler.compile({
        activityId: ui.activity.id,
        source: CppLab.IR.toFullCpp(prog),
        stdin: '',
        mode: 'verify',
        program: prog
      }).then(function (res) {
        verify.textContent = '🧪 用真实C++验证我的故事';
        updateVerifyState();
        if (res && res.real === true && res.status === 'ok' && res.stdout === localOut) {
          saveCard(true);
          showFeedback('ok', '真实C++编译通过！', '作品卡打上了「已通过真实 C++ 验证」的印章！', []);
        } else if (res && res.real === true) {
          showFeedback('warn', '编译器有话要说', '真实编译结果和预演不太一样，叫老师一起来看看。', []);
        } else {
          showFeedback('warn', '概念演示', '⚠️ 概念演示——真实编译暂不可用。作品卡先不打验证印章。', []);
        }
      });
    });
    verify.style.marginLeft = '8px';
    saveRow.appendChild(verify);

    card.appendChild(saveRow);
    var verifyHint = el('p', 'form-hint', '💡 「真实验证」按钮要等你选好出发能量、拼出作品后才会亮起来。');
    verifyHint.style.marginTop = '6px';
    card.appendChild(verifyHint);
    host.appendChild(card);
    refreshPreview();
  }

  /* ======================================================================
   * trace 检查点
   * ==================================================================== */

  function renderCheckpointCard() {
    var ui = S.ui;
    var host = document.getElementById('cp-host');
    if (!host || !ui.pendingCp) return;
    clearNode(host);
    var cp = ui.pendingCp.cp;
    var idx = ui.pendingCp.index;

    var box = el('div', 'predict-panel');
    box.style.marginTop = '12px';
    box.appendChild(el('div', 'pp-q', '🔍 侦探提问：' + T(cp.question || '')));
    var row = el('div', 'predict-row');
    var fbRow = el('div');

    function answer(value) {
      var right = valEq(value, cp.correct);
      ui.cpResults[idx] = { answered: true, correct: right };
      ui.pendingCp = null;
      clearNode(fbRow);
      fbRow.appendChild(el('div', right ? 'predict-done' : 'bug-note',
        right ? '答对了！' + pick(PRAISES) : '正确答案是 ' + String(cp.correct) + '，看看时间线想想为什么～'));
      var chips = row.querySelectorAll('.chip, .btn, input');
      for (var i = 0; i < chips.length; i++) chips[i].disabled = true;
      refreshButtons();

      // 同一步可挂多个检查点（如 lesson1-03-A 的 afterStep:2 双问）：答完接着问下一个
      var cps = (ui.variant.interaction && ui.variant.interaction.checkpoints) || [];
      for (var j = 0; j < cps.length; j++) {
        if (cps[j].afterStep === cp.afterStep && !ui.cpResults[j]) {
          ui.pendingCp = { index: j, cp: cps[j] };
          setTimeout(function () { renderCheckpointCard(); }, 1100);
          return;
        }
      }

      // 若已走到末尾且全部检查点回答完，收尾
      if (ui.runFinished) maybeFinishTrace();
      setTimeout(function () {
        var h = document.getElementById('cp-host');
        if (h && !ui.pendingCp) clearNode(h);
      }, 2600);
    }

    if (cp.inputType === 'choice' && Array.isArray(cp.options)) {
      cp.options.forEach(function (opt) {
        var label = (opt && typeof opt === 'object') ? (opt.label !== undefined ? opt.label : opt.id) : opt;
        var value = (opt && typeof opt === 'object') ? (opt.id !== undefined ? opt.id : opt.label) : opt;
        var c = el('button', 'chip', T(String(label)));
        c.type = 'button';
        c.addEventListener('click', function () { answer(value); });
        row.appendChild(c);
      });
    } else {
      var input = el('input', 'predict-input');
      input.type = 'number';
      var ok = btn('回答', 'btn btn-sm btn-accent', function () {
        if (input.value === '') { input.focus(); return; }
        answer(input.value);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
      row.appendChild(input);
      row.appendChild(ok);
    }
    box.appendChild(row);
    box.appendChild(fbRow);
    host.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function maybeFinishTrace() {
    var ui = S.ui;
    if (ui.completed || ui.pendingCp) { refreshButtons(); return; }
    if (!ui.runFinished) { refreshButtons(); return; }
    var cps = (ui.variant.interaction && ui.variant.interaction.checkpoints) || [];
    var answered = 0, correct = 0;
    for (var i = 0; i < cps.length; i++) {
      if (ui.cpResults[i] && ui.cpResults[i].answered) {
        answered++;
        if (ui.cpResults[i].correct) correct++;
      }
    }
    if (cps.length && answered < cps.length) {
      // 有检查点没触发（内容 afterStep 配置越界等）：不卡孩子，按已答的算
      answered = cps.length;
    }
    var ratio = cps.length ? (correct / cps.length) : 1;
    // 自动评分封顶 2：检查点全对=新题独立完成(2)；3 级只能由教师基于解释/迁移升级
    var outcome = ratio >= 0.999 ? 2 : 1;
    completeCurrent({
      outcome: outcome,
      answerOrCode: '检查点答对 ' + correct + '/' + cps.length,
      childAction: '逐步追踪并回答检查点提问'
    });
  }

  /* ======================================================================
   * 代码台（blocks / focus / full / free + 透视）
   * ==================================================================== */

  function renderCodePanel(hostPanel) {
    var ui = S.ui;
    clearNode(hostPanel);
    var program = activeProgram();

    hostPanel.appendChild(el('div', 'panel-title', '⌨️ 代码台'));

    var modes = allowedCodeModes();
    if (ui.type === 'freeEdit') modes = ['free'];
    // 只保留本活动真正可用的模式（free 模式需要 program 或本身是自由编辑活动）
    modes = modes.filter(function (m) {
      if (m === 'free' && ui.type !== 'freeEdit' && !program) return false;
      return true;
    });
    if (modes.indexOf(ui.codeMode) < 0 && modes.length) ui.codeMode = modes[0];

    var MODE_LABEL = { blocks: '图块', focus: '聚焦代码', full: '完整程序', free: '自由编辑' };

    // 模式 tabs：只有一种可用时不显示 tabs 只显示内容（§13-2）；「查看完整程序」保留
    var peek = null;
    if (program && CppLab.IR) {
      peek = btn('🔭 查看完整程序', 'btn btn-sm btn-ghost code-peek', function () {
        openModal('完整的 C++ 程序', function (body) {
          body.appendChild(el('p', 'form-hint', T('这就是机器人真正读的完整程序。现在看不懂也没关系，我们在一格一格点亮它！')));
          var full = CppLab.IR.toFullCpp(program);
          // bughunt：修好之前透视的也是带 bug 版——提前展示修好行会泄露答案
          if (ui.type === 'bughunt' && ui.bugFixed) full = bugFixedSource(full);
          body.appendChild(buildCodeView(full.split('\n'), null, {}));
        });
      });
    }
    if (modes.length > 1 || peek) {
      var tabs = el('div', 'code-tabs');
      if (modes.length > 1) {
        modes.forEach(function (m) {
          var t = el('button', 'code-tab' + (ui.codeMode === m ? ' active' : ''), MODE_LABEL[m]);
          t.type = 'button';
          t.addEventListener('click', function () {
            ui.codeMode = m;
            renderCodePanel(hostPanel);
            renderButtonBar();   // free 模式开/关会影响「真实C++验证」按钮的渲染
            refreshButtons();
          });
          tabs.appendChild(t);
        });
      }
      if (peek) tabs.appendChild(peek);
      hostPanel.appendChild(tabs);
    }

    var body = el('div');
    hostPanel.appendChild(body);

    if (ui.codeMode === 'free' || ui.type === 'freeEdit') {
      renderFreeArea(body);
      return;
    }
    if (!program || !program.length) {
      body.appendChild(el('p', 'form-hint', '这个任务不需要看代码，专心完成上面的挑战吧！'));
      return;
    }
    if (ui.codeMode === 'blocks') {
      body.appendChild(buildBlocksView(program));
      return;
    }
    var focus = CppLab.IR.toFocusCpp(program);
    if (ui.codeMode === 'focus') {
      var focusLines = focus.split('\n');
      if (ui.type === 'bughunt' && ui.bugFixed) {
        focusLines = bugFixedSource(focus).split('\n');
      }
      body.appendChild(buildCodeView(focusLines, ui.currentLine, {
        clickable: ui.type === 'bughunt' && !ui.bugFixed,
        onLineClick: onBugLineClick,
        fixedLine: (ui.type === 'bughunt' && ui.bugFixed) ? ui.bugFoundLine : null
      }));
      return;
    }
    if (ui.codeMode === 'full') {
      var full = CppLab.IR.toFullCpp(program);
      if (ui.type === 'bughunt' && ui.bugFixed) full = bugFixedSource(full);
      var fullLines = full.split('\n');
      var offset = fullLineOffset(fullLines, focus.split('\n'));
      var cur = (typeof ui.currentLine === 'number') ? ui.currentLine + offset : null;
      body.appendChild(buildCodeView(fullLines, cur, {}));
    }
  }

  function fullLineOffset(fullLines, focusLines) {
    if (!focusLines.length) return 0;
    var first = focusLines[0].trim();
    for (var i = 0; i < fullLines.length; i++) {
      if (fullLines[i].trim() === first) return i; // 聚焦第 1 行 ↔ 完整第 i+1 行
    }
    return 0;
  }

  /**
   * 把一行代码切词，给认识的标识符加中文释义（CONTRACT §13）：
   * 桌面悬停 title + 触屏点按弹 toast 小气泡（建造遗留8）。
   */
  function buildCodeLineContent(lineText) {
    var frag = document.createDocumentFragment();
    var parts = String(lineText).split(/([A-Za-z_][A-Za-z0-9_]*)/);
    parts.forEach(function (p) {
      if (!p) return;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && GLOSSARY[p]) {
        var span = el('span', 'cpp-id', p);
        span.title = p + ' = ' + GLOSSARY[p];
        span.addEventListener('click', function () {
          // 抓虫模式下整行可点（选可疑行是主动作），不抢走点击语义
          if (span.closest && span.closest('.code-line.clickable')) return;
          toast(p + ' 的意思是「' + GLOSSARY[p] + '」');
        });
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(p));
      }
    });
    return frag;
  }

  function buildCodeView(lines, currentLine, opts) {
    var box = el('div', 'codeview');
    box.setAttribute('data-code-view', '1');
    lines.forEach(function (text, i) {
      var lineNo = i + 1;
      var line = el('div', 'code-line');
      line.setAttribute('data-line', String(lineNo));
      if (currentLine === lineNo) line.classList.add('current');
      if (opts.fixedLine === lineNo) line.classList.add('bug-fixed');
      var ln = el('span', 'ln', String(lineNo));
      line.appendChild(ln);
      var code = el('span');
      code.appendChild(buildCodeLineContent(text));
      line.appendChild(code);
      if (opts.clickable) {
        line.classList.add('clickable');
        line.title = '觉得这一行可疑？点它！';
        line.addEventListener('click', function () { opts.onLineClick(lineNo); });
      }
      box.appendChild(line);
    });
    return box;
  }

  /* ---- 图块视图：IR step -> 图块，行号与聚焦代码布局对齐 ---- */

  function exprText(expr) {
    try { return CppLab.IR.exprToCpp(expr); } catch (e) { return '…'; }
  }

  function buildBlocksView(program) {
    var wrap = el('div', 'blocks-view');
    wrap.setAttribute('data-blocks-view', '1');
    var counter = { line: 1 };
    appendBlocks(wrap, program, counter);
    // 顶层行号用 IR.getLineMap 校准（嵌套行号为本地推算，best-effort）
    try {
      var map = CppLab.IR.getLineMap(program) || {};
      for (var k in map) {
        // 顶层第 k 步对应 map[k] 行 —— 已按同一布局推算，通常一致；不一致以 IR 为准
        var blocks = wrap.querySelectorAll('[data-top-step="' + k + '"]');
        if (blocks.length) blocks[0].setAttribute('data-line', String(map[k]));
      }
    } catch (e) { /* 忽略 */ }
    return wrap;
  }

  function appendBlocks(container, steps, counter, isTop) {
    if (isTop === undefined) isTop = true;
    steps.forEach(function (step, idx) {
      if (!step) return;
      if (step.op === 'declare') {
        addBlock(container, 'block-declare', '📦',
          '新建盒子 ' + step.name + '，放进 ' + exprText(step.expr),
          counter.line, isTop ? idx : null);
        counter.line += 1;
      } else if (step.op === 'assign') {
        addBlock(container, 'block-assign', '✏️',
          '把 ' + step.name + ' 更新成 ' + exprText(step.expr),
          counter.line, isTop ? idx : null);
        counter.line += 1;
      } else if (step.op === 'output') {
        addBlock(container, 'block-output', '📢',
          '大声报告：' + exprText(step.expr),
          counter.line, isTop ? idx : null);
        counter.line += 1;
      } else if (step.op === 'if') {
        addBlock(container, 'block-if', '🚦',
          '如果 ' + exprText(step.cond) + ' 是真的……',
          counter.line, isTop ? idx : null);
        counter.line += 1; // "if (...) {"
        var thenNest = el('div', 'block-nest');
        appendBlocks(thenNest, step.then || [], counter, false);
        container.appendChild(thenNest);
        if (step.else && step.else.length) {
          container.appendChild(el('div', 'block-branch-label', '不然的话……'));
          counter.line += 1; // "} else {"
          var elseNest = el('div', 'block-nest');
          appendBlocks(elseNest, step.else, counter, false);
          container.appendChild(elseNest);
        }
        counter.line += 1; // "}"
      }
    });
  }

  function addBlock(container, cls, icon, text, lineNo, topStepIndex) {
    var b = el('div', 'block ' + cls);
    b.setAttribute('data-line', String(lineNo));
    if (topStepIndex !== null && topStepIndex !== undefined) {
      b.setAttribute('data-top-step', String(topStepIndex));
    }
    b.appendChild(el('span', 'blk-icon', icon));
    b.appendChild(el('span', null, text));
    container.appendChild(b);
  }

  function setCurrentLine(lineNo) {
    if (S.ui) S.ui.currentLine = lineNo;
    var codeHost = document.getElementById('code-host');
    if (!codeHost) return;
    // 代码行视图
    var views = codeHost.querySelectorAll('[data-code-view] .code-line, [data-blocks-view] .block');
    var mode = S.ui ? S.ui.codeMode : 'focus';
    var target = lineNo;
    if (mode === 'full' && typeof lineNo === 'number' && S.ui) {
      var program = activeProgram();
      if (program && CppLab.IR) {
        try {
          var focusLines = CppLab.IR.toFocusCpp(program).split('\n');
          var fullLines = CppLab.IR.toFullCpp(program).split('\n');
          target = lineNo + fullLineOffset(fullLines, focusLines);
        } catch (e) { /* 忽略 */ }
      }
    }
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      var isCur = (target !== null) && v.getAttribute('data-line') === String(target);
      v.classList.toggle('current', isCur);
    }
  }

  /* ---- 自由编辑 ---- */

  function renderFreeArea(body) {
    var ui = S.ui;
    var inter = (ui.variant && ui.variant.interaction) || {};
    var badgeRow = el('div');
    badgeRow.style.marginBottom = '8px';
    var badge = el('span', 'console-badge', '控制台模式');
    badge.title = '自由写的代码由真正的 C++ 编译器运行，左边的画面不会跟着动';
    badgeRow.appendChild(badge);
    body.appendChild(badgeRow);

    var area = el('textarea', 'free-area');
    area.id = 'free-code-area';
    area.spellcheck = false;
    if (ui.freeCode !== undefined) {
      area.value = ui.freeCode;
    } else if (inter.starterCode) {
      area.value = inter.starterCode;
    } else if (ui.type !== 'freeEdit' && activeProgram() && CppLab.IR) {
      try { area.value = CppLab.IR.toFullCpp(activeProgram()); } catch (e) { area.value = ''; }
    }
    area.addEventListener('input', function () { ui.freeCode = area.value; });
    body.appendChild(area);
    body.appendChild(el('p', 'form-hint', '写好后按下面的「真实C++验证」，让真正的编译器来运行你的代码！'));
  }

  /* ======================================================================
   * 真实 C++ 验证
   * ==================================================================== */

  function verifySource() {
    var ui = S.ui;
    if (ui.type === 'freeEdit' || ui.codeMode === 'free') {
      var area = document.getElementById('free-code-area');
      return area ? area.value : (ui.freeCode || '');
    }
    var program = activeProgram();
    if (!program || !CppLab.IR) return null;
    var full = CppLab.IR.toFullCpp(program);
    // 修好之后才编译修好版；修好之前验证的就是带 bug 版（与屏幕模拟一致，不提前泄露答案）
    if (ui.type === 'bughunt' && ui.bugFixed) full = bugFixedSource(full);
    return full;
  }

  function doVerify() {
    var ui = S.ui;
    if (!ui) return;
    if (!CppLab.Compiler || typeof CppLab.Compiler.compile !== 'function') {
      toast('验证模块没有加载好，请找老师看看');
      return;
    }
    if (ui.verifyBusy) return;
    // freeEdit 完成判定约定：有 prediction 必须先提交预测才允许发起真实验证（P0-1）
    if (ui.type === 'freeEdit' && effPrediction() && !ui.predicted) {
      focusPredict();
      toast('先把上面的预测填好，再请真编译器出场！');
      return;
    }
    var source = verifySource();
    if (!source || !source.trim()) { toast('还没有可以验证的代码哦'); return; }

    var isFree = (ui.type === 'freeEdit' || ui.codeMode === 'free');
    ui.verifyBusy = true;
    ui.verifyAttempts += 1;
    if (S.dom.bVerify) S.dom.bVerify.textContent = '⏳ 验证中…';
    refreshButtons();

    var crHost = document.getElementById('compile-area');
    if (crHost) {
      clearNode(crHost);
      var waiting = el('div', 'feedback-card fb-warn');
      waiting.appendChild(el('div', 'fb-title', '📡 正在请真正的 C++ 编译器帮忙……'));
      waiting.appendChild(el('p', null, '稍等几秒钟，它在认真读你的代码。'));
      crHost.appendChild(waiting);
    }

    var req = {
      activityId: ui.activity.id,
      source: source,
      stdin: '',
      mode: isFree ? 'free' : 'verify'
    };
    if (!isFree && activeProgram()) req.program = activeProgram();

    CppLab.Compiler.compile(req).then(function (res) {
      ui.verifyBusy = false;
      if (S.dom.bVerify) S.dom.bVerify.textContent = '🧪 真实C++验证';
      // 教师端可观测性：最近一次真实验证的状态与降级原因写入 session（教师端展示）
      try {
        Sto().update(function (ss) {
          ss.lastCompile = {
            at: new Date().toISOString(),
            activityId: ui.activity.id,
            status: res.status,
            real: !!res.real,
            compilerVersion: res.compilerVersion || '',
            remoteError: res.remoteError || null
          };
        });
      } catch (e) { /* 记录失败不影响孩子端流程 */ }
      renderCompileResult(res, isFree);
      refreshButtons();
    }, function () {
      // 契约上 compile 永远 resolve；这里只是最后一道保险
      ui.verifyBusy = false;
      if (S.dom.bVerify) S.dom.bVerify.textContent = '🧪 真实C++验证';
      renderCompileResult({ status: 'offline', real: false }, isFree);
      refreshButtons();
    });
  }

  function renderCompileResult(res, isFree) {
    var ui = S.ui;
    var host = document.getElementById('compile-area');
    if (!host) return;
    clearNode(host);
    res = res || { status: 'offline', real: false };

    var card;
    if (res.real === true && res.status === 'ok') {
      // 唯一允许的"真实成功"（红线 §14.1：real:true 只来自远程真实编译）
      card = el('div', 'feedback-card fb-ok');
      card.appendChild(el('div', 'fb-title', '✅ 真实C++编译通过！'));
      card.appendChild(el('p', null, '真正的 C++ 编译器读懂了这段代码，还运行了它。电脑的回答是：'));
      card.appendChild(el('div', 'cr-stdout', (res.stdout === '' || res.stdout == null) ? '（这次没有输出）' : res.stdout));
      // 比对基准 = 「这次真正送去编译的程序」的本地模拟输出（§12.2 概念模拟与真实编译一致）。
      // bughunt 修好后比对修好版（内容里的 expectedStdout 也是修好版输出）；slots 比对孩子
      // 当前 workProgram；本地重算不了才退回内容配置的 expectedStdout。
      var expected = null;
      if (!isFree) {
        var simProg = (ui.type === 'bughunt' && ui.bugFixed) ? bugFixedProgram() : activeProgram();
        if (simProg && CppLab.IR) {
          try {
            var sim = CppLab.IR.execute(simProg);
            if (!sim.error) expected = sim.stdout;
          } catch (e) { /* 忽略，走兜底 */ }
        }
        if (expected == null && !(ui.type === 'bughunt' && ui.bugFixed)) {
          var cc = ui.activity.compilerCheck;
          if (cc && cc.expectedStdout) expected = cc.expectedStdout;
        }
      }
      if (!isFree && expected !== undefined && expected !== null && expected !== '') {
        if (res.stdout === expected) {
          card.appendChild(el('p', null, (ui.type === 'bughunt' && ui.bugFixed)
            ? '🎯 和修好之后我们预想的结果一模一样！这只 bug 真的被你修好了。'
            : '🎯 和我们在屏幕上演的一模一样！模拟和真实世界对上了。'));
        } else {
          card.appendChild(el('p', null, '🤨 咦，和我们预想的结果有点不一样，叫老师一起来看看吧。'));
        }
      }
      if (res.compilerVersion) {
        card.appendChild(el('div', 'cr-meta', '编译器：' + res.compilerVersion + (res.elapsedMs ? ' · 用时 ' + Math.round(res.elapsedMs) + ' 毫秒' : '')));
      }
      // 方案 8.4：door 模型活动的舱门动画由真实输出驱动一次（真实编译成功时）。
      // OPEN/门开 → 开门；CHARGE/还是关 → 保持关门充电。旁白点明这是真实编译结果。
      if (!isFree && S.viz && ui.activity.visualModel === 'door' && typeof res.stdout === 'string') {
        var realOut = res.stdout.trim();
        var doorOpen = /OPEN|门开/.test(realOut) ? true : (/CHARGE|还是关|门没开/.test(realOut) ? false : null);
        if (doorOpen !== null) {
          try {
            S.viz.setDoor(doorOpen);
            if (typeof S.viz.setCaption === 'function') {
              S.viz.setCaption(T('这一下是真实编译结果驱动的：真正的 C++ 说「' + realOut + '」，所以舱门' +
                (doorOpen ? '打开了！' : '保持关闭，继续充电。')));
            }
          } catch (e) { /* 可视化驱动失败不阻断结果展示 */ }
        }
      }
      if (ui.type === 'freeEdit' && !ui.completed) {
        // 完成判定（跨文件约定 1）：有 prediction 必须已提交预测；内容配置了
        // interaction.expectedStdout 时，真实 stdout.trim() 必须与之一致才算过关；
        // 不匹配只展示输出并提示再试，绝不自动 completeCurrent。
        var fInter = (ui.variant && ui.variant.interaction) || {};
        var fExpected = (fInter.expectedStdout !== undefined && fInter.expectedStdout !== null)
          ? String(fInter.expectedStdout) : null;
        var fPredOk = !effPrediction() || ui.predicted;
        var fOutOk = (fExpected === null) ||
          (String(res.stdout == null ? '' : res.stdout).trim() === fExpected);
        if (!fPredOk) {
          card.appendChild(el('p', null, '🤔 编译通过了，但先回到上面把预测填好——猜完再验证才算完整过关！'));
        } else if (!fOutOk) {
          card.appendChild(el('p', null, '🤔 真编译器运行成功了，但它说的话和任务目标还不一样。对照上面的任务目标，再改改代码，改好再验证一次！'));
        } else {
          completeCurrent({
            outcome: outcomeFromAttempts(ui.verifyAttempts),
            selfCorrection: ui.verifyAttempts > 1,
            answerOrCode: verifySource() || '',
            childAction: '自由编辑代码，第 ' + ui.verifyAttempts + ' 次真实编译通过' +
              (fExpected !== null ? '且输出与目标一致' : '')
          });
        }
      }
    } else if (res.real === true && (res.status === 'compile_error' || res.status === 'runtime_error' || res.status === 'timeout')) {
      card = el('div', 'feedback-card fb-warn');
      var titleMap = {
        compile_error: '🔧 编译器发现了几个小问题',
        runtime_error: '🌀 程序跑起来后遇到了麻烦',
        timeout: '⏰ 程序跑了太久，被裁判叫停了'
      };
      card.appendChild(el('div', 'fb-title', titleMap[res.status] || '🔧 编译器有话要说'));
      card.appendChild(el('p', null, '别担心，出错是工程师每天都会遇到的事。一条一条来看：'));
      var errs = Array.isArray(res.friendlyErrors) ? res.friendlyErrors : [];
      if (errs.length) {
        errs.forEach(function (fe) {
          var box = el('div', 'friendly-err');
          box.appendChild(el('div', 'fe-msg', fe.message || '有一个小问题'));
          if (fe.hint) box.appendChild(el('div', 'fe-hint', '💡 ' + fe.hint));
          if (typeof fe.line === 'number') box.appendChild(el('div', 'fe-hint', '（大概在完整程序的第 ' + fe.line + ' 行附近，可以点「🔭 查看完整程序」找找看）'));
          host.appendChild(box);
        });
      } else {
        card.appendChild(el('p', null, '编译器说了一些悄悄话，让老师帮你翻译一下吧。'));
      }
      if (res.stdout) {
        card.appendChild(el('p', null, '在停下来之前，它说了：'));
        card.appendChild(el('div', 'cr-stdout', res.stdout));
      }
    } else {
      // real:false / offline / mock —— 一律「概念演示」标记，绝无假成功（红线 §14.1）
      card = el('div', 'feedback-card fb-warn');
      card.appendChild(el('div', 'fb-title', '⚠️ 概念演示——真实编译暂不可用'));
      if (res.status === 'ok') {
        card.appendChild(el('p', null, '现在连不上真正的 C++ 编译器，下面是屏幕上模拟出来的结果，等网络好了再来真实验证一次！'));
        card.appendChild(el('div', 'cr-stdout', (res.stdout === '' || res.stdout == null) ? '（这次没有输出）' : res.stdout));
      } else {
        card.appendChild(el('p', null, '现在连不上真正的 C++ 编译器。屏幕上的演示照常玩，等网络好了再来验证！'));
      }
      // freeEdit 离线通道（跨文件约定 2）：远程编译不可用时走教师人工确认完成；
      // 作品/结果绝不打真实验证标记（红线 §14.1 不变）。
      if (ui.type === 'freeEdit' && !ui.completed) {
        card.appendChild(el('p', null, '📴 现在没网，真实编译用不了。请老师看过你的代码后确认。'));
        card.appendChild(btn('👩‍🏫 老师确认完成', 'btn btn-sm', function () {
          if (ui.completed) return;
          completeCurrent({
            outcome: 'N', // 离线无法自动判定，完成度由教师在证据流里补记
            answerOrCode: verifySource() || '',
            childAction: '离线-教师人工确认'
          });
        }));
      }
    }
    host.insertBefore(card, host.firstChild);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ======================================================================
   * 求提示
   * ==================================================================== */

  function renderHintPanel() {
    var d = S.dom;
    var ui = S.ui;
    if (!d.hintList || !d.hintPanel) return;
    clearNode(d.hintList);
    var used = (CppLab.Hints && typeof CppLab.Hints.getUsed === 'function' && ui)
      ? CppLab.Hints.getUsed(ui.activity.id) : [];

    // §13-2：没有提示入口且没领过提示 → 整个面板不出现
    var show = !!ui && (hintEntryAvailable() || used.length > 0);
    d.hintPanel.style.display = show ? '' : 'none';
    if (!show) { refreshLensChrome(); return; }

    // 默认折叠成小按钮；领到内容或孩子点开后展开
    var expanded = !!(ui.hintExpanded || used.length);
    d.hintPanel.classList.toggle('hint-collapsed', !expanded);
    if (d.hintToggle) d.hintToggle.textContent = expanded ? '💡 我的提示' : '💡 提示';
    if (!expanded) { refreshLensChrome(); return; }

    if (!used.length) {
      d.hintList.appendChild(el('div', 'hint-note', '卡住就按「求提示」'));
      refreshLensChrome();
      return;
    }
    // 重新展示已领过的提示文本（按阶梯顺序）
    var ladder = (ui.activity && ui.activity.hintLadder) || [];
    var n = 0;
    ladder.forEach(function (h) {
      if (used.indexOf(h.level) >= 0) {
        n += 1;
        var item = el('div', 'hint-item');
        item.appendChild(el('span', 'hi-tag', '小提示 ' + n));
        item.appendChild(document.createTextNode(T(h.text || '')));
        d.hintList.appendChild(item);
      }
    });
    refreshLensChrome();
  }

  /** 状态提示条（锁定/用完等）只保留一条：追加前先清掉旧的同类 .hint-note，防止反复点出重复条。 */
  function replaceHintNote(text) {
    var d = S.dom;
    if (!d.hintList) return;
    var olds = d.hintList.querySelectorAll('.hint-note');
    for (var i = 0; i < olds.length; i++) {
      if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    }
    d.hintList.appendChild(el('div', 'hint-note', text));
  }

  function doHint() {
    var ui = S.ui;
    if (!ui) return;
    if (!CppLab.Hints || typeof CppLab.Hints.next !== 'function') {
      toast('提示模块没有加载好'); return;
    }
    var res = CppLab.Hints.next(ui.activity.id, ui.activity);
    var d = S.dom;

    if (res && res.level) {
      ui.hintExpanded = true;      // 有内容才展开（§13-2）
      renderHintPanel();
      toast('新提示放到「我的提示」里啦');
      return;
    }
    ui.hintExpanded = true;
    renderHintPanel();
    if (res && res.aiDisabled) {
      clearNode(d.hintList);
      d.hintList.appendChild(el('div', 'hint-note', res.text || '现在的提示由老师亲自来给，举手问问老师吧！'));
      return;
    }
    if (res && res.locked) {
      replaceHintNote('更大的提示需要老师帮忙解锁，举手叫老师来吧！');
      return;
    }
    if (res && res.exhausted) {
      replaceHintNote('提示都用完啦。和老师一起看看这道题？');
      return;
    }
    toast('暂时拿不到提示，问问老师吧');
  }

  /* ======================================================================
   * 反馈与完成
   * ==================================================================== */

  /**
   * 当前活动已完成时该给的"往下走"按钮（最后一关是领徽章）。
   * 抽出来是因为反馈区每次渲染都会整块清空：活动完成后，任何后续反馈
   * （最典型的是「🧪 真实C++验证」的结果）如果不带这个按钮，就会把
   * 完成时给出的「下一个任务！」直接擦掉，孩子当场卡在这一关走不了。
   * 教案在活动 2、4、5、6、7 都让老师"完成后再点真实验证"，所以这条
   * 路径是必经的，不是边角情况。
   */
  function nextStepActions(lessonDone) {
    if (!S.engine || !S.ui || !S.ui.completed) return [];
    var isLast = S.engine.currentIndex + 1 >= S.engine.getActivities().length;
    return [
      (lessonDone || isLast)
        ? { label: '🏅 去领我的徽章！', primary: true, onClick: function () { renderLessonEnd(); } }
        : { label: '下一个任务！', primary: true, onClick: function () { gotoNextActivity(); } }
    ];
  }

  function showFeedback(kind, title, text, actions) {
    var host = document.getElementById('feedback-area');
    if (!host) return;
    // 已完成的活动，反馈里必须始终留着"往下走"的出口（见 nextStepActions 注释）
    if (!actions || !actions.length) actions = nextStepActions(false);
    clearNode(host);
    var cls = kind === 'ok' ? 'fb-ok' : (kind === 'err' ? 'fb-err' : 'fb-warn');
    var card = el('div', 'feedback-card ' + cls);
    var icon = kind === 'ok' ? '🎉' : (kind === 'err' ? '🛠' : '💭');
    card.appendChild(el('div', 'fb-title', icon + ' ' + title));
    if (text) card.appendChild(el('p', null, text));
    if (actions && actions.length) {
      var row = el('div', 'fb-actions');
      actions.forEach(function (a) {
        row.appendChild(btn(a.label, a.primary ? 'btn btn-primary' : 'btn', a.onClick));
      });
      card.appendChild(row);
    }
    host.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    refreshButtons();
  }

  /** 试听观察记录：兴趣选择写 interests，aiHabit 活动写 aiHabit（CONTRACT §7 字段） */
  function recordTrialObservation(optionId) {
    var ui = S.ui;
    if (!ui || S.lessonId !== 'trial' || !Sto()) return;
    Sto().update(function (ss) {
      ss.lessons = ss.lessons || {};
      ss.lessons.trial = ss.lessons.trial || { completed: false, activityStates: {}, interests: [], aiHabit: null };
      if (ui.activity.aiHabit) {
        ss.lessons.trial.aiHabit = String(optionId);
      } else {
        if (!Array.isArray(ss.lessons.trial.interests)) ss.lessons.trial.interests = [];
        if (ss.lessons.trial.interests.indexOf(String(optionId)) < 0) {
          ss.lessons.trial.interests.push(String(optionId));
        }
      }
    });
  }

  function completeCurrent(opts) {
    var ui = S.ui;
    if (!ui || ui.completed) return;
    ui.completed = true;
    stopRunTimer();

    var res = null;
    try {
      res = S.engine.completeActivity(opts || {});
    } catch (e) {
      res = { ok: false };
    }
    if (S.lessonId === 'trial') refreshTrialGateFromStorage();
    if (S.viz) { try { S.viz.celebrate(); } catch (e) { /* 忽略 */ } }
    refreshDots();

    var lessonDone = !!(res && res.lessonDone);
    var doneActions = nextStepActions(lessonDone);

    // 组合型活动：主交互完成后追加渲染 followUp 第二段轻交互
    var fu = ui.variant && ui.variant.interaction && ui.variant.interaction.followUp;
    if (fu && !ui.followUpDone) {
      renderFollowUp(fu, function () {
        showFeedback('ok', pick(PRAISES), T(ui.activity.successCriteriaChildText || '这个任务完成啦！'), doneActions);
      });
      return;
    }

    showFeedback('ok', pick(PRAISES), T(ui.activity.successCriteriaChildText || '这个任务完成啦！'), doneActions);
  }

  /**
   * followUp 第二段轻交互（内容 schema 扩展 2）：
   * - choice 有 correct：判对错，答对进入 onDone；答错鼓励重试
   * - choice 无 correct：纯观察记录（不判分），任选即过；试听侧写 interests/aiHabit
   * - slots：单/多槽位改值，按 goal（finalVar）判定
   */
  function renderFollowUp(fu, onDone) {
    var ui = S.ui;
    var host = document.getElementById('feedback-area');
    if (!host) { ui.followUpDone = true; onDone(); return; }
    clearNode(host);

    function finish() {
      ui.followUpDone = true;
      setTimeout(onDone, 900);
    }

    var card = el('div', 'feedback-card fb-ok');
    card.appendChild(el('div', 'fb-title', '⭐ 再来一个小挑战'));

    if (fu.type === 'choice') {
      card.appendChild(el('p', null, T(fu.question || '')));
      var row = el('div', 'chip-row');
      var hasCorrect = (fu.options || []).some(function (o) { return o && o.correct === true; });
      var answered = false;
      (fu.options || []).forEach(function (opt) {
        var c = el('button', 'chip', T(String(opt.label !== undefined ? opt.label : opt.id)));
        c.type = 'button';
        c.addEventListener('click', function () {
          if (answered) return;
          if (!hasCorrect) {
            answered = true;
            c.classList.add('selected');
            disableChips(row);
            recordTrialObservation(opt.id);
            row.parentNode.appendChild(el('p', 'predict-done', '记下来啦！'));
            finish();
            return;
          }
          if (opt.correct === true) {
            answered = true;
            c.classList.add('right');
            disableChips(row);
            row.parentNode.appendChild(el('p', 'predict-done', pick(PRAISES)));
            finish();
          } else {
            c.classList.add('wrong');
            c.disabled = true;
            toast('再想想看？');
          }
        });
        row.appendChild(c);
      });
      card.appendChild(row);
    } else if (fu.type === 'slots' && Array.isArray(fu.slots)) {
      var baseProgram = activeProgram();
      if (!baseProgram || !CppLab.IR) { ui.followUpDone = true; onDone(); return; }
      var work = deepClone(baseProgram);
      var goal = fu.goal || null;
      var goalText = (goal && goal.type === 'finalVar')
        ? '目标：让 ' + goal.name + ' 最后变成 ' + goal.value + '。'
        : (goal && goal.type === 'stdout' ? '目标：让输出变成「' + goal.value + '」。' : '');
      if (goalText) card.appendChild(el('p', null, goalText));

      var tryRow = el('div');
      fu.slots.forEach(function (slot) {
        var box = el('div', 'slot-editor');
        box.appendChild(el('span', null, T(slot.label || '槽位') + '：'));
        function tryValue(v) {
          var step = slotGetStep(work, slot.stepIndex);
          if (!step) return;
          slotWriteValue(step, slot.path, v);
          var exec = CppLab.IR.execute(work);
          var ok = false;
          if (goal && goal.type === 'finalVar') ok = valEq((exec.finalVars || {})[goal.name], goal.value);
          else if (goal && goal.type === 'stdout') ok = valEq(exec.stdout, goal.value);
          else ok = !exec.error;
          clearNode(tryRow);
          if (ok) {
            tryRow.appendChild(el('p', 'predict-done', '太棒了，正好达成目标！'));
            finish();
          } else {
            tryRow.appendChild(el('p', 'bug-note', '这次' + (goal && goal.type === 'finalVar' ? (' ' + goal.name + ' 变成了 ' + String((exec.finalVars || {})[goal.name])) : '还没达成目标') + '，再试一个数？'));
          }
        }
        if (slot.inputType === 'choice' && Array.isArray(slot.choices)) {
          slot.choices.forEach(function (cv) {
            box.appendChild(btn(String(cv), 'btn btn-sm', function () { tryValue(cv); }));
          });
        } else {
          var input = el('input', 'predict-input');
          input.type = 'number';
          var ok2 = btn('试试看', 'btn btn-sm btn-accent', function () {
            if (input.value === '') { input.focus(); return; }
            tryValue(Number(input.value));
          });
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok2.click(); });
          box.appendChild(input);
          box.appendChild(ok2);
        }
        card.appendChild(box);
      });
      card.appendChild(tryRow);
    } else {
      // 未知 followUp 类型：不阻断流程
      ui.followUpDone = true;
      onDone();
      return;
    }

    var skip = btn('先跳过', 'btn btn-sm btn-ghost', function () { finish(); });
    skip.style.marginTop = '8px';
    card.appendChild(skip);
    host.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function gotoNextActivity() {
    var r = S.engine.next();
    if (r && r.lessonDone) { renderLessonEnd(); return; }
    renderActivity();
  }

  /* ======================================================================
   * 课末徽章页（Report.childFeedback）
   * ==================================================================== */

  function renderLessonEnd() {
    stopRunTimer();
    destroyViz();
    S.view = 'end';
    var lessonId = S.lessonId;
    clearNode(S.root);
    S.root.appendChild(buildTopbar({ title: T(packTitle(lessonId)) }));

    var view = el('div', 'view view-narrow end-page');
    var card = el('div', 'card');
    card.appendChild(el('div', 'li-icon', '🎊'));
    card.appendChild(el('h1', null, '今天的探险完成啦！'));

    var fb = null;
    if (CppLab.Report && typeof CppLab.Report.childFeedback === 'function') {
      try { fb = CppLab.Report.childFeedback(lessonId); } catch (e) { fb = null; }
    }

    if (fb && Array.isArray(fb.badges) && fb.badges.length) {
      card.appendChild(el('p', null, '看看你赢得了什么：'));
      var grid = el('div', 'badge-grid');
      fb.badges.forEach(function (b, i) {
        var bc = el('div', 'badge-card');
        bc.style.animationDelay = (i * 0.15) + 's';
        bc.appendChild(el('div', 'bd-icon', TIcon(b.icon || '🏅')));
        bc.appendChild(el('div', 'bd-title', T(b.title || '小小徽章')));
        if (b.desc) bc.appendChild(el('div', 'bd-desc', T(b.desc)));
        grid.appendChild(bc);
      });
      card.appendChild(grid);
    } else {
      card.appendChild(el('p', null, '你今天认真探险的样子超帅！'));
    }

    // 我学会了一件事（learnedOne 单选）
    if (fb && fb.learnedOne && Array.isArray(fb.learnedOne.options) && fb.learnedOne.options.length) {
      card.appendChild(el('h3', null, '今天我学会了……（选一个）'));
      var row = el('div', 'chip-row');
      row.style.justifyContent = 'center';
      fb.learnedOne.options.forEach(function (optText) {
        // 展示按主题换词；写入 session 的仍是正本句（教师/报告读正本）
        var c = el('button', 'chip', T(String(optText)));
        c.type = 'button';
        c.addEventListener('click', function () {
          var all = row.querySelectorAll('.chip');
          for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
          c.classList.add('selected');
          Sto().update(function (ss) {
            ss.lessons = ss.lessons || {};
            ss.lessons[lessonId] = ss.lessons[lessonId] || { completed: false, activityStates: {} };
            ss.lessons[lessonId].learnedOne = String(optText);
          });
          toast('记下来啦！');
        });
        row.appendChild(c);
      });
      card.appendChild(row);
    }

    if (fb && fb.nextPreview) {
      var np = el('div', 'next-preview');
      np.appendChild(el('strong', null, '下次预告：'));
      np.appendChild(document.createTextNode(' ' + T(fb.nextPreview)));
      card.appendChild(np);
    }

    var home = btn('🏠 回到首页', 'btn btn-primary', function () { renderHome(); });
    home.style.marginTop = '18px';
    card.appendChild(home);

    view.appendChild(card);
    S.root.appendChild(view);
  }

  /* ======================================================================
   * 按钮条状态机（.btn-primary 同屏 <= 2，红线 §14.5）
   * ==================================================================== */

  function refreshButtons() {
    var d = S.dom;
    var ui = S.ui;
    if (!d.bReset || !ui) return;

    var pred = effPrediction();
    var hasProgram = activityHasProgram();
    var needPredict = !!pred && !ui.predicted;
    var paused = !!ui.pendingCp;
    var canVerify = activityCanVerify();

    // 可用性（按钮条已按活动动态渲染，这里只对存在的按钮设状态）
    if (d.bPredict) d.bPredict.disabled = !pred || ui.predicted || ui.runFinished;
    if (d.bStep) {
      d.bStep.disabled = !hasProgram || paused || ui.verifyBusy || (ui.runFinished && !ui.useLocal && S.engine.getActivityState().status === 'done');
      if (ui.runFinished) d.bStep.disabled = true;
      if (ui.type === 'bughunt' && ui.bugFixed) d.bStep.disabled = true;
    }
    if (d.bRun) d.bRun.disabled = d.bStep ? d.bStep.disabled : true;
    d.bReset.disabled = ui.verifyBusy || paused;
    if (d.bVerify) d.bVerify.disabled = !canVerify || !!ui.verifyBusy;
    if (d.bHint) d.bHint.disabled = false;

    // 高亮策略：任何时刻 .btn-primary <= 2
    [d.bPredict, d.bStep, d.bRun, d.bReset, d.bVerify, d.bHint].forEach(function (b) {
      if (b) b.classList.remove('btn-primary');
    });

    var primaries = [];
    if (needPredict) {
      primaries = [d.bPredict];               // 未预测：只高亮「先预测」
    } else if (hasProgram && !ui.runFinished && !paused && !(ui.type === 'bughunt' && ui.bugFixed)) {
      primaries = [d.bStep, d.bRun];          // 待运行：单步 + 运行
    } else if (ui.runFinished && canVerify && !ui.completed) {
      primaries = [d.bVerify];                // 跑完待验证
    } else if (ui.type === 'freeEdit' && canVerify && !ui.completed) {
      primaries = [d.bVerify];
    } else if (ui.type === 'bughunt' && ui.bugFixed && canVerify) {
      primaries = [d.bVerify];
    }
    primaries = primaries.filter(function (b) { return !!b; });
    // 反馈卡里的主按钮也算同屏高亮：反馈区有主按钮时最多再留 1 个
    var fbPrimary = document.querySelector('#feedback-area .btn-primary');
    var budget = fbPrimary ? 1 : 2;
    primaries.slice(0, budget).forEach(function (b) {
      if (!b.disabled) b.classList.add('btn-primary');
    });
  }

  /* ======================================================================
   * 对外 API 与启动
   * ==================================================================== */

  App.init = boot;
  App.goHome = function () { renderHome(); };
  App.startLesson = startLesson;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
