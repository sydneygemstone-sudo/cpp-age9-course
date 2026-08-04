/*
 * js/ui/visualizer.js — CppLab.Visualizer（可视化引擎，CONTRACT §12）
 *
 * 纯 SVG/CSS，零依赖，file:// 可运行。
 * - mount(container, visualModel, opts) -> ctrl
 * - ctrl = { applyTraceEntry, setVars, reset, setSkin, setEnergy, showCond,
 *            setDoor, highlightLine, branch, celebrate, destroy }
 * - 样式由本文件注入 <style id="cpplab-visualizer-css">，使用 css/main.css 的 CSS 变量
 *   （所有 var() 均带回退值，缺少 main.css 时也不会裂开）。
 * - document.body 有 no-anim class 时：CSS 动画/过渡全部关闭，JS 直接置终态。
 * - 顶层不访问 DOM；mount 之前不触碰 document（node --check / require 均安全）。
 * - 儿童端红线：本文件所有文案不出现维度、分数、支架档位（E/S/A）字样。
 */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  // ---------------------------------------------------------------- 常量 --

  var SKIN_LIST = ['robo-blue', 'robo-orange', 'robo-dog'];
  var MODEL_LIST = ['energy', 'door', 'sequence', 'function', 'scene', 'none'];
  var ENERGY_MAX = 12;          // 能量条 0–12 格
  var VALUE_ANIM_MS = 560;      // 变量盒 旧值淡出→新值写入 总时长（契约 ≤600ms）

  // C++ 标识符 → 中文释义（悬停 title 用，§13：标识符英文 + 中文释义）
  var VAR_NAME_CN = {
    energy: '能量', shield: '护盾', hasKey: '有没有钥匙', key: '钥匙',
    age: '年龄', coins: '金币', points: '积分', level: '等级',
    speed: '速度', power: '力量', count: '数量', temp: '温度',
    x: '数字 x', y: '数字 y', n: '数字 n'
  };

  var SKIN_CN = {
    'robo-blue': '蓝色圆滚机器人',
    'robo-orange': '橙色方块机器人',
    'robo-dog': '绿色小狗机器人'
  };

  var DEFAULT_CAPTION = {
    energy: '我是能量机器人！按「单步」，看我一格一格充能量～',
    door: '这是智能舱门：它会先检查条件，再决定开门还是不开门。',
    sequence: '命令们排好队啦！它们会一条接一条轮流执行哦。',
    'function': '这是函数机器：把原料放进去，加工一下，就会送出结果！',
    scene: '准备好了吗？我们一起出发吧！',
    none: ''
  };

  var KIND_LABEL = {
    declare: '建立盒子',
    assign: '更新盒子',
    output: '汇报结果',
    'if': '检查条件'
  };

  // ------------------------------------------------------------ CSS 文本 --

  var CSS_TEXT = [
    '.cpplab-viz{',
    '  --vz-ok:var(--c-ok,#22c55e); --vz-err:var(--c-err,#ef4444);',
    '  --vz-primary:var(--c-primary,#3b82f6); --vz-accent:var(--c-accent,#f59e0b);',
    '  --vz-ink:var(--c-ink,#1e293b); --vz-muted:var(--c-muted,#64748b);',
    '  --vz-card:var(--c-card,#fff); --vz-r:var(--radius,14px);',
    '  font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
    '  font-size:17px; color:var(--vz-ink); line-height:1.45;',
    '  display:flex; flex-direction:column; gap:10px; user-select:none;',
    '  position:relative;', /* celebrate() 在 model=none 时把 .viz-stars 挂根元素，需要定位祖先兜底 */
    '}',
    /* ---- 舞台 ---- */
    '.viz-stage{position:relative; display:flex; align-items:flex-end; justify-content:center;',
    '  gap:24px; flex-wrap:wrap; padding:18px 14px 16px; min-height:200px; overflow:hidden;',
    '  background:var(--vz-card); border-radius:var(--vz-r); box-shadow:0 1px 4px rgba(30,41,59,.08);}',
    /* ---- 机器人 ---- */
    '.viz-robot{flex:0 0 auto; width:122px;}',
    '.viz-robot svg{width:122px; height:142px; display:block; overflow:visible;',
    '  animation:viz-bob 2.6s ease-in-out infinite;}',
    '.viz-face{display:none;}',
    '.viz-robot[data-mood="normal"] .viz-face-normal{display:inline;}',
    '.viz-robot[data-mood="happy"] .viz-face-happy{display:inline;}',
    '.viz-robot[data-mood="confused"] .viz-face-confused{display:inline;}',
    '.viz-tail{transform-origin:88px 100px; animation:viz-wag 1.3s ease-in-out infinite;}',
    '@keyframes viz-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '@keyframes viz-wag{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(14deg)}}',
    /* ---- 行号提示 ---- */
    '.viz-linechip{position:absolute; top:10px; right:12px; z-index:5;',
    '  background:var(--vz-primary); color:#fff; font-size:14px; font-weight:700;',
    '  padding:4px 12px; border-radius:999px;}',
    '.viz-linechip[hidden]{display:none;}',
    /* ---- 旁白气泡 ---- */
    '.viz-caption{display:flex; align-items:center; gap:8px; padding:10px 16px;',
    '  background:var(--vz-card); border:2px dashed #93c5fd; border-radius:var(--vz-r);',
    '  min-height:44px; font-size:17px;}',
    '.viz-caption::before{content:"💬"; font-size:18px;}',
    /* ---- 能量站 ---- */
    '.viz-energy{display:flex; align-items:flex-end; gap:12px;}',
    '.viz-battery{position:relative; width:58px; height:184px; padding:5px;',
    '  border:3px solid var(--vz-ink); border-radius:12px; background:#fff;',
    '  display:flex; flex-direction:column-reverse; gap:3px;}',
    '.viz-battery::before{content:""; position:absolute; top:-11px; left:50%; transform:translateX(-50%);',
    '  width:22px; height:8px; background:var(--vz-ink); border-radius:4px 4px 0 0;}',
    '.viz-cell{flex:1 1 0; border-radius:4px; background:#e2e8f0;',
    '  transition:background .25s, box-shadow .25s;}',
    '.viz-cell.on{background:linear-gradient(180deg,#fcd34d,var(--vz-accent));',
    '  box-shadow:0 0 6px rgba(245,158,11,.55);}',
    '.viz-energy-info{text-align:center; padding-bottom:6px;}',
    '.viz-energy-num{font-size:42px; font-weight:800; line-height:1; color:var(--vz-accent);}',
    '.viz-energy-num.neg{color:var(--vz-err);}',
    '.viz-energy-label{font-size:14px; color:var(--vz-muted); font-weight:600;}',
    '.viz-energy.mini .viz-battery{width:40px; height:122px; border-width:2px;}',
    '.viz-energy.mini .viz-energy-num{font-size:26px;}',
    /* ---- 智能舱门 ---- */
    '.viz-doorwrap{display:flex; flex-direction:column; align-items:center; gap:8px;}',
    '.viz-lamp{display:inline-flex; align-items:center; gap:7px; padding:6px 16px;',
    '  border-radius:999px; font-size:18px; font-weight:800;',
    '  background:#e2e8f0; color:var(--vz-muted); transition:background .3s, color .3s;}',
    '.viz-lamp .viz-lamp-icon{font-size:20px; line-height:1;}',
    '.viz-lamp[data-state="true"]{background:var(--vz-ok); color:#fff;}',
    '.viz-lamp[data-state="false"]{background:var(--vz-err); color:#fff;}',
    '.viz-condbadge{position:absolute; top:10px; left:12px; z-index:5;}',
    '.viz-condbadge[hidden]{display:none;}',
    '.viz-doorframe{position:relative; width:152px; height:152px; overflow:hidden;',
    '  border:4px solid var(--vz-ink); border-radius:12px;',
    '  background:radial-gradient(circle at 50% 42%, #fef9c3, #fde68a);}',
    '.viz-doorframe::after{content:"☀"; position:absolute; top:40%; left:50%;',
    '  transform:translate(-50%,-50%); font-size:34px; color:#f59e0b;}',
    '.viz-leaf{position:absolute; top:0; bottom:0; width:51%; z-index:2;',
    '  background:linear-gradient(180deg,#94a3b8,#64748b);',
    '  transition:transform .55s cubic-bezier(.4,0,.2,1);}',
    '.viz-leaf-l{left:0; border-right:3px solid #475569;}',
    '.viz-leaf-r{right:0; border-left:3px solid #475569;}',
    '.viz-doorframe.open .viz-leaf-l{transform:translateX(-103%);}',
    '.viz-doorframe.open .viz-leaf-r{transform:translateX(103%);}',
    '.viz-doorstate{font-size:16px; font-weight:700; color:var(--vz-muted);}',
    '.viz-doorstate.open{color:var(--vz-ok);}',
    /* ---- 双分支轨道 ---- */
    '.viz-tracks{display:flex; flex-direction:column; gap:12px; justify-content:center;}',
    '.viz-track{display:flex; align-items:center; gap:9px; min-width:186px;',
    '  padding:9px 14px; border:3px solid #cbd5e1; border-radius:999px; background:#fff;',
    '  font-weight:700; font-size:16px; transition:opacity .35s, filter .35s,',
    '  border-color .35s, transform .35s, box-shadow .35s;}',
    '.viz-track-badge{padding:2px 11px; border-radius:999px; color:#fff; font-weight:800;}',
    '.viz-track-badge.true{background:var(--vz-ok);}',
    '.viz-track-badge.false{background:var(--vz-err);}',
    '.viz-tracks[data-taken="then"] .viz-track-then,',
    '.viz-tracks[data-taken="else"] .viz-track-else{',
    '  border-color:var(--vz-accent); transform:scale(1.04);',
    '  box-shadow:0 0 0 4px rgba(245,158,11,.22);}',
    '.viz-tracks[data-taken="then"] .viz-track-then::after,',
    '.viz-tracks[data-taken="else"] .viz-track-else::after{',
    '  content:"← 走这边！"; color:var(--vz-accent); font-size:14px;}',
    '.viz-tracks[data-taken="then"] .viz-track-else,',
    '.viz-tracks[data-taken="else"] .viz-track-then{opacity:.35; filter:grayscale(1);}',
    /* ---- 命令队列 ---- */
    '.viz-seq{display:flex; flex-wrap:wrap; gap:8px; align-content:flex-start;',
    '  max-width:340px; min-height:44px;}',
    '.viz-chip{padding:6px 13px; border:2px solid var(--vz-primary); border-radius:999px;',
    '  background:#dbeafe; color:#1d4ed8; font-size:15px; font-weight:700;',
    '  animation:viz-pop .3s ease;}',
    '@keyframes viz-pop{from{transform:scale(.4); opacity:0}to{transform:scale(1); opacity:1}}',
    /* ---- 函数机器 ---- */
    '.viz-machine{display:flex; align-items:center; gap:10px; padding-top:26px;}',
    '.viz-belt{position:relative; width:112px; height:64px; border:3px solid #94a3b8;',
    '  border-radius:10px; display:flex; align-items:center; justify-content:center;',
    '  background:repeating-linear-gradient(90deg,#cbd5e1 0 14px,#e2e8f0 14px 28px);}',
    '.viz-belt-label{position:absolute; top:-26px; left:50%; transform:translateX(-50%);',
    '  font-size:14px; font-weight:700; color:var(--vz-muted); white-space:nowrap;}',
    '.viz-token{min-width:42px; max-width:100px; overflow:hidden; text-overflow:ellipsis;',
    '  white-space:nowrap; padding:5px 10px; border-radius:10px; text-align:center;',
    '  background:var(--vz-accent); color:#fff; font-weight:800; font-size:16px;',
    '  opacity:0; transition:opacity .3s, transform .5s;}',
    '.viz-token.show{opacity:1;}',
    '.viz-token-in.go{transform:translateX(72px); opacity:0;}',
    '.viz-token-out{background:var(--vz-ok);}',
    '.viz-mbox{width:112px; height:112px; border-radius:18px; background:var(--vz-primary);',
    '  color:#fff; font-weight:800; font-size:15px; display:flex; flex-direction:column;',
    '  align-items:center; justify-content:center; gap:5px;',
    '  box-shadow:inset 0 -6px 0 rgba(0,0,0,.15);}',
    '.viz-gear{font-size:36px; line-height:1; display:block;}',
    '.viz-mbox.working .viz-gear{animation:viz-spin .8s linear infinite;}',
    '@keyframes viz-spin{to{transform:rotate(360deg)}}',
    /* ---- 变量盒 + 输出屏 ---- */
    '.viz-panel{display:flex; gap:10px; flex-wrap:wrap; align-items:stretch;}',
    '.viz-vars{display:flex; gap:10px; flex-wrap:wrap; flex:1 1 220px; align-content:flex-start;}',
    '.viz-vars:empty::after{content:"（还没有变量盒子）"; color:var(--vz-muted); font-size:14px;',
    '  align-self:center;}',
    '.viz-varbox{min-width:100px; padding:8px 15px; text-align:center;',
    '  background:var(--vz-card); border:3px solid var(--vz-primary); border-radius:var(--vz-r);',
    '  transition:border-color .3s, box-shadow .3s; animation:viz-pop .3s ease;}',
    '.viz-varbox.changed{border-color:var(--vz-accent);',
    '  box-shadow:0 0 0 4px rgba(245,158,11,.25);}',
    '.viz-varname{font-family:ui-monospace,Menlo,Consolas,monospace; font-size:15px;',
    '  font-weight:700; color:var(--vz-muted); cursor:help;}',
    '.viz-varval{position:relative; height:42px; overflow:hidden;',
    '  display:flex; align-items:center; justify-content:center; gap:6px;}',
    '.viz-val{font-size:29px; font-weight:800; line-height:1;}',
    '.viz-val-out{position:absolute; animation:viz-val-out .26s ease forwards;}',
    '.viz-val-in{animation:viz-val-in .3s ease .14s backwards;}',
    '@keyframes viz-val-out{to{opacity:0; transform:translateY(-16px) scale(.7)}}',
    '@keyframes viz-val-in{from{opacity:0; transform:translateY(16px) scale(.7)}}',
    '.viz-booltag{font-size:13px; font-weight:800; padding:2px 9px; border-radius:999px; color:#fff;}',
    '.viz-booltag.true{background:var(--vz-ok);}',
    '.viz-booltag.false{background:var(--vz-err);}',
    '.viz-varcn{font-size:13px; color:var(--vz-muted); font-weight:600;}',
    '.viz-screen{flex:1 1 200px; min-width:190px; padding:10px 15px;',
    '  background:#0f172a; border-radius:var(--vz-r);}',
    '.viz-screen-label{font-size:13px; letter-spacing:3px; color:#94a3b8; margin-bottom:4px;',
    '  font-weight:700;}',
    '.viz-screen-text{margin:0; min-height:30px; white-space:pre-wrap; word-break:break-all;',
    '  font-family:ui-monospace,Menlo,Consolas,monospace; font-size:21px; color:#4ade80;}',
    '.viz-screen-text.empty{color:#64748b; font-size:15px;}',
    '.viz-screen-text.flash{animation:viz-flash .5s ease;}',
    '@keyframes viz-flash{0%{background:rgba(74,222,128,.35)}100%{background:transparent}}',
    /* ---- 庆祝星星 ---- */
    '.viz-stars{position:absolute; inset:0; z-index:9; pointer-events:none; overflow:hidden;}',
    '.viz-star{position:absolute; font-size:23px; animation:viz-star 1.25s ease-out forwards;}',
    '@keyframes viz-star{0%{transform:translateY(0) scale(.4); opacity:0}',
    '  20%{opacity:1}100%{transform:translateY(-96px) scale(1.2); opacity:0}}',
    /* ---- none 布局 ---- */
    '.viz-none{padding:14px; text-align:center; font-size:15px; color:var(--vz-muted);',
    '  background:var(--vz-card); border-radius:var(--vz-r);}',
    /* ---- no-anim：所有动画/过渡瞬时完成 ---- */
    'body.no-anim .cpplab-viz, body.no-anim .cpplab-viz *,',
    'body.no-anim .cpplab-viz *::before, body.no-anim .cpplab-viz *::after{',
    '  animation:none !important; transition:none !important;}'
  ].join('\n');

  // ------------------------------------------------------- SVG 皮肤生成 --

  /**
   * 生成一套三种表情的脸（普通/开心/疑惑），由 data-mood 控制显示。
   * exL/exR: 左右眼圆心 x；ey: 眼睛 y；mx/my: 嘴巴中心。
   */
  function makeFace(exL, exR, ey, mx, my) {
    var ink = 'var(--c-ink,#1e293b)';
    return [
      // 普通：圆眼 + 平静小嘴
      '<g class="viz-face viz-face-normal">',
      '<circle cx="' + exL + '" cy="' + ey + '" r="8" fill="#fff"/>',
      '<circle cx="' + exR + '" cy="' + ey + '" r="8" fill="#fff"/>',
      '<circle cx="' + exL + '" cy="' + ey + '" r="3.6" fill="' + ink + '"/>',
      '<circle cx="' + exR + '" cy="' + ey + '" r="3.6" fill="' + ink + '"/>',
      '<path d="M ' + (mx - 8) + ' ' + my + ' q 8 4 16 0" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
      '</g>',
      // 开心：弯弯的眯眯眼 + 大笑嘴 + 腮红
      '<g class="viz-face viz-face-happy">',
      '<path d="M ' + (exL - 8) + ' ' + ey + ' Q ' + exL + ' ' + (ey - 10) + ' ' + (exL + 8) + ' ' + ey + '" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>',
      '<path d="M ' + (exR - 8) + ' ' + ey + ' Q ' + exR + ' ' + (ey - 10) + ' ' + (exR + 8) + ' ' + ey + '" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>',
      '<circle cx="' + (exL - 10) + '" cy="' + (ey + 9) + '" r="4.5" fill="var(--c-err,#ef4444)" opacity=".3"/>',
      '<circle cx="' + (exR + 10) + '" cy="' + (ey + 9) + '" r="4.5" fill="var(--c-err,#ef4444)" opacity=".3"/>',
      '<path d="M ' + (mx - 10) + ' ' + (my - 2) + ' Q ' + mx + ' ' + (my + 11) + ' ' + (mx + 10) + ' ' + (my - 2) + '" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>',
      '</g>',
      // 疑惑：一只眼睁大一只眼眯小 + 歪嘴 + 问号
      '<g class="viz-face viz-face-confused">',
      '<circle cx="' + exL + '" cy="' + ey + '" r="8" fill="#fff"/>',
      '<circle cx="' + exL + '" cy="' + ey + '" r="3.6" fill="' + ink + '"/>',
      '<line x1="' + (exL - 9) + '" y1="' + (ey - 11) + '" x2="' + (exL + 6) + '" y2="' + (ey - 14) + '" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>',
      '<circle cx="' + exR + '" cy="' + (ey + 1) + '" r="5" fill="#fff"/>',
      '<circle cx="' + exR + '" cy="' + (ey + 1) + '" r="2.4" fill="' + ink + '"/>',
      '<path d="M ' + (mx - 9) + ' ' + (my + 2) + ' q 4 -6 9 -1 q 4 5 9 -2" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
      '<text x="' + (exR + 20) + '" y="' + (ey - 12) + '" font-size="18" font-weight="bold" fill="var(--c-muted,#64748b)">?</text>',
      '</g>'
    ].join('');
  }

  /** 返回指定皮肤的完整 SVG 字符串。 */
  function skinSvg(skin) {
    var ink = 'var(--c-ink,#1e293b)';
    var svgOpen = '<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
      (SKIN_CN[skin] || '机器人') + '">';

    if (skin === 'robo-orange') {
      // 橙色方块机器人
      return svgOpen +
        '<line x1="38" y1="26" x2="38" y2="40" stroke="' + ink + '" stroke-width="3"/>' +
        '<line x1="82" y1="26" x2="82" y2="40" stroke="' + ink + '" stroke-width="3"/>' +
        '<circle cx="38" cy="22" r="5" fill="var(--c-primary,#3b82f6)"/>' +
        '<circle cx="82" cy="22" r="5" fill="var(--c-primary,#3b82f6)"/>' +
        '<rect x="20" y="40" width="80" height="78" rx="14" fill="var(--c-accent,#f59e0b)"/>' +
        '<rect x="28" y="96" width="64" height="14" rx="7" fill="#fff" opacity=".3"/>' +
        '<circle cx="28" cy="48" r="3" fill="#fff" opacity=".6"/>' +
        '<circle cx="92" cy="48" r="3" fill="#fff" opacity=".6"/>' +
        '<rect x="6" y="62" width="12" height="30" rx="6" fill="#d97706"/>' +
        '<rect x="102" y="62" width="12" height="30" rx="6" fill="#d97706"/>' +
        '<rect x="24" y="120" width="72" height="14" rx="7" fill="#334155"/>' +
        '<circle cx="38" cy="127" r="4" fill="#94a3b8"/>' +
        '<circle cx="60" cy="127" r="4" fill="#94a3b8"/>' +
        '<circle cx="82" cy="127" r="4" fill="#94a3b8"/>' +
        makeFace(45, 75, 66, 60, 86) +
        '</svg>';
    }

    if (skin === 'robo-dog') {
      // 绿色小狗机器人
      return svgOpen +
        '<path class="viz-tail" d="M 90 100 Q 106 92 104 74" stroke="var(--c-ok,#22c55e)" stroke-width="7" stroke-linecap="round" fill="none"/>' +
        '<polygon points="32,32 22,62 46,52" fill="#16a34a"/>' +
        '<polygon points="88,32 98,62 74,52" fill="#16a34a"/>' +
        '<ellipse cx="60" cy="106" rx="34" ry="25" fill="var(--c-ok,#22c55e)"/>' +
        '<ellipse cx="60" cy="112" rx="20" ry="13" fill="#fff" opacity=".3"/>' +
        '<rect x="34" y="124" width="12" height="12" rx="5" fill="#15803d"/>' +
        '<rect x="74" y="124" width="12" height="12" rx="5" fill="#15803d"/>' +
        '<circle cx="60" cy="56" r="27" fill="var(--c-ok,#22c55e)"/>' +
        '<ellipse cx="60" cy="70" rx="12" ry="8" fill="#fff" opacity=".85"/>' +
        '<circle cx="60" cy="65" r="3.6" fill="' + ink + '"/>' +
        makeFace(49, 71, 50, 60, 76) +
        '</svg>';
    }

    // 默认：蓝色圆滚机器人
    return svgOpen +
      '<line x1="60" y1="16" x2="60" y2="34" stroke="' + ink + '" stroke-width="3"/>' +
      '<circle cx="60" cy="12" r="6" fill="var(--c-accent,#f59e0b)"/>' +
      '<circle cx="60" cy="84" r="48" fill="var(--c-primary,#3b82f6)"/>' +
      '<circle cx="60" cy="102" r="19" fill="#fff" opacity=".25"/>' +
      '<circle cx="10" cy="86" r="9" fill="#2563eb"/>' +
      '<circle cx="110" cy="86" r="9" fill="#2563eb"/>' +
      '<circle cx="42" cy="132" r="8" fill="#334155"/>' +
      '<circle cx="78" cy="132" r="8" fill="#334155"/>' +
      makeFace(45, 75, 66, 60, 86) +
      '</svg>';
  }

  // ------------------------------------------------------------ 小工具 --

  /** 注入组件样式（只注入一次）。 */
  function ensureCss(doc) {
    if (doc.getElementById('cpplab-visualizer-css')) return;
    var st = doc.createElement('style');
    st.id = 'cpplab-visualizer-css';
    st.textContent = CSS_TEXT;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /** 创建元素的小快捷方式。动态文本一律走 textContent，避免注入。 */
  function h(doc, tag, className, text) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  // ------------------------------------------------------------- mount --

  /**
   * CppLab.Visualizer.mount(container, visualModel, opts) -> ctrl
   *
   * @param container  DOM 元素或选择器字符串（会被清空后接管）
   * @param visualModel 'energy'|'door'|'sequence'|'function'|'scene'|'none'
   * @param opts {
   *   skin: 'robo-blue'|'robo-orange'|'robo-dog',   // 默认 robo-blue
   *   energy: Number,                                // 初始能量（energy/door 布局显示）
   *   vars: Object,                                  // 初始变量（可选）
   *   caption: String,                               // 覆盖默认旁白（可选）
   *   onHighlightLine: function(lineNo){}            // 行号联动回调（可选，app.js 用）
   * }
   */
  function mount(container, visualModel, opts) {
    if (typeof document === 'undefined') {
      throw new Error('CppLab.Visualizer.mount 只能在浏览器环境调用');
    }
    opts = opts || {};
    var doc = document;
    var host = (typeof container === 'string') ? doc.querySelector(container) : container;
    if (!host) throw new Error('CppLab.Visualizer.mount：找不到容器 ' + container);

    var model = (MODEL_LIST.indexOf(visualModel) >= 0) ? visualModel : 'none';
    ensureCss(doc);

    // ---- 内部状态 ----
    var state = {
      destroyed: false,
      skin: (SKIN_LIST.indexOf(opts.skin) >= 0) ? opts.skin : 'robo-blue',
      initialEnergy: (typeof opts.energy === 'number' && isFinite(opts.energy)) ? opts.energy : 0,
      initialVars: (opts.vars && typeof opts.vars === 'object') ? opts.vars : null,
      energy: 0,
      vars: {},
      output: '',
      caption: (typeof opts.caption === 'string') ? opts.caption : DEFAULT_CAPTION[model]
    };
    var timers = [];

    /** no-anim 模式：动画瞬时完成。 */
    function instant() {
      return !!(doc.body && doc.body.classList.contains('no-anim'));
    }
    /** 延时执行；no-anim 时立即执行（直接置终态）。 */
    function later(fn, ms) {
      if (state.destroyed) return;
      if (instant()) { fn(); return; }
      var id = setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        if (!state.destroyed) fn();
      }, ms);
      timers.push(id);
    }
    /** 无论是否 no-anim 都真实延时（用于短暂展示后移除的静态元素）。 */
    function delayReal(fn, ms) {
      if (state.destroyed) return;
      var id = setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        if (!state.destroyed) fn();
      }, ms);
      timers.push(id);
    }

    // ---- 搭 DOM ----
    host.innerHTML = '';
    var root = h(doc, 'div', 'cpplab-viz viz-model-' + model);

    var stageEl = null, robotEl = null, captionTextEl = null, lineChipEl = null;
    var cellEls = [], energyNumEl = null;
    var lampEl = null, lampIconEl = null, lampTextEl = null;
    var doorFrameEl = null, doorStateEl = null, tracksEl = null;
    var seqEl = null;
    var machineEl = null, tokenInEl = null, tokenOutEl = null, mboxEl = null;
    var varsEl = null, screenTextEl = null;

    if (model === 'none') {
      // none：极简占位，不放任何动画部件，但 ctrl 全部方法安全可调。
      root.appendChild(h(doc, 'div', 'viz-none', '这个环节不需要动画，专心想一想、说一说吧！'));
    } else {
      stageEl = h(doc, 'div', 'viz-stage');

      // 行号提示
      lineChipEl = h(doc, 'div', 'viz-linechip');
      lineChipEl.hidden = true;
      stageEl.appendChild(lineChipEl);

      // 真假灯：door 布局放在舱门上方；其他布局作为舞台角落的小徽章。
      function buildLamp(cls) {
        lampEl = h(doc, 'div', 'viz-lamp' + (cls ? ' ' + cls : ''));
        lampEl.dataset.state = 'idle';
        lampIconEl = h(doc, 'span', 'viz-lamp-icon', '?');
        lampTextEl = h(doc, 'span', 'viz-lamp-text', '等待检查');
        lampEl.appendChild(lampIconEl);
        lampEl.appendChild(lampTextEl);
        return lampEl;
      }

      // 机器人（function 布局不放机器人，主角是机器）
      if (model !== 'function') {
        robotEl = h(doc, 'div', 'viz-robot');
        robotEl.dataset.mood = 'normal';
        robotEl.innerHTML = skinSvg(state.skin);
        stageEl.appendChild(robotEl);
      }

      // 能量站
      function buildEnergy(mini) {
        var wrap = h(doc, 'div', 'viz-energy' + (mini ? ' mini' : ''));
        var battery = h(doc, 'div', 'viz-battery');
        battery.title = '能量条（0 到 ' + ENERGY_MAX + ' 格）';
        cellEls = [];
        for (var i = 0; i < ENERGY_MAX; i++) {
          var cell = h(doc, 'div', 'viz-cell');
          battery.appendChild(cell);
          cellEls.push(cell);
        }
        var info = h(doc, 'div', 'viz-energy-info');
        energyNumEl = h(doc, 'div', 'viz-energy-num', '0');
        info.appendChild(energyNumEl);
        info.appendChild(h(doc, 'div', 'viz-energy-label', '格能量'));
        wrap.appendChild(battery);
        wrap.appendChild(info);
        return wrap;
      }

      if (model === 'energy') {
        stageEl.appendChild(buildEnergy(false));
        var badge1 = buildLamp('viz-condbadge');
        badge1.hidden = true;
        stageEl.appendChild(badge1);
      } else if (model === 'door') {
        var doorWrap = h(doc, 'div', 'viz-doorwrap');
        doorWrap.appendChild(buildLamp(''));
        doorFrameEl = h(doc, 'div', 'viz-doorframe');
        var glowL = h(doc, 'div', 'viz-leaf viz-leaf-l');
        var glowR = h(doc, 'div', 'viz-leaf viz-leaf-r');
        doorFrameEl.appendChild(glowL);
        doorFrameEl.appendChild(glowR);
        doorWrap.appendChild(doorFrameEl);
        doorStateEl = h(doc, 'div', 'viz-doorstate', '门关着');
        doorWrap.appendChild(doorStateEl);
        stageEl.appendChild(doorWrap);

        tracksEl = h(doc, 'div', 'viz-tracks');
        var trackThen = h(doc, 'div', 'viz-track viz-track-then');
        trackThen.appendChild(h(doc, 'span', 'viz-track-badge true', '真 ✓'));
        trackThen.appendChild(h(doc, 'span', null, '走这条路'));
        var trackElse = h(doc, 'div', 'viz-track viz-track-else');
        trackElse.appendChild(h(doc, 'span', 'viz-track-badge false', '假 ✗'));
        trackElse.appendChild(h(doc, 'span', null, '走这条路'));
        tracksEl.appendChild(trackThen);
        tracksEl.appendChild(trackElse);
        stageEl.appendChild(tracksEl);

        stageEl.appendChild(buildEnergy(true));
      } else if (model === 'sequence') {
        seqEl = h(doc, 'div', 'viz-seq');
        seqEl.title = '已经执行的命令会排在这里';
        stageEl.appendChild(seqEl);
        var badge2 = buildLamp('viz-condbadge');
        badge2.hidden = true;
        stageEl.appendChild(badge2);
      } else if (model === 'function') {
        machineEl = h(doc, 'div', 'viz-machine');
        var beltIn = h(doc, 'div', 'viz-belt viz-belt-in');
        beltIn.appendChild(h(doc, 'span', 'viz-belt-label', '输入传送带'));
        tokenInEl = h(doc, 'span', 'viz-token viz-token-in', '原料');
        beltIn.appendChild(tokenInEl);
        mboxEl = h(doc, 'div', 'viz-mbox');
        mboxEl.appendChild(h(doc, 'span', 'viz-gear', '⚙'));
        mboxEl.appendChild(h(doc, 'span', null, '函数机器'));
        var beltOut = h(doc, 'div', 'viz-belt viz-belt-out');
        beltOut.appendChild(h(doc, 'span', 'viz-belt-label', '输出传送带'));
        tokenOutEl = h(doc, 'span', 'viz-token viz-token-out', '');
        beltOut.appendChild(tokenOutEl);
        machineEl.appendChild(beltIn);
        machineEl.appendChild(mboxEl);
        machineEl.appendChild(beltOut);
        stageEl.appendChild(machineEl);
        var badge3 = buildLamp('viz-condbadge');
        badge3.hidden = true;
        stageEl.appendChild(badge3);
      } else if (model === 'scene') {
        var badge4 = buildLamp('viz-condbadge');
        badge4.hidden = true;
        stageEl.appendChild(badge4);
      }

      root.appendChild(stageEl);

      // 旁白气泡
      var captionEl = h(doc, 'div', 'viz-caption');
      captionTextEl = h(doc, 'span', 'viz-caption-text', state.caption || '');
      captionEl.appendChild(captionTextEl);
      root.appendChild(captionEl);

      // 变量盒 + 输出屏
      var panelEl = h(doc, 'div', 'viz-panel');
      varsEl = h(doc, 'div', 'viz-vars');
      panelEl.appendChild(varsEl);
      var screenEl = h(doc, 'div', 'viz-screen');
      screenEl.appendChild(h(doc, 'div', 'viz-screen-label', '输出屏'));
      screenTextEl = h(doc, 'pre', 'viz-screen-text empty', '（还没有输出）');
      screenEl.appendChild(screenTextEl);
      panelEl.appendChild(screenEl);
      root.appendChild(panelEl);
    }

    host.appendChild(root);

    // ------------------------------------------------------ 内部操作 --

    function setMood(mood) {
      if (robotEl) robotEl.dataset.mood = mood;
    }
    /** 短暂切换表情后恢复普通脸。 */
    function blinkMood(mood, ms) {
      if (!robotEl) return;
      setMood(mood);
      // no-anim 下表情也保留一小会儿（表情是状态不是动画），用真实延时
      delayReal(function () {
        if (robotEl && robotEl.dataset.mood === mood) setMood('normal');
      }, ms || 1000);
    }

    function setCaption(text) {
      if (captionTextEl && typeof text === 'string') captionTextEl.textContent = text;
    }

    /** 生成一个值的展示（布尔值带 真✓/假✗ 小标签，图标+文字并用）。 */
    function buildValNodes(value) {
      var frag = doc.createDocumentFragment();
      var valSpan = h(doc, 'span', 'viz-val', String(value));
      frag.appendChild(valSpan);
      if (typeof value === 'boolean') {
        frag.appendChild(h(doc, 'span', 'viz-booltag ' + (value ? 'true' : 'false'),
          value ? '真 ✓' : '假 ✗'));
      }
      return frag;
    }

    function makeVarBox(name, value) {
      var box = h(doc, 'div', 'viz-varbox');
      box.dataset.name = name;
      var nameEl = h(doc, 'div', 'viz-varname', name);
      nameEl.title = VAR_NAME_CN[name] || '变量 ' + name;
      box.appendChild(nameEl);
      var valWrap = h(doc, 'div', 'viz-varval');
      valWrap.appendChild(buildValNodes(value));
      box.appendChild(valWrap);
      box.appendChild(h(doc, 'div', 'viz-varcn', VAR_NAME_CN[name] || '变量'));
      return box;
    }

    /** 变量盒换值动画：旧值淡出 → 新值写入（总时长 ≤600ms）。 */
    function animateValue(box, newValue) {
      var valWrap = box.querySelector('.viz-varval');
      if (!valWrap) return;
      box.classList.add('changed');
      later(function () { box.classList.remove('changed'); }, 800);

      if (instant()) {
        valWrap.innerHTML = '';
        valWrap.appendChild(buildValNodes(newValue));
        return;
      }
      // 旧值加 out 动画（绝对定位淡出），新值加 in 动画
      var olds = valWrap.querySelectorAll('.viz-val, .viz-booltag');
      for (var i = 0; i < olds.length; i++) olds[i].classList.add('viz-val-out');
      var fresh = buildValNodes(newValue);
      var freshNodes = [];
      var node = fresh.firstChild;
      while (node) { freshNodes.push(node); node = node.nextSibling; }
      for (var j = 0; j < freshNodes.length; j++) freshNodes[j].classList.add('viz-val-in');
      valWrap.appendChild(fresh);
      later(function () {
        for (var k = 0; k < olds.length; k++) {
          if (olds[k].parentNode === valWrap) valWrap.removeChild(olds[k]);
        }
        for (var m = 0; m < freshNodes.length; m++) freshNodes[m].classList.remove('viz-val-in');
      }, VALUE_ANIM_MS);
    }

    function setVarsInternal(vars) {
      vars = (vars && typeof vars === 'object') ? vars : {};
      if (varsEl) {
        // 移除消失的变量盒
        var boxes = varsEl.querySelectorAll('.viz-varbox');
        for (var i = 0; i < boxes.length; i++) {
          var nm = boxes[i].dataset.name;
          if (!(nm in vars)) varsEl.removeChild(boxes[i]);
        }
        // 新建 / 更新
        for (var name in vars) {
          if (!Object.prototype.hasOwnProperty.call(vars, name)) continue;
          var value = vars[name];
          var box = varsEl.querySelector('.viz-varbox[data-name="' + name.replace(/"/g, '') + '"]');
          if (!box) {
            varsEl.appendChild(makeVarBox(name, value));
          } else if (state.vars[name] !== value) {
            animateValue(box, value);
          }
        }
      }
      state.vars = {};
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) state.vars[k] = vars[k];
      }
      // energy 变量联动能量条
      if (typeof vars.energy === 'number' && isFinite(vars.energy)) {
        setEnergyInternal(vars.energy);
      }
    }

    function setEnergyInternal(n) {
      n = Number(n);
      if (!isFinite(n)) return;
      state.energy = n;
      if (energyNumEl) {
        energyNumEl.textContent = String(n);
        energyNumEl.classList.toggle('neg', n < 0);
      }
      var filled = Math.max(0, Math.min(ENERGY_MAX, Math.floor(n)));
      for (var i = 0; i < cellEls.length; i++) {
        cellEls[i].classList.toggle('on', i < filled);
      }
    }

    function setOutputInternal(text) {
      text = (text === undefined || text === null) ? '' : String(text);
      var changed = (text !== state.output);
      state.output = text;
      if (!screenTextEl) return;
      if (text === '') {
        screenTextEl.textContent = '（还没有输出）';
        screenTextEl.classList.add('empty');
      } else {
        screenTextEl.textContent = text;
        screenTextEl.classList.remove('empty');
      }
      if (changed && text !== '' && !instant()) {
        screenTextEl.classList.remove('flash');
        // 强制重启动画
        void screenTextEl.offsetWidth;
        screenTextEl.classList.add('flash');
        later(function () { screenTextEl.classList.remove('flash'); }, 550);
      }
    }

    function showCondInternal(result) {
      if (!lampEl) return;
      var truthy = !!result;
      lampEl.hidden = false;
      lampEl.dataset.state = truthy ? 'true' : 'false';
      lampIconEl.textContent = truthy ? '✓' : '✗';
      lampTextEl.textContent = truthy ? '真' : '假';
      blinkMood(truthy ? 'happy' : 'confused', 1100);
    }

    function setDoorInternal(open) {
      if (!doorFrameEl) return;
      var isOpen = !!open;
      doorFrameEl.classList.toggle('open', isOpen);
      if (doorStateEl) {
        doorStateEl.textContent = isOpen ? '门开啦！' : '门关着';
        doorStateEl.classList.toggle('open', isOpen);
      }
    }

    function branchInternal(taken) {
      if (!tracksEl) return;
      if (taken === 'then' || taken === 'else') {
        tracksEl.dataset.taken = taken;
      } else {
        delete tracksEl.dataset.taken;
      }
    }

    function highlightLineInternal(lineNo) {
      if (lineChipEl) {
        if (typeof lineNo === 'number' && isFinite(lineNo)) {
          lineChipEl.textContent = '▶ 正在执行第 ' + lineNo + ' 行';
          lineChipEl.hidden = false;
        } else {
          lineChipEl.hidden = true;
        }
      }
      if (typeof opts.onHighlightLine === 'function' &&
          typeof lineNo === 'number' && isFinite(lineNo)) {
        try { opts.onHighlightLine(lineNo); } catch (e) { /* 联动回调出错不影响动画 */ }
      }
    }

    /** 命令队列（sequence 布局）追加一枚已执行命令的小卡片。 */
    function addSeqChip(kind, entry) {
      if (!seqEl) return;
      var idx = seqEl.children.length + 1;
      var chip = h(doc, 'span', 'viz-chip', idx + '. ' + (KIND_LABEL[kind] || '执行命令'));
      if (entry && entry.description) chip.title = entry.description;
      seqEl.appendChild(chip);
    }

    /** 函数机器：输入滑入 → 齿轮转动 → 输出滑出。 */
    function runMachine(outputText) {
      if (!machineEl) return;
      var outText = (outputText === '' || outputText === undefined || outputText === null)
        ? '完成' : String(outputText);
      if (instant()) {
        tokenInEl.className = 'viz-token viz-token-in';
        tokenOutEl.textContent = outText;
        tokenOutEl.classList.add('show');
        return;
      }
      // 重置
      tokenInEl.className = 'viz-token viz-token-in';
      tokenOutEl.className = 'viz-token viz-token-out';
      tokenOutEl.textContent = '';
      void tokenInEl.offsetWidth;
      tokenInEl.classList.add('show');
      later(function () { tokenInEl.classList.add('go'); }, 300);
      later(function () { if (mboxEl) mboxEl.classList.add('working'); }, 500);
      later(function () {
        if (mboxEl) mboxEl.classList.remove('working');
        tokenOutEl.textContent = outText;
        tokenOutEl.classList.add('show');
      }, 1300);
    }

    function celebrateInternal() {
      var parent = stageEl || root;
      var overlay = h(doc, 'div', 'viz-stars');
      var chars = ['★', '✦', '✧'];
      var colors = ['var(--c-accent,#f59e0b)', 'var(--c-ok,#22c55e)',
                    'var(--c-primary,#3b82f6)', 'var(--c-err,#ef4444)'];
      for (var i = 0; i < 16; i++) {
        var star = h(doc, 'span', 'viz-star', chars[i % chars.length]);
        star.style.left = (5 + Math.random() * 90) + '%';
        star.style.top = (40 + Math.random() * 50) + '%';
        star.style.color = colors[i % colors.length];
        star.style.animationDelay = (Math.random() * 0.35) + 's';
        overlay.appendChild(star);
      }
      parent.appendChild(overlay);
      blinkMood('happy', 1600);
      // no-anim 下星星不做动画，静态展示一小会儿后移除（不是过渡，不违反瞬时原则）
      delayReal(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, instant() ? 700 : 1700);
    }

    function resetInternal() {
      // 清计时器
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      // 变量与能量
      state.vars = {};
      if (varsEl) varsEl.innerHTML = '';
      if (state.initialVars) setVarsInternal(state.initialVars);
      setEnergyInternal(state.initialEnergy);
      // 输出
      setOutputInternal('');
      // 旁白与行号
      setCaption(state.caption || '');
      highlightLineInternal(null);
      // 灯 / 门 / 轨道
      if (lampEl) {
        lampEl.dataset.state = 'idle';
        lampIconEl.textContent = '?';
        lampTextEl.textContent = '等待检查';
        if (lampEl.classList.contains('viz-condbadge')) lampEl.hidden = true;
      }
      setDoorInternal(false);
      branchInternal(null);
      // 队列 / 机器 / 星星 / 表情
      if (seqEl) seqEl.innerHTML = '';
      if (machineEl) {
        tokenInEl.className = 'viz-token viz-token-in';
        tokenInEl.textContent = '原料';
        tokenOutEl.className = 'viz-token viz-token-out';
        tokenOutEl.textContent = '';
        if (mboxEl) mboxEl.classList.remove('working');
      }
      var stars = root.querySelectorAll('.viz-stars');
      for (var s = 0; s < stars.length; s++) {
        if (stars[s].parentNode) stars[s].parentNode.removeChild(stars[s]);
      }
      setMood('normal');
    }

    /**
     * 按 TraceEntry（CONTRACT §4）自动驱动动画：
     *   declare/assign → 变量盒换值 + 能量条；
     *   output         → 输出屏（function 布局还会开动函数机器）；
     *   if             → 真假灯 + 分支轨道（door 布局联动开关门）。
     */
    function applyTraceEntryInternal(entry) {
      if (!entry || typeof entry !== 'object') return;
      if (typeof entry.lineNo === 'number') highlightLineInternal(entry.lineNo);
      if (typeof entry.description === 'string' && entry.description) {
        setCaption(entry.description);
      }
      var kind = entry.kind;
      if (kind === 'declare' || kind === 'assign') {
        var prevOut = state.output;
        setVarsInternal(entry.varsAfter || {});
        // varsAfter 不带输出信息，保持输出屏与 outputSoFar 同步
        if (typeof entry.outputSoFar === 'string' && entry.outputSoFar !== prevOut) {
          setOutputInternal(entry.outputSoFar);
        }
        blinkMood('happy', 800);
        addSeqChip(kind, entry);
      } else if (kind === 'output') {
        var newOut = (typeof entry.outputSoFar === 'string') ? entry.outputSoFar : state.output;
        if (model === 'function') {
          // 送进机器的是"这一步新产出的"那截输出
          var delta = (newOut.indexOf(state.output) === 0)
            ? newOut.slice(state.output.length) : newOut;
          runMachine(delta);
        }
        setOutputInternal(newOut);
        if (entry.varsAfter) setVarsInternal(entry.varsAfter);
        blinkMood('happy', 800);
        addSeqChip(kind, entry);
      } else if (kind === 'if') {
        if (entry.condValue !== undefined) showCondInternal(entry.condValue);
        if (entry.branchTaken === 'then' || entry.branchTaken === 'else') {
          branchInternal(entry.branchTaken);
        }
        if (model === 'door' && entry.condValue !== undefined) {
          setDoorInternal(!!entry.condValue);
        }
        if (entry.varsAfter) setVarsInternal(entry.varsAfter);
        addSeqChip(kind, entry);
      } else {
        // 未知 kind：尽力同步状态，不报错不卡课
        if (entry.varsAfter) setVarsInternal(entry.varsAfter);
        if (typeof entry.outputSoFar === 'string') setOutputInternal(entry.outputSoFar);
      }
    }

    // ---- 初始状态 ----
    if (state.initialVars) setVarsInternal(state.initialVars);
    setEnergyInternal(state.initialEnergy);

    // ------------------------------------------------------ ctrl 对象 --

    function guarded(fn) {
      return function () {
        if (state.destroyed) return undefined;
        return fn.apply(null, arguments);
      };
    }

    var ctrl = {
      applyTraceEntry: guarded(applyTraceEntryInternal),
      setVars: guarded(setVarsInternal),
      reset: guarded(resetInternal),
      setSkin: guarded(function (skin) {
        if (SKIN_LIST.indexOf(skin) < 0) return;
        state.skin = skin;
        if (robotEl) {
          var mood = robotEl.dataset.mood || 'normal';
          robotEl.innerHTML = skinSvg(skin);
          robotEl.dataset.mood = mood;
        }
      }),
      setEnergy: guarded(setEnergyInternal),
      showCond: guarded(showCondInternal),
      setDoor: guarded(setDoorInternal),
      highlightLine: guarded(highlightLineInternal),
      branch: guarded(branchInternal),
      celebrate: guarded(celebrateInternal),
      destroy: function () {
        if (state.destroyed) return;
        state.destroyed = true;
        for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
        timers.length = 0;
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      // 额外辅助（契约之外的便利方法，app.js 可用可不用）
      setCaption: guarded(setCaption),
      setMood: guarded(setMood),
      getModel: function () { return model; },
      getState: function () {
        return {
          model: model, skin: state.skin, energy: state.energy,
          vars: JSON.parse(JSON.stringify(state.vars)), output: state.output,
          destroyed: state.destroyed
        };
      }
    };

    return ctrl;
  }

  // ------------------------------------------------------------- 导出 --

  var Visualizer = {
    mount: mount,
    SKINS: SKIN_LIST.slice(),
    SKIN_NAMES_CN: {
      'robo-blue': SKIN_CN['robo-blue'],
      'robo-orange': SKIN_CN['robo-orange'],
      'robo-dog': SKIN_CN['robo-dog']
    },
    MODELS: MODEL_LIST.slice(),
    ENERGY_MAX: ENERGY_MAX
  };

  CppLab.Visualizer = Visualizer;

  if (typeof module !== 'undefined' && module.exports) { module.exports = Visualizer; }
})();
