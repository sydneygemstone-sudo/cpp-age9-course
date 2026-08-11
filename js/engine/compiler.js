/* =============================================================================
 * compiler.js — CppLab.Compiler（编译适配层）
 * =============================================================================
 * 职责（CONTRACT §8）：
 *   - RemoteAdapter：调公共编译执行 API 获得真实 g++ 编译与运行结果。
 *   - MockAdapter：无网/教学演示时用 CppLab.IR.execute 的 stdout，real:false。
 *   - 友好错误映射：把真实 g++ stderr 翻译成 9 类中文儿童化提示。
 *
 * 远程端点实测记录（2026-08-04，Bash curl 实测后写死，勿凭空改动）：
 *   主适配器：Compiler Explorer
 *     POST https://godbolt.org/api/compiler/g143/compile   (g143 = x86-64 gcc 14.3)
 *     请求: {source, options:{userArguments:'-std=c++17 -Wall',
 *            filters:{execute:true}, executeParameters:{stdin:''}}}
 *     实测: 正常程序 execResult.stdout 拿到输出；缺分号程序 stderr 拿到真实
 *          g++ 错误（含 ANSI 色码，需剥离）；stdin 透传可用；
 *          响应头含 Access-Control-Allow-Origin: * → 浏览器 file:// 可直连。
 *   备选适配器：Wandbox
 *     POST https://wandbox.org/api/compile.json
 *     请求: {code, compiler:'gcc-13.2.0', options:'',
 *            'compiler-option-raw':'-std=c++17 -Wall', stdin}
 *     实测: 响应头含 Access-Control-Allow-Origin: *；但 2026-08-04 其执行沙箱
 *          故障（HTTP 200 + status "126" + "OCI runtime error"），本适配器
 *          已按该故障形态做了识别：视为基础设施失败，不冒充编译结果。
 *
 * 红线（CONTRACT §14.1）：real:true 只允许来自远程真实编译；
 * 一切失败 → resolve {status:'offline', real:false}，绝不伪造"验证成功"。
 *
 * Node 兼容：顶层不触碰 document/window；文件末尾导出 module.exports。
 * ========================================================================== */

var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 常量配置
   * ------------------------------------------------------------------ */
  var CE_ENDPOINT = 'https://godbolt.org/api/compiler/g143/compile';
  var CE_VERSION = 'x86-64 gcc 14.3 (Compiler Explorer)';
  var WANDBOX_ENDPOINT = 'https://wandbox.org/api/compile.json';
  var WANDBOX_COMPILER = 'gcc-13.2.0';
  var WANDBOX_VERSION = 'gcc-13.2.0 (Wandbox)';
  var COMPILE_FLAGS = '-std=c++17 -Wall'; // 固定，不允许学生传参（方案 §10.2）
  var MOCK_VERSION = '教学模拟（非真实编译）';

  // 可被测试钩子覆盖的运行参数
  var cfg = {
    timeoutMs: 15000,   // 单次远程请求 15 秒超时（AbortController）
    throttleMs: 1000,   // 连续远程调用间隔 >= 1s
    stdoutLimit: 10240  // stdout 截断 10KB
  };

  // fetch 注入点：undefined = 用环境全局 fetch；null = 显式无网络
  var injectedFetch;

  var lastRemoteAt = 0;      // 节流：上一次远程调用的"占位时间"
  var lastRemoteError = null; // {at, message}：最近一次远程验证降级的原因（教师端可观测性）
  var currentAdapter = 'remote';

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function stripAnsi(s) {
    // g++ 彩色输出的 ANSI 控制序列（实测 CE 返回里带 \x1b[01m\x1b[K 等）
    return String(s == null ? '' : s).replace(/\x1b\[[0-9;]*[mK]/g, '');
  }

  function joinTextLines(arr) {
    // Compiler Explorer 的 stdout/stderr 是 [{text:'...'}, ...] 行数组
    if (!arr || !arr.length) return '';
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      out.push(stripAnsi(arr[i] && arr[i].text != null ? arr[i].text : ''));
    }
    return out.join('\n');
  }

  function truncateOutput(s, limit) {
    s = String(s == null ? '' : s);
    if (s.length <= limit) return { text: s, truncated: false };
    return {
      text: s.slice(0, limit) + '\n…（输出太长，后面的部分被裁掉了）',
      truncated: true
    };
  }

  function nowMs() { return Date.now(); }

  function resolveFetch() {
    if (injectedFetch !== undefined) return injectedFetch; // 测试注入（可为 null）
    /* eslint-disable no-undef */
    return (typeof fetch !== 'undefined') ? fetch : null;
    /* eslint-enable no-undef */
  }

  function makeResult(patch) {
    // Result 统一骨架（CONTRACT §8），字段永远齐全
    var r = {
      status: 'offline',
      real: false,
      stdout: '',
      stderr: '',
      compileOutput: '',
      friendlyErrors: [],
      compilerVersion: '',
      elapsedMs: 0
    };
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) r[k] = patch[k]; }
    return r;
  }

  /* ------------------------------------------------------------------ *
   * 友好错误映射（9 类，全部依据 2026-08-04 实测 g++ 14.3 stderr 设计）
   * 真实样本示例：
   *   <source>:4:5: error: expected ',' or ';' before 'std'
   *   <source>:3:5: error: 'energy' was not declared in this scope
   *   <source>:3:18: error: missing terminating " character
   *   <source>:6:2: error: expected '}' at end of input
   *   <source>:5:6: error: expected ')' before 'return'
   *   <source>:3:18: error: expected primary-expression before ';' token
   *   <source>:3:18: error: invalid conversion from 'const char*' to 'int'
   *   <source>:4:16: warning: suggest parentheses around assignment used as
   *                  truth value [-Wparentheses]
   * ------------------------------------------------------------------ */

  var LINE_RE = /(?:<source>|[^\s:]*\.(?:cc|cpp|cxx)):(\d+)(?::\d+)?:/;

  function pickLine(rawLine) {
    var m = LINE_RE.exec(rawLine);
    return m ? parseInt(m[1], 10) : 0;
  }

  // 规则表：按优先级排列，同一行 stderr 只命中一条
  var ERROR_RULES = [
    {
      id: 'unterminated-string',
      test: /missing terminating/,
      build: function (line) {
        return {
          line: line,
          message: '第' + line + '行有一个引号没有关上。',
          hint: '文字的两边要有一对引号「"」才行，数一数第' + line + '行的引号是不是成双成对。'
        };
      }
    },
    {
      id: 'undeclared',
      test: /was not declared/,
      build: function (line, rawLine) {
        var m = /'([^']+)' was not declared/.exec(rawLine);
        var name = m ? m[1] : '这个名字';
        return {
          line: line,
          message: '第' + line + '行用到了一个还没登场的名字「' + name + '」。',
          hint: '变量要先声明才能用，比如先写「int ' + (m ? name : 'energy') + ' = 3;」。也检查一下名字是不是拼错了。'
        };
      }
    },
    {
      id: 'missing-semicolon',
      test: /expected ',' or ';'|expected ';'/,
      build: function (line) {
        var prev = line > 1 ? (line - 1) : line;
        return {
          line: line,
          message: '编译器在第' + line + '行附近没有找到分号。',
          hint: '每条指令说完要用「;」收尾，先检查第' + prev + '行的结尾。'
        };
      }
    },
    {
      id: 'mismatched-brace',
      test: /expected '\}'/,
      build: function (line) {
        return {
          line: line,
          message: '有一个花括号「{」还没找到它的伙伴「}」。',
          hint: '花括号总是成对出现的，从上往下数一数「{」和「}」是不是一样多。'
        };
      }
    },
    {
      id: 'mismatched-paren',
      test: /expected '\)'/,
      build: function (line) {
        return {
          line: line,
          message: '有一个小括号「(」还没找到它的伙伴「)」。',
          hint: '看看第' + line + '行附近，是不是少写了一个「)」。'
        };
      }
    },
    {
      id: 'missing-expression',
      test: /expected primary-expression|expected expression/,
      build: function (line) {
        return {
          line: line,
          message: '第' + line + '行好像少了一块内容，符号后面空空的。',
          hint: '等号或运算符号的后面要跟上数字或变量，看看第' + line + '行是不是漏写了什么。'
        };
      }
    },
    {
      id: 'type-mismatch',
      test: /invalid conversion|cannot convert/,
      build: function (line) {
        return {
          line: line,
          message: '第' + line + '行想往变量盒子里放不合适的东西。',
          hint: 'int 盒子只能装整数。想一想第' + line + '行放进去的到底是什么。'
        };
      }
    },
    {
      id: 'assign-in-condition',
      test: /\[-Wparentheses\]|suggest parentheses around assignment/,
      build: function (line) {
        return {
          line: line,
          message: '第' + line + '行的「=」可能想写的是「==」。',
          hint: '一个等号「=」是把东西放进盒子，两个等号「==」才是问"相不相等"。'
        };
      }
    }
  ];
  // 第 9 类（超时）与"输出过多"不来自 stderr 文本，由 compile() 流程直接生成，见下。

  /**
   * mapErrors(stderrText, source) -> friendlyErrors[]
   * 纯函数，供单元测试与教师端复用。教师端展示原始 stderr（compileOutput），
   * 儿童端只展示这里的翻译结果。
   */
  function mapErrors(stderrText, source) {
    var lines = stripAnsi(stderrText).split('\n');
    var found = [];
    var seen = {}; // 去重：同类 + 同行 只报一次

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      // 只看 error 行和 -Wparentheses 警告行，跳过 note/装饰行
      var isError = /\berror:/.test(raw);
      var isParenWarn = /\[-Wparentheses\]/.test(raw);
      if (!isError && !isParenWarn) continue;

      for (var j = 0; j < ERROR_RULES.length; j++) {
        var rule = ERROR_RULES[j];
        if (!rule.test.test(raw)) continue;
        var line = pickLine(raw);
        var key = rule.id + '@' + line;
        if (!seen[key]) {
          seen[key] = true;
          var fe = rule.build(line, raw);
          fe.rule = rule.id;
          found.push(fe);
        }
        break; // 一行 stderr 只命中一条规则
      }
    }

    // 引号没关上时，后续的 primary-expression 错误几乎都是连锁反应，
    // 对孩子只保留根源那一条。
    var hasUnterminated = false;
    for (var k = 0; k < found.length; k++) {
      if (found[k].rule === 'unterminated-string') { hasUnterminated = true; break; }
    }
    if (hasUnterminated) {
      found = found.filter(function (e) { return e.rule !== 'missing-expression'; });
    }

    // 规则补充检测：源代码里 if(x = n) 而编译器没报 -Wparentheses 时也提醒
    var hasParenWarn = found.some(function (e) { return e.rule === 'assign-in-condition'; });
    if (!hasParenWarn && source) {
      var srcLines = String(source).split('\n');
      for (var s = 0; s < srcLines.length; s++) {
        if (/if\s*\(\s*[A-Za-z_]\w*\s*=(?!=)/.test(srcLines[s])) {
          found.push({
            line: s + 1,
            message: '第' + (s + 1) + '行的「=」可能想写的是「==」。',
            hint: '一个等号「=」是把东西放进盒子，两个等号「==」才是问"相不相等"。',
            rule: 'assign-in-condition'
          });
          break;
        }
      }
    }

    // 一次最多给孩子 3 条，太多会吓到（先出现的通常是根源）
    if (found.length > 3) found = found.slice(0, 3);

    // 对外结构只保留契约字段 {line, message, hint}
    return found.map(function (e) {
      return { line: e.line, message: e.message, hint: e.hint };
    });
  }

  function timeoutFriendly() {
    return {
      line: 0,
      message: '程序跑了太久，被裁判叫停了。',
      hint: '看看程序里有没有停不下来的重复动作，或者等一会儿再试一次。'
    };
  }

  function tooMuchOutputFriendly() {
    return {
      line: 0,
      message: '程序说了太多话，后面的输出被裁掉了。',
      hint: '检查一下是不是输出了太多遍，通常说清楚一次就够啦。'
    };
  }

  /* ------------------------------------------------------------------ *
   * 远程调用底座：节流 + 超时
   * ------------------------------------------------------------------ */

  function throttleSlot() {
    // 为本次调用"预约"一个时间点，保证任意两次远程请求间隔 >= throttleMs
    var now = nowMs();
    var startAt = Math.max(now, lastRemoteAt + cfg.throttleMs);
    lastRemoteAt = startAt;
    var wait = startAt - now;
    if (wait <= 0) return Promise.resolve();
    return new Promise(function (res) { setTimeout(res, wait); });
  }

  /**
   * fetchJSON(url, body) -> Promise<{ok, status, json} | throw>
   * - 15 秒 AbortController 超时，超时以 Error('cpplab-timeout') 抛出。
   */
  function fetchJSON(fetchFn, url, body) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      if (ctrl) ctrl.abort();
    }, cfg.timeoutMs);

    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    };
    if (ctrl) opts.signal = ctrl.signal;

    return Promise.resolve()
      .then(function () { return fetchFn(url, opts); })
      .then(function (resp) {
        clearTimeout(timer);
        if (!resp || !resp.ok) {
          throw new Error('cpplab-http-' + (resp ? resp.status : 'none'));
        }
        return resp.json();
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (timedOut) throw new Error('cpplab-timeout');
        throw err;
      });
  }

  /* ------------------------------------------------------------------ *
   * 主适配器：Compiler Explorer（实测通过，CORS: *）
   * ------------------------------------------------------------------ */

  function compileViaCE(fetchFn, source, stdin) {
    var body = {
      source: source,
      options: {
        userArguments: COMPILE_FLAGS,
        filters: { execute: true },
        executeParameters: { stdin: stdin || '' }
      }
    };
    return fetchJSON(fetchFn, CE_ENDPOINT, body).then(function (d) {
      if (!d || typeof d.code === 'undefined') throw new Error('cpplab-bad-shape');

      var compileOutput = joinTextLines(d.stderr);

      if (d.code !== 0) {
        // 编译失败
        return {
          status: 'compile_error',
          stdout: '',
          stderr: '',
          compileOutput: compileOutput,
          compilerVersion: CE_VERSION
        };
      }

      var er = d.execResult || {};
      var stdout = joinTextLines(er.stdout);
      var runStderr = joinTextLines(er.stderr);
      var status;
      if (er.timedOut) status = 'timeout';
      else if (typeof er.code === 'number' && er.code !== 0) status = 'runtime_error';
      else status = 'ok';

      return {
        status: status,
        stdout: stdout,
        stderr: runStderr,
        compileOutput: compileOutput, // 编译期警告（如 -Wparentheses）也在这里
        remoteTruncated: !!er.truncated,
        compilerVersion: CE_VERSION
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * 备选适配器：Wandbox（API/CORS 实测可达；沙箱故障形态已识别）
   * ------------------------------------------------------------------ */

  function compileViaWandbox(fetchFn, source, stdin) {
    var body = {
      code: source,
      compiler: WANDBOX_COMPILER,
      options: '',
      // Wandbox 的 compiler-option-raw 以换行分隔多个参数；整串带空格传过去会被
      // 当成单个参数，返回 "unrecognized command-line option '-std=c++17 -Wall'"。
      // 该错误含 "error:"，会被下面的映射误判成学生程序的真实编译错误
      // （2026-08-11 实测复现），因此这里必须逐个参数换行分隔。
      'compiler-option-raw': COMPILE_FLAGS.split(/\s+/).join('\n'),
      stdin: stdin || ''
    };
    return fetchJSON(fetchFn, WANDBOX_ENDPOINT, body).then(function (d) {
      if (!d || typeof d.status === 'undefined') throw new Error('cpplab-bad-shape');

      var compilerErr = stripAnsi(d.compiler_error || '');
      // 实测 2026-08-04：Wandbox 沙箱故障时返回 HTTP 200 + status "126"
      // + "OCI runtime error"。这是基础设施失败，不是学生程序的问题，
      // 必须当作调用失败抛出（继而走 offline），绝不能冒充编译结果。
      if (/OCI runtime error|crun:/i.test(compilerErr)) {
        throw new Error('cpplab-wandbox-sandbox-down');
      }

      var exit = String(d.status);
      var compileOutput = (compilerErr + '\n' + stripAnsi(d.compiler_output || '')).trim();
      var stdout = String(d.program_output || '');
      var runStderr = stripAnsi(d.program_error || '');

      // 保守闸门（QA P2）：故障文案会变，不能只认 OCI/crun 一种形态。
      // 非 0 退出、没有任何编译报错（error:）、也没有任何程序输出/程序报错，
      // 或 shell 级故障码 126/127——这些呈现的是基础设施失败特征而非学生程序行为，
      // 一律抛出走降级（offline），绝不冒充 real:true 的 runtime_error 记在学生头上。
      if (!d.signal && exit !== '0' && !/error:/.test(compilerErr) &&
          (exit === '126' || exit === '127' || (stdout === '' && runStderr === ''))) {
        throw new Error('cpplab-wandbox-sandbox-down');
      }

      var status;
      if (/error:/.test(compilerErr)) status = 'compile_error';
      else if (d.signal && /XCPU|KILL|ALRM/i.test(String(d.signal))) status = 'timeout';
      else if (exit !== '0') status = 'runtime_error';
      else status = 'ok';

      return {
        status: status,
        stdout: status === 'compile_error' ? '' : stdout,
        stderr: runStderr,
        compileOutput: compileOutput,
        compilerVersion: WANDBOX_VERSION
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * RemoteAdapter：CE 主 → Wandbox 备 → offline
   * ------------------------------------------------------------------ */

  function remoteCompile(request) {
    var started = nowMs();
    var fetchFn = resolveFetch();
    var source = String(request.source || '');
    var stdin = String(request.stdin || '');

    if (!fetchFn) {
      // Node 无 fetch / 明确无网络环境：优雅离线
      return Promise.resolve(makeResult({ status: 'offline', elapsedMs: nowMs() - started }));
    }

    var ceFailNote = null;
    return throttleSlot()
      .then(function () { return compileViaCE(fetchFn, source, stdin); })
      .catch(function (ceErr) {
        // 主适配器失败 → 自动 fallback 到 Wandbox（再排一次节流位）
        if (ceErr && ceErr.message === 'cpplab-timeout') {
          // 网络层 15s 超时：按契约仍尝试备选一次
        }
        ceFailNote = 'CE(godbolt) 失败：' + describeRemoteError(ceErr);
        return throttleSlot().then(function () {
          return compileViaWandbox(fetchFn, source, stdin);
        });
      })
      .then(function (raw) {
        var cut = truncateOutput(raw.stdout, cfg.stdoutLimit);
        var friendly = [];
        if (raw.status === 'timeout') {
          friendly.push(timeoutFriendly());
        } else {
          friendly = mapErrors(raw.compileOutput, source);
        }
        if (cut.truncated || raw.remoteTruncated) {
          friendly.push(tooMuchOutputFriendly());
        }
        return makeResult({
          status: raw.status,
          real: true, // 只有走到这里（远程真实编译成功返回）才允许 real:true
          stdout: cut.text,
          stderr: raw.stderr,
          compileOutput: raw.compileOutput, // 教师端展开用的原始 g++ 输出
          friendlyErrors: friendly,
          compilerVersion: raw.compilerVersion,
          elapsedMs: nowMs() - started
        });
      })
      .catch(function (wbErr) {
        // 两个远程端点都失败 → 离线降级（UI 必须显示"概念演示"标记）。
        // 失败原因留档并随结果透出，教师端可看到「真实验证为何不可用」而非无声消失。
        var note = (ceFailNote ? ceFailNote + '；' : '') +
          'Wandbox 失败：' + describeRemoteError(wbErr);
        lastRemoteError = { at: new Date().toISOString(), message: note };
        return makeResult({ status: 'offline', elapsedMs: nowMs() - started, remoteError: note });
      });
  }

  /** 远程错误的教师可读描述（内部错误码 → 中文短语） */
  function describeRemoteError(err) {
    var m = (err && err.message) ? String(err.message) : '未知错误';
    if (m === 'cpplab-timeout') return '15 秒内没有响应（网络超时）';
    if (m === 'cpplab-bad-shape') return '返回数据格式异常（接口可能已变更）';
    if (m === 'cpplab-wandbox-sandbox-down') return '沙箱基础设施故障（非学生程序问题）';
    if (/^cpplab-http-404$/.test(m)) return 'HTTP 404（编译器 id 可能已下线，需要维护者更新端点）';
    if (/^cpplab-http-/.test(m)) return 'HTTP ' + m.replace('cpplab-http-', '') + ' 错误';
    return m;
  }

  /* ------------------------------------------------------------------ *
   * MockAdapter：概念演示（real:false）
   * 仅 mode:'verify' 且请求携带活动的 program（LessonIR）时可用，
   * 用 CppLab.IR.execute 得到 stdout。
   * ------------------------------------------------------------------ */

  function mockCompile(request) {
    var started = nowMs();
    return Promise.resolve().then(function () {
      var program = request.program || null;
      if (request.mode !== 'verify' || !program) {
        return makeResult({ status: 'offline', elapsedMs: nowMs() - started });
      }
      var IR = CppLab.IR;
      if (!IR || typeof IR.execute !== 'function') {
        return makeResult({ status: 'offline', elapsedMs: nowMs() - started });
      }
      var r;
      try {
        r = IR.execute(program);
      } catch (e) {
        return makeResult({ status: 'offline', elapsedMs: nowMs() - started });
      }
      var cut = truncateOutput(r && r.stdout != null ? r.stdout : '', cfg.stdoutLimit);
      var friendly = [];
      if (cut.truncated) friendly.push(tooMuchOutputFriendly());
      return makeResult({
        status: (r && r.error) ? 'runtime_error' : 'ok',
        real: false, // 模拟结果永远不是真实编译（红线 §14.1）
        stdout: cut.text,
        stderr: (r && r.error) ? String(r.error) : '',
        compileOutput: '',
        friendlyErrors: friendly,
        compilerVersion: MOCK_VERSION,
        elapsedMs: nowMs() - started
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 对外 API
   * ------------------------------------------------------------------ */

  var Compiler = {

    /**
     * compile({activityId, source, stdin='', mode:'verify'|'free', program?})
     *   -> Promise<Result>
     * 永远 resolve，不 reject。
     * program 字段是给 MockAdapter 用的可选扩展（引擎在 verify 模式下把
     * 当前活动的 LessonIR 一并传入即可；远程适配器忽略它）。
     */
    compile: function (request) {
      request = request || {};
      if (currentAdapter === 'mock') return mockCompile(request);
      return remoteCompile(request);
    },

    /** setAdapter('remote' | 'mock') */
    setAdapter: function (name) {
      if (name !== 'remote' && name !== 'mock') {
        throw new Error('CppLab.Compiler.setAdapter: 未知适配器 "' + name + '"');
      }
      currentAdapter = name;
    },

    getAdapterName: function () { return currentAdapter; },

    /** 最近一次远程验证降级的原因（{at, message} 或 null）——教师端展示用 */
    getLastRemoteError: function () { return lastRemoteError; },

    /**
     * 友好错误映射（纯函数，教师端/测试可直接调用）。
     * stderrText: 原始 g++ stderr；source: 学生源码（用于 =/== 规则补充检测）。
     */
    mapErrors: mapErrors,

    /* ---- 仅供测试的钩子（下划线开头，产品代码不得调用） ---- */
    _setFetch: function (f) { injectedFetch = f; },
    _resetFetch: function () { injectedFetch = undefined; },
    _setTimeoutMs: function (ms) { cfg.timeoutMs = ms; },
    _setThrottleMs: function (ms) { cfg.throttleMs = ms; },
    _resetForTests: function () {
      injectedFetch = undefined;
      cfg.timeoutMs = 15000;
      cfg.throttleMs = 1000;
      cfg.stdoutLimit = 10240;
      lastRemoteAt = 0;
      lastRemoteError = null;
      currentAdapter = 'remote';
    }
  };

  CppLab.Compiler = Compiler;

})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CppLab.Compiler; }
