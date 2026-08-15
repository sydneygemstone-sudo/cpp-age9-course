/*
 * lesson2.js — 第 2 课内容包《智能舱门：让程序自己做决定》
 * owner: content-lesson2（本文件只含课程内容数据，零教学逻辑，契约 §14.8）
 *
 * 依据：docs/方案定稿.md §8（8.1-8.7）、§5.3、§11.3；docs/CONTRACT.md §5 schema。
 * 跨课承接（契约补充，engine/lesson2/ui 三方一致）：
 *   - Variant 可带 dynamic:{initFromLesson1Energy:true}；
 *   - Engine.getVariant() 会把 program 中第一个 declare(name==='energy') 的 expr
 *     替换为 {kind:'lit', value: lesson1.finalEnergy}（Storage 无值时用本文件默认值），
 *   - 且 prediction.correctFromInherited===true 时把 prediction.correct 同步为该值。
 *
 * Node 兼容：顶层不触碰 document/window；文件尾 module.exports。
 */
var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ---------- 小工厂：只为减少笔误，产出纯数据 ---------- */

  function lit(v) { return { kind: 'lit', value: v }; }
  function vr(name) { return { kind: 'var', name: name }; }
  function bin(op, left, right) { return { kind: 'bin', op: op, left: left, right: right }; }
  function decl(varType, name, expr) { return { op: 'declare', varType: varType, name: name, expr: expr }; }
  function out(expr) { return { op: 'output', expr: expr }; }
  function ifElse(cond, thenSteps, elseSteps) { return { op: 'if', cond: cond, then: thenSteps, else: elseSteps }; }

  /*
   * 核心程序（方案 8.3 原样）：
   *   int energy = 5;
   *   if (energy >= 5) { std::cout << "OPEN"; } else { std::cout << "CHARGE"; }
   * 手算 stdout = "OPEN"
   */
  function coreProgram() {
    return [
      decl('int', 'energy', lit(5)),
      ifElse(
        bin('>=', vr('energy'), lit(5)),
        [out(lit('OPEN'))],
        [out(lit('CHARGE'))]
      )
    ];
  }

  /*
   * 带 bug 版（边界错误侦探）：说明书写着"能量满 5 格就开门"，
   * 代码却写成 energy > 5 —— 能量正好 5 时不开门。手算 stdout = "CHARGE"。
   */
  function bugProgram() {
    return [
      decl('int', 'energy', lit(5)),
      ifElse(
        bin('>', vr('energy'), lit(5)),
        [out(lit('OPEN'))],
        [out(lit('CHARGE'))]
      )
    ];
  }

  /*
   * 加速线扩展（方案 8.3 高级扩展 + else 分支以便两种结局都可见）：
   *   int energy = 5;  bool hasKey = true;
   *   if (energy >= 5 && hasKey) OPEN else CHARGE
   * 手算 stdout = "OPEN"
   */
  function andProgram() {
    return [
      decl('int', 'energy', lit(5)),
      decl('bool', 'hasKey', lit(true)),
      ifElse(
        bin('&&', bin('>=', vr('energy'), lit(5)), vr('hasKey')),
        [out(lit('OPEN'))],
        [out(lit('CHARGE'))]
      )
    ];
  }

  /*
   * "设计自己的规则"底座程序：机器人身上有四个传感器（能量/年龄/钥匙/积分），
   * 默认装的是能量门。孩子用槽位换门、调门槛。默认手算 stdout = "OPEN"。
   */
  function ruleBaseProgram() {
    return [
      decl('int', 'energy', lit(5)),
      decl('int', 'age', lit(9)),
      decl('int', 'keys', lit(1)),
      decl('int', 'score', lit(80)),
      ifElse(
        bin('>=', vr('energy'), lit(5)),
        [out(lit('OPEN'))],
        [out(lit('CHARGE'))]
      )
    ];
  }

  /* 加速线底座：双条件 && 。默认 energy>=5 真、keys>=1 真 → "OPEN"。 */
  function ruleBaseProgramA() {
    return [
      decl('int', 'energy', lit(5)),
      decl('int', 'age', lit(9)),
      decl('int', 'keys', lit(1)),
      decl('int', 'score', lit(80)),
      ifElse(
        bin('&&',
          bin('>=', vr('energy'), lit(5)),
          bin('>=', vr('keys'), lit(1))),
        [out(lit('OPEN'))],
        [out(lit('CHARGE'))]
      )
    ];
  }

  /* 四扇门的条件表达式（slots 的 choice 槽位使用；expr 即放入 path 的 IR 表达式） */
  function gateChoices() {
    return [
      { id: 'gate-energy', label: '能量门：energy >= 5（能量满 5 格才开）', expr: bin('>=', vr('energy'), lit(5)) },
      { id: 'gate-age', label: '年龄门：age >= 10（满 10 岁才开）', expr: bin('>=', vr('age'), lit(10)) },
      { id: 'gate-key', label: '钥匙门：keys >= 1（至少 1 把钥匙才开）', expr: bin('>=', vr('keys'), lit(1)) },
      { id: 'gate-score', label: '积分门：score >= 90（积分到 90 才开）', expr: bin('>=', vr('score'), lit(90)) }
    ];
  }

  /* 比较符槽位的选项（value 即放入 path 的比较符） */
  function opChoices() {
    return [
      { id: 'op-ge', label: '>=（大于或正好等于）', value: '>=' },
      { id: 'op-gt', label: '>（只认比它大）', value: '>' },
      { id: 'op-le', label: '<=（小于或正好等于）', value: '<=' },
      { id: 'op-lt', label: '<（只认比它小）', value: '<' }
    ];
  }

  CppLab.content = CppLab.content || {};

  var lesson2 = {
    lessonId: 'lesson2',
    title: '智能舱门：让程序自己做决定',
    intro: '你的机器人已经带着能量回来了。前面这扇舱门有点特别——它会自己检查能量，自己决定开还是不开。今天，我们来看看程序是怎么做决定的。',
    activities: [

      /* =====================================================================
       * 活动 0 · 开场 0–3 分钟 · 工作台仪式（ordering）——Mac 基础操作侧线第 2 关
       * 依 Dean 首课后的定案：第 1 课登机仪式只覆盖「网络+浏览器」，第 2 课在
       * Mac 系统环境下拓展、向正式编程环境逐步推进——目标是两三节课后孩子能
       * 自己输入代码。本活动：访达新建「我的代码」文件夹 → 认识键盘上的
       * Cmd/空格/Shift 与切英文输入法 → 文本编辑(TextEdit)用英文敲一行字。
       * 规格仿 lesson1-00-boarding-ritual：order 0 排最前、minutes [0,3]。
       * minutes 与活动 1（能量回忆 [0,7]）角标重叠——照本课 6.5 活动
       * （file-workshop）的先例处理：时间弹性共享，节奏由教师现场把控。
       * 各变体 program 为 null、不参与编译校验；动手部分全部在真机
       * （访达/键盘/文本编辑）完成。这里建的「我的代码」文件夹，本课后面的
       * 「代码的家」活动（lesson2-09）会再次用到——届时不必重建，找到即可。
       * =================================================================== */
      {
        id: 'lesson2-00-workbench-ritual',
        lessonId: 'lesson2',
        order: 0,
        minutes: [0, 3],
        title: '工作台仪式',
        concept: '程序员的工作台：文件夹是代码的家，键盘和英文输入法是写代码的工具。',
        learningObjective: '能在访达里亲手新建「我的代码」文件夹，认识键盘上的 Cmd/空格/Shift，切换成英文输入法并在文本编辑里用英文敲出一行字（对应 D12 电脑操作熟练度；Mac 基础操作侧线第 2 关）。',
        childPrompt: '上次你连上了老师的服务器，这次要搭起自己的工作台！机器人拍拍桌子：「真正的程序员动手前，先备好三样——给代码安家的[[文件夹|folder]]、听你指挥的[[键盘|keyboard]]、还有写代码专用的英文输入法。照卡片把仪式做一遍！」',
        dimensions: ['D12', 'D2'],
        activityType: 'ordering',
        visualModel: 'scene',
        variants: {
          E: {
            intro: '机器人说：「今天的仪式只有三步，一步一步来，我在旁边看着你。做完这三步，你的工作台就搭好啦！」',
            program: null,
            interaction: {
              items: [
                { id: 'open-finder', label: '点 Dock 里的笑脸打开访达，在桌面新建一个文件夹，取名「我的代码」', icon: '📁' },
                { id: 'meet-keys', label: '在键盘上找到三个新朋友：Cmd ⌘、空格（最长那条）、Shift ⇧，再把输入法切换成英文', icon: '⌨️' },
                { id: 'type-hello', label: '打开文本编辑（TextEdit），用英文敲出 hello', icon: '📝' }
              ],
              correctOrder: ['open-finder', 'meet-keys', 'type-hello']
            },
            prediction: null,
            successCriteria: '排出正确顺序，并在真机上完成一遍：新建出「我的代码」文件夹、指认三个键、在文本编辑里敲出 hello（操作可由老师念口令、孩子动手）。'
          },
          S: {
            intro: '机器人递来一张「工作台检查单」：「这次是完整版仪式——四步一步都不能乱！排好之后在真机上做一遍，每做一步就指给我看：这是哪张卡？」',
            program: null,
            interaction: {
              items: [
                { id: 'open-finder', label: '打开访达（Dock 里的笑脸），新建文件夹取名「我的代码」——这是代码的家', icon: '📁' },
                { id: 'meet-keys', label: '低头认键盘：找到 Cmd ⌘、最长的空格条、上箭头 Shift ⇧', icon: '⌨️' },
                { id: 'switch-en', label: '把输入法切换成英文——看屏幕右上角的输入法标志变成英文（ABC）', icon: '🔤' },
                { id: 'type-hello', label: '打开文本编辑，新建文档，用英文敲出 hello，检查每个字母都是英文', icon: '📝' }
              ],
              correctOrder: ['open-finder', 'meet-keys', 'switch-en', 'type-hello']
            },
            prediction: null,
            successCriteria: '独立排出四步并在真机完成；能指出右上角的输入法标志现在是中文还是英文，并说出 Shift 是用来打大写字母的。'
          },
          A: {
            intro: '机器人神秘地说：「高级仪式一共五步，全部自己来，一步都不用老师帮。最后还要回答我的工作台之问——全对了才算出师！」',
            program: null,
            interaction: {
              items: [
                { id: 'open-finder', label: '打开访达（Dock 里的笑脸），新建文件夹取名「我的代码」——这是代码的家', icon: '📁' },
                { id: 'meet-keys', label: '低头认键盘：找到 Cmd ⌘、最长的空格条、上箭头 Shift ⇧', icon: '⌨️' },
                { id: 'switch-en', label: '把输入法切换成英文——看屏幕右上角的输入法标志变成英文（ABC）', icon: '🔤' },
                { id: 'type-hello', label: '打开文本编辑，新建文档，用英文敲出 hello', icon: '📝' },
                { id: 'shift-try', label: '按住 Shift 再敲一个字母，看小写变大写——代码里 Hello 和 hello 可不是一回事', icon: '⬆️' }
              ],
              correctOrder: ['open-finder', 'meet-keys', 'switch-en', 'type-hello', 'shift-try']
            },
            prediction: {
              question: '为什么写代码之前要先切换成英文输入法？',
              inputType: 'choice',
              options: [
                { id: 'en-chars', label: 'C++ 代码里的单词和符号（int、;、>=）都必须是英文字符，中文输入法打出的符号编译器不认识' },
                { id: 'looks', label: '因为英文看起来更酷，其实用什么输入法都行' },
                { id: 'ban', label: '因为电脑里不允许出现任何中文字' }
              ],
              correct: 'en-chars'
            },
            successCriteria: '答出「代码的单词和符号必须是英文字符，中文输入法打的符号编译器不认」；独立排出五步并在真机完成，敲出的 hello 每个字母都是英文小写、按 Shift 能敲出大写。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '任务是把工作台仪式的步骤排好队。想一想：代码还没有地方住的时候，先干哪件事？' },
          { level: 'H2', text: '先安家，再备工具：文件夹是代码的家，键盘和英文输入法是写字的工具，最后才轮到真正敲字。' },
          { level: 'H3', text: '「敲出 hello」一定排在切换英文输入法之后——不然敲出来的可能是一串汉字。先把第一步和最后一步定住，中间就好排了。' },
          { level: 'H4', text: '打个比方：先收拾好书桌，再摆好纸和笔，最后才开始写字。建文件夹、切英文输入法、敲字，是不是同一个道理？' },
          { level: 'H5', text: '教师提示：老师先在自己机器上完整演示「新建文件夹 → 切英文 → 敲 hello」一遍，再让孩子在学生机重做；输入法卡住时指着右上角的标志念「中/英」，让孩子自己按到英文为止。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D12',
          note: '真机操作独立度：新建文件夹、认键、切英文输入法、敲英文四步里哪些能独立完成？切输入法与敲字的熟练度直接决定后面几课能否自己输入代码，需逐项记录。'
        },
        teacherCards: {
          truth: '这一关仍是真实电脑操作，不是编程：访达（Dock 的笑脸）是 Mac 的文件管理器，管理文件和文件夹；这里建的「我的代码」文件夹，本课后面「代码的家」活动会再次用到——届时不必重建，找到它就行。Cmd ⌘ 是 Mac 的指挥键（Cmd+S 保存、Cmd+V 粘贴都靠它），Shift ⇧ 打大写字母，空格是最长那条。写代码必须用英文输入法：C++ 的关键词、分号、引号都是英文字符，中文输入法会打出全角符号（「；」和「;」不一样），编译器不认识。',
          demo: '老师全程只动口不动手。孩子建好文件夹后，故意让他先用中文输入法敲一个分号，再切英文敲一个，把「；」和「;」放大摆在一起对比——为 A 档追问和以后亲手写代码埋伏笔。',
          questions: [
            '「我的代码」文件夹建在哪儿了？下周开机还能找到它吗？',
            '屏幕右上角哪里能看出现在是中文输入法还是英文输入法？',
            'Cmd、空格、Shift 三个键各在键盘的什么位置？Shift 是干什么用的？'
          ],
          misconceptions: [
            '以为输入法只影响打汉字，不知道中文输入法连标点符号（；：“”）都会打成另一种样子。',
            '以为文件夹建完关掉窗口就消失了，没有「它一直住在电脑里、随时能再找到」的概念。'
          ],
          rescueSteps: [
            '一次只做一步：先只练「新建文件夹」——在桌面右键（或双指点按）菜单里找「新建文件夹」，命名成功了再进下一步。',
            '切输入法卡住时，让孩子盯着右上角的输入法标志，每按一次切换键就看它变一次，变到英文（ABC）为止。',
            '敲 hello 打不出来时，老师念一个字母、孩子按一个键，敲完一起指着屏幕把这个单词念一遍。'
          ],
          extension: '追问：如果用中文输入法敲 hello 会出现什么？在文本编辑里亲手试一试，再想想以后写代码时这会闯什么祸。（正好引出：代码里的每一个字符都要用英文输入法敲。）'
        },
        compilerCheck: {
          enabled: false,
          expectedStdout: ''
        }
      },

      /* =====================================================================
       * 活动 1 · 0–7 分钟 · 能量回忆（predict）
       * 跨课承接：dynamic.initFromLesson1Energy + prediction.correctFromInherited
       * =================================================================== */
      {
        id: 'lesson2-01-energy-recall',
        lessonId: 'lesson2',
        order: 1,
        minutes: [0, 7],
        title: '能量回忆',
        concept: '变量保存的是"现在的状态"，隔了一次课它还在。',
        learningObjective: '孩子能回忆并说出上一课结束时 energy 的当前值，确认变量保存的是最新状态。',
        childPrompt: '还记得吗？上次你给机器人攒了能量。先猜猜它现在身上有几格，再让程序把答案亮出来！',
        dimensions: ['D3', 'D4'],
        activityType: 'predict',
        visualModel: 'energy',
        variants: {
          E: {
            intro: '你的机器人回来啦！先别看代码，想一想：上次下课的时候，它的能量条停在了几格？把数字告诉我。',
            dynamic: { initFromLesson1Energy: true },
            program: [
              decl('int', 'energy', lit(6)),
              out(vr('energy'))
            ],
            interaction: {
              question: '机器人现在身上有几格能量？',
              inputType: 'number',
              correct: 6
            },
            prediction: {
              question: '机器人现在身上有几格能量？',
              inputType: 'number',
              correct: 6,
              correctFromInherited: true
            },
            successCriteria: '孩子说出一个数字并运行验证；即使猜错，能在看到输出后说出"能量卡里存的是最后那个数"。'
          },
          S: {
            intro: '欢迎回来！上次的能量还存在 energy 这个[[变量|variable]]盒子里。先预测它现在的值，再运行程序检查你的记忆准不准。',
            dynamic: { initFromLesson1Energy: true },
            program: [
              decl('int', 'energy', lit(6)),
              out(vr('energy'))
            ],
            interaction: {
              question: '现在 energy 里存的数是多少？',
              inputType: 'number',
              correct: 6
            },
            prediction: {
              question: '现在 energy 里存的数是多少？',
              inputType: 'number',
              correct: 6,
              correctFromInherited: true
            },
            successCriteria: '独立预测正确，并能说出"energy 存的是上次最后算出来的值，不是一开始的值"。'
          },
          A: {
            intro: '你的机器人带着上次的能量回来了。预测 energy 的当前值，并准备解释：为什么它不是第 1 课开头的那个数？',
            dynamic: { initFromLesson1Energy: true },
            program: [
              decl('int', 'energy', lit(6)),
              out(vr('energy'))
            ],
            interaction: {
              question: 'energy 现在的值是多少？',
              inputType: 'number',
              correct: 6
            },
            prediction: {
              question: 'energy 现在的值是多少？',
              inputType: 'number',
              correct: 6,
              correctFromInherited: true
            },
            successCriteria: '预测正确，且能解释"变量只保存最新状态，旧值已经被写回覆盖了"。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '任务是想起上次的能量数。想一想：上次下课前，能量条最后停在了哪里？' },
          { level: 'H2', text: '注意看 energy 这个变量盒子——它存的永远是"最后一次放进去的数"。' },
          { level: 'H3', text: '不用从头算！上次的三步加减早就算完了，盒子里只剩一个最终的数。' },
          { level: 'H4', text: '打个比方：储蓄罐上周存完是 8 块钱，这周打开还是 8 块，不会变回最开始的 3 块。' },
          { level: 'H5', text: '教师提示：直接翻开上一课的作品卡，一起指着"最终能量"读出来，再让孩子在这里输入同一个数。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D3',
          note: '间隔一次课后的状态保持：是否记得 energy 终值？是靠记忆、靠推算、还是需要翻看作品卡？'
        },
        teacherCards: {
          truth: '变量保存的是当前状态，不是历史列表。第 1 课结束时 energy 的终值被系统存了下来，本课开场直接注入，正是"程序里的状态可以延续"的第一次真实体验。',
          demo: '让孩子先闭眼说数字，再运行程序对答案。如果孩子说的是第 1 课开头的初始值（比如 3），恰好暴露"变量=一串历史"的误区，值得当场展开。',
          questions: [
            '你是怎么想起这个数的？是记住了，还是重新算了一遍？',
            'energy 里现在只装着一个数，还是把以前的数都装着？',
            '如果上次你最后多充了一格电，今天这里会显示几？'
          ],
          misconceptions: [
            '认为变量同时保存所有出现过的值（3、7、6……），说不出"只剩最后一个"。',
            '把"能量变化的过程"与"能量现在是多少"混为一件事，重述整个过程却给不出当前值。'
          ],
          rescueSteps: [
            '先别看代码，只问："上次能量条最后停在几格？"',
            '打开上一课作品卡，指着最终能量一起读一遍。',
            '回到本页运行程序，让屏幕上的数字和作品卡对上。'
          ],
          extension: '追问：如果机器人昨晚"偷偷自己充了电"，程序不改的话，今天这里的数会变吗？（不会——程序里的状态只由代码和存档决定。）'
        },
        compilerCheck: {
          enabled: false,
          expectedStdout: ''
        }
      },

      /* =====================================================================
       * 活动 2 · 7–15 分钟 · 人工舱门游戏（choice）——孩子扮演舱门
       * =================================================================== */
      {
        id: 'lesson2-02-human-door',
        lessonId: 'lesson2',
        order: 2,
        minutes: [7, 15],
        title: '人工舱门游戏',
        concept: '条件是一个只会回答"真"或"假"的问题；规则成立才执行。',
        learningObjective: '孩子能扮演舱门，按"能量满 5 格才开门"的规则对不同能量值做出开/不开的判断。',
        childPrompt: '现在你就是那扇舱门！老师会喊出机器人的能量数，你只按规则办事：能量满 5 格，才准开门。',
        dimensions: ['D5'],
        activityType: 'choice',
        visualModel: 'door',
        variants: {
          E: {
            intro: '游戏开始！你是舱门，规则只有一条：能量满 5 格才开门。老师喊："这台机器人能量是 3！"你怎么做？',
            program: null,
            interaction: {
              question: '机器人能量是 3，规则是"能量满 5 格才开门"。你是舱门，你怎么做？',
              options: [
                { id: 'open', label: '开门，放它进来' },
                { id: 'closed', label: '不开门，请它先去充电', correct: true },
                { id: 'half', label: '开一半，让它挤进来' }
              ],
              multi: false
            },
            prediction: null,
            successCriteria: '孩子按规则回答"不开"，并能用自己的话说出"因为 3 不到 5"。'
          },
          S: {
            intro: '这一轮有点狡猾：机器人能量正好是 5，一格不多一格不少。规则是"能量满 5 格才开门"。舱门，你怎么判？',
            program: null,
            interaction: {
              question: '机器人能量正好是 5，规则是"能量满 5 格才开门"。你是舱门，你怎么做？',
              options: [
                { id: 'open', label: '开门——"满 5 格"包括正好 5', correct: true },
                { id: 'closed', label: '不开门——5 还不够多' },
                { id: 'ask', label: '说不清，去问船长' }
              ],
              multi: false
            },
            prediction: null,
            successCriteria: '孩子判定"正好 5 也算满 5"，并能说出这条规则包含"等于"的情况。'
          },
          A: {
            intro: '最后一轮换一条更严的规则：这扇门的说明书写的是"能量必须比 7 多才开门"。机器人能量正好是 7。你怎么判？',
            program: null,
            interaction: {
              question: '规则是"能量必须比 7 多（超过 7）才开门"，机器人能量正好是 7。你是舱门，你怎么做？',
              options: [
                { id: 'open', label: '开门——7 已经很多了' },
                { id: 'closed', label: '不开门——"比 7 多"不包括正好 7', correct: true },
                { id: 'both', label: '先开再关，两个都做' }
              ],
              multi: false
            },
            prediction: null,
            successCriteria: '孩子分清"满 5（>=）"和"比 7 多（>）"是两种不同的规则，并说出正好等于时的区别。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '你的任务是当一扇只讲规则的门。先把规则大声读一遍：什么情况下才能开？' },
          { level: 'H2', text: '把两个数摆在一起比一比：机器人的能量数，和规则里的那个数。' },
          { level: 'H3', text: '门只需要回答一个问题："够了吗？"答案只有"真"和"假"，没有"差不多"。' },
          { level: 'H4', text: '想想游乐场的身高杆：写着"满 120 厘米才能玩"，正好 120 的小朋友能不能玩？那"必须超过 120"呢？' },
          { level: 'H5', text: '教师提示：拿三张卡片写上 3、5、8，逐张举起让孩子喊"开/不开"，喊错就一起指着规则重新比一次。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D5',
          note: '条件作为规则的理解：能否稳定按规则判断？边界值（正好等于）时是否犹豫或凭感觉？'
        },
        teacherCards: {
          truth: '条件的结果只有真或假，没有第三种。孩子亲身扮演舱门，是把"条件"从代码符号还原成一个"只回答真假的问题"——这正是 if 语句的全部秘密。',
          demo: '老师连续喊出能量 3、5、8，让孩子快速判"开/不开"。判到 5 时故意停顿，问"正好 5 算不算满 5"，观察孩子是凭规则还是凭感觉。',
          questions: [
            '你刚才是怎么决定开不开的？用了规则里的哪个数？',
            '"满 5 格"和"比 5 多"是同一条规则吗？差在哪个数上？',
            '门可以回答"差不多够了"吗？为什么不行？'
          ],
          misconceptions: [
            '认为门可以"看情况通融"——条件之外还有模糊地带；实际上条件结果只有真或假。',
            '把"能量变化"与"检查能量"混为一件事：以为门检查时能量还会自己变。'
          ],
          rescueSteps: [
            '先把自己当成舱门，只回答"真"还是"假"，别的都不用管。',
            '问："现在的能量是几？规则要求什么？"让孩子把两个数各写在一张卡上再比。',
            '连续三轮只玩"比大小喊真假"，不提开门，等答案稳定了再把"真=开门"接回来。'
          ],
          extension: '追问：如果规则改成"能量少于 3 才要去充电"，能量是 3 的机器人去不去充电？（不去——"少于"不包括等于。）'
        },
        compilerCheck: {
          enabled: false,
          expectedStdout: ''
        }
      },

      /* =====================================================================
       * 活动 3 · 15–25 分钟 · 条件透镜（trace）——真假检测器
       * =================================================================== */
      {
        id: 'lesson2-03-condition-lens',
        lessonId: 'lesson2',
        order: 3,
        minutes: [15, 25],
        title: '条件透镜',
        concept: '程序执行到 if 那一行时，把条件计算一次，得到真或假。',
        learningObjective: '孩子能借助真假检测器，说出 energy >= 5 这类条件在当前能量下的真假结果。',
        childPrompt: '把 energy >= 5 放进真假检测器！单步运行，看看检测器亮绿灯（真 ✓）还是红灯（假 ✗）。',
        dimensions: ['D5', 'D1'],
        activityType: 'trace',
        visualModel: 'door',
        variants: {
          E: {
            intro: '这是真假检测器：[[条件|condition]]放进去，它只会亮两种灯——绿灯 ✓ 是真，红灯 ✗ 是假。现在能量是 5，我们把 energy >= 5 放进去，单步走一步看一步。',
            program: coreProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 1,
                  question: '检测器检查了 energy >= 5。它亮了哪盏灯？',
                  inputType: 'choice',
                  options: [
                    { id: 'true', label: '绿灯 ✓（真）' },
                    { id: 'false', label: '红灯 ✗（假）' }
                  ],
                  correct: 'true'
                }
              ]
            },
            prediction: null,
            successCriteria: '孩子能在检测器亮灯后正确说出"真"，并把 5 >= 5 的比较说成"正好够，也算真"。'
          },
          S: {
            intro: '真假检测器上场！energy >= 5 的意思是"energy 大于或正好等于 5"。单步运行，先看它怎么亮灯，再想想能量变少会怎样。',
            program: coreProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 1,
                  question: '现在 energy 是 5，检测器检查 energy >= 5，亮哪盏灯？',
                  inputType: 'choice',
                  options: [
                    { id: 'true', label: '绿灯 ✓（真）——5 大于或正好等于 5' },
                    { id: 'false', label: '红灯 ✗（假）——5 不比 5 大' }
                  ],
                  correct: 'true'
                },
                {
                  afterStep: 2,
                  question: '如果能量只有 4，同一个检测器会亮哪盏灯？',
                  inputType: 'choice',
                  options: [
                    { id: 'true', label: '绿灯 ✓（真）' },
                    { id: 'false', label: '红灯 ✗（假）' }
                  ],
                  correct: 'false'
                }
              ]
            },
            prediction: null,
            successCriteria: '两个检查点都答对，并能解释 >= 里的"="就是"正好等于也算"。'
          },
          A: {
            intro: '升级挑战：这扇门要同时检查两个小问题——能量够不够（energy >= 5），钥匙有没有（hasKey）。两个都真，整个[[条件|condition]]才是真。',
            program: andProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 2,
                  question: 'energy 是 5、hasKey 是 true。检测器检查 energy >= 5 && hasKey，亮哪盏灯？',
                  inputType: 'choice',
                  options: [
                    { id: 'true', label: '绿灯 ✓（真）——两个小问题都是真' },
                    { id: 'false', label: '红灯 ✗（假）——有一个是假' }
                  ],
                  correct: 'true'
                },
                {
                  afterStep: 3,
                  question: '如果把规则改成 energy > 5 && hasKey（注意是 > 不是 >=），检测器会亮哪盏灯？',
                  inputType: 'choice',
                  options: [
                    { id: 'true', label: '绿灯 ✓（真）' },
                    { id: 'false', label: '红灯 ✗（假）——5 不比 5 大，第一个小问题就假了' }
                  ],
                  correct: 'false'
                }
              ]
            },
            prediction: null,
            successCriteria: '能说出 && 是"两个都要真"，并且发现 > 与 >= 在 energy 正好是 5 时结果不同。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '检测器只回答一个问题："这个条件现在是真还是假？"先把条件小声读一遍。' },
          { level: 'H2', text: '看右边的变量卡：energy 现在是几？条件里跟它比的数是几？' },
          { level: 'H3', text: '>= 是两个符号拼的："大于"或者"正好等于"。两种情况里只要中一种，就是真。' },
          { level: 'H4', text: '换个数试试：如果 energy 是 9，9 >= 5 是真还是假？如果是 2 呢？再回来看现在的数。' },
          { level: 'H5', text: '教师提示：在纸上画两个圈写"大于 5"和"正好 5"，把当前能量数放进对应的圈，落进任何一个圈就是真——再让孩子照这个方法判一次。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D5',
          note: '比较与边界：能否读懂 >= 并正确判定真假？正好等于阈值时是否知道"也算真"？'
        },
        teacherCards: {
          truth: '条件在程序执行到 if 那一行时被计算一次，结果只有真或假。>= 包括"正好等于"，> 不包括——这个小差别就是下一个活动里 bug 的伏笔。',
          demo: '单步走到 if 行时暂停，先让孩子口头判真假，再点下一步看检测器亮灯。故意问"要是能量 4 呢？"，让孩子在脑子里重跑一次检测器。',
          questions: [
            '检测器是什么时候开始检查的？程序一启动它就一直在查吗？',
            'energy >= 5 里的两个符号分别是什么意思？',
            '能量是几的时候，这盏灯会从绿变红？'
          ],
          misconceptions: [
            '认为条件会一直在后台自动检查——实际上只在执行到 if 那一行时算一次。',
            '把 >= 读成"大于"，漏掉"正好等于也算真"的情况。'
          ],
          rescueSteps: [
            '问："现在的能量是几？规则要求什么？"把两个数写下来再比。',
            '先只比"大于"：5 比 5 大吗？不大。再比"正好等于"：5 等于 5 吗？等于！所以 >= 是真。',
            '用 4、5、6 三个数各判一次真假，让孩子发现只有跨过 5 这道坎结果才变。'
          ],
          extension: '追问：程序跑完以后，如果老师偷偷把能量改成 2，刚才亮过的绿灯会自己变红吗？（不会——条件只在执行到那一行时算过一次。）'
        },
        compilerCheck: {
          enabled: true,
          expectedStdout: 'OPEN'
        }
      },

      /* =====================================================================
       * 活动 4 · 25–36 分钟 · 两条道路（trace）——单步 if/else，未走分支变灰
       * =================================================================== */
      {
        id: 'lesson2-04-two-roads',
        lessonId: 'lesson2',
        order: 4,
        minutes: [25, 36],
        title: '两条道路',
        concept: 'if/else 是一个岔路口：真走 if 块，假走 else 块，永远只走一边。',
        learningObjective: '孩子能预测 if/else 只会执行哪一侧，并说出未执行的分支根本没有运行。',
        childPrompt: '舱门程序前面出现了岔路口：上面一条路写着 OPEN，下面一条路写着 CHARGE。单步走一走，看程序到底走哪条——另一条会变灰哦！',
        dimensions: ['D5', 'D2'],
        activityType: 'trace',
        visualModel: 'door',
        variants: {
          E: {
            intro: '看，代码里出现了岔路口！先猜猜屏幕最后会打出几个单词，再单步走，亲眼看程序选路。没走的那条路会变灰。',
            program: coreProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 1,
                  question: '检测器亮了绿灯（真）。接下来程序走哪条路？',
                  inputType: 'choice',
                  options: [
                    { id: 'open-road', label: '上面的路：打出 OPEN' },
                    { id: 'charge-road', label: '下面的路：打出 CHARGE' },
                    { id: 'both-roads', label: '两条路都走一遍' }
                  ],
                  correct: 'open-road'
                },
                {
                  afterStep: 2,
                  question: 'CHARGE 那条路变灰了。它刚才运行过吗？',
                  inputType: 'choice',
                  options: [
                    { id: 'not-run', label: '没有运行，这一次它被跳过了' },
                    { id: 'ran-secretly', label: '偷偷运行了，只是没显示' }
                  ],
                  correct: 'not-run'
                }
              ]
            },
            prediction: {
              question: '运行之前先猜：屏幕上最后会出现几个单词？',
              inputType: 'choice',
              options: [
                { id: 'one', label: '1 个——程序只走一条路' },
                { id: 'two', label: '2 个——OPEN 和 CHARGE 都会出现' }
              ],
              correct: 'one'
            },
            successCriteria: '孩子预测只出 1 个单词，两个检查点都答对，并能指着灰色分支说"这边没跑"。'
          },
          S: {
            intro: '岔路口规则：条件真，走 if 块；条件假，走 else 块；一次只走一边。先预测[[输出|output]]，再单步验证你的想法。',
            program: coreProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 1,
                  question: '条件 energy >= 5 是真。程序接下来执行哪一段花括号里的代码？',
                  inputType: 'choice',
                  options: [
                    { id: 'open-road', label: 'if 后面的花括号：std::cout << "OPEN";' },
                    { id: 'charge-road', label: 'else 后面的花括号：std::cout << "CHARGE";' },
                    { id: 'both-roads', label: '先执行 if 的，再执行 else 的' }
                  ],
                  correct: 'open-road'
                },
                {
                  afterStep: 2,
                  question: 'else 什么时候才会轮到它运行？',
                  inputType: 'choice',
                  options: [
                    { id: 'when-false', label: '条件是假的时候' },
                    { id: 'after-if', label: 'if 执行完就轮到它' },
                    { id: 'never', label: '永远不会运行' }
                  ],
                  correct: 'when-false'
                }
              ]
            },
            prediction: {
              question: '运行之前先猜：这段程序会打出几个单词？',
              inputType: 'choice',
              options: [
                { id: 'one', label: '只打出 1 个' },
                { id: 'two', label: 'OPEN 和 CHARGE 都打出来' }
              ],
              correct: 'one'
            },
            successCriteria: '预测正确，能说出"else 只在条件为假时运行"，并解释灰色表示这次没执行。'
          },
          A: {
            intro: '你已经知道程序只走一边。这次不但要选对路，还要会"改路"：想让程序走另一条路，该动哪个数字？',
            program: coreProgram(),
            interaction: {
              checkpoints: [
                {
                  afterStep: 1,
                  question: '条件为真，程序走哪条路？',
                  inputType: 'choice',
                  options: [
                    { id: 'open-road', label: 'if 块：输出 OPEN' },
                    { id: 'charge-road', label: 'else 块：输出 CHARGE' }
                  ],
                  correct: 'open-road'
                },
                {
                  afterStep: 2,
                  question: '想让程序改走 CHARGE 那条路，把 energy 的初始值改成几就行？',
                  inputType: 'choice',
                  options: [
                    { id: 'four', label: '改成 4——4 >= 5 是假，走 else' },
                    { id: 'five', label: '改成 5——正好 5 就走 else' },
                    { id: 'six', label: '改成 6——更多能量走 else' }
                  ],
                  correct: 'four'
                }
              ]
            },
            prediction: {
              question: '运行之前先猜：屏幕上会打出几个单词？',
              inputType: 'choice',
              options: [
                { id: 'one', label: '1 个' },
                { id: 'two', label: '2 个' }
              ],
              correct: 'one'
            },
            successCriteria: '预测正确，并能反向操作：说出把 energy 改小到 5 以下就能让程序走 else 分支。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '这是一个岔路口。先想想：走岔路的时候，你能同时走两条路吗？' },
          { level: 'H2', text: '看检测器的灯：绿灯（真）配 if 那条路，红灯（假）配 else 那条路。' },
          { level: 'H3', text: '排除一个方向：程序绝不会两条路都走。所以答案只在"上面"和"下面"里选一个。' },
          { level: 'H4', text: '打个比方：自动门检票，票有效走"请进"通道，票无效走"补票"通道——没有人两个通道都过一遍。' },
          { level: 'H5', text: '教师提示：让孩子用手指当"程序小人"，从第一行一路划下来，到 if 处只能拐进一条花括号；划完问他"另一条你的手指碰过吗？"', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D5',
          note: '核心观察：是否误以为 if 和 else 两边都会执行？看到未走分支变灰后能否自己说出"它没运行"？'
        },
        teacherCards: {
          truth: '真时执行 if 块，假时执行 else 块，永远只有一边运行。花括号包围一个代码块——整块一起走或整块一起被跳过。灰色不是"运行得慢"，是"这次根本没轮到"。',
          demo: '单步到 if 行时停住，让孩子先用手指出要走的路，再点下一步印证。然后把 energy 改成 4 重跑一次，让孩子看到另一条路亮起来、原来的路变灰。',
          questions: [
            '为什么 CHARGE 没有出现在屏幕上？那几行代码去哪儿了？',
            '什么情况下 OPEN 那条路会变灰？',
            '花括号把哪几行包在一起？它们是一起走还是可以拆开走？'
          ],
          misconceptions: [
            '认为两个分支都会先后运行，只是先跑 if 再跑 else。',
            '认为变灰的分支"在后台悄悄跑了"，只是没显示出来。'
          ],
          rescueSteps: [
            '念口诀："真时走上面，假时走下面。"一边念一边用手指划路线。',
            '先看检测器亮什么灯，再让孩子只回答"上面还是下面"。',
            '把 energy 改成 4 再单步跑一遍，两条路各走过一次后，再问"一次能走几条？"'
          ],
          extension: '追问：如果把 else 那一整块删掉，能量是 4 的时候程序会打出什么？（什么都不打——条件假而且没有 else，就直接跳过去了。）'
        },
        compilerCheck: {
          enabled: true,
          expectedStdout: 'OPEN'
        }
      },

      /* =====================================================================
       * 活动 5 · 36–46 分钟 · 边界错误侦探（bughunt）
       * program 是带 bug 版：energy > 5，能量正好 5 时不开门（直接运行输出 CHARGE）。
       * expectedStdout 是修好版（>=）的真实编译输出 OPEN——与产品「真实C++验证」
       * 时机一致（孩子修好 bug 后 app.js 编译修好版源码比对）。
       * =================================================================== */
      {
        id: 'lesson2-05-boundary-bughunt',
        lessonId: 'lesson2',
        order: 5,
        minutes: [36, 46],
        title: '边界错误侦探',
        concept: '> 不包括"正好等于"，>= 包括；边界值最容易藏 bug。',
        learningObjective: '孩子能发现"能量正好 5 时不开门"的原因是 > 写错了，应改为 >=，并用边界值验证修复。',
        childPrompt: '出事了！说明书写着"能量满 5 格就开门"，可机器人能量正好是 5，舱门却把它拦在了外面。侦探，请找出代码里出问题的那个符号！',
        dimensions: ['D8', 'D1'],
        activityType: 'bughunt',
        visualModel: 'door',
        variants: {
          E: {
            intro: '侦探任务来了！规则本该是"满 5 格就开门"。先猜猜这台能量正好 5 的机器人能不能进门，再运行看看——如果和你想的不一样，bug 就藏在附近！',
            program: bugProgram(),
            interaction: {
              bug: {
                stepIndex: 1,
                wrongPiece: 'energy > 5',
                rightPiece: 'energy >= 5',
                whyChild: '「>」只认"比 5 大"，能量正好是 5 的时候它会说"假"，门就不开。把它换成「>=」，"正好等于 5"也算真，门就会开啦。'
              }
            },
            prediction: {
              question: '说明书写着"能量满 5 格就开门"。机器人能量正好是 5，运行这段代码，门会开吗？',
              inputType: 'choice',
              options: [
                { id: 'open', label: '会开——正好 5 也算满 5' },
                { id: 'closed', label: '不会开——这段代码有问题' }
              ],
              correct: 'closed'
            },
            successCriteria: '孩子发现运行结果和说明书不符，指出 > 这个符号有问题，并说出"要把正好等于也算进去"。'
          },
          S: {
            intro: '说明书说"满 5 格开门"，代码却把能量 5 的机器人拦住了。先预测运行结果，再对照说明书找出那个写错的符号，说清楚为什么错。',
            program: bugProgram(),
            interaction: {
              bug: {
                stepIndex: 1,
                wrongPiece: 'energy > 5',
                rightPiece: 'energy >= 5',
                whyChild: '说明书要的是"满 5 格"，也就是"大于或正好等于 5"。代码里的「>」漏掉了"正好等于"这半句，所以 5 被当成了"不够"。改成「>=」才和说明书一致。'
              }
            },
            prediction: {
              question: 'energy 正好是 5，这段代码运行后屏幕上会打出什么？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN——门会开' },
                { id: 'charge', label: 'CHARGE——门不开，去充电' }
              ],
              correct: 'charge'
            },
            successCriteria: '预测出 CHARGE，定位到 > 符号，并能用"5、6、4 三个能量各会怎样"来解释修复前后的差别。'
          },
          A: {
            intro: '侦探升级：这个 bug 只在一个特定的能量值上发作——其他能量都表现正常。先预测，再找出符号问题，并设计一组能"抓住"这个 bug 的测试能量。',
            program: bugProgram(),
            interaction: {
              bug: {
                stepIndex: 1,
                wrongPiece: 'energy > 5',
                rightPiece: 'energy >= 5',
                whyChild: '「>」和「>=」只在一个点上不一样：energy 正好等于 5。能量 6、7、8 时两种写法都开门，能量 4 以下都不开——只有 5 会暴露真相。这就是"边界测试"要盯住的点。'
              }
            },
            prediction: {
              question: '这段代码里，哪个能量值会让 bug 现出原形？',
              inputType: 'choice',
              options: [
                { id: 'four', label: '4——不到 5 的时候' },
                { id: 'five', label: '5——正好等于边界的时候' },
                { id: 'six', label: '6——超过 5 的时候' }
              ],
              correct: 'five'
            },
            successCriteria: '能说出"只有 energy 正好 5 时 > 和 >= 结果不同"，并主动提出用 4、5、6 三个值做边界测试。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '侦探的第一步：把说明书的规则和运行结果放在一起，它们哪里对不上？' },
          { level: 'H2', text: '盯住 if 那一行的条件，尤其是中间那个比较符号，把它大声读出来。' },
          { level: 'H3', text: '排除一个方向：数字 5 没有写错。问题出在符号上——「>」读作"比 5 大"，那正好等于 5 算不算？' },
          { level: 'H4', text: '换个场景想：公交车规则"满 6 岁要买票"，如果写成"超过 6 岁要买票"，正好 6 岁的小朋友买不买？两种写法一样吗？' },
          { level: 'H5', text: '教师提示：展示半个答案——把条件改成 energy ( ) 5，让孩子从 > 和 >= 里挑一个填进去，并解释为什么挑它。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D8',
          note: '调试与例子驱动思考：能否从"结果与规则不符"倒推到具体符号？是否会主动用阈值-1/正好/阈值+1 来验证？'
        },
        teacherCards: {
          truth: '「>」不包括相等，「>=」包括——两者只在边界值上分道扬镳。真实软件里大量 bug 正是这样：平时一切正常，只在边界上出错。让孩子体验"用一个例子抓住 bug"，比记住符号本身更重要。',
          demo: '先跑 energy=8（门开，一切正常），再跑 energy=5（门不开，孩子惊讶），最后问"到底哪个数把 bug 逼出来了？"——展示 bug 只在边界发作。',
          questions: [
            '能量是 8 的时候程序看起来对不对？那 bug 藏在哪儿了？',
            '「>」和「>=」在哪个数字上会给出不同的答案？',
            '修好以后，用哪三个能量值测一遍你才放心？'
          ],
          misconceptions: [
            '忽略边界值：只测一个"明显够"和一个"明显不够"的数，觉得程序没问题。',
            '认为是数字 5 写错了而去改数字，没有意识到问题出在比较符号上。'
          ],
          rescueSteps: [
            '拿出三张边界卡：能量 4（比阈值小 1）、能量 5（正好等于）、能量 6（大 1），每张各判一次"开/不开"。',
            '问："现在的能量是几？说明书要求什么？"把代码的答案和说明书的答案并排写下来。',
            '让孩子只盯着「>」这个符号读出声："比 5 大"——再问"正好 5 呢？"'
          ],
          extension: '追问：修好这扇门以后，如果说明书改成"能量超过 5 才开门"，现在的代码反而要改回去吗？（要——代码永远要跟着规则走，符号本身没有对错。）'
        },
        compilerCheck: {
          enabled: true,
          expectedStdout: 'OPEN'
        }
      },

      /* =====================================================================
       * 活动 6 · 46–52 分钟 · 真实编译验证（predict + compilerCheck）
       * =================================================================== */
      {
        id: 'lesson2-06-real-compile',
        lessonId: 'lesson2',
        order: 6,
        minutes: [46, 52],
        title: '真实编译验证',
        concept: '动画是模拟，真实编译器说了才算；两者应该给出同一个答案。',
        learningObjective: '孩子能预测真实 C++ 程序的输出，提交真实编译，并把返回的 OPEN/CHARGE 与舱门动画对应起来。',
        childPrompt: '现在把舱门程序交给真正的 C++ 编译器！先猜屏幕会打出哪个单词，再按下"真实 C++ 验证"，看看真家伙和动画说的是不是同一句话。',
        dimensions: ['D5', 'D12'],
        activityType: 'predict',
        visualModel: 'door',
        variants: {
          E: {
            intro: '刚才都是我们的动画在演。这次来真的：把代码寄给一台真正会[[编译|compile]] C++ 的电脑。先猜猜它会回一个什么单词。',
            program: coreProgram(),
            interaction: {
              question: '真正的 C++ 编译器运行这段代码后，会打出哪个单词？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN' },
                { id: 'charge', label: 'CHARGE' },
                { id: 'both', label: 'OPEN 和 CHARGE 一起' }
              ],
              correct: 'open'
            },
            prediction: {
              question: '真正的 C++ 编译器运行这段代码后，会打出哪个单词？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN' },
                { id: 'charge', label: 'CHARGE' },
                { id: 'both', label: 'OPEN 和 CHARGE 一起' }
              ],
              correct: 'open'
            },
            successCriteria: '孩子先做出预测再提交编译，并能指着返回的 OPEN 说"这就是舱门打开的意思"。'
          },
          S: {
            intro: '真实验证时间，两步走！第一步：能量槽里现在是 5，先预测输出，再按"真实C++验证"，亲眼看真编译器打出 OPEN。第二步：把能量槽改成 4，再真实编译一次——看真编译器改口说 CHARGE。两条路都要亲眼见过真实输出才算完。',
            program: coreProgram(),
            // 与 predict 档不同：S 档改用槽位实操（activityTypeOverride），孩子亲手改
            // 能量值走两条分支；expectedStdout 仍是未改动程序（energy=5）的 "OPEN"，
            // 槽位目标达成与否由 UI 比对当前程序 IR stdout（goal: CHARGE）。
            activityTypeOverride: 'slots',
            interaction: {
              goal: { type: 'stdout', value: 'CHARGE' },
              slots: [
                { stepIndex: 0, path: 'expr', label: '能量', inputType: 'number' }
              ]
            },
            prediction: {
              question: 'energy 是 5，真实[[编译|compile]]运行后屏幕会打出什么？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN——条件为真，走 if 块' },
                { id: 'charge', label: 'CHARGE——条件为假，走 else 块' }
              ],
              correct: 'open'
            },
            successCriteria: '先用能量 5 完成一次真实编译、亲眼看到 OPEN；再把能量槽改成 4（或任何小于 5 的数）达成 CHARGE 目标并再次真实编译，能说出"真实输出跟着岔路口换了条路"。'
          },
          A: {
            intro: '加速挑战：这段代码有两个条件用 && 连着——能量够、钥匙在，两个都真门才开。预测真实编译的[[输出|output]]，特别注意 energy 正好踩在边界 5 上。',
            program: andProgram(),
            interaction: {
              question: 'energy 是 5、hasKey 是 true，真实编译运行后会打出什么？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN——5 >= 5 真，hasKey 真，两个都真' },
                { id: 'charge', label: 'CHARGE——energy 没有超过 5，条件是假' }
              ],
              correct: 'open'
            },
            prediction: {
              question: 'energy 是 5、hasKey 是 true，真实编译运行后会打出什么？',
              inputType: 'choice',
              options: [
                { id: 'open', label: 'OPEN——5 >= 5 真，hasKey 真，两个都真' },
                { id: 'charge', label: 'CHARGE——energy 没有超过 5，条件是假' }
              ],
              correct: 'open'
            },
            successCriteria: '预测正确并完成真实编译；能提出"把 hasKey 改成 false 再编译一次"来验证 && 的另一半。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '先别急着按按钮。你的任务是"先猜后验"：这段代码你已经很熟了，它会打出哪个单词？' },
          { level: 'H2', text: '回忆真假检测器：energy 现在是几？条件亮的会是哪盏灯？' },
          { level: 'H3', text: '排除法：真实编译器和动画走的是同一段代码，它绝不会把两个单词都打出来。' },
          { level: 'H4', text: '想想上一课的真实验证：那次动画显示的数字和真实编译打出的数字，最后是不是一样的？' },
          { level: 'H5', text: '教师提示：先用单步动画完整走一遍让孩子看到输出，再提交真实编译对照——两边答案一致后，问孩子"哪个才是真正的 C++ 在运行？"', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D5',
          note: '能否把真实编译输出与场景对应：看到 OPEN/CHARGE 时能否说出对应哪条分支、哪种舱门动作？（若显示"概念演示"标记说明离线，需记录。）'
        },
        teacherCards: {
          truth: '动画是我们做的模拟，真实编译器是行业里真正的 g++。两者对同一段代码给出同一个输出，才能证明孩子学的是"真的 C++"。若网络不可用，界面会显示"概念演示"标记——请如实告诉孩子这次没连上真编译器，绝不假装验证成功。',
          demo: '让孩子按"查看完整程序"看一眼 #include 和 main 的外壳，说明"寄出去的是完整程序"；编译返回后，把真实输出、动画输出、孩子的预测三者并排念一遍。',
          questions: [
            '你的预测、动画的结果、真编译器的结果，三个一样吗？',
            '如果动画说 OPEN、真编译器说 CHARGE，你会先怀疑谁？为什么？',
            '想让真编译器打出 CHARGE，代码要改哪里？'
          ],
          misconceptions: [
            '认为动画本身就是"运行了 C++"，分不清模拟和真实编译。',
            '认为编译器会"看懂说明书的意思"——实际上它只认代码写了什么，不认我们想要什么。'
          ],
          rescueSteps: [
            '先只对照两样东西：孩子的预测 vs 真实输出，一致就画个勾。',
            '再把动画结果摆进来，说明"动画在学真编译器说话"。',
            '把能量改成 4 重新编译，让孩子看到真实输出也会跟着走另一条路。'
          ],
          extension: '追问：把代码里的 >= 偷偷改成 =（只剩一个等号）再编译，会发生什么？（编译器会警告或报错——它是比较认真的裁判；== 才是"比一比"，= 是"存进去"。）'
        },
        compilerCheck: {
          enabled: true,
          expectedStdout: 'OPEN'
        }
      },

      /* =====================================================================
       * 活动 6.5 · 52–55 分钟 · 代码的家（ordering）——侧线「文件概念 + godbolt 自主操作」
       * 依 Dean 定案「侧线内容按关卡编织进各课」插入：紧跟活动 6 的首次真实编译，
       * 孩子刚看到"代码寄给真编译器"，顺势揭示编译器的家 godbolt.org 并亲手操作。
       * order 取 6.5 插队排序，不改动既有活动的 order/minutes（时间与活动 7/8
       * 弹性共享，节奏由教师现场把控）。动手部分在浏览器/访达里完成，故各变体
       * program 为 null、不参与编译校验。E 档用 activityTypeOverride 降为 choice
       * 认概念；A 档加追问「.cpp 后缀是什么意思」。
       * =================================================================== */
      {
        id: 'lesson2-09-file-workshop',
        lessonId: 'lesson2',
        order: 6.5,
        minutes: [52, 55],
        title: '代码的家：文件与工坊',
        concept: '代码不是只住在屏幕里——它保存在以 .cpp 结尾的文件中，随时能再打开。',
        learningObjective: '孩子能说出代码保存在 .cpp 文件里，并亲手完成：新建「我的代码」文件夹 → 打开 godbolt.org → 粘贴代码 → 自己点编译。',
        childPrompt: '机器人有个小秘密：刚才帮我们检查代码的真编译器，住在一个叫 godbolt.org 的代码工坊里！这次换你亲自出马——先给代码安一个家（[[文件|file]]），再去工坊自己点一次编译！',
        dimensions: ['D12', 'D2'],
        activityType: 'ordering',
        visualModel: 'scene',
        variants: {
          E: {
            intro: '先想一个小问题：我们写好的代码，关掉电脑之后去哪儿了？机器人提示你：代码可以住进一个有名字的"家"，下次还能找到它。',
            activityTypeOverride: 'choice',
            program: null,
            interaction: {
              question: '想把写好的代码留住，应该把它放在哪里？',
              options: [
                { id: 'file', label: '保存在一个以 .cpp 结尾的文件里，下次还能打开', correct: true },
                { id: 'screen', label: '让它一直留在屏幕上，关机它自己会记得' },
                { id: 'head', label: '记在脑子里就行，电脑不用管' }
              ],
              multi: false
            },
            prediction: null,
            successCriteria: '孩子选出"保存在 .cpp 文件里"；随后在老师陪同下看一遍 godbolt.org 里的舱门程序，并亲手按一次编译按钮（其余步骤老师可代劳）。'
          },
          S: {
            intro: '出发去代码工坊！四张任务卡散了——先把它们排成正确的顺序，再照着一步步做：这次鼠标全程由你来点。',
            program: null,
            interaction: {
              items: [
                { id: 'card-folder', label: '在电脑上新建一个文件夹，取名「我的代码」——这是代码的家', icon: '📁' },
                { id: 'card-visit', label: '打开浏览器，去代码工坊 godbolt.org', icon: '🌐' },
                { id: 'card-paste', label: '把舱门程序的代码贴进左边的代码框', icon: '📋' },
                { id: 'card-compile', label: '自己点编译，看右边打出结果', icon: '▶️' }
              ],
              correctOrder: ['card-folder', 'card-visit', 'card-paste', 'card-compile']
            },
            prediction: null,
            successCriteria: '排出正确顺序并亲手完成四步；能说出"代码保存下来会是 door.cpp 这样的文件，放在我的文件夹里"。'
          },
          /* A 档加强（Dean 首课后指示「逐步推进到孩子自己输入代码」）：贴入代码
           * 编译后，第 5 步亲手改一个字（把输出的 OPEN 换成自己的英文名字）再
           * 编译一次——「自己输入代码」的第一次萌芽。仅动 A 档；E/S 档与活动级
           * 共享字段（H5「四张卡」口诀、demo「演示四步」）描述的仍是基础四步
           * 流程，不改。 */
          A: {
            intro: '工坊高级任务：五步全部自己来，一步都不用老师帮——最后一步你要亲手改代码里的一个字！完成后还有一道侦探题——文件名 door.cpp 里那条"小尾巴"到底是什么意思？',
            program: null,
            interaction: {
              items: [
                { id: 'card-folder', label: '在电脑上新建一个文件夹，取名「我的代码」——这是代码的家', icon: '📁' },
                { id: 'card-visit', label: '打开浏览器，去代码工坊 godbolt.org', icon: '🌐' },
                { id: 'card-paste', label: '把舱门程序的代码贴进左边的代码框', icon: '📋' },
                { id: 'card-compile', label: '自己点编译，看右边打出结果', icon: '▶️' },
                { id: 'card-edit', label: '亲手改一个字：把代码里输出的 OPEN 换成你的英文名字（记得用英文输入法！），再点一次编译，看结果跟着变', icon: '✏️' }
              ],
              correctOrder: ['card-folder', 'card-visit', 'card-paste', 'card-compile', 'card-edit']
            },
            prediction: {
              question: 'door.cpp 这个[[文件|file]]的名字里，后缀「.cpp」是什么意思？',
              inputType: 'choice',
              options: [
                { id: 'kind', label: '它是文件的"身份牌"，告诉电脑：这里面装的是 C++ 代码' },
                { id: 'deco', label: '它是随便加的装饰，删掉也没有任何影响' },
                { id: 'size', label: '它表示这个文件有多大' }
              ],
              correct: 'kind'
            },
            successCriteria: '独立完成五步操作（含亲手把 OPEN 改成自己的英文名字并重新编译）；能说出".cpp 后缀告诉电脑这是 C++ 代码文件"，并能指着新输出说"这是我自己改出来的"。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '想一想：画好的画要放进画夹才不会丢——写好的代码也需要一个"家"。它的家叫什么、以什么结尾？' },
          { level: 'H2', text: '排队小窍门：先安家，再出门。代码的家（文件夹）建好了，才轮到去工坊干活。' },
          { level: 'H3', text: '到了工坊先别急着点编译——空空的工坊什么也编不了。想想点编译之前还差哪一步？' },
          { level: 'H4', text: '打个比方：寄信要先写好信、装进信封，最后才投进邮筒。代码也要先贴进工坊，才轮到按编译。' },
          { level: 'H5', text: '教师提示：把四张卡念成口诀「建家 → 进工坊 → 贴代码 → 点编译」，让孩子跟读一遍再排；实操时老师只指屏幕不碰鼠标。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D12',
          note: '电脑操作熟练度：新建文件夹、打开网址、粘贴、点编译四步中哪些能独立完成？记录需要代劳的步骤。（断网未能完成 godbolt 实操时需注明。）'
        },
        teacherCards: {
          truth: 'App 里的「真实C++验证」按的正是 godbolt.org（Compiler Explorer）的门铃——本活动是把幕后工坊亮出来让孩子亲手敲门。代码保存在以 .cpp 结尾的文件里，后缀告诉电脑"这是 C++ 源代码"；文件住在文件夹里、文件夹住在电脑里。若断网：文件夹与 .cpp 概念照做，godbolt 实操留作家庭任务，绝不假装编译成功（与活动 6 同一原则）。',
          demo: '老师先用 30 秒完整演示四步，再把鼠标交给孩子从头做一遍。贴的代码就用本课舱门程序（在活动 6 点"查看完整程序"复制）。编译成功后，让孩子把 godbolt 右侧的输出与 App 里的结果对照着念一遍。',
          questions: [
            '你在 godbolt 点的编译，和 App 里按"真实C++验证"，是同一位裁判吗？',
            '「我的代码」文件夹里现在放着什么？下周打开电脑它还在吗？',
            '如果把文件名改成 door.txt，电脑还知道里面是 C++ 代码吗？'
          ],
          misconceptions: [
            '认为代码只存在于 App 或屏幕里，关机就消失——缺少"保存成文件"的概念。',
            '认为 .cpp 只是名字的装饰，改成什么后缀都不影响电脑认出它。'
          ],
          rescueSteps: [
            '先只做一步：一起新建「我的代码」文件夹，亲眼看着它出现在桌面上。',
            '老师把 godbolt.org 打开到位，只让孩子做"贴代码 + 点编译"两步，成功一次再补前两步。',
            '把四张卡按口诀"建家 → 进工坊 → 贴代码 → 点编译"边念边重排一遍，排好再上手。'
          ],
          extension: '追问：断网的时候 godbolt 去不了，你的代码文件还在吗？（在——文件住在你的电脑里，工坊只是帮忙编译的地方。）还可以看看 godbolt 右边那些"天书"：那是编译器把 C++ 翻译给机器听的语言（汇编）。'
        },
        compilerCheck: {
          enabled: false,
          expectedStdout: ''
        }
      },

      /* =====================================================================
       * 活动 7 · 52–57 分钟 · 设计自己的规则（slots）——四扇门四选一
       * =================================================================== */
      {
        id: 'lesson2-07-my-rule',
        lessonId: 'lesson2',
        order: 7,
        minutes: [52, 57],
        title: '设计自己的规则',
        concept: '同一个 if 结构可以装进不同的条件——规则是你设计的。',
        learningObjective: '孩子能从能量门/年龄门/钥匙门/积分门中选一扇，修改条件让门为自己打开，完成一次条件规则的迁移创造。',
        childPrompt: '轮到你当设计师啦！机器人身上有四个传感器：能量、年龄、钥匙、积分。挑一扇门，定下你自己的规则，调好门槛数字，让门为你打开！',
        dimensions: ['D9', 'D5'],
        activityType: 'slots',
        visualModel: 'door',
        variants: {
          E: {
            intro: '挑一扇你最喜欢的门装到代码里，再调调门槛数字。目标：让门打出 OPEN！小提示：看看每个传感器现在的读数够不够过门槛。',
            program: ruleBaseProgram(),
            interaction: {
              goal: { type: 'stdout', value: 'OPEN' },
              slots: [
                {
                  stepIndex: 4,
                  path: 'cond',
                  label: '选一扇门（整条规则）',
                  inputType: 'choice',
                  choices: gateChoices()
                },
                {
                  stepIndex: 4,
                  path: 'cond.right',
                  label: '门槛数字',
                  inputType: 'number'
                }
              ]
            },
            prediction: null,
            successCriteria: '选定一扇门并调整门槛数字后运行得到 OPEN；能说出"我把门槛定成几，因为传感器读数是几"。'
          },
          S: {
            intro: '设计师任务：选一扇门、挑一个比较符号、定一个门槛。三样都由你决定，目标还是让门打出 OPEN——但要能讲出你这条规则"卡住"的是什么样的机器人。',
            program: ruleBaseProgram(),
            interaction: {
              goal: { type: 'stdout', value: 'OPEN' },
              slots: [
                {
                  stepIndex: 4,
                  path: 'cond',
                  label: '选一扇门（整条规则）',
                  inputType: 'choice',
                  choices: gateChoices()
                },
                {
                  stepIndex: 4,
                  path: 'cond.op',
                  label: '比较符号',
                  inputType: 'choice',
                  choices: opChoices()
                },
                {
                  stepIndex: 4,
                  path: 'cond.right',
                  label: '门槛数字',
                  inputType: 'number'
                }
              ]
            },
            prediction: null,
            successCriteria: '完成一条自定义规则并得到 OPEN；能回答"正好等于门槛的机器人，你这扇门放不放行？"'
          },
          A: {
            intro: '高级设计台：你的门要同时检查两个条件（用 && 连接）——比如"能量够 而且 钥匙够"。两个门槛都由你定，让门打出 OPEN，并想好一个刚好被拦住的例子。',
            program: ruleBaseProgramA(),
            interaction: {
              goal: { type: 'stdout', value: 'OPEN' },
              slots: [
                {
                  stepIndex: 4,
                  path: 'cond.left',
                  label: '第一道检查（选一扇门）',
                  inputType: 'choice',
                  choices: gateChoices()
                },
                {
                  stepIndex: 4,
                  path: 'cond.left.op',
                  label: '第一道检查的比较符号',
                  inputType: 'choice',
                  choices: opChoices()
                },
                {
                  stepIndex: 4,
                  path: 'cond.left.right',
                  label: '第一道门槛数字',
                  inputType: 'number'
                },
                {
                  stepIndex: 4,
                  path: 'cond.right.right',
                  label: '第二道门槛：至少要几把钥匙',
                  inputType: 'number'
                }
              ]
            },
            prediction: null,
            successCriteria: '完成双条件规则并得到 OPEN；能设计一个"只差一点点被拦住"的边界例子并解释哪一半条件是假。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '目标是让门打出 OPEN。先挑一扇门，再想：要让它开，得满足什么？' },
          { level: 'H2', text: '看左边的变量卡：你选的那个传感器，现在的读数是几？门槛比它高还是低？' },
          { level: 'H3', text: '如果门总是不开，试着把门槛数字调到"正好等于传感器读数"，再想想比较符号让不让"正好等于"过关。' },
          { level: 'H4', text: '换个门试试同样的招：能量门上好用的办法，在积分门上是不是一样好用？规则的样子其实都相同。' },
          { level: 'H5', text: '教师提示：给出半条规则如 score >= ( )，让孩子只填门槛数字并解释"为什么这个数能让 80 分的机器人进门"。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D9',
          note: '迁移与创造：能否把"能量门"的 if 结构套到全新的门上？调整门槛时是碰运气还是对照传感器读数有目的地改？'
        },
        teacherCards: {
          truth: 'if 结构是一个可以反复使用的"决定机器"，换掉条件就换了一条规则。孩子在这里第一次不是"修别人的程序"而是"立自己的规矩"——这一步的表现是路径推荐里最重要的迁移证据。',
          demo: '孩子完成自己的门后，请他当众"验门"：报出一个传感器读数，问全班（或老师）"这台机器人进得来吗？"再运行验证。孩子设计的规则会存进作品卡。',
          questions: [
            '你这条规则会拦住什么样的机器人？举一个刚好被拦住的例子。',
            '正好等于门槛的机器人，你的门放不放行？是哪个符号决定的？',
            '如果想让这扇门更难进，是改数字还是改符号？两种办法都行吗？'
          ],
          misconceptions: [
            '换了一扇门就以为要重学一套写法——没意识到 if (条件) { } else { } 的骨架完全没变。',
            '乱调门槛数字碰运气，而不是先看传感器读数再定门槛。'
          ],
          rescueSteps: [
            '回到最熟的能量门先成功一次，再原样搬到新门上。',
            '问："你选的传感器现在读数是几？"把读数写在门槛旁边再比较。',
            '用三张边界卡的老办法：门槛-1、正好门槛、门槛+1，各判一次开不开。'
          ],
          extension: '追问：能不能设计一扇"反着开"的门——数字越小越欢迎？（能——把符号换成 <= 就是"积分不超过 90 的新手门"。）'
        },
        compilerCheck: {
          enabled: true,
          expectedStdout: 'OPEN'
        }
      },

      /* =====================================================================
       * 活动 8 · 57–60 分钟 · 课末解释（explain）
       * 路径确认点·第 2 课后确认（方案 5.3；「第 2 次路径复核」是第 6 课，见课程地图）
       * =================================================================== */
      {
        id: 'lesson2-08-final-explain',
        lessonId: 'lesson2',
        order: 8,
        minutes: [57, 60],
        title: '讲给舱门听',
        concept: '能讲明白"条件何时检查、为何只走一边"，说明分支的心智模型已经立住了。',
        learningObjective: '孩子能用自己的话回答：程序什么时候检查条件？为什么只走一边？',
        childPrompt: '最后一个任务：把今天的秘密讲给舱门听——程序是什么时候检查条件的？为什么它每次只走一条路？',
        dimensions: ['D11', 'D5'],
        activityType: 'explain',
        visualModel: 'door',
        variants: {
          E: {
            intro: '今天你当过舱门、修过 bug、还设计了自己的门。现在用接龙的方式，把舱门的秘密讲出来吧——讲给老师听，或者打字都可以。',
            program: null,
            interaction: {
              prompt: '程序什么时候检查条件？为什么只走一边？',
              sentenceStarters: [
                '程序走到 if 那一行的时候，会……',
                '条件的答案只有……和……',
                '答案是真就走……，是假就走……'
              ],
              minWords: 0
            },
            prediction: null,
            successCriteria: '在句子开头的帮助下说出"走到 if 才检查"和"真假各走一边"两个要点，口头表达即可。'
          },
          S: {
            intro: '用你自己的话完整讲一遍今天的两个大秘密。讲完可以考考老师："要是条件是假的呢？"',
            program: null,
            interaction: {
              prompt: '程序什么时候检查条件？为什么只走一边？',
              sentenceStarters: [
                '条件不是一直被检查的，它只在……',
                '因为条件的结果只有真或假，所以……'
              ],
              minWords: 15
            },
            prediction: null,
            successCriteria: '独立说出"执行到 if 那一行才计算一次条件"，并用真/假解释为什么两条路只走其一。'
          },
          A: {
            intro: '终极讲解：除了回答两个问题，再补一句——> 和 >= 的差别害我们今天抓了一只什么 bug？',
            program: null,
            interaction: {
              prompt: '程序什么时候检查条件？为什么只走一边？再说说 > 和 >= 差在哪儿。',
              sentenceStarters: [
                '条件在……的时候被计算一次，之后不会自己再查。',
                '只走一边是因为……',
                '> 和 >= 只在……的时候答案不同，所以边界要专门测。'
              ],
              minWords: 25
            },
            prediction: null,
            successCriteria: '完整讲出"检查时机、只走一边、边界差别"三个要点，并至少举一个今天课上的真实例子。'
          }
        },
        hintLadder: [
          { level: 'H1', text: '别紧张，就回答两个小问题：程序什么时候检查条件？检查完为什么只走一条路？' },
          { level: 'H2', text: '想想今天的岔路口画面：程序小人是走到哪一行才停下来看灯的？' },
          { level: 'H3', text: '先说一半也行："程序走到 if 那一行的时候……"接着往下说。' },
          { level: 'H4', text: '想想检票口：检票员是在你走到闸机前才看票，还是从早到晚一直盯着你？看完票你走了几个通道？' },
          { level: 'H5', text: '教师提示：老师先示范讲一遍但故意讲错一处（比如"两条路都会走"），让孩子来纠正并说出正确版本。', teacherOnly: true }
        ],
        evidenceRule: {
          dimension: 'D11',
          note: '解释能力与元认知：能否不借助追问说全"何时检查、为何只走一边"？【路径确认点（第 2 课后确认）：完成后教师端应显示 pathSuggestion 供确认。】'
        },
        teacherCards: {
          truth: '条件在执行到 if 时被计算一次，结果只有真或假；真走 if 块、假走 else 块。孩子若能自己讲出这两点，说明分支的心智模型已建立——这是本课最重要的一条证据，也是路径确认（第 2 课后确认点）的核心输入。',
          demo: '让孩子面向舱门（或机器人）来讲，老师只当听众记录原话。讲完后在教师端结合本课全部证据查看 pathSuggestion，与第 1 课的临时路径对照后确认或调整。',
          questions: [
            '条件是程序一开始就检查，还是走到那一行才检查？',
            '为什么屏幕上从来不会同时出现 OPEN 和 CHARGE？',
            '今天哪个瞬间你突然明白了？当时发生了什么？'
          ],
          misconceptions: [
            '认为条件会一直在后台自动检查，说成"程序随时在看能量"。',
            '认为两个分支都会先后运行，解释时说"先开门再充电"。'
          ],
          rescueSteps: [
            '把问题拆成两问，一次只答一问。',
            '重新单步跑一遍核心程序，跑到 if 行时暂停问："它现在在干什么？"',
            '让孩子用手指演"程序小人走路"，边走边讲，讲到岔路口自然停下。'
          ],
          extension: '追问：下一课机器人要过一整排这样的门，同样的检查要做很多很多次——你猜程序有没有偷懒的办法，不用把 if 写十遍？（循环的预告。）'
        },
        compilerCheck: {
          enabled: false,
          expectedStdout: ''
        }
      }
    ]
  };

  CppLab.content.lesson2 = lesson2;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = lesson2;
  }
})();
