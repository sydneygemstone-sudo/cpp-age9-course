/*
 * js/engine/ir.js — CppLab.IR（教学中间表示）
 * owner: ir（CONTRACT §1）
 *
 * 职责（CONTRACT §4 / 方案 §9.5）：
 *   同一份 Step[] 结构，既能一步步"演"出来（execute → TraceEntry[]，
 *   给可视化和孩子看的中文解说），也能生成一模一样的 C++ 代码
 *   （toFocusCpp / toFullCpp，与方案 §7.3、§8.3 样例逐字符一致）。
 *
 * 纯逻辑模块：顶层不碰 document / window，Node 可直接 require 用于测试。
 */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 运算符优先级（数字越大越先算），用于最小括号化输出。
   * C++ 里同级二元运算符全部左结合。
   * --------------------------------------------------------------- */
  var PRECEDENCE = {
    '||': 1,
    '&&': 2,
    '==': 3, '!=': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6
  };

  var COMPARISON_OPS = { '>': 1, '>=': 1, '<': 1, '<=': 1, '==': 1, '!=': 1 };
  var LOGIC_OPS = { '&&': 1, '||': 1 };
  var ARITH_OPS = { '+': 1, '-': 1, '*': 1, '/': 1 };

  var INDENT = '    '; // 4 空格，全文件统一

  /* ================= 小工具 ================= */

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function shallowCopy(obj) {
    var out = {};
    for (var k in obj) {
      if (hasOwn(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function escapeCppString(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  /* C++ 里布尔到整数的转换（cout << true 会显示 1） */
  function toNum(v) {
    if (v === true) return 1;
    if (v === false) return 0;
    return v;
  }

  /* C++ 条件真值：非 0 即真 */
  function truthy(v) {
    return v !== false && v !== 0;
  }

  /* 给孩子看的值写法：布尔带中文注释，字符串带引号 */
  function fmtValue(v) {
    if (typeof v === 'boolean') return v ? 'true（真）' : 'false（假）';
    if (typeof v === 'string') return '"' + v + '"';
    return String(v);
  }

  /* 代入变量值时的紧凑写法（用于「计算 3+4=7」这种式子） */
  function workedValue(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return '"' + v + '"';
    if (typeof v === 'number' && v < 0) return '(' + v + ')';
    return String(v);
  }

  /* ================= 表达式 → C++ 文本 ================= */

  function litToCpp(value) {
    if (typeof value === 'string') return '"' + escapeCppString(value) + '"';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }

  /*
   * spaced=true  → 正式代码风格：energy + shield * 2
   * spaced=false → 解说里的紧凑算式：3+1*2
   * substVars    → 有则把变量替换成当前值（生成「3+4」这类代入式）
   */
  function renderExpr(expr, spaced, substVars) {
    if (!expr || typeof expr !== 'object' || !expr.kind) {
      throw new Error('表达式缺失或格式不对');
    }
    if (expr.kind === 'lit') {
      return substVars ? workedValue(expr.value) : litToCpp(expr.value);
    }
    if (expr.kind === 'var') {
      if (typeof expr.name !== 'string' || expr.name === '') {
        throw new Error('变量表达式缺少名字');
      }
      if (substVars && hasOwn(substVars, expr.name)) {
        return workedValue(substVars[expr.name]);
      }
      return expr.name;
    }
    if (expr.kind === 'bin') {
      var p = PRECEDENCE[expr.op];
      if (p === undefined) {
        throw new Error('无法识别的运算符：' + String(expr.op));
      }
      var left = renderExpr(expr.left, spaced, substVars);
      var right = renderExpr(expr.right, spaced, substVars);
      // 左结合：左孩子优先级更低才加括号；右孩子同级也要加括号（如 a - (b - c)）
      if (expr.left && expr.left.kind === 'bin' && PRECEDENCE[expr.left.op] < p) {
        left = '(' + left + ')';
      }
      if (expr.right && expr.right.kind === 'bin' && PRECEDENCE[expr.right.op] <= p) {
        right = '(' + right + ')';
      }
      return spaced ? left + ' ' + expr.op + ' ' + right : left + expr.op + right;
    }
    throw new Error('无法识别的表达式类型：' + String(expr.kind));
  }

  function exprToCpp(expr) {
    return renderExpr(expr, true, null);
  }

  /* 「3+4」：把变量代入当前值后的紧凑算式，用在中文解说里 */
  function exprToWorked(expr, vars) {
    return renderExpr(expr, false, vars || {});
  }

  function exprReferencesVar(expr, name) {
    if (!expr || typeof expr !== 'object') return false;
    if (expr.kind === 'var') return expr.name === name;
    if (expr.kind === 'bin') {
      return exprReferencesVar(expr.left, name) || exprReferencesVar(expr.right, name);
    }
    return false;
  }

  /* ================= 表达式求值 ================= */

  function evalExpr(expr, vars) {
    vars = vars || {};
    if (!expr || typeof expr !== 'object' || !expr.kind) {
      throw new Error('表达式缺失或格式不对');
    }
    if (expr.kind === 'lit') {
      return expr.value;
    }
    if (expr.kind === 'var') {
      if (!hasOwn(vars, expr.name)) {
        throw new Error('还没有创建变量 ' + expr.name + '，读不到它的值');
      }
      return vars[expr.name];
    }
    if (expr.kind === 'bin') {
      var op = expr.op;
      if (LOGIC_OPS[op]) {
        // C++ 短路求值：左边定了结果，右边就完全不看
        var lv = evalExpr(expr.left, vars);
        if (typeof lv === 'string') {
          throw new Error('文字不能参与真假判断，只能用 std::cout 输出');
        }
        if (op === '&&') {
          if (!truthy(lv)) return false;
        } else { // '||'
          if (truthy(lv)) return true;
        }
        var rv = evalExpr(expr.right, vars);
        if (typeof rv === 'string') {
          throw new Error('文字不能参与真假判断，只能用 std::cout 输出');
        }
        return truthy(rv);
      }
      if (!ARITH_OPS[op] && !COMPARISON_OPS[op]) {
        throw new Error('无法识别的运算符：' + String(op));
      }
      var a = evalExpr(expr.left, vars);
      var b = evalExpr(expr.right, vars);
      if (typeof a === 'string' || typeof b === 'string') {
        throw new Error('文字不能参与计算，只能用 std::cout 输出');
      }
      a = toNum(a);
      b = toNum(b);
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new Error('不能除以 0，程序会在这里出错');
          return Math.trunc(a / b); // C++ 整数除法：直接砍掉小数部分
        case '>': return a > b;
        case '>=': return a >= b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '==': return a === b;
        case '!=': return a !== b;
      }
    }
    throw new Error('无法识别的表达式类型：' + String(expr.kind));
  }

  /* ================= 程序布局（代码行 + 行号 + 步骤索引） =================
   *
   * buildLayout 一次遍历同时产出：
   *   lines   — 聚焦代码的每一行（toFocusCpp = lines.join('\n')）
   *   records — 与 Step 一一对应的记录树（先序编号 index、行号 lineNo），
   *             execute 和 getLineMap 都走这份，保证行号映射永远一致。
   *
   * 布局规则（与方案 §7.3 / §8.3 样例逐字符一致）：
   *   - declare/assign/output 一步一行；
   *   - 每个 if 步骤之前输出一个空行（若 if 是全文件第一行则不加）；
   *   - if/else 用 K&R 花括号：`if (cond) {` / `} else {` / `}`；
   *   - 分支体缩进 4 空格。
   * ------------------------------------------------------------------- */

  function stepToLine(step) {
    if (step.op === 'declare') {
      if (step.varType !== 'int' && step.varType !== 'bool') {
        throw new Error('无法识别的变量类型：' + String(step.varType));
      }
      return step.varType + ' ' + step.name + ' = ' + exprToCpp(step.expr) + ';';
    }
    if (step.op === 'assign') {
      return step.name + ' = ' + exprToCpp(step.expr) + ';';
    }
    if (step.op === 'output') {
      return 'std::cout << ' + exprToCpp(step.expr) + ';';
    }
    throw new Error('无法识别的步骤类型：' + String(step.op));
  }

  function buildLayout(program) {
    var lines = [];
    var counter = { n: 0 };

    function walk(steps, indent) {
      var records = [];
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        if (!step || typeof step !== 'object' || !step.op) {
          throw new Error('程序里有一步缺失或格式不对');
        }
        var rec = { step: step, index: counter.n++ }; // 先序编号
        if (step.op === 'if') {
          if (lines.length > 0) lines.push(''); // if 之前的空行
          rec.lineNo = lines.length + 1;
          lines.push(indent + 'if (' + exprToCpp(step.cond) + ') {');
          rec.thenRecs = walk(step.then || [], indent + INDENT);
          if (step.else) {
            lines.push(indent + '} else {');
            rec.elseRecs = walk(step.else, indent + INDENT);
          } else {
            rec.elseRecs = null;
          }
          lines.push(indent + '}');
        } else {
          rec.lineNo = lines.length + 1;
          lines.push(indent + stepToLine(step));
        }
        records.push(rec);
      }
      return records;
    }

    var records = walk(program || [], '');
    return { lines: lines, records: records };
  }

  function toFocusCpp(program) {
    return buildLayout(program).lines.join('\n');
  }

  function toFullCpp(program) {
    var focusLines = buildLayout(program).lines;
    var out = ['#include <iostream>', '', 'int main() {'];
    for (var i = 0; i < focusLines.length; i++) {
      // 空行保持为空，不带缩进空格
      out.push(focusLines[i] === '' ? '' : INDENT + focusLines[i]);
    }
    out.push(INDENT + 'return 0;');
    out.push('}');
    return out.join('\n') + '\n';
  }

  function getLineMap(program) {
    var map = {};
    function collect(records) {
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        map[rec.index] = rec.lineNo;
        if (rec.thenRecs) collect(rec.thenRecs);
        if (rec.elseRecs) collect(rec.elseRecs);
      }
    }
    collect(buildLayout(program).records);
    return map;
  }

  /* ================= 中文解说 ================= */

  var TYPE_CN = { int: '整数', bool: '布尔' };

  function describeDeclare(step, value, vars) {
    var typeCN = TYPE_CN[step.varType] || step.varType;
    if (step.expr.kind === 'lit') {
      return '新建' + typeCN + '变量 ' + step.name + '，把 ' + fmtValue(value) + ' 放进盒子';
    }
    var worked = exprToWorked(step.expr, vars);
    return '新建' + typeCN + '变量 ' + step.name + '，先计算 ' + worked + '=' + workedValue(value) +
      '，再把 ' + fmtValue(value) + ' 放进盒子';
  }

  function describeAssign(step, oldValue, newValue, varsBefore) {
    if (step.expr.kind === 'lit') {
      return '把 ' + fmtValue(newValue) + ' 写入 ' + step.name;
    }
    var worked = exprToWorked(step.expr, varsBefore);
    if (exprReferencesVar(step.expr, step.name)) {
      // 方案样例句式：「读取旧值 3，计算 3+4=7，把 7 写回 energy」
      return '读取旧值 ' + workedValue(oldValue) + '，计算 ' + worked + '=' + workedValue(newValue) +
        '，把 ' + workedValue(newValue) + ' 写回 ' + step.name;
    }
    return '计算 ' + worked + '=' + workedValue(newValue) + '，把 ' + workedValue(newValue) + ' 写入 ' + step.name;
  }

  function describeOutput(step, value, vars) {
    if (typeof value === 'string') {
      return '把文字 "' + value + '" 显示到屏幕上';
    }
    if (typeof value === 'boolean') {
      var shown = value ? '1' : '0';
      var zhenJia = value ? 'true（真）' : 'false（假）';
      return '结果是 ' + zhenJia + '，屏幕上会显示 ' + shown;
    }
    if (step.expr.kind === 'var') {
      return '读取 ' + step.expr.name + ' 的值 ' + workedValue(value) + '，把 ' + workedValue(value) + ' 显示到屏幕上';
    }
    if (step.expr.kind === 'lit') {
      return '把 ' + workedValue(value) + ' 显示到屏幕上';
    }
    var worked = exprToWorked(step.expr, vars);
    return '计算 ' + worked + '=' + workedValue(value) + '，把 ' + workedValue(value) + ' 显示到屏幕上';
  }

  function describeIf(step, condValue, hasElse, vars) {
    var condCpp = exprToCpp(step.cond);
    var worked = exprToWorked(step.cond, vars);
    var head = '判断条件 ' + condCpp + '：现在是 ' + worked + '，';
    if (condValue) {
      return head + '结果为真，走“真”这条路';
    }
    if (hasElse) {
      return head + '结果为假，走“假”这条路';
    }
    return head + '结果为假，这里没有“假”这条路，直接跳过';
  }

  /* ================= 执行 ================= */

  function coerceByType(value, varType, name) {
    if (typeof value === 'string') {
      throw new Error('文字不能存进变量 ' + name + '，变量盒子只装数字或真假');
    }
    if (varType === 'bool') return truthy(value);
    return Math.trunc(toNum(value)); // int：C++ 会砍掉小数、把真假变 1/0
  }

  function execute(program) {
    var layout;
    var trace = [];
    var vars = {};
    var varTypes = {};
    var state = { stdout: '' };
    var errorMsg;

    try {
      layout = buildLayout(program || []);
    } catch (layoutErr) {
      return { trace: [], finalVars: {}, stdout: '', error: layoutErr.message };
    }

    function pushEntry(rec, kind, varsBefore, extra) {
      var entry = {
        index: trace.length,
        lineNo: rec.lineNo,
        kind: kind,
        varsBefore: varsBefore,
        varsAfter: shallowCopy(vars),
        outputSoFar: state.stdout,
        description: extra.description
      };
      if (hasOwn(extra, 'condValue')) entry.condValue = extra.condValue;
      if (hasOwn(extra, 'branchTaken')) entry.branchTaken = extra.branchTaken;
      trace.push(entry);
      return entry;
    }

    function runRecords(records) {
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var step = rec.step;
        var before = shallowCopy(vars);

        if (step.op === 'declare') {
          if (hasOwn(vars, step.name)) {
            throw new Error('变量 ' + step.name + ' 已经存在，不能再新建一次');
          }
          var dv = coerceByType(evalExpr(step.expr, vars), step.varType, step.name);
          vars[step.name] = dv;
          varTypes[step.name] = step.varType;
          pushEntry(rec, 'declare', before, { description: describeDeclare(step, dv, before) });

        } else if (step.op === 'assign') {
          if (!hasOwn(vars, step.name)) {
            throw new Error('还没有创建变量 ' + step.name + '，不能给它写入新值');
          }
          var oldValue = vars[step.name];
          var av = coerceByType(evalExpr(step.expr, vars), varTypes[step.name] || 'int', step.name);
          vars[step.name] = av;
          pushEntry(rec, 'assign', before, { description: describeAssign(step, oldValue, av, before) });

        } else if (step.op === 'output') {
          var ov = evalExpr(step.expr, vars);
          var text;
          if (typeof ov === 'string') text = ov;
          else if (ov === true) text = '1';   // C++ 里 cout << true 显示 1
          else if (ov === false) text = '0';
          else text = String(ov);
          state.stdout += text;
          pushEntry(rec, 'output', before, { description: describeOutput(step, ov, before) });

        } else if (step.op === 'if') {
          var condRaw = evalExpr(step.cond, vars);
          if (typeof condRaw === 'string') {
            throw new Error('文字不能当作条件，条件的结果只能是真或假');
          }
          var condValue = truthy(condRaw);
          var hasElse = !!rec.elseRecs;
          var extra = {
            condValue: condValue,
            description: describeIf(step, condValue, hasElse, before)
          };
          if (condValue) extra.branchTaken = 'then';
          else if (hasElse) extra.branchTaken = 'else';
          pushEntry(rec, 'if', before, extra);
          if (condValue) {
            runRecords(rec.thenRecs);
          } else if (hasElse) {
            runRecords(rec.elseRecs);
          }

        } else {
          throw new Error('无法识别的步骤类型：' + String(step.op));
        }
      }
    }

    try {
      runRecords(layout.records);
    } catch (e) {
      errorMsg = (e && e.message) ? e.message : String(e);
    }

    var result = { trace: trace, finalVars: shallowCopy(vars), stdout: state.stdout };
    if (errorMsg !== undefined) result.error = errorMsg;
    return result;
  }

  /* ================= 导出 ================= */

  var IR = {
    evalExpr: evalExpr,
    execute: execute,
    toFocusCpp: toFocusCpp,
    toFullCpp: toFullCpp,
    getLineMap: getLineMap,
    exprToCpp: exprToCpp
  };

  CppLab.IR = IR;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = IR;
  }
})();
