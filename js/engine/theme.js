/* ============================================================
 * js/engine/theme.js — CppLab.Theme（渲染层主题化引擎）
 * owner: theme ｜ 依据: docs/CONTRACT.md §13-3
 *
 * 总架构裁定：内容文件 js/content/*.js 永远保持「机器人世界」正本；
 * 三主题（robot/pet/adventure）只在渲染层做词汇/图标替换。
 *
 * - t(text, themeId)：正本中文 → 主题词汇。robot 恒等返回；
 *   最长优先匹配；identity 保护词条（机器人世界/宠物乐园/探险王国/
 *   机器人与机械）先行切分、原样保留。
 * - icon(emoji, themeId)：故事图标按主题换（🔋→🥫/💎 等）。
 * - skinName(skin)：皮肤名跨主题统一（蓝色圆滚滚/橙色方块侠/绿色电力狗）。
 * - 词典只含中文故事词：代码字符串（C++ 标识符、OPEN/CHARGE 字面量、
 *   编译器输出）天然不受影响；「能量」一词与能量条格数体系全课程保留。
 *
 * 纯逻辑模块：Node 兼容，顶层不访问 document/window。
 * ============================================================ */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  var THEME_IDS = ['robot', 'pet', 'adventure'];

  /* identity 保护词条：切分后原样保留，绝不进词典替换。
   * 「机器人与机械」是兴趣类别名（不等于当前故事主题），跨主题必须一致。 */
  var PROTECTED = ['机器人与机械', '机器人世界', '宠物乐园', '探险王国'];

  /* 核心词典 + 长尾（正本 → [宠物乐园, 探险王国]）。
   * 构建时按正本词长度降序排序 = 最长优先匹配；同一道具全课程同词。 */
  var VOCAB = [
    /* ---- 整句/长尾词条（优先命中，避免机械拼接生硬） ---- */
    ['我是能量机器人！按「单步」，看我一格一格充能量～',
      '我是小狗搭档！按「单步」，看我的能量一格一格变化～',
      '我是探险搭档！按「单步」，看我的能量一格一格变化～'],
    ['打开胸前的小门，露出能量盒', '推来一个能量盒', '打开背包，取出能量盒'],
    ['会思考的智能舱门', '会判断的聪明园门', '会判断的机关石门'],
    ['向你敬了个礼', '朝你摇了摇尾巴', '向你挥了挥手'],
    ['机器人能量站', '小狗能量补给屋', '水晶能量营地'],
    ['帮小猫充电', '给小猫喂能量罐头', '用能量水晶帮助小精灵'],
    ['机器人皮肤', '小狗装扮', '探险装扮'],
    ['函数机械师', '函数训练师', '函数机关师'],
    /* 旧「××机器人」皮肤叫法 → 统一皮肤名（lessonEngine 开场白模板等正本文案里出现） */
    ['蓝色圆滚机器人', '蓝色圆滚滚', '蓝色圆滚滚'],
    ['橙色方块机器人', '橙色方块侠', '橙色方块侠'],
    ['绿色小狗机器人', '绿色电力狗', '绿色电力狗'],
    ['机器人伙伴', '小狗搭档', '探险搭档'],
    /* ---- 核心词典（总架构裁定给定，不许偏离） ---- */
    ['智能舱门', '聪明园门', '机关石门'],
    ['舱门', '园门', '石门'],
    ['太空宠物', '受困的小猫', '受困的小精灵'],
    ['宠物', '小猫', '小精灵'],
    ['能量豆', '能量罐头', '能量水晶'],
    ['电池', '能量罐头', '能量水晶'],
    ['机器人', '小狗搭档', '探险搭档'],
    ['飞船', '乐园救援车', '探险飞艇'],
    ['星际救援', '乐园救援', '王国救援'],
    ['充电机', '能量喂食机', '水晶增能机'],
    ['探照灯', '小夜灯', '探险火把'],
    ['能量站', '能量补给屋', '能量营地'],
    ['基地', '乐园', '探险营地'],
    ['喇叭', '扩音器', '号角'],
    ['燃料', '能量', '能量'],
    ['指挥官', '小队长', '探险队长'],
    /* ---- 按盘点清单补充的长尾（同一道具同词） ---- */
    ['充电站', '能量补给屋', '能量营地'],
    ['充电门', '补给大门', '水晶试炼门'],
    ['充电', '补充能量', '补充能量'],
    ['能量舱', '乐园小屋', '遗迹石室'],
    ['救援星球', '宠物乐园', '探险王国'],
    ['星球', '乐园', '王国'],
    ['点火起飞', '启动出发', '点亮启航符文'],
    ['起飞', '出发', '启航'],
    ['点火', '启动', '点亮符文'],
    ['降落', '到站', '降落'],
    ['返航', '返程', '返航'],
    ['主驾驶', '小队长', '探险队长'],
    ['神秘乘客', '神秘帮手', '神秘向导'],
    ['维修单', '补给单', '机关检修图'],
    ['图纸', '设计卡', '机关图'],
    ['衣柜', '装扮箱', '装备箱'],
    ['皮肤', '装扮', '装扮'],
    ['发射', '发送', '发送']
  ];

  /* 故事图标（🔋 电池/⛽ 燃料/🚀 飞船/🔦 探照灯/🤖 机器人） */
  var ICON_MAP = {
    '🔋': ['🥫', '💎'],
    '⛽': ['🥫', '💎'],
    '🚀': ['🚐', '🛸'],
    '🔦': ['💡', '🔥'],
    '🤖': ['🐶', '🎒']
  };

  /* 皮肤名统一：跨主题不变（保护规则②） */
  var SKIN_NAME = {
    'robo-blue': '蓝色圆滚滚',
    'robo-orange': '橙色方块侠',
    'robo-dog': '绿色电力狗'
  };

  /* ------------------------------------------------------------ 构建 -- */

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }

  /* 最长优先：按正本词长度降序 */
  var SORTED = VOCAB.slice().sort(function (a, b) { return b[0].length - a[0].length; });

  var LOOKUP = {};
  SORTED.forEach(function (row) { LOOKUP[row[0]] = [row[1], row[2]]; });

  var VOCAB_RE = new RegExp(SORTED.map(function (row) { return escapeRe(row[0]); }).join('|'), 'g');

  /* 保护切分：capture group 让 split 保留保护词条本身 */
  var PROTECT_SORTED = PROTECTED.slice().sort(function (a, b) { return b.length - a.length; });
  var PROTECT_RE = new RegExp('(' + PROTECT_SORTED.map(escapeRe).join('|') + ')');
  var PROTECT_SET = {};
  PROTECTED.forEach(function (p) { PROTECT_SET[p] = true; });

  /* ------------------------------------------------------------ 状态 -- */

  var currentThemeId = null;

  function normalize(id) {
    return THEME_IDS.indexOf(id) >= 0 ? id : 'robot';
  }

  function sessionTheme() {
    try {
      if (CppLab.Storage && typeof CppLab.Storage.load === 'function') {
        var s = CppLab.Storage.load();
        if (s && s.theme) return s.theme;
      }
    } catch (e) { /* Storage 不可用时退回 robot */ }
    return null;
  }

  /** themeId 省略时读当前 session.theme（setTheme 缓存优先，Storage 兜底） */
  function resolveTheme(themeId) {
    return normalize(themeId || currentThemeId || sessionTheme() || 'robot');
  }

  /* ------------------------------------------------------------ API -- */

  function t(text, themeId) {
    if (text === null || text === undefined) return text;
    var id = resolveTheme(themeId);
    var str = String(text);
    if (id === 'robot') return str; /* robot 恒等 */
    var idx = (id === 'pet') ? 0 : 1;
    var parts = str.split(PROTECT_RE);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === undefined || seg === '') continue;
      if (PROTECT_SET[seg]) { out += seg; continue; }
      out += seg.replace(VOCAB_RE, function (m) {
        var pair = LOOKUP[m];
        return pair ? pair[idx] : m;
      });
    }
    return out;
  }

  function icon(emoji, themeId) {
    if (emoji === null || emoji === undefined) return emoji;
    var id = resolveTheme(themeId);
    if (id === 'robot') return String(emoji);
    var pair = ICON_MAP[String(emoji)];
    if (!pair) return String(emoji);
    return (id === 'pet') ? pair[0] : pair[1];
  }

  function skinName(skin) {
    return SKIN_NAME[skin] || '我的伙伴';
  }

  function setTheme(themeId) {
    currentThemeId = normalize(themeId);
  }

  function getTheme() {
    return resolveTheme();
  }

  /* ---------- 导出 ---------- */
  var Theme = {
    t: t,
    icon: icon,
    skinName: skinName,
    setTheme: setTheme,
    getTheme: getTheme,
    THEMES: THEME_IDS.slice(),
    PROTECTED: PROTECTED.slice()
  };

  CppLab.Theme = Theme;

  if (typeof module !== 'undefined' && module.exports) { module.exports = Theme; }
})();
