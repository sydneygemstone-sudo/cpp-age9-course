/* =============================================================================
 * test-compiler.js — CppLab.Compiler 与 CppLab.Hints 单元测试
 * 运行：node js/tests/test-compiler.js
 * 零依赖；失败输出 FAIL 并 process.exitCode = 1；成功输出 PASS (n assertions)。
 *
 * 错误映射用例全部来自 2026-08-04 对 Compiler Explorer (x86-64 gcc 14.3,
 * -std=c++17 -Wall) 的真实 curl 实测 stderr 录制，非手编。
 * ========================================================================== */

'use strict';

var path = require('path');
var Compiler = require(path.join(__dirname, '..', 'engine', 'compiler.js'));
var Hints = require(path.join(__dirname, '..', 'engine', 'hints.js'));

var assertions = 0;
function assert(cond, msg) {
  assertions++;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

/* ===========================================================================
 * 第一部分：友好错误映射（真实 g++ 14.3 stderr 录制样本）
 * ======================================================================== */

// 样本 1：缺分号（int energy = 3 后漏 ';'）
var STDERR_SEMICOLON = [
  "<source>: In function 'int main()':",
  "<source>:4:5: error: expected ',' or ';' before 'std'",
  '    4 |     std::cout << energy << std::endl;',
  '      |     ^~~'
].join('\n');

// 样本 2：未声明变量
var STDERR_UNDECLARED = [
  "<source>: In function 'int main()':",
  "<source>:3:5: error: 'energy' was not declared in this scope",
  '    3 |     energy = 3;',
  '      |     ^~~~~~'
].join('\n');

// 样本 3：引号未闭合（同时引发连锁的 primary-expression 错误）
var STDERR_UNTERMINATED = [
  '<source>:3:18: warning: missing terminating " character',
  '    3 |     std::cout << "hello;',
  '      |                  ^',
  '<source>:3:18: error: missing terminating " character',
  '    3 |     std::cout << "hello;',
  '      |                  ^~~~~~~',
  "<source>: In function 'int main()':",
  "<source>:4:5: error: expected primary-expression before 'return'",
  '    4 |     return 0;',
  '      |     ^~~~~~'
].join('\n');

// 样本 4：花括号不匹配
var STDERR_BRACE = [
  "<source>: In function 'int main()':",
  "<source>:6:2: error: expected '}' at end of input",
  '    6 | }',
  '      |  ^',
  "<source>:2:12: note: to match this '{'",
  '    2 | int main() {',
  '      |            ^'
].join('\n');

// 样本 5：小括号不匹配（g++ 先报分号，再报括号）
var STDERR_PAREN = [
  "<source>: In function 'int main()':",
  "<source>:3:14: error: expected ';' before '{' token",
  '    3 |     if (3 > 2 {',
  '      |              ^~',
  '      |              ;',
  '<source>:3:11: warning: statement has no effect [-Wunused-value]',
  "<source>:6:5: error: expected primary-expression before 'return'",
  '    6 |     return 0;',
  "<source>:5:6: error: expected ')' before 'return'",
  '    5 |     }',
  '      |      ^',
  '      |      )',
  "<source>:3:8: note: to match this '('"
].join('\n');

// 样本 6：缺表达式
var STDERR_MISSING_EXPR = [
  "<source>: In function 'int main()':",
  "<source>:3:18: error: expected primary-expression before ';' token",
  '    3 |     int energy = ;',
  '      |                  ^'
].join('\n');

// 样本 7：类型不匹配
var STDERR_TYPE = [
  "<source>: In function 'int main()':",
  "<source>:3:18: error: invalid conversion from 'const char*' to 'int' [-fpermissive]",
  '    3 |     int energy = "hello";',
  '      |                  ^~~~~~~'
].join('\n');

// 样本 8：if 条件里的 = （编译成功 code 0，仅 -Wparentheses 警告）
var STDERR_ASSIGN_IF = [
  "<source>: In function 'int main()':",
  '<source>:4:16: warning: suggest parentheses around assignment used as truth value [-Wparentheses]',
  '    4 |     if (energy = 10) {',
  '      |         ~~~~~~~^~~~'
].join('\n');

// 样本 9：带 ANSI 色码的原始形态（CE 实际返回逐行带 \x1b[..m / \x1b[K）
var STDERR_ANSI = '[01m[K<source>:4:5:[m[K ' +
  "[01;31m[Kerror: [m[Kexpected '[01m[K,[m[K' " +
  "or '[01m[K;[m[K' before '[01m[Kstd[m[K'";

(function testMapErrors() {
  var e;

  e = Compiler.mapErrors(STDERR_SEMICOLON, '');
  assert(e.length === 1, '缺分号：应恰好 1 条友好错误，得到 ' + e.length);
  assert(e[0].line === 4, '缺分号：line 应为 4，得到 ' + e[0].line);
  assert(e[0].message === '编译器在第4行附近没有找到分号。', '缺分号：message 文案不符：' + e[0].message);
  assert(e[0].hint.indexOf('第3行') >= 0, '缺分号：hint 应指向上一行（第3行）：' + e[0].hint);

  e = Compiler.mapErrors(STDERR_UNDECLARED, '');
  assert(e.length === 1, '未声明：应 1 条，得到 ' + e.length);
  assert(e[0].line === 3, '未声明：line 应为 3');
  assert(e[0].message.indexOf('energy') >= 0, '未声明：message 应包含变量名 energy：' + e[0].message);
  assert(e[0].hint.indexOf('声明') >= 0, '未声明：hint 应提到声明');

  e = Compiler.mapErrors(STDERR_UNTERMINATED, '');
  assert(e.length === 1, '引号未闭合：连锁错误应被吸收，只剩 1 条，得到 ' + e.length);
  assert(e[0].message.indexOf('引号') >= 0, '引号未闭合：message 应提到引号：' + e[0].message);
  assert(e[0].line === 3, '引号未闭合：line 应为 3');

  e = Compiler.mapErrors(STDERR_BRACE, '');
  assert(e.length === 1, '花括号：应 1 条，得到 ' + e.length);
  assert(e[0].message.indexOf('花括号') >= 0, '花括号：message 应提到花括号：' + e[0].message);

  e = Compiler.mapErrors(STDERR_PAREN, '');
  assert(e.length === 3, '小括号样本：分号+缺表达式+小括号 = 3 条，得到 ' + e.length);
  var hasParen = e.some(function (x) { return x.message.indexOf('小括号') >= 0; });
  assert(hasParen, '小括号样本：应包含小括号配对提示');

  e = Compiler.mapErrors(STDERR_MISSING_EXPR, '');
  assert(e.length === 1, '缺表达式：应 1 条，得到 ' + e.length);
  assert(e[0].line === 3 && e[0].message.indexOf('少了') >= 0, '缺表达式：文案应说"少了一块内容"：' + e[0].message);

  e = Compiler.mapErrors(STDERR_TYPE, '');
  assert(e.length === 1, '类型不匹配：应 1 条，得到 ' + e.length);
  assert(e[0].message.indexOf('盒子') >= 0, '类型不匹配：message 应用盒子比喻：' + e[0].message);

  e = Compiler.mapErrors(STDERR_ASSIGN_IF, '');
  assert(e.length === 1, '=/==：-Wparentheses 警告应映射为 1 条，得到 ' + e.length);
  assert(e[0].line === 4, '=/==：line 应为 4');
  assert(e[0].message.indexOf('==') >= 0, '=/==：message 应提到 ==：' + e[0].message);

  // ANSI 剥离
  e = Compiler.mapErrors(STDERR_ANSI, '');
  assert(e.length === 1 && e[0].line === 4, 'ANSI：带色码的 stderr 也应正确解析出第4行缺分号');

  // 源码规则补充检测：stderr 里没有 -Wparentheses 时，if(x = n) 也要提醒
  e = Compiler.mapErrors('', 'int main() {\n    int a = 1;\n    if (a = 5) { }\n    return 0;\n}');
  assert(e.length === 1 && e[0].line === 3, '规则检测：源码 if(a = 5) 应产生第3行提醒');

  // if (a == 5) 不应误报
  e = Compiler.mapErrors('', 'int main() {\n    int a = 1;\n    if (a == 5) { }\n    return 0;\n}');
  assert(e.length === 0, '规则检测：if(a == 5) 不应误报，得到 ' + e.length + ' 条');

  // 空 stderr → 空数组
  e = Compiler.mapErrors('', '');
  assert(Array.isArray(e) && e.length === 0, '空 stderr 应返回空数组');
})();

/* ===========================================================================
 * 第二部分：适配器行为（注入假 fetch，全部离线可测）
 * ======================================================================== */

function jsonResponse(obj) {
  return { ok: true, status: 200, json: function () { return Promise.resolve(obj); } };
}

// CE 正常返回形态（按 2026-08-04 实测响应裁剪）
function ceOkBody(stdoutText) {
  return {
    code: 0,
    stdout: [], stderr: [],
    execResult: {
      code: 0, timedOut: false, truncated: false,
      stdout: [{ text: stdoutText }], stderr: [],
      didExecute: true
    }
  };
}

function ceCompileErrorBody() {
  return {
    code: 1,
    stdout: [],
    stderr: STDERR_SEMICOLON.split('\n').map(function (t) { return { text: t }; }),
    execResult: null
  };
}

// Wandbox 正常返回形态
var WB_OK = {
  status: '0', signal: '',
  compiler_output: '', compiler_error: '', compiler_message: '',
  program_output: '7\n', program_error: '', program_message: '7\n'
};

// Wandbox 沙箱故障形态（2026-08-04 实测原文）
var WB_SANDBOX_DOWN = {
  status: '126', signal: '',
  compiler_output: '',
  compiler_error: 'Error: OCI runtime error: crun: clone: Resource temporarily unavailable\n',
  compiler_message: 'Error: OCI runtime error: crun: clone: Resource temporarily unavailable\n',
  program_output: '', program_error: '', program_message: ''
};

var SRC_OK = '#include <iostream>\nint main(){ std::cout << 7; return 0; }';

function runAdapterTests() {
  var chain = Promise.resolve();

  function testCase(name, setup, check) {
    chain = chain.then(function () {
      Compiler._resetForTests();
      Compiler._setThrottleMs(0);
      setup();
      return Compiler.compile({ activityId: 'test', source: SRC_OK, mode: 'free' })
        .then(check)
        .catch(function (err) {
          assert(false, name + '：compile() 不应 reject：' + (err && err.message));
        });
    });
    return chain;
  }

  // 1. 无 fetch（Node 无网环境）→ 优雅 offline
  testCase('无fetch', function () {
    Compiler._setFetch(null);
  }, function (r) {
    assert(r.status === 'offline', '无fetch：status 应为 offline，得到 ' + r.status);
    assert(r.real === false, '无fetch：real 必须为 false');
    assert(Array.isArray(r.friendlyErrors), '无fetch：friendlyErrors 应为数组');
  });

  // 2. fetch 全部抛错（断网）→ offline
  testCase('断网', function () {
    Compiler._setFetch(function () { return Promise.reject(new Error('ENOTFOUND')); });
  }, function (r) {
    assert(r.status === 'offline' && r.real === false, '断网：应 offline / real:false');
  });

  // 3. CE 成功 → ok / real:true / stdout
  testCase('CE成功', function () {
    Compiler._setFetch(function (url) {
      assert(url.indexOf('godbolt.org') >= 0, 'CE成功：应首先调用 Compiler Explorer');
      return Promise.resolve(jsonResponse(ceOkBody('7')));
    });
  }, function (r) {
    assert(r.status === 'ok', 'CE成功：status 应为 ok，得到 ' + r.status);
    assert(r.real === true, 'CE成功：真实远程编译 real 应为 true');
    assert(r.stdout === '7', 'CE成功：stdout 应为 "7"，得到 ' + JSON.stringify(r.stdout));
    assert(r.compilerVersion.indexOf('gcc 14.3') >= 0, 'CE成功：compilerVersion 应标注 gcc 14.3');
    assert(typeof r.elapsedMs === 'number', 'CE成功：应有 elapsedMs');
  });

  // 4. CE 编译错误 → compile_error + 友好错误 + 教师端原始 stderr
  testCase('CE编译错误', function () {
    Compiler._setFetch(function () {
      return Promise.resolve(jsonResponse(ceCompileErrorBody()));
    });
  }, function (r) {
    assert(r.status === 'compile_error', 'CE编译错误：status 应为 compile_error，得到 ' + r.status);
    assert(r.real === true, 'CE编译错误：真实编译结果 real 仍为 true');
    assert(r.friendlyErrors.length === 1 && r.friendlyErrors[0].line === 4,
      'CE编译错误：应映射出第4行缺分号');
    assert(r.compileOutput.indexOf("expected ',' or ';'") >= 0,
      'CE编译错误：compileOutput 应保留原始 g++ stderr 给教师端');
  });

  // 5. CE 失败 → 自动 fallback Wandbox 成功
  testCase('fallback到Wandbox', function () {
    Compiler._setFetch(function (url) {
      if (url.indexOf('godbolt.org') >= 0) return Promise.reject(new Error('CE down'));
      return Promise.resolve(jsonResponse(WB_OK));
    });
  }, function (r) {
    assert(r.status === 'ok' && r.real === true, 'fallback：Wandbox 成功应 ok / real:true');
    assert(r.stdout.indexOf('7') === 0, 'fallback：stdout 应来自 Wandbox program_output');
    assert(r.compilerVersion.indexOf('Wandbox') >= 0, 'fallback：compilerVersion 应标注 Wandbox');
  });

  // 6. CE 失败 + Wandbox 沙箱故障（HTTP 200 但 OCI 错误）→ offline，不冒充结果
  testCase('Wandbox沙箱故障', function () {
    Compiler._setFetch(function (url) {
      if (url.indexOf('godbolt.org') >= 0) return Promise.reject(new Error('CE down'));
      return Promise.resolve(jsonResponse(WB_SANDBOX_DOWN));
    });
  }, function (r) {
    assert(r.status === 'offline' && r.real === false,
      'Wandbox沙箱故障：必须识别为基础设施失败并 offline，得到 ' + r.status);
  });

  // 7. 远程执行超时（CE execResult.timedOut）→ status timeout + 超时友好提示
  testCase('远程执行超时', function () {
    var body = ceOkBody('');
    body.execResult.timedOut = true;
    body.execResult.code = 137;
    Compiler._setFetch(function () { return Promise.resolve(jsonResponse(body)); });
  }, function (r) {
    assert(r.status === 'timeout', '执行超时：status 应为 timeout，得到 ' + r.status);
    assert(r.friendlyErrors.length === 1 && r.friendlyErrors[0].message.indexOf('太久') >= 0,
      '执行超时：应有"跑了太久"友好提示');
  });

  // 8. 网络层超时（AbortController 生效）→ 两端都挂 → offline
  testCase('网络层超时', function () {
    Compiler._setTimeoutMs(30);
    Compiler._setFetch(function (url, opts) {
      return new Promise(function (resolve, reject) {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', function () {
            reject(new Error('AbortError'));
          });
        }
        // 永不 resolve，等 abort
      });
    });
  }, function (r) {
    assert(r.status === 'offline', '网络超时：15s(测试30ms)后应降级 offline，得到 ' + r.status);
    assert(r.real === false, '网络超时：real 必须为 false');
  });

  // 9. stdout 截断 10KB + "输出过多"提示
  testCase('stdout截断', function () {
    var big = new Array(3000).join('哈哈哈哈'); // 远超 10KB
    Compiler._setFetch(function () {
      return Promise.resolve(jsonResponse(ceOkBody(big)));
    });
  }, function (r) {
    assert(r.stdout.length < 10240 + 60, '截断：stdout 应被截到 10KB 附近，得到 ' + r.stdout.length);
    assert(r.stdout.indexOf('裁掉') >= 0, '截断：截断处应有提示文字');
    var hasMsg = r.friendlyErrors.some(function (x) { return x.message.indexOf('太多话') >= 0; });
    assert(hasMsg, '截断：friendlyErrors 应含"输出过多"提示');
  });

  // 10. 节流：连续两次远程调用间隔 >= 1s
  chain = chain.then(function () {
    Compiler._resetForTests();
    Compiler._setThrottleMs(120); // 用 120ms 代表 1s，验证机制本身
    var callTimes = [];
    Compiler._setFetch(function () {
      callTimes.push(Date.now());
      return Promise.resolve(jsonResponse(ceOkBody('x')));
    });
    var p1 = Compiler.compile({ activityId: 'a', source: SRC_OK, mode: 'free' });
    var p2 = Compiler.compile({ activityId: 'b', source: SRC_OK, mode: 'free' });
    return Promise.all([p1, p2]).then(function () {
      assert(callTimes.length === 2, '节流：应发生两次远程调用');
      assert(callTimes[1] - callTimes[0] >= 100,
        '节流：两次调用间隔应 >= throttleMs，实际 ' + (callTimes[1] - callTimes[0]) + 'ms');
    });
  });

  // 11. MockAdapter：用 CppLab.IR.execute 的 stdout，real:false
  chain = chain.then(function () {
    Compiler._resetForTests();
    // 存根 IR（真实 ir.js 由 ir owner 提供，这里只验证 Compiler 侧协议）
    globalThis.CppLab.IR = {
      execute: function (program) {
        assert(Array.isArray(program), 'Mock：IR.execute 应收到 program 数组');
        return { trace: [], finalVars: { energy: 7 }, stdout: '7\n' };
      }
    };
    Compiler.setAdapter('mock');
    return Compiler.compile({
      activityId: 'lesson1-05-reach-ten',
      source: 'whatever',
      mode: 'verify',
      program: [{ op: 'output', expr: { kind: 'lit', value: 7 } }]
    }).then(function (r) {
      assert(r.status === 'ok', 'Mock：status 应为 ok，得到 ' + r.status);
      assert(r.real === false, 'Mock：real 必须为 false（红线：不伪造真实编译）');
      assert(r.stdout === '7\n', 'Mock：stdout 应来自 IR.execute');
    });
  });

  // 12. MockAdapter：mode 非 verify 或无 program → offline
  chain = chain.then(function () {
    return Compiler.compile({ activityId: 'x', source: 's', mode: 'free' }).then(function (r) {
      assert(r.status === 'offline' && r.real === false, 'Mock：mode:free 应返回 offline');
      return Compiler.compile({ activityId: 'x', source: 's', mode: 'verify' });
    }).then(function (r) {
      assert(r.status === 'offline', 'Mock：无 program 应返回 offline');
      delete globalThis.CppLab.IR;
      Compiler._resetForTests();
    });
  });

  // 13. setAdapter 校验
  chain = chain.then(function () {
    var threw = false;
    try { Compiler.setAdapter('nonsense'); } catch (e) { threw = true; }
    assert(threw, 'setAdapter：未知适配器名应抛错');
    assert(Compiler.getAdapterName() === 'remote', 'setAdapter：默认应为 remote');
  });

  return chain;
}

/* ===========================================================================
 * 第三部分：提示阶梯（Hints）
 * ======================================================================== */

function makeActivity(lessonId) {
  return {
    id: lessonId + '-01-demo',
    lessonId: lessonId,
    hintLadder: [
      { level: 'H1', text: '再读一遍任务：机器人要攒到 10 点能量。你觉得现在缺几点？' },
      { level: 'H2', text: '看看 energy 这个变量盒子，第 2 行给它加了多少？' },
      { level: 'H3', text: '答案不在加号那里——检查一下最后输出的是哪个变量。' },
      { level: 'H4', text: '如果一开始是 2，要到 6，就得加 4。咱们这题是一样的道理哦。' },
      { level: 'H5', text: '老师带你看：energy = energy + __; 空里填几才能到 10？填好后讲给老师听。', teacherOnly: true }
    ]
  };
}

function runHintsTests() {
  var act = makeActivity('lesson1');
  var id = act.id;

  Hints._resetForTests();

  // 1. 逐级发放 H1 → H4
  var r = Hints.next(id, act);
  assert(r.level === 'H1', '阶梯：第一次应发 H1，得到 ' + JSON.stringify(r));
  assert(typeof r.text === 'string' && r.text.length > 0, '阶梯：H1 应带文案');
  r = Hints.next(id, act);
  assert(r.level === 'H2', '阶梯：第二次应发 H2');
  r = Hints.next(id, act);
  assert(r.level === 'H3', '阶梯：第三次应发 H3');
  r = Hints.next(id, act);
  assert(r.level === 'H4', '阶梯：第四次应发 H4');

  // 2. H5 教师未解锁 → locked，且不记入 hintsUsed
  r = Hints.next(id, act);
  assert(r.locked === 'H5需教师解锁', '阶梯：H5 未解锁应返回 locked，得到 ' + JSON.stringify(r));
  assert(Hints.getUsed(id).indexOf('H5') < 0, '阶梯：locked 时 H5 不应记入 hintsUsed');

  // 3. 教师解锁后可发 H5
  Hints.unlockH5(id);
  assert(Hints.isH5Unlocked(id) === true, '阶梯：unlockH5 后 isH5Unlocked 应为 true');
  r = Hints.next(id, act);
  assert(r.level === 'H5', '阶梯：解锁后应发 H5');

  // 4. 用完 → exhausted
  r = Hints.next(id, act);
  assert(r.exhausted === true, '阶梯：H5 之后应 exhausted');

  // 5. hintsUsed 完整记录 + highestUsed
  var used = Hints.getUsed(id);
  assert(used.join(',') === 'H1,H2,H3,H4,H5', '记录：hintsUsed 应为 H1..H5，得到 ' + used.join(','));
  assert(Hints.highestUsed(id) === 'H5', '记录：highestUsed 应为 H5');
  assert(Hints.highestUsed('never-used') === null, '记录：未用过的活动 highestUsed 应为 null');

  // 6. 试听闸门：核心诊断未完成 → 儿童端 aiDisabled（红线 §14.7）
  Hints._resetForTests();
  var trialAct = makeActivity('trial');
  r = Hints.next(trialAct.id, trialAct);
  assert(r.aiDisabled === true, '试听：默认闸门关闭，应 aiDisabled');
  assert(r.text === '试听诊断阶段提示由老师给出', '试听：aiDisabled 文案应符合契约');
  assert(Hints.getUsed(trialAct.id).length === 0, '试听：aiDisabled 时不应记录 hintsUsed');

  // 7. 试听闸门期间教师端仍可见完整阶梯
  var tv = Hints.teacherLadder(trialAct.id, trialAct);
  assert(tv.ladder.length === 5, '教师端：试听闸门期间应见全部 5 档');
  assert(tv.aiDisabledForChild === true, '教师端：应能看到儿童端处于 aiDisabled 状态');
  assert(tv.ladder[4].teacherOnly === true, '教师端：H5 应标记 teacherOnly');

  // 8. 教师代读计入 hintsUsed
  Hints.markUsedByTeacher(trialAct.id, 'H1');
  assert(Hints.getUsed(trialAct.id).join(',') === 'H1', '教师代读：markUsedByTeacher 应记入');

  // 9. 闸门打开后儿童端恢复，接着上次进度发放
  Hints.setTrialGate(true);
  r = Hints.next(trialAct.id, trialAct);
  assert(r.level === 'H2', '试听：闸门打开后应接着教师已代读的 H1 发 H2，得到 ' + JSON.stringify(r));

  // 10. 非试听课程不受闸门影响
  Hints._resetForTests();
  var l2 = makeActivity('lesson2');
  r = Hints.next(l2.id, l2);
  assert(r.level === 'H1', '闸门：lesson2 不应受试听闸门影响');

  // 11. teacherLadder 不消耗阶梯（只读）
  Hints._resetForTests();
  Hints.teacherLadder(id, act);
  r = Hints.next(id, act);
  assert(r.level === 'H1', '教师端：teacherLadder 不应消耗儿童端阶梯');

  // 12. LLMHintProvider 只是占位：enabled:false + note
  assert(Hints.LLMHintProvider.enabled === false, 'LLM：feature flag 必须默认关闭');
  assert(Hints.LLMHintProvider.note === 'feature flag, 一期不启用', 'LLM：note 文案应符合契约');
  Hints.setProvider('llm');
  r = Hints.next('another-act', act);
  assert(r.level === 'H2' || r.level === 'H1', 'LLM：占位 provider 行为应与规则阶梯一致');
  Hints.setProvider('rule-based');
  assert(Hints.getProviderName() === 'rule-based', 'provider：应切回 rule-based');

  // 13. setProvider 非法输入抛错
  var threw = false;
  try { Hints.setProvider(42); } catch (e) { threw = true; }
  assert(threw, 'provider：非法 provider 应抛错');

  // 14. 空阶梯活动：直接 exhausted，不崩溃
  Hints._resetForTests();
  r = Hints.next('empty-act', { id: 'empty-act', lessonId: 'lesson1', hintLadder: [] });
  assert(r.exhausted === true, '空阶梯：应返回 exhausted');
  r = Hints.next('no-ladder', { id: 'no-ladder', lessonId: 'lesson1' });
  assert(r.exhausted === true, '无阶梯字段：应返回 exhausted 而非崩溃');

  Hints._resetForTests();
}

/* ===========================================================================
 * 运行
 * ======================================================================== */

runHintsTests();

runAdapterTests().then(function () {
  if (process.exitCode === 1) {
    console.error('测试未全部通过（见上方 FAIL）。');
  } else {
    console.log('PASS (' + assertions + ' assertions)');
  }
}).catch(function (err) {
  console.error('FAIL: 测试框架异常：', err && err.stack || err);
  process.exitCode = 1;
});
