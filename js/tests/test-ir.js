/*
 * js/tests/test-ir.js — CppLab.IR 单元测试（零依赖）
 * 运行：node js/tests/test-ir.js
 * 约定（CONTRACT §15）：失败输出 FAIL: 原因 并以退出码 1 结束；成功输出 PASS (n assertions)。
 */
'use strict';

var IR = require(__dirname + '/../engine/ir.js');

var assertionCount = 0;

function assert(cond, msg) {
  assertionCount++;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

function assertEq(actual, expected, msg) {
  assertionCount++;
  if (actual !== expected) {
    console.error('FAIL:', msg, '\n  期望:', JSON.stringify(expected), '\n  实际:', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

/* ---------- 表达式速写工具 ---------- */
function lit(v) { return { kind: 'lit', value: v }; }
function v(name) { return { kind: 'var', name: name }; }
function bin(op, left, right) { return { kind: 'bin', op: op, left: left, right: right }; }

/* =========================================================
 * 1. 第 1 课程序：energy 3 → 7 → 6，stdout「6」（方案 §7.3）
 * ========================================================= */
var lesson1Program = [
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(3) },
  { op: 'assign', name: 'energy', expr: bin('+', v('energy'), lit(4)) },
  { op: 'assign', name: 'energy', expr: bin('-', v('energy'), lit(1)) },
  { op: 'output', expr: v('energy') }
];

var r1 = IR.execute(lesson1Program);
assert(r1.error === undefined, '第1课程序不应报错，实际: ' + r1.error);
assertEq(r1.finalVars.energy, 6, '第1课最终 energy 应为 6');
assertEq(r1.stdout, '6', '第1课 stdout 应为「6」');
assertEq(r1.trace.length, 4, '第1课应产生 4 条 TraceEntry');

assertEq(r1.trace[0].kind, 'declare', '第1条 trace 应为 declare');
assertEq(Object.keys(r1.trace[0].varsBefore).length, 0, 'declare 前应没有任何变量');
assertEq(r1.trace[0].varsAfter.energy, 3, 'declare 后 energy 应为 3');

assertEq(r1.trace[1].varsBefore.energy, 3, '第2步执行前 energy 应为 3');
assertEq(r1.trace[1].varsAfter.energy, 7, '第2步执行后 energy 应为 7');
assertEq(r1.trace[1].description, '读取旧值 3，计算 3+4=7，把 7 写回 energy',
  '赋值步骤中文解说必须与方案样例句式一致');

assertEq(r1.trace[2].varsAfter.energy, 6, '第3步执行后 energy 应为 6');
assertEq(r1.trace[2].outputSoFar, '', '输出前 outputSoFar 应为空');
assertEq(r1.trace[3].kind, 'output', '第4条 trace 应为 output');
assertEq(r1.trace[3].outputSoFar, '6', '输出后 outputSoFar 应为「6」');
assert(r1.trace[3].description.indexOf('6') !== -1, 'output 解说里应出现 6');

// 行号：无 if 时逐行排布
assertEq(r1.trace[0].lineNo, 1, '第1课 step0 行号应为 1');
assertEq(r1.trace[1].lineNo, 2, '第1课 step1 行号应为 2');
assertEq(r1.trace[2].lineNo, 3, '第1课 step2 行号应为 3');
assertEq(r1.trace[3].lineNo, 4, '第1课 step3 行号应为 4');

// trace index 连续
for (var ti = 0; ti < r1.trace.length; ti++) {
  assertEq(r1.trace[ti].index, ti, '第1课 trace index 应连续递增');
}

/* =========================================================
 * 2. 第 1 课代码生成：与方案 §7.3 逐字符一致
 * ========================================================= */
var lesson1Focus =
  'int energy = 3;\n' +
  'energy = energy + 4;\n' +
  'energy = energy - 1;\n' +
  'std::cout << energy;';
assertEq(IR.toFocusCpp(lesson1Program), lesson1Focus, '第1课聚焦代码必须与方案 §7.3 逐字符一致');

var lesson1Full =
  '#include <iostream>\n' +
  '\n' +
  'int main() {\n' +
  '    int energy = 3;\n' +
  '    energy = energy + 4;\n' +
  '    energy = energy - 1;\n' +
  '    std::cout << energy;\n' +
  '    return 0;\n' +
  '}\n';
assertEq(IR.toFullCpp(lesson1Program), lesson1Full, 'toFullCpp 必须按 §7.3 完整程序格式包裹');

var map1 = IR.getLineMap(lesson1Program);
assertEq(map1[0], 1, '第1课行号映射 step0→1');
assertEq(map1[3], 4, '第1课行号映射 step3→4');

/* =========================================================
 * 3. 第 2 课程序：两个分支（方案 §8.3）
 * ========================================================= */
function lesson2Program(startEnergy) {
  return [
    { op: 'declare', varType: 'int', name: 'energy', expr: lit(startEnergy) },
    {
      op: 'if',
      cond: bin('>=', v('energy'), lit(5)),
      then: [{ op: 'output', expr: lit('OPEN') }],
      else: [{ op: 'output', expr: lit('CHARGE') }]
    }
  ];
}

// energy = 5 → OPEN（边界值：>= 包含相等）
var r2open = IR.execute(lesson2Program(5));
assert(r2open.error === undefined, '第2课(5)不应报错，实际: ' + r2open.error);
assertEq(r2open.stdout, 'OPEN', 'energy=5 时应输出 OPEN');
assertEq(r2open.trace.length, 3, 'energy=5 时应有 3 条 trace（declare + if + then 内 output）');
assertEq(r2open.trace[1].kind, 'if', '第2条 trace 应为 if');
assertEq(r2open.trace[1].condValue, true, 'energy=5 时条件 energy >= 5 应为真');
assertEq(r2open.trace[1].branchTaken, 'then', 'energy=5 时应走 then 分支');
assert(r2open.trace[1].description.indexOf('energy >= 5') !== -1, 'if 解说应包含条件原文');
assert(r2open.trace[1].description.indexOf('5>=5') !== -1, 'if 解说应包含代入值的算式 5>=5');
assert(r2open.trace[1].description.indexOf('真') !== -1, 'if 解说应说出条件为真');
assertEq(r2open.trace[2].kind, 'output', 'then 分支内的 output 应有自己的 TraceEntry');
assertEq(r2open.trace[2].outputSoFar, 'OPEN', 'then 分支输出后 outputSoFar 应为 OPEN');

// energy = 3 → CHARGE
var r2charge = IR.execute(lesson2Program(3));
assert(r2charge.error === undefined, '第2课(3)不应报错，实际: ' + r2charge.error);
assertEq(r2charge.stdout, 'CHARGE', 'energy=3 时应输出 CHARGE');
assertEq(r2charge.trace.length, 3, 'energy=3 时应有 3 条 trace（declare + if + else 内 output）');
assertEq(r2charge.trace[1].condValue, false, 'energy=3 时条件应为假');
assertEq(r2charge.trace[1].branchTaken, 'else', 'energy=3 时应走 else 分支');
assert(r2charge.trace[1].description.indexOf('假') !== -1, 'if 解说应说出条件为假');
assertEq(r2charge.trace[2].outputSoFar, 'CHARGE', 'else 分支输出后 outputSoFar 应为 CHARGE');

/* =========================================================
 * 4. 第 2 课代码生成：与方案 §8.3 逐字符一致（含 if 前空行）
 * ========================================================= */
var lesson2Focus =
  'int energy = 5;\n' +
  '\n' +
  'if (energy >= 5) {\n' +
  '    std::cout << "OPEN";\n' +
  '} else {\n' +
  '    std::cout << "CHARGE";\n' +
  '}';
assertEq(IR.toFocusCpp(lesson2Program(5)), lesson2Focus, '第2课聚焦代码必须与方案 §8.3 逐字符一致');

var lesson2Full =
  '#include <iostream>\n' +
  '\n' +
  'int main() {\n' +
  '    int energy = 5;\n' +
  '\n' +
  '    if (energy >= 5) {\n' +
  '        std::cout << "OPEN";\n' +
  '    } else {\n' +
  '        std::cout << "CHARGE";\n' +
  '    }\n' +
  '    return 0;\n' +
  '}\n';
assertEq(IR.toFullCpp(lesson2Program(5)), lesson2Full, '第2课完整程序应正确缩进且空行保持为空');

/* =========================================================
 * 5. 行号映射：if 前空行导致的偏移 + 稳定性
 * ========================================================= */
var map2 = IR.getLineMap(lesson2Program(5));
assertEq(map2[0], 1, 'step0（declare）应在第 1 行');
assertEq(map2[1], 3, 'step1（if）应在第 3 行（第 2 行是空行）');
assertEq(map2[2], 4, 'then 内 output 应在第 4 行');
assertEq(map2[3], 6, 'else 内 output 应在第 6 行（第 5 行是 } else {）');

// trace 里的行号必须与映射一致
assertEq(r2open.trace[1].lineNo, 3, 'if 的 TraceEntry.lineNo 应与行号映射一致');
assertEq(r2open.trace[2].lineNo, 4, 'then 内 output 的 lineNo 应为 4');
assertEq(r2charge.trace[2].lineNo, 6, 'else 内 output 的 lineNo 应为 6');

// 稳定性：重复调用结果完全相同
assertEq(JSON.stringify(IR.getLineMap(lesson2Program(5))), JSON.stringify(map2),
  '行号映射重复调用必须完全一致');
assertEq(IR.toFocusCpp(lesson2Program(5)), IR.toFocusCpp(lesson2Program(5)),
  '聚焦代码重复生成必须完全一致');

/* =========================================================
 * 6. A 档双变量程序（方案 §7.5）：energy=3, shield=1 → 5
 * ========================================================= */
var aProgram = [
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(3) },
  { op: 'declare', varType: 'int', name: 'shield', expr: lit(1) },
  { op: 'assign', name: 'energy', expr: bin('+', v('energy'), bin('*', v('shield'), lit(2))) }
];
var rA = IR.execute(aProgram);
assert(rA.error === undefined, 'A档程序不应报错，实际: ' + rA.error);
assertEq(rA.finalVars.energy, 5, 'A档 energy 最终应为 5');
assertEq(rA.finalVars.shield, 1, 'A档 shield 应保持 1');
assertEq(IR.exprToCpp(aProgram[2].expr), 'energy + shield * 2',
  'A档表达式生成不应有多余括号');
assertEq(rA.trace[2].description, '读取旧值 3，计算 3+1*2=5，把 5 写回 energy',
  'A档赋值解说应代入两个变量的值');

/* =========================================================
 * 7. 字符串输出
 * ========================================================= */
var strProgram = [{ op: 'output', expr: lit('OPEN') }];
var rStr = IR.execute(strProgram);
assertEq(rStr.stdout, 'OPEN', '字符串输出应原样进入 stdout');
assert(rStr.trace[0].description.indexOf('文字') !== -1, '字符串输出解说应提到「文字」');
assertEq(IR.toFocusCpp(strProgram), 'std::cout << "OPEN";', '字符串字面量必须用双引号');

// 转义：引号与反斜杠
assertEq(IR.exprToCpp(lit('说"你好"')), '"说\\"你好\\""', '字符串里的双引号必须转义');

/* =========================================================
 * 8. 运算优先级与括号
 * ========================================================= */
assertEq(IR.evalExpr(bin('+', lit(2), bin('*', lit(3), lit(4))), {}), 14, '2+3*4 应为 14');
assertEq(IR.evalExpr(bin('*', bin('+', lit(2), lit(3)), lit(4)), {}), 20, '(2+3)*4 应为 20');
assertEq(IR.exprToCpp(bin('+', lit(2), bin('*', lit(3), lit(4)))), '2 + 3 * 4',
  '高优先级在右不需要括号');
assertEq(IR.exprToCpp(bin('*', bin('+', lit(2), lit(3)), lit(4))), '(2 + 3) * 4',
  '低优先级在左必须加括号');
assertEq(IR.exprToCpp(bin('-', lit(10), bin('-', lit(5), lit(2)))), '10 - (5 - 2)',
  '右结合歧义必须加括号（左结合语义）');
assertEq(IR.evalExpr(bin('-', bin('-', lit(10), lit(5)), lit(2)), {}), 3, '10-5-2 左结合应为 3');
assertEq(IR.exprToCpp(bin('&&', bin('>=', v('energy'), lit(5)), v('hasKey'))),
  'energy >= 5 && hasKey', '比较+逻辑组合不应有多余括号（方案 §8.3 高级扩展样例）');

/* =========================================================
 * 9. 整数除法（C++ 截断语义）
 * ========================================================= */
assertEq(IR.evalExpr(bin('/', lit(7), lit(2)), {}), 3, '7/2 整数除法应为 3');
assertEq(IR.evalExpr(bin('/', lit(-7), lit(2)), {}), -3, '-7/2 应向零截断为 -3');
assertEq(IR.evalExpr(bin('/', lit(9), lit(3)), {}), 3, '9/3 应为 3');

var divZero = IR.execute([
  { op: 'declare', varType: 'int', name: 'x', expr: bin('/', lit(1), lit(0)) }
]);
assert(divZero.error !== undefined, '除以 0 必须报错');
assertEq(divZero.trace.length, 0, '除以 0 时该步不应产生 TraceEntry');

/* =========================================================
 * 10. 比较运算
 * ========================================================= */
var vars10 = { energy: 5 };
assertEq(IR.evalExpr(bin('>=', v('energy'), lit(5)), vars10), true, '5 >= 5 应为真');
assertEq(IR.evalExpr(bin('>', v('energy'), lit(5)), vars10), false, '5 > 5 应为假（> 不含相等）');
assertEq(IR.evalExpr(bin('<', v('energy'), lit(6)), vars10), true, '5 < 6 应为真');
assertEq(IR.evalExpr(bin('<=', v('energy'), lit(4)), vars10), false, '5 <= 4 应为假');
assertEq(IR.evalExpr(bin('==', v('energy'), lit(5)), vars10), true, '5 == 5 应为真');
assertEq(IR.evalExpr(bin('!=', v('energy'), lit(5)), vars10), false, '5 != 5 应为假');

/* =========================================================
 * 11. && || 短路求值
 * ========================================================= */
// 左边为假时，右边即使引用不存在的变量也不能报错（短路）
var shortAnd = IR.evalExpr(bin('&&', lit(false), v('不存在的变量')), {});
assertEq(shortAnd, false, '&& 左假应短路返回 false，不碰右边');
var shortOr = IR.evalExpr(bin('||', lit(true), v('不存在的变量')), {});
assertEq(shortOr, true, '|| 左真应短路返回 true，不碰右边');
// 不短路时正常求值
assertEq(IR.evalExpr(bin('&&', lit(true), bin('>', lit(3), lit(1))), {}), true, '&& 两侧皆真应为真');
assertEq(IR.evalExpr(bin('||', lit(false), lit(false)), {}), false, '|| 两侧皆假应为假');

// A 档扩展程序（§8.3 高级扩展）：bool + &&
var keyProgram = [
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(5) },
  { op: 'declare', varType: 'bool', name: 'hasKey', expr: lit(true) },
  {
    op: 'if',
    cond: bin('&&', bin('>=', v('energy'), lit(5)), v('hasKey')),
    then: [{ op: 'output', expr: lit('OPEN') }]
  }
];
var rKey = IR.execute(keyProgram);
assert(rKey.error === undefined, 'bool+&& 程序不应报错，实际: ' + rKey.error);
assertEq(rKey.stdout, 'OPEN', 'energy=5 且 hasKey=true 应输出 OPEN');
assertEq(rKey.trace[2].branchTaken, 'then', '条件为真应走 then');

// 无 else 且条件为假：跳过、不产生分支 trace
var noElseSkip = IR.execute([
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(2) },
  {
    op: 'if',
    cond: bin('>=', v('energy'), lit(5)),
    then: [{ op: 'output', expr: lit('OPEN') }]
  }
]);
assertEq(noElseSkip.stdout, '', '条件为假且无 else 时不应有输出');
assertEq(noElseSkip.trace.length, 2, '条件为假且无 else 时只有 declare 和 if 两条 trace');
assertEq(noElseSkip.trace[1].condValue, false, '跳过时 condValue 应为 false');
assert(noElseSkip.trace[1].description.indexOf('跳过') !== -1, '跳过时解说应说明直接跳过');

/* =========================================================
 * 12. 布尔输出遵循 C++ 语义（cout << true 显示 1）
 * ========================================================= */
var boolOut = IR.execute([{ op: 'output', expr: bin('>=', lit(5), lit(5)) }]);
assertEq(boolOut.stdout, '1', 'cout 输出 true 应显示 1');
var boolOut0 = IR.execute([{ op: 'output', expr: bin('>', lit(4), lit(5)) }]);
assertEq(boolOut0.stdout, '0', 'cout 输出 false 应显示 0');

/* =========================================================
 * 13. 错误路径：错误信息中文、trace 保留到出错前
 * ========================================================= */
var useUndeclared = IR.execute([
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(3) },
  { op: 'assign', name: 'power', expr: lit(5) }
]);
assert(useUndeclared.error !== undefined, '给未创建的变量赋值必须报错');
assert(useUndeclared.error.indexOf('power') !== -1, '错误信息应指出变量名');
assertEq(useUndeclared.trace.length, 1, '出错前的 trace（declare）应保留');
assertEq(useUndeclared.finalVars.energy, 3, '出错时已生效的变量应保留');

var redeclare = IR.execute([
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(3) },
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(5) }
]);
assert(redeclare.error !== undefined, '重复创建同名变量必须报错');

var readMissing = IR.execute([{ op: 'output', expr: v('ghost') }]);
assert(readMissing.error !== undefined, '读取未创建变量必须报错');
assert(readMissing.error.indexOf('ghost') !== -1, '错误信息应指出变量名');

/* =========================================================
 * 14. 嵌套 if：内层 if 前同样有空行，行号同步偏移
 * ========================================================= */
var nestedProgram = [
  { op: 'declare', varType: 'int', name: 'energy', expr: lit(8) },
  {
    op: 'if',
    cond: bin('>=', v('energy'), lit(5)),
    then: [
      { op: 'output', expr: lit('OPEN') },
      {
        op: 'if',
        cond: bin('>=', v('energy'), lit(8)),
        then: [{ op: 'output', expr: lit('!') }]
      }
    ],
    else: [{ op: 'output', expr: lit('CHARGE') }]
  }
];
var nestedFocus =
  'int energy = 8;\n' +
  '\n' +
  'if (energy >= 5) {\n' +
  '    std::cout << "OPEN";\n' +
  '\n' +
  '    if (energy >= 8) {\n' +
  '        std::cout << "!";\n' +
  '    }\n' +
  '} else {\n' +
  '    std::cout << "CHARGE";\n' +
  '}';
assertEq(IR.toFocusCpp(nestedProgram), nestedFocus, '嵌套 if 的布局应正确（空行+缩进+K&R）');
var rNested = IR.execute(nestedProgram);
assertEq(rNested.stdout, 'OPEN!', '嵌套 if 执行结果应为 OPEN!');
var nestedMap = IR.getLineMap(nestedProgram);
assertEq(nestedMap[0], 1, '嵌套：step0 行号 1');
assertEq(nestedMap[1], 3, '嵌套：外层 if 行号 3');
assertEq(nestedMap[2], 4, '嵌套：OPEN 输出行号 4');
assertEq(nestedMap[3], 6, '嵌套：内层 if 行号 6（前有空行）');
assertEq(nestedMap[4], 7, '嵌套：! 输出行号 7');
assertEq(nestedMap[5], 10, '嵌套：CHARGE 输出行号 10');

/* =========================================================
 * 15. evalExpr 基础形态
 * ========================================================= */
assertEq(IR.evalExpr(lit(42), {}), 42, '字面量求值');
assertEq(IR.evalExpr(v('x'), { x: 9 }), 9, '变量求值');
assertEq(IR.evalExpr(lit('OPEN'), {}), 'OPEN', '字符串字面量求值（仅供输出）');

/* ---------- 收尾 ---------- */
if (process.exitCode) {
  process.exit(1);
} else {
  console.log('PASS (' + assertionCount + ' assertions)');
}
