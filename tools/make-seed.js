#!/usr/bin/env node
/**
 * make-seed.js — 生成课前会话种子（server.js 的 --seed 参数用）
 *
 * 为什么需要它：
 *   localStorage 按「机器 × 浏览器 × origin」三重隔离。学生在自己的 MacBook Air 上、
 *   通过 http://<老师Mac的IP>:8080 打开儿童端时，那是一个全新的 origin，
 *   老师电脑上试听课留下的存档一个字节都带不过去。
 *   不给种子的话：档位会掉回默认的 S（不是我们要的 A）、孩子要重新填昵称并从
 *   三个世界里挑一个、教师端还会默认停在「试听」页签而不是第 1 课。
 *
 * 用法：
 *   node tools/make-seed.js --nickname "闪电小队长" > server/seed.json
 *   node server/server.js --port 8080 --seed server/seed.json
 *
 * 参数：
 *   --nickname <昵称>   孩子的昵称，会出现在作品卡标题「XXX 的作品」上（默认：小指挥官）
 *   --path <E|S|A>      难度档位（默认：A）
 *   --theme <robot|pet|adventure>  主题世界（默认：robot 机器人世界）
 *
 * 结构依据 docs/CONTRACT.md §7 与 js/engine/storage.js 的 defaultSession()。
 */

'use strict';

function parseArgs(argv) {
  var out = { nickname: '小指挥官', path: 'A', theme: 'robot' };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i];
    if (k === '--nickname' && argv[i + 1]) { out.nickname = argv[++i]; }
    else if (k === '--path' && argv[i + 1]) { out.path = argv[++i].toUpperCase(); }
    else if (k === '--theme' && argv[i + 1]) { out.theme = argv[++i]; }
  }
  if (['E', 'S', 'A'].indexOf(out.path) < 0) {
    throw new Error('--path 只能是 E、S 或 A，收到：' + out.path);
  }
  if (['robot', 'pet', 'adventure'].indexOf(out.theme) < 0) {
    throw new Error('--theme 只能是 robot、pet 或 adventure，收到：' + out.theme);
  }
  return out;
}

// 主题 → 搭档皮肤（对应 js/ui/app.js 的 THEMES 映射）
var SKIN_BY_THEME = {
  robot: 'robo-blue',      // 机器人世界 → 蓝色圆滚滚
  pet: 'robo-dog',         // 宠物乐园   → 绿色电力狗
  adventure: 'robo-orange' // 探险王国   → 橙色方块侠
};

function buildSeed(opt) {
  var now = new Date().toISOString();
  return {
    sessionId: 'sess-seed-' + Date.now().toString(36),
    createdAt: now,
    nickname: opt.nickname,
    theme: opt.theme,
    robotSkin: SKIN_BY_THEME[opt.theme],
    path: opt.path,
    scaffoldHistory: [
      { at: now, from: null, to: opt.path, by: 'teacher', note: '课前按试听表现直接定档（存档跨机器丢失，改用种子注入）' }
    ],
    lessons: {
      // 试听已在老师电脑上真实上过，但那份 localStorage 带不过来。
      // 这里标记 completed:true 有两个实际作用：
      //   1) 首页不再催孩子去上试听；
      //   2) 教师端不会默认停在「试听」页签（它选的是第一门未完成的课）。
      // activityStates 留空是诚实的：我们确实没有那次试听的逐活动证据。
      trial: { completed: true, activityStates: {}, interests: [], aiHabit: null },
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

if (require.main === module) {
  try {
    var opt = parseArgs(process.argv.slice(2));
    process.stdout.write(JSON.stringify(buildSeed(opt), null, 2) + '\n');
  } catch (e) {
    process.stderr.write('生成失败：' + e.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { parseArgs: parseArgs, buildSeed: buildSeed, SKIN_BY_THEME: SKIN_BY_THEME };
