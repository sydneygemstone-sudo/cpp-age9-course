/*
 * js/tests/test-theme.js — CppLab.Theme 单元测试（零依赖）
 * 运行：node js/tests/test-theme.js
 * 约定（CONTRACT §15）：失败输出 FAIL: 原因 并以退出码 1 结束；成功输出 PASS (n assertions)。
 */
'use strict';

var Theme = require(__dirname + '/../engine/theme.js');

var assertionCount = 0;

function assertEq(actual, expected, msg) {
  assertionCount++;
  if (actual !== expected) {
    console.error('FAIL:', msg, '\n  期望:', JSON.stringify(expected), '\n  实际:', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

function assert(cond, msg) {
  assertionCount++;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

var t = Theme.t;

/* =========================================================
 * 1. 词典替换正确性（核心词典逐条抽查）
 * ========================================================= */
assertEq(t('捡电池', 'pet'), '捡能量罐头', 'pet: 电池 → 能量罐头');
assertEq(t('捡电池', 'adventure'), '捡能量水晶', 'adventure: 电池 → 能量水晶');
assertEq(t('吃到能量豆，获得4格能量', 'pet'), '吃到能量罐头，获得4格能量', 'pet: 能量豆 → 能量罐头（能量保留）');
assertEq(t('吃到能量豆，获得4格能量', 'adventure'), '吃到能量水晶，获得4格能量', 'adventure: 能量豆 → 能量水晶');
assertEq(t('欢迎回来，指挥官！', 'pet'), '欢迎回来，小队长！', 'pet: 指挥官 → 小队长');
assertEq(t('欢迎回来，指挥官！', 'adventure'), '欢迎回来，探险队长！', 'adventure: 指挥官 → 探险队长');
assertEq(t('星际救援·试听诊断', 'pet'), '乐园救援·试听诊断', 'pet: 星际救援 → 乐园救援');
assertEq(t('星际救援·试听诊断', 'adventure'), '王国救援·试听诊断', 'adventure: 星际救援 → 王国救援');
assertEq(t('启动返航飞船', 'pet'), '启动返程乐园救援车', 'pet: 飞船 → 乐园救援车');
assertEq(t('机器人按喇叭', 'pet'), '小狗搭档按扩音器', 'pet: 机器人+喇叭');
assertEq(t('机器人按喇叭', 'adventure'), '探险搭档按号角', 'adventure: 机器人+喇叭');
assertEq(t('检查燃料', 'pet'), '检查能量', 'pet: 燃料 → 能量');
assertEq(t('打开探照灯', 'adventure'), '打开探险火把', 'adventure: 探照灯 → 探险火把');
assertEq(t('充电机：输入→处理→输出', 'pet'), '能量喂食机：输入→处理→输出', 'pet: 充电机 → 能量喂食机');
assertEq(t('基地里有一排神奇机器', 'adventure'), '探险营地里有一排神奇机器', 'adventure: 基地 → 探险营地');
assertEq(t('救出太空宠物', 'pet'), '救出受困的小猫', 'pet: 太空宠物 → 受困的小猫');
assertEq(t('救出太空宠物', 'adventure'), '救出受困的小精灵', 'adventure: 太空宠物 → 受困的小精灵');

/* =========================================================
 * 2. identity 保护
 * ========================================================= */
assertEq(t('宠物乐园', 'pet'), '宠物乐园', '「宠物乐园」不被「宠物→小猫」误伤');
assertEq(t('宠物乐园', 'adventure'), '宠物乐园', 'adventure 下「宠物乐园」也原样保留');
assertEq(t('机器人世界', 'pet'), '机器人世界', '「机器人世界」不被拆成小狗搭档世界');
assertEq(t('探险王国', 'pet'), '探险王国', '「探险王国」原样保留');
assertEq(t('欢迎来到宠物乐园，宠物在等你', 'pet'), '欢迎来到宠物乐园，小猫在等你',
  '保护词条外的「宠物」正常替换');
assertEq(t('机器人世界的机器人', 'adventure'), '机器人世界的探险搭档',
  '保护词条外的「机器人」正常替换');
assertEq(t('🤖 机器人与机械任务', 'pet'), '🤖 机器人与机械任务',
  '兴趣类别「机器人与机械」跨主题保留（不等于当前故事主题）');

/* =========================================================
 * 3. 最长优先
 * ========================================================= */
assertEq(t('智能舱门', 'pet'), '聪明园门', 'pet: 智能舱门整词优先于「舱门」');
assertEq(t('智能舱门', 'adventure'), '机关石门', 'adventure: 智能舱门整词优先');
assertEq(t('智能舱门的秘密：舱门上有一盏判断灯', 'pet'), '聪明园门的秘密：园门上有一盏判断灯',
  '同句中整词与单词分别按最长优先命中');
assertEq(t('机器人能量站', 'pet'), '小狗能量补给屋', '整句词条优先于 机器人+能量站 拼接');
assertEq(t('机器人能量站', 'adventure'), '水晶能量营地', 'adventure 整句词条优先');
assertEq(t('能量站送来命令卡', 'pet'), '能量补给屋送来命令卡', '单独「能量站」照常替换');
assertEq(t('充电机在充电站里充电', 'pet'), '能量喂食机在能量补给屋里补充能量',
  '充电机/充电站 优先于「充电」');

/* 旧「××机器人」皮肤叫法 → 统一皮肤名（不产生「小狗小狗搭档」类叠词） */
assertEq(t('你的绿色小狗机器人已经充好了能量', 'pet'), '你的绿色电力狗已经充好了能量',
  'pet: 绿色小狗机器人 → 绿色电力狗');
assertEq(t('蓝色圆滚机器人', 'adventure'), '蓝色圆滚滚', 'adventure: 蓝色圆滚机器人 → 蓝色圆滚滚');
assertEq(t('机器人伙伴', 'pet'), '小狗搭档', 'pet: 机器人伙伴 → 小狗搭档（无叠词）');

/* =========================================================
 * 4. robot 恒等
 * ========================================================= */
['捡电池', '智能舱门', '机器人能量站', '救出太空宠物', '欢迎回来，指挥官！'].forEach(function (s) {
  assertEq(t(s, 'robot'), s, 'robot 恒等: ' + s);
});
assertEq(t('捡电池'), '捡电池', 'themeId 省略且无 session → 默认 robot 恒等');

/* =========================================================
 * 5. 代码字符串不受影响（负例）
 * ========================================================= */
assertEq(t('std::cout << "OPEN";', 'pet'), 'std::cout << "OPEN";', '代码字面量 OPEN 不受影响');
assertEq(t('std::cout << "CHARGE";', 'adventure'), 'std::cout << "CHARGE";', '代码字面量 CHARGE 不受影响');
assertEq(t('int energy = 3;', 'pet'), 'int energy = 3;', 'C++ 标识符不受影响');
assertEq(t('if (energy >= 5 && hasKey) { }', 'adventure'), 'if (energy >= 5 && hasKey) { }',
  '条件表达式不受影响');
assertEq(t('energy=能量', 'pet'), 'energy=能量', '标识符释义（energy=能量）不受影响');
assertEq(t('能量条还有 3 格', 'pet'), '能量条还有 3 格', '「能量」与格数体系全课程保留');

/* =========================================================
 * 6. 边界：空值 / 空串
 * ========================================================= */
assertEq(t('', 'pet'), '', '空串恒等');
assertEq(t(null, 'pet'), null, 'null 原样返回');
assertEq(t(undefined, 'pet'), undefined, 'undefined 原样返回');
assertEq(t('未知主题词恒等', 'nosuch'), '未知主题词恒等', '非法 themeId 按 robot 恒等');

/* =========================================================
 * 7. icon()
 * ========================================================= */
assertEq(Theme.icon('🔋', 'pet'), '🥫', 'pet: 🔋 → 🥫');
assertEq(Theme.icon('🔋', 'adventure'), '💎', 'adventure: 🔋 → 💎');
assertEq(Theme.icon('🔋', 'robot'), '🔋', 'robot: 🔋 恒等');
assertEq(Theme.icon('🚪', 'pet'), '🚪', '未登记图标恒等');
assertEq(Theme.icon('⛽', 'adventure'), '💎', 'adventure: ⛽ → 💎');
assertEq(Theme.icon('🚀', 'pet'), '🚐', 'pet: 🚀 → 🚐');

/* =========================================================
 * 8. skinName 跨主题统一
 * ========================================================= */
assertEq(Theme.skinName('robo-blue'), '蓝色圆滚滚', 'robo-blue → 蓝色圆滚滚');
assertEq(Theme.skinName('robo-orange'), '橙色方块侠', 'robo-orange → 橙色方块侠');
assertEq(Theme.skinName('robo-dog'), '绿色电力狗', 'robo-dog → 绿色电力狗');
assertEq(Theme.skinName('nosuch'), '我的伙伴', '未知皮肤兜底');

/* =========================================================
 * 9. setTheme / getTheme
 * ========================================================= */
Theme.setTheme('pet');
assertEq(Theme.getTheme(), 'pet', 'setTheme 后 getTheme 返回 pet');
assertEq(t('捡电池'), '捡能量罐头', 'themeId 省略时读 setTheme 缓存');
Theme.setTheme('robot');
assertEq(t('捡电池'), '捡电池', '切回 robot 恒等');

if (process.exitCode !== 1) {
  console.log('PASS (' + assertionCount + ' assertions)');
} else {
  console.error('测试未全部通过');
}
