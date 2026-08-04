/*
 * js/content/lesson1.js — CppLab.content.lesson1
 * owner: content-lesson1（CONTRACT §1）
 *
 * 第 1 课《机器人能量站：命令怎样改变世界》（方案 §7 全部）。
 * 8 个活动严格对应方案 §7.4 的 60 分钟时间表；三档变体按 §7.5；
 * 教师真相卡吸收 §7.6；提示阶梯语义按 §11.3。
 *
 * 内容与引擎分离（CONTRACT §14.8）：本文件只有数据，不含任何执行逻辑。
 * 纯逻辑文件：顶层不碰 document/window，Node 可直接 require 用于测试。
 */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ================= IR 小工具（只用于拼数据，不执行） ================= */

  function lit(v) { return { kind: 'lit', value: v }; }
  function vr(name) { return { kind: 'var', name: name }; }
  function bin(op, left, right) { return { kind: 'bin', op: op, left: left, right: right }; }
  function declInt(name, value) { return { op: 'declare', varType: 'int', name: name, expr: lit(value) }; }
  function assign(name, expr) { return { op: 'assign', name: name, expr: expr }; }
  function output(expr) { return { op: 'output', expr: expr }; }

  /* 核心程序（方案 §7.3 原样）：3 → +4 → -1 → 输出 6 */
  function coreProgram() {
    return [
      declInt('energy', 3),
      assign('energy', bin('+', vr('energy'), lit(4))),
      assign('energy', bin('-', vr('energy'), lit(1))),
      output(vr('energy'))
    ];
  }

  /* A 档双变量程序（方案 §7.5 样例）：energy=3, shield=1, energy = energy + shield * 2 → energy 最终 5 */
  function shieldProgram() {
    return [
      declInt('energy', 3),
      declInt('shield', 1),
      assign('energy', bin('+', vr('energy'), bin('*', vr('shield'), lit(2))))
    ];
  }

  /* ================= 活动 1 · 0–5 分钟 · 返回任务世界 ================= */

  var act1 = {
    id: 'lesson1-01-return-world',
    lessonId: 'lesson1',
    order: 1,
    minutes: [0, 5],
    title: '返回任务世界',
    concept: '程序世界里的变化，来自我们发出的一条条命令',
    learningObjective: '回忆并说出：机器人的能量会变，是因为命令按顺序改变了它（对应目标：程序按顺序运行、变量保存当前状态）',
    childPrompt: '欢迎回来，指挥官！机器人还记得你——上次你修好了它。出发前，先回答它的一个小问题吧。',
    dimensions: ['D2', 'D4'],
    activityType: 'choice',
    visualModel: 'scene',
    variants: {
      E: {
        intro: '机器人看到你，开心地亮起了眼睛：「指挥官，上次谢谢你！考考你还记不记得——」',
        program: null,
        interaction: {
          question: '上次任务里，机器人的能量数字为什么会一会儿变大、一会儿变小？',
          options: [
            { id: 'commands', label: '因为我们发出的命令，一条一条地改变了它', correct: true },
            { id: 'random', label: '因为能量数字自己会乱跳' },
            { id: 'mood', label: '因为机器人心情不好，不想告诉我们真的数字' }
          ],
          multi: false
        },
        prediction: null,
        successCriteria: '孩子选出「命令改变能量」，或用自己的话说出「是命令让它变的」'
      },
      S: {
        intro: '机器人向你敬了个礼：「指挥官，出发前先对一次暗号——关于命令是怎么工作的。」',
        program: null,
        interaction: {
          question: '一段程序里有好几条命令，它们是怎么发生的？',
          options: [
            { id: 'in-order', label: '按从上到下的顺序，一条做完再做下一条', correct: true },
            { id: 'all-at-once', label: '所有命令同时一起发生' },
            { id: 'any-order', label: '顺序无所谓，反正结果都一样' }
          ],
          multi: false
        },
        prediction: null,
        successCriteria: '孩子选出「从上到下、一条一条」，并能补一句上次的例子'
      },
      A: {
        intro: '机器人递给你一张「指挥官复训卡」：「这道题，上次只有你答对了一半，今天来挑战完整版！」',
        program: null,
        interaction: {
          question: '机器人的能量盒先后出现过 3、7、6 三个数字。关于这个盒子，哪句话是对的？',
          options: [
            { id: 'only-now', label: '盒子里只保存现在的值，旧的值会被新的值盖掉', correct: true },
            { id: 'keep-all', label: '盒子把 3、7、6 三个数字全都存着' },
            { id: 'new-box', label: '每换一个数字，就会造出一个新盒子' }
          ],
          multi: false
        },
        prediction: null,
        successCriteria: '孩子选出「只保存现在的值」，并能说一句「旧值去哪儿了」'
      }
    },
    hintLadder: [
      { level: 'H1', text: '我们在回忆：上次机器人的能量数字为什么会变。你还记得当时你按了什么按钮吗？' },
      { level: 'H2', text: '想一想代码台上的那几行命令——能量每次变化之前，屏幕上是不是刚好亮起了一行？' },
      { level: 'H3', text: '可以先排除一个：能量数字不会自己乱跳。剩下的选项里，哪个和「一行一行发生」有关？' },
      { level: 'H4', text: '打个比方：做蛋糕时先打蛋、再加面粉、再烤——每一步都会让碗里的东西变一次。程序的命令也是这样一步一步来的。' },
      { level: 'H5', text: '（教师解锁）指着答案的前半句读出来：「因为我们发出的命令……」让孩子补完后半句，并追问「是谁在发命令？」', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D4', note: '观察孩子是否还保留「变量=当前状态」「命令按顺序发生」的记忆；只是复述按钮操作而说不出原因记 1，能自己举例记 2-3' },
    teacherCards: {
      truth: '「int energy = 3;」的意思是：建立一个整数变量（一个带名字的盒子）并把 3 存进去。之后能量的每次变化，都来自一条命令对这个盒子的读和写；程序通常从上向下执行。',
      demo: '打开上次的机器人场景，指着能量条问「它为什么是这个数？」再用单步按钮走一行，让孩子看到「一行命令 → 一次变化」。',
      questions: [
        '上次你最喜欢机器人的哪个瞬间？那时能量是几？',
        '如果我们一条命令都不发，能量数字会自己变吗？',
        '「盒子里现在是几」和「盒子里出现过哪些数」，哪个才是变量真正记住的？'
      ],
      misconceptions: [
        '认为变量同时保存 3、7、6 三个值（把变量当成历史清单，而不是当前状态）',
        '认为能量变化是机器人「自己决定」的，与命令无关'
      ],
      rescueSteps: [
        '先别谈代码，只问：「机器人现在的能量是几？」让孩子读能量条。',
        '按一次单步，再问：「刚才是谁让它变的？」指向刚亮起的那行命令。',
        '把三个选项读出来，每读一个就问「和刚才看到的一样吗？」逐个对照排除。'
      ],
      extension: '追问：如果把上次程序里的两条命令交换顺序，机器人中间会经历一样的能量吗？（为活动 2 埋伏笔）'
    },
    compilerCheck: { enabled: false, expectedStdout: '' }
  };

  /* ================= 活动 2 · 5–12 分钟 · 命令排队 ================= */

  var act2 = {
    id: 'lesson1-02-command-queue',
    lessonId: 'lesson1',
    order: 2,
    minutes: [5, 12],
    title: '命令排队',
    concept: '程序按顺序运行；交换顺序，中间状态会不同',
    learningObjective: '能说明程序会按顺序运行，并观察交换顺序后中间能量的不同（对应目标 1：程序按顺序运行）',
    childPrompt: '能量站送来四张命令卡，可它们全散了！把命令卡排成正确的队伍，再交换试试，看看机器人的能量会走哪条路。',
    dimensions: ['D2', 'D3'],
    activityType: 'ordering',
    visualModel: 'sequence',
    variants: {
      E: {
        intro: '机器人抱着一堆卡片跑来：「指挥官，帮我把今天的任务排排队！排好后按运行，看看能量怎么走。」',
        program: coreProgram(),
        interaction: {
          items: [
            { id: 'card-setup', label: '建立能量盒，先放进 3 格能量', icon: '📦' },
            { id: 'card-gain', label: '吃到能量豆，获得 4 格能量', icon: '⚡' },
            { id: 'card-use', label: '打开探照灯，使用 1 格能量', icon: '🔦' },
            { id: 'card-report', label: '向屏幕报告现在的能量', icon: '📢' }
          ],
          correctOrder: ['card-setup', 'card-gain', 'card-use', 'card-report']
        },
        prediction: null,
        successCriteria: '孩子排出正确顺序并运行；再交换「获得 4」和「使用 1」跑一次，能指着能量条说出「中间的数字不一样了」'
      },
      S: {
        intro: '机器人说：「排好队只是第一步——真正的指挥官，还能在运行之前猜到结果！」',
        program: coreProgram(),
        interaction: {
          items: [
            { id: 'card-setup', label: '建立能量盒，先放进 3 格能量', icon: '📦' },
            { id: 'card-gain', label: '吃到能量豆，获得 4 格能量', icon: '⚡' },
            { id: 'card-use', label: '打开探照灯，使用 1 格能量', icon: '🔦' },
            { id: 'card-report', label: '向屏幕报告现在的能量', icon: '📢' }
          ],
          correctOrder: ['card-setup', 'card-gain', 'card-use', 'card-report']
        },
        prediction: {
          question: '如果把「获得 4」和「使用 1」交换位置，最后报告的数字会变吗？',
          inputType: 'choice',
          options: [
            { id: 'same', label: '不变，最后还是 6' },
            { id: 'diff', label: '会变成别的数' },
            { id: 'crash', label: '程序会坏掉' }
          ],
          correct: 'same'
        },
        successCriteria: '先提交预测，再排队运行并交换验证；能用一句话解释「最后一样，但中间路过的数字不一样」'
      },
      A: {
        intro: '机器人拿出秒表：「高级挑战！交换顺序之前，先算出中间那一刻的能量——算错了它可要按喇叭。」',
        program: coreProgram(),
        interaction: {
          items: [
            { id: 'card-setup', label: '建立能量盒，先放进 3 格能量', icon: '📦' },
            { id: 'card-gain', label: '吃到能量豆，获得 4 格能量', icon: '⚡' },
            { id: 'card-use', label: '打开探照灯，使用 1 格能量', icon: '🔦' },
            { id: 'card-report', label: '向屏幕报告现在的能量', icon: '📢' }
          ],
          correctOrder: ['card-setup', 'card-gain', 'card-use', 'card-report']
        },
        prediction: {
          question: '把「使用 1」换到「获得 4」前面。交换后，第二张卡刚执行完的那一刻，能量是几？',
          inputType: 'number',
          correct: 2
        },
        successCriteria: '预测出交换后中间值是 2；运行验证后，能解释「最终值相同、中间值不同」的原因'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是把命令卡排成一条正确的队伍。想一想：机器人做任何事之前，得先有什么？' },
      { level: 'H2', text: '注意「建立能量盒」这张卡——盒子还没建立，能量豆吃进去也没地方放哦。' },
      { level: 'H3', text: '「报告能量」应该放在做完所有事情之后。先把第一张和最后一张定下来，中间就好排了。' },
      { level: 'H4', text: '打个比方：存钱罐要先摆好，再放进 5 元，再取出 2 元，最后数一数。换成能量盒，是不是一样的队伍？' },
      { level: 'H5', text: '（教师解锁）摆好第一、二张卡，让孩子接着排完剩下两张，并逐张解释「这张卡执行完，能量是几？」', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D2', note: '观察孩子是否知道顺序会改变中间状态：只会排队记 1；能预测交换后的中间值并解释记 2-3' },
    teacherCards: {
      truth: '程序通常从上向下执行，一条做完再做下一条。交换两条命令，最终值可能恰好相同（3+4−1 = 3−1+4），但机器人「路过」的中间能量不同——顺序决定过程。以后我们还会用条件、循环和函数来改变执行路线。',
      demo: '排好队后用单步运行，每走一行就让孩子报一次能量：3 → 7 → 6。再交换两张卡重跑：3 → 2 → 6。把两条「能量之路」并排画在白板上。',
      questions: [
        '交换第二、三行之后，最后值一样吗？中间过程一样吗？',
        '哪一张卡必须排第一？为什么别的卡不行？',
        '如果机器人在中间那一刻只剩 2 格能量，探照灯还敢开吗？'
      ],
      misconceptions: [
        '认为所有行同时发生，感觉不到「一条一条」的先后',
        '认为最终结果一样就等于「顺序完全不重要」，忽略中间状态的差别'
      ],
      rescueSteps: [
        '把四张卡念成故事：「先摆盒子，再吃豆子，再开灯，最后报数」，让孩子跟着复述一遍再动手。',
        '每放好一张卡就问：「这张做完，盒子里是几？」用手指盖住后面的卡，只看眼前这一步。',
        '还排不出来就先只给三张卡（去掉报告卡），排好后再把报告卡补到队尾。'
      ],
      extension: '交换第二、三行后最终值恰好一样——那有没有交换后最终值也会变的情况？（提示：如果有一张卡是「能量翻倍」呢？3+4 再翻倍和翻倍再 +4 可不一样！）'
    },
    compilerCheck: { enabled: true, expectedStdout: '6' }
  };

  /* ================= 活动 3 · 12–22 分钟 · 能量盒 ================= */

  var act3 = {
    id: 'lesson1-03-energy-box',
    lessonId: 'lesson1',
    order: 3,
    minutes: [12, 22],
    title: '能量盒',
    concept: '变量是一个只装「现在的值」的盒子；赋值是先读旧值、算出新值、再写回去',
    learningObjective: '能追踪一个变量的当前值，并说明赋值是「把计算结果存回变量」（对应目标 2、3）',
    childPrompt: '看，energy 变成了一个真正的盒子！一行一行地走，盯紧盒子：旧数字淡出、新数字住进来。每到检查点，报出盒子里现在的数！',
    dimensions: ['D3', 'D4'],
    activityType: 'trace',
    visualModel: 'energy',
    variants: {
      E: {
        intro: '机器人打开胸前的小门，露出能量盒：「指挥官，你盯着盒子，我一行一行慢慢走。别眨眼哦！」',
        program: coreProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 1,
              question: '第二行走完了！盒子里现在住着几？',
              inputType: 'choice',
              options: [
                { id: '7', label: '7' },
                { id: '3', label: '3' },
                { id: '34', label: '3 和 4 挤在一起' }
              ],
              correct: '7'
            },
            {
              afterStep: 2,
              question: '第三行也走完了。盒子里现在是几？',
              inputType: 'choice',
              options: [
                { id: '6', label: '6' },
                { id: '7', label: '还是 7' },
                { id: '1', label: '1' }
              ],
              correct: '6'
            }
          ]
        },
        prediction: {
          question: '出发前先猜一猜：四行全部走完，盒子里最后是几？',
          inputType: 'choice',
          options: [
            { id: '6', label: '6' },
            { id: '7', label: '7' },
            { id: '8', label: '8' }
          ],
          correct: '6'
        },
        successCriteria: '先预测，再单步走完，两个检查点都答对；能指着盒子说「旧的数字不见了，只剩现在的」'
      },
      S: {
        intro: '机器人说：「这次不给选项了——每到检查点，你直接把盒子里的数敲给我！」',
        program: coreProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 1,
              question: '第二行「energy = energy + 4;」走完了，盒子里现在是几？',
              inputType: 'number',
              correct: 7
            },
            {
              afterStep: 2,
              question: '第三行走完了。这一行读到的「旧能量」是几？',
              inputType: 'number',
              correct: 7
            },
            {
              afterStep: 3,
              question: '最后一行报告完，盒子里的数字是几？',
              inputType: 'number',
              correct: 6
            }
          ]
        },
        prediction: {
          question: '先预测：程序走完，energy 盒子里最后是几？',
          inputType: 'number',
          correct: 6
        },
        successCriteria: '先预测再单步验证，三个检查点全对；能说出「第二行读到的是修改之前的能量」'
      },
      A: {
        intro: '机器人搬来了第二个盒子：「双盒挑战！energy 和 shield 一起上场——看清楚哪个盒子动了，哪个没动。」',
        program: shieldProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 1,
              question: '前两行走完，桌上现在摆着几个盒子？',
              inputType: 'number',
              correct: 2
            },
            {
              afterStep: 2,
              question: '第三行「energy = energy + shield * 2;」走完，energy 盒子里是几？',
              inputType: 'number',
              correct: 5
            },
            {
              afterStep: 2,
              question: '再看看 shield 的盒子——它怎么样了？',
              inputType: 'choice',
              options: [
                { id: 'unchanged', label: '没变，还是 1：这一行只是「读」了它' },
                { id: 'doubled', label: '变成 2 了' },
                { id: 'empty', label: '被清空了' }
              ],
              correct: 'unchanged'
            }
          ]
        },
        prediction: {
          question: '先算一算：第三行走完后，energy 会是几？（提示：等号右边先算，shield * 2 先乘）',
          inputType: 'number',
          correct: 5
        },
        successCriteria: '预测出 5；能解释「右边先把 3 + 1 × 2 算完，左边的 energy 才被写入」，并指出 shield 只被读、没被改'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是盯住盒子里「现在」的数。检查点问的那一行刚走完时，盒子里是几？' },
      { level: 'H2', text: '看等号的右边：它用到的 energy，是这一行开始之前盒子里的旧数字。' },
      { level: 'H3', text: '排除一个想法：盒子不会把旧数字和新数字一起存着。先算右边得几，那个数才是盒子的新主人。' },
      { level: 'H4', text: '换个数字试试：如果盒子里是 10，走一行「energy = energy + 4;」，盒子会变成 14。那现在这行呢？' },
      { level: 'H5', text: '（教师解锁）教师演示第一步：「右边是 3 + 4，先算出 7」，让孩子完成「把 7 写回盒子」并解释旧的 3 去哪了。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D3', note: '观察孩子把变量理解为「当前值」还是「一串历史」：需要盒子动画才能报数记 1；能提前心算检查点记 2；能解释读旧值-算-写回记 3' },
    teacherCards: {
      truth: '「energy = energy + 4;」的执行分三步：先读取盒子里的旧值，再算出等号右边的结果，最后把新值写回盒子——旧值就被覆盖了。变量任何时刻只保存一个「现在的值」。',
      demo: '用单步按钮走第二行，指着变量盒动画说三句话：「读到 3」「算出 3 + 4 = 7」「7 住进盒子，3 消失」。让孩子照样解说第三行。',
      questions: [
        '第二行读到的能量，是修改之前的还是之后的？',
        '旧的 3 现在还在盒子里吗？它去哪儿了？',
        '如果我们再加一行「energy = energy + 4;」，盒子会变成几？'
      ],
      misconceptions: [
        '认为变量同时保存 3、7、6 三个值（当成历史清单）',
        '认为「energy = energy + 4」在数学上不成立，所以代码是错的（把赋值号当等式）'
      ],
      rescueSteps: [
        '先别看代码，只看盒子现在是几。',
        '右边先算完，会得到几？',
        '现在把这个结果放回左边的盒子。仍然困难时，播放逐行慢动画再走一遍。'
      ],
      extension: 'A 档追问：把第三行改成「shield = energy + shield;」，两个盒子分别会是几？谁被读、谁被写？'
    },
    compilerCheck: { enabled: false, expectedStdout: '' }
  };

  /* ================= 活动 4 · 22–34 分钟 · 代码透视 ================= */

  var act4 = {
    id: 'lesson1-04-code-xray',
    lessonId: 'lesson1',
    order: 4,
    minutes: [22, 34],
    title: '代码透视',
    concept: '图块和 C++ 代码是同一件事的两种写法；输出只是展示状态，不会改变状态',
    learningObjective: '能把可视化动作对应到具体的 C++ 代码行，并说明输出只是展示、不修改变量（对应目标 4、5 的观察部分）',
    childPrompt: '戴上透视眼镜！图块慢慢变成了真正的 C++ 代码。点一点每一行，场景里会亮起它做的事——找出每一行的真面目吧。',
    dimensions: ['D2', 'D8'],
    activityType: 'trace',
    visualModel: 'energy',
    variants: {
      E: {
        intro: '机器人递给你一副透视眼镜：「图块的里面，其实一直藏着 C++！点哪一行，我就把它干的事演给你看。」',
        program: coreProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 1,
              question: '刚才能量条「唰」地涨了 4 格！是哪一行干的？',
              inputType: 'choice',
              options: [
                { id: 'line2', label: 'energy = energy + 4;' },
                { id: 'line1', label: 'int energy = 3;' },
                { id: 'line4', label: 'std::cout << energy;' }
              ],
              correct: 'line2'
            },
            {
              afterStep: 3,
              question: '最后一行「std::cout << energy;」做了什么？',
              inputType: 'choice',
              options: [
                { id: 'show-only', label: '只把 6 展示到屏幕上，能量盒没有变' },
                { id: 'add-6', label: '又给机器人加了 6 格能量' },
                { id: 'clear', label: '把能量盒清空了' }
              ],
              correct: 'show-only'
            }
          ]
        },
        prediction: null,
        successCriteria: '两个检查点答对；能点着任意一行说出它在场景里做的事'
      },
      S: {
        intro: '机器人说：「透视眼镜升级了！这次你要认出每一行的『工种』：谁在建盒子，谁在改数字，谁只是大喇叭。」',
        program: coreProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 0,
              question: '哪一行是给盒子起名字、放进第一个数的？',
              inputType: 'choice',
              options: [
                { id: 'line1', label: 'int energy = 3;' },
                { id: 'line2', label: 'energy = energy + 4;' },
                { id: 'line4', label: 'std::cout << energy;' }
              ],
              correct: 'line1'
            },
            {
              afterStep: 2,
              question: '「energy = energy - 1;」这一行里的「=」是什么意思？',
              inputType: 'choice',
              options: [
                { id: 'store', label: '把右边算出的结果，存进左边的盒子' },
                { id: 'equal', label: '宣布左右两边永远相等' },
                { id: 'compare', label: '比一比左右两边谁大' }
              ],
              correct: 'store'
            },
            {
              afterStep: 3,
              question: '如果删掉最后一行 std::cout，能量盒里的数会变吗？',
              inputType: 'choice',
              options: [
                { id: 'no-change', label: '不变，只是屏幕上看不到了' },
                { id: 'be-zero', label: '会变成 0' },
                { id: 'gone', label: '盒子会消失' }
              ],
              correct: 'no-change'
            }
          ]
        },
        prediction: null,
        successCriteria: '三个检查点答对；能说出「= 是存进去，不是相等」和「cout 只展示不修改」两句话',
      },
      A: {
        intro: '机器人压低声音：「终极透视题——如果把大喇叭那一行搬到队伍中间，屏幕会喊出什么数？想清楚再答！」',
        program: coreProgram(),
        interaction: {
          checkpoints: [
            {
              afterStep: 1,
              question: '点亮第二行时，等号右边读到的 energy 是几？',
              inputType: 'number',
              correct: 3
            },
            {
              afterStep: 3,
              question: '如果把「std::cout << energy;」搬到「energy = energy + 4;」的后面、「energy = energy - 1;」的前面，屏幕会显示几？',
              inputType: 'number',
              correct: 7
            }
          ]
        },
        prediction: {
          question: '透视开始前先猜：这段程序里，真正「改变」能量盒的行有几行？（建立盒子那行不算改变）',
          inputType: 'number',
          correct: 2
        },
        successCriteria: '答出搬动 cout 后显示 7；能解释「cout 报告的是它执行那一刻盒子里的值」'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是找出「哪一行干了哪件事」。刚才场景里发生变化时，代码台上哪一行亮着？' },
      { level: 'H2', text: '盯住带「=」的行：它们会动能量盒。带「std::cout」的行只是一个大喇叭。' },
      { level: 'H3', text: '先排除 std::cout 那行——它从来不改变盒子里的数，只把现在的数喊出来。' },
      { level: 'H4', text: '打个比方：体重秤只会「报告」你的体重，站上去一百次也不会让你变重。std::cout 就是程序里的那台秤。' },
      { level: 'H5', text: '（教师解锁）教师点亮第二行并演示对应动画，让孩子接着点第三、四行，每点一行自己说出「这一行在场景里做了什么」。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D8', note: '观察孩子能否把可视化动作定位到具体代码行：靠试错乱点记 1；能直接指对行并说明记 2；能推理「搬动 cout 显示 7」记 3' },
    teacherCards: {
      truth: '「=」在 C++ 里是赋值，不是「左右永远相等」：右边先算，结果存进左边。「std::cout << energy;」只输出、不改变变量——它报告的是执行那一刻盒子里的值。图块和 C++ 是同一个程序的两种外衣。',
      demo: '点击第四行，让孩子看到场景里只有「喇叭」亮、能量条一动不动；再点第二行，能量条涨 4 格。两相对比，一句话总结：「有的行改状态，有的行只报告状态。」',
      questions: [
        '哪几行会改变能量盒？哪几行只是看一看？',
        '把 std::cout 那行搬到第二行后面，屏幕会喊几？为什么不是 6？',
        '数学课上的「x = 3」和这里的「energy = 3」，意思完全一样吗？'
      ],
      misconceptions: [
        '认为「energy = energy + 4」在数学上不成立，因此代码错误',
        '认为输出命令会自动给机器人增加能量（把「报告」当成「充电」）'
      ],
      rescueSteps: [
        '回到图块模式，把图块和代码行并排放，一行一行连线。',
        '让孩子只区分两类行：「会动盒子的」和「只带喇叭的」，先不管细节。',
        '用单步重跑一遍，每走一行就问「场景里刚才谁动了？」'
      ],
      extension: '给 A 档孩子看完整程序透视（#include、main、return 0），说明聚焦代码住在 main 的家里——不用背，认识门牌就行。'
    },
    compilerCheck: { enabled: true, expectedStdout: '6' }
  };

  /* ================= 活动 5 · 34–45 分钟 · 正好到达 10 ================= */

  var act5 = {
    id: 'lesson1-05-reach-ten',
    lessonId: 'lesson1',
    order: 5,
    minutes: [34, 45],
    title: '正好到达 10',
    concept: '修改代码里的数字，预测并验证结果——预测、尝试、调试、解释',
    learningObjective: '能修改代码并预测结果，通过尝试与调试让程序达到目标值（对应目标 5：修改代码并预测结果）',
    childPrompt: '能量站的充电门只认「正好 10 格」——多一格少一格都不开门！改动代码里的数字，让机器人跑完程序时能量正好是 10。',
    dimensions: ['D3', 'D8'],
    activityType: 'slots',
    visualModel: 'energy',
    variants: {
      E: {
        intro: '机器人指着充电门上的大数字 10：「现在这套数字还差一点点。改一改槽位里的数字，帮我正好凑到 10 吧！」',
        program: [
          declInt('energy', 2),
          assign('energy', bin('+', vr('energy'), lit(4))),
          assign('energy', bin('+', vr('energy'), lit(3))),
          output(vr('energy'))
        ],
        interaction: {
          goal: { type: 'finalVar', name: 'energy', value: 10 },
          slots: [
            { stepIndex: 0, path: 'expr', label: '起始能量', inputType: 'number' },
            { stepIndex: 1, path: 'expr.right', label: '第一次充电的格数', inputType: 'number' },
            { stepIndex: 2, path: 'expr.right', label: '第二次充电的格数', inputType: 'number' }
          ]
        },
        prediction: {
          question: '先别改！按现在这套数字跑完，能量会是几？',
          inputType: 'choice',
          options: [
            { id: '9', label: '9' },
            { id: '10', label: '10' },
            { id: '7', label: '7' }
          ],
          correct: '9'
        },
        successCriteria: '先预测出 9；改动任意一个数字让最终能量正好等于 10，并说出「我改了哪、为什么」'
      },
      S: {
        intro: '机器人苦恼地挠头：「维修单上明明写着能到 10，可怎么跑都不对……代码里一定有一行在捣乱！只许改一个数字，把它揪出来！」',
        program: [
          declInt('energy', 5),
          assign('energy', bin('+', vr('energy'), lit(2))),
          assign('energy', bin('-', vr('energy'), lit(3))),
          output(vr('energy'))
        ],
        interaction: {
          goal: { type: 'finalVar', name: 'energy', value: 10 },
          slots: [
            { stepIndex: 0, path: 'expr', label: '起始能量', inputType: 'number' },
            { stepIndex: 1, path: 'expr.right', label: '充电的格数（维修单：应充 8 格）', inputType: 'number' },
            { stepIndex: 2, path: 'expr.right', label: '开灯用掉的格数', inputType: 'number' }
          ]
        },
        prediction: {
          question: '先算一算：按现在这套数字跑完，能量会是几？',
          inputType: 'number',
          correct: 4
        },
        successCriteria: '预测出 4；对照维修单找出捣乱的一行（充电只充了 2 格，应是 8 格），只改一个数字达到 10，并解释错在哪'
      },
      A: {
        intro: '机器人带来了新伙伴 boost：「双变量挑战！充电量是 boost * 2——想让最终能量正好 10，你可以改 boost，也可以改别的数字。改之前先算清楚！」',
        program: [
          declInt('energy', 3),
          declInt('boost', 1),
          assign('energy', bin('+', vr('energy'), bin('*', vr('boost'), lit(2)))),
          assign('energy', bin('+', vr('energy'), lit(3))),
          output(vr('energy'))
        ],
        interaction: {
          goal: { type: 'finalVar', name: 'energy', value: 10 },
          slots: [
            { stepIndex: 0, path: 'expr', label: '起始能量', inputType: 'number' },
            { stepIndex: 1, path: 'expr', label: 'boost 的值', inputType: 'number' },
            { stepIndex: 3, path: 'expr.right', label: '最后一次充电的格数', inputType: 'number' }
          ]
        },
        prediction: {
          question: '先算：按现在这套数字（energy=3，boost=1）跑完，能量会是几？',
          inputType: 'number',
          correct: 8
        },
        successCriteria: '预测出 8；找到至少一种改法达到 10（如 boost 改 2），并能追踪两个变量、解释 boost * 2 是先乘再加'
      }
    },
    hintLadder: [
      { level: 'H1', text: '目标是让程序跑完时能量正好是 10。先想一想：现在这套数字跑完，离 10 差几格？' },
      { level: 'H2', text: '把每一行走一遍，记下能量一路的变化——看看是哪一步让它偏离了 10。' },
      { level: 'H3', text: '先固定住其他数字不动，只挑一个槽位改。差几格，就把那个槽位的数字调几格。' },
      { level: 'H4', text: '换一个小目标练手：如果门上写的是 8，起始 2、充 4 格，再充几格正好到 8？想通了，10 的题就是同一个玩法。' },
      { level: 'H5', text: '（教师解锁）教师改好一个槽位并演示重跑，让孩子改出第二种不同的解法，并解释两种改法为什么都能到 10。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D8', note: '观察预测-尝试-调试-解释四步：乱试数字碰对记 1；先算差值再一次改对记 2；能给出多种解法或讲清捣乱行记 3。自己发现并修正错误是正向证据' },
    teacherCards: {
      truth: '调试不是「乱改到对为止」，而是：预测结果 → 运行对照 → 定位偏差在哪一行 → 只改一处 → 再验证。目标值 10 减去当前结果，就是要补的差距。',
      demo: '先运行一次原始程序，指着输出问「离 10 还差几？」再演示只改一个槽位、重跑、对照，把「预测-尝试-调试-解释」四个词写在白板上打钩。',
      questions: [
        '你改这个数字之前，心里算出来的结果是几？',
        '有没有别的改法也能到 10？哪种改法动的地方最少？',
        '如果门上的数字换成 12，你会改哪里？'
      ],
      misconceptions: [
        '不做预测直接乱试数字，把调试当成碰运气',
        '一次改动好几个槽位，成功了也说不清是哪个改动起了作用'
      ],
      rescueSteps: [
        '让孩子先只运行、不修改，把现在的最终能量抄下来。',
        '问「离 10 差几格？」把差值写在纸上。',
        '指定只改最后一个槽位，把差值补上去，重跑验证。'
      ],
      extension: '如果机器人不能出现负能量，这段程序还缺少什么规则？（引出第 2 课的条件判断——程序自己「决定」要不要执行）'
    },
    compilerCheck: { enabled: true, expectedStdout: '10' }
  };

  /* ================= 活动 6 · 45–50 分钟 · 真实 C++ 验证 ================= */

  var act6 = {
    id: 'lesson1-06-real-cpp',
    lessonId: 'lesson1',
    order: 6,
    minutes: [45, 50],
    title: '真实 C++ 验证',
    concept: '刚才的动画是模拟；真正的 C++ 编译器会运行同一段程序，结果应该和手算一致',
    learningObjective: '完成一次真实 C++ 编译验证，理解模拟与真实运行的关系（对应目标 6：至少完成一次真实 C++ 编译验证）',
    childPrompt: '重要时刻到了！我们把完整的 C++ 程序发射给一台真正的编译器。发射前先写下你的预测——看看真机器吐出的数字，和你算的一不一样！',
    dimensions: ['D3', 'D9'],
    activityType: 'predict',
    visualModel: 'energy',
    variants: {
      E: {
        intro: '机器人激动地按住发射按钮：「这次不是演习！真正的 C++ 编译器要跑我们的程序了。先猜猜它会打印什么？」',
        program: coreProgram(),
        interaction: {
          question: '真正的 C++ 编译器跑完这段程序，屏幕上会打印出哪个数字？',
          inputType: 'choice',
          options: [
            { id: '6', label: '6' },
            { id: '7', label: '7' },
            { id: '3467', label: '3、4、6、7 全都打印' }
          ],
          correct: '6'
        },
        prediction: {
          question: '真正的 C++ 编译器跑完这段程序，屏幕上会打印出哪个数字？',
          inputType: 'choice',
          options: [
            { id: '6', label: '6' },
            { id: '7', label: '7' },
            { id: '3467', label: '3、4、6、7 全都打印' }
          ],
          correct: '6'
        },
        successCriteria: '先提交预测，再点「真实 C++ 验证」；对照真实输出和自己的预测，说出「一样/不一样，因为……」'
      },
      S: {
        intro: '机器人打开「完整程序」透视：「看，我们的四行代码住在 main 的家里，这才是发给编译器的全部。预测它会打印几？」',
        program: coreProgram(),
        interaction: {
          question: '真正的编译器运行完整程序后，屏幕上会打印出什么数字？',
          inputType: 'number',
          correct: 6
        },
        prediction: {
          question: '真正的编译器运行完整程序后，屏幕上会打印出什么数字？',
          inputType: 'number',
          correct: 6
        },
        successCriteria: '预测 6 并完成真实编译；能说出「屏幕上只有 6，因为程序里只有一条输出命令」'
      },
      A: {
        intro: '机器人指着完整程序：「发射前的最后检查——想清楚编译器会打印什么、不会打印什么，再按按钮。」',
        program: coreProgram(),
        interaction: {
          question: '真实编译器运行后，屏幕上打印的内容是什么？（提示：想想有几条输出命令，中间值会不会被打印）',
          inputType: 'number',
          correct: 6
        },
        prediction: {
          question: '真实编译器运行后，屏幕上会打印出什么数字？',
          inputType: 'number',
          correct: 6
        },
        successCriteria: '预测 6 并完成真实编译；能解释「7 是中间值，没有输出命令报告它，所以屏幕上看不到」，并（可选）口头对比 energy = energy + 2 与 energy += 2 是同一个意思的两种写法'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是预测真机器打印的数字。想一想：程序里哪一行负责「打印」？它打印的是什么时候的值？' },
      { level: 'H2', text: '找到「std::cout << energy;」这一行——它是唯一会往屏幕上写字的行，打印它执行那一刻盒子里的值。' },
      { level: 'H3', text: '先排除「把 3、7、6 都打印」：没有输出命令的值不会出现在屏幕上。只需算出最后一刻的能量。' },
      { level: 'H4', text: '换个数字想：如果程序是「int a = 5; a = a + 2; std::cout << a;」，屏幕只会出现 7。那我们的程序呢？' },
      { level: 'H5', text: '（教师解锁）教师带孩子逐行手算并写下 3、7、6，然后圈出「谁被打印」，让孩子补完预测并解释另外两个数为什么不出现。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D3', note: '观察孩子能否用状态追踪支撑预测，以及看到真实输出时的反应：是否理解模拟动画与真实运行是同一段程序的两种跑法（关联 D9 迁移）' },
    teacherCards: {
      truth: '「std::cout」只输出、不改变变量；屏幕上只出现被输出命令报告过的值。动画是我们的模拟，真实编译器（真正的 g++）跑的是同一段完整程序——两边结果一致，说明我们的手算是对的。若显示「概念演示」标记，说明这次没有连上真实编译器，结果来自模拟。',
      demo: '先让孩子在纸上写下预测，再点「真实 C++ 验证」；把真实输出、动画输出、手算结果三个「6」并排指给孩子看：「三台机器，同一个答案。」',
      questions: [
        '屏幕上为什么没有出现 7？7 去哪儿了？',
        '动画里的 6 和真编译器打印的 6，是巧合吗？',
        '如果想让屏幕把中间值也打印出来，程序要加什么？'
      ],
      misconceptions: [
        '认为输出命令会自动给机器人增加能量',
        '认为动画是「假的」、和真实 C++ 是两种不同的语言'
      ],
      rescueSteps: [
        '回到能量盒动画，重走一遍，把 3、7、6 三个值按顺序写在纸上。',
        '问「哪个值旁边有大喇叭（输出命令）？」圈出 6。',
        '再提交预测并发射，对照真实输出。'
      ],
      extension: 'A 档口头对比：energy = energy + 2 和 energy += 2 是同一个意思的两种写法，后者是程序员的「快捷键」；第 2 课还会见到它。'
    },
    compilerCheck: { enabled: true, expectedStdout: '6' }
  };

  /* ================= 活动 7 · 50–56 分钟 · 我的改造 ================= */

  var act7 = {
    id: 'lesson1-07-my-remix',
    lessonId: 'lesson1',
    order: 7,
    minutes: [50, 56],
    title: '我的改造',
    concept: '同样的程序骨架，换上自己选的数字和事件，就是自己的作品',
    learningObjective: '能在程序骨架上做出自己的选择并预期其结果，完成个人版本（对应目标 5 的创造部分，保存第 1 课可见成果）',
    childPrompt: '轮到你当设计师啦！挑一个机器人皮肤、定一个初始能量、选几件今天发生的事——组装出独一无二的「我的能量站」，存成你的作品卡！',
    dimensions: ['D6', 'D4'],
    activityType: 'build',
    visualModel: 'scene',
    variants: {
      E: {
        intro: '机器人搬来三个衣柜和一排开关：「指挥官说了算！选好了我们就试运行，跑通了就印成你的作品卡。」',
        program: null,
        interaction: {
          choices: {
            skin: [
              { id: 'robo-blue', label: '蓝色圆滚滚' },
              { id: 'robo-orange', label: '橙色方块侠' },
              { id: 'robo-dog', label: '绿色电力狗' }
            ],
            initialEnergy: [2, 3, 5],
            events: [
              { id: 'ev-bean', label: '吃到能量豆（能量 +4）', effect: { op: '+', amount: 4 } },
              { id: 'ev-lamp', label: '打开探照灯（能量 -1）', effect: { op: '-', amount: 1 } },
              { id: 'ev-cat', label: '帮小猫充电（能量 -2）', effect: { op: '-', amount: 2 } }
            ]
          },
          saveAs: 'artifactCard'
        },
        prediction: null,
        successCriteria: '选好皮肤、初始能量和至少 2 件事件，运行看到结果并保存作品卡；能读出自己程序的最终能量'
      },
      S: {
        intro: '机器人递来设计图纸：「这次有个小要求——保存之前，先口算出你这套选择的最终能量，再运行对答案！」',
        program: null,
        interaction: {
          choices: {
            skin: [
              { id: 'robo-blue', label: '蓝色圆滚滚' },
              { id: 'robo-orange', label: '橙色方块侠' },
              { id: 'robo-dog', label: '绿色电力狗' }
            ],
            initialEnergy: [1, 2, 3, 5, 8],
            events: [
              { id: 'ev-bean', label: '吃到能量豆（能量 +4）', effect: { op: '+', amount: 4 } },
              { id: 'ev-lamp', label: '打开探照灯（能量 -1）', effect: { op: '-', amount: 1 } },
              { id: 'ev-cat', label: '帮小猫充电（能量 -2）', effect: { op: '-', amount: 2 } },
              { id: 'ev-super', label: '超级快充（能量 +6）', effect: { op: '+', amount: 6 } }
            ]
          },
          saveAs: 'artifactCard'
        },
        prediction: null,
        successCriteria: '选择 3 件事件并在运行前口算出最终能量；运行对上答案后保存作品卡'
      },
      A: {
        intro: '机器人拿出金色图纸：「设计师终极关——请让你的作品最终能量正好落在 10，事件不少于 3 件。设计、心算、验证，一气呵成！」',
        program: null,
        interaction: {
          choices: {
            skin: [
              { id: 'robo-blue', label: '蓝色圆滚滚' },
              { id: 'robo-orange', label: '橙色方块侠' },
              { id: 'robo-dog', label: '绿色电力狗' }
            ],
            initialEnergy: [1, 2, 3, 5, 8],
            events: [
              { id: 'ev-bean', label: '吃到能量豆（能量 +4）', effect: { op: '+', amount: 4 } },
              { id: 'ev-lamp', label: '打开探照灯（能量 -1）', effect: { op: '-', amount: 1 } },
              { id: 'ev-cat', label: '帮小猫充电（能量 -2）', effect: { op: '-', amount: 2 } },
              { id: 'ev-super', label: '超级快充（能量 +6）', effect: { op: '+', amount: 6 } },
              { id: 'ev-double', label: '太阳能加倍（能量 ×2）', effect: { op: '*', amount: 2 } }
            ]
          },
          saveAs: 'artifactCard'
        },
        prediction: null,
        successCriteria: '设计出最终能量正好为 10、含至少 3 件事件的方案（例如初始 2，吃能量豆 +4、开探照灯 -1、太阳能加倍 ×2，最终正好 10），运行验证后保存；能解释加倍事件放在不同位置结果为何不同'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是组装你自己的能量站。先选最喜欢的皮肤，再想：你的机器人今天一开始有几格能量？' },
      { level: 'H2', text: '每件事件都会改变能量盒。选一件事件时，看看它旁边写的是加几、减几。' },
      { level: 'H3', text: '先只选两件事件，从初始能量开始，一件一件算过去；算顺了再添第三件。' },
      { level: 'H4', text: '参考一个例子：初始 3，吃能量豆 +4，开探照灯 -1，最后是 6。把里面的数换成你自己的选择再算一遍。' },
      { level: 'H5', text: '（教师解锁）教师先摆一半方案（皮肤+初始能量+一件事件）并算出中间值，让孩子补完剩下的事件并算出最终能量再保存。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D6', note: '观察孩子是能创造还是只复制：照抄示例记 1；自己组合并算对最终能量记 2；能为「正好到 10」等目标反推事件组合记 3。兴趣类别（皮肤/事件的选择偏好）单独记录' },
    teacherCards: {
      truth: '孩子的每个选择都会变成真实的代码行：初始能量是「int energy = …;」，每件事件是一行赋值。作品卡按方案要求包含：自选机器人、初始能量、三至五行代码、最终结果、一句自己的解释，以及「已通过真实 C++ 验证」标记（仅真实编译成功时）。',
      demo: '选两件事件后切到代码模式，指给孩子看「你按的每个按钮都长成了一行 C++」。保存前让孩子把最终能量说出来再运行。',
      questions: [
        '你的机器人今天经历了什么故事？按顺序讲一遍。',
        '把这两件事件交换顺序，最终能量还一样吗？',
        '你的程序里哪一行是「建立盒子」，哪一行是「报告」？'
      ],
      misconceptions: [
        '把作品当成「摆造型」，没有意识到每个选择都对应一行会执行的代码',
        '选了加倍事件后仍按「加 2」心算（把 ×2 当 +2）'
      ],
      rescueSteps: [
        '限制只选 2 件事件，先跑通、保存一个最小作品。',
        '每选一件事件就停下来问「现在能量到几了？」',
        '让孩子照着屏幕把自己的代码读一遍，再按运行。'
      ],
      extension: 'A 档追问：「太阳能加倍」放在「吃能量豆」之前和之后，最终能量差多少？为什么乘法对顺序这么敏感？'
    },
    compilerCheck: { enabled: false, expectedStdout: '' }
  };

  /* ================= 活动 8 · 56–60 分钟 · 讲给机器人听 ================= */

  var act8 = {
    id: 'lesson1-08-teach-robot',
    lessonId: 'lesson1',
    order: 8,
    minutes: [56, 60],
    title: '讲给机器人听',
    concept: '能讲明白，才是真的学会——用自己的话解释赋值的三步',
    learningObjective: '能解释赋值是「先读旧值、算出结果、再存回变量」，输出只是展示（对应目标 3、4 的解释层）',
    childPrompt: '机器人想把今天学到的本领讲给别的机器人听，可它讲到一半卡住了。帮它补完这句话吧——你可以说出来，也可以打出来！',
    dimensions: ['D8', 'D11'],
    activityType: 'explain',
    visualModel: 'energy',
    variants: {
      E: {
        intro: '机器人清了清嗓子：「咳咳……第二行先读取旧能量，然后……然后……哎呀，指挥官快帮我接下去！」',
        program: coreProgram(),
        interaction: {
          prompt: '补全机器人的话：「第二行先读取旧能量，然后……」（说给老师听，或打几个字都可以）',
          sentenceStarters: [
            '第二行先读取旧能量，然后……',
            '算出来的新数字会住进……',
            '旧的数字就……'
          ],
          minWords: 0
        },
        prediction: null,
        successCriteria: '能用自己的话补出「加上 4，把新数字放回盒子」的意思（口头即可，老师记录）'
      },
      S: {
        intro: '机器人邀请你当小老师：「请把第二行的全部秘密讲给我听——读什么、算什么、存到哪，一步都别漏！」',
        program: coreProgram(),
        interaction: {
          prompt: '把「energy = energy + 4;」的三个步骤完整讲一遍，再用一句话说说 std::cout 那行是干什么的。',
          sentenceStarters: [
            '第二行先读取旧能量，然后……',
            '等号的右边先……，算完才……',
            'std::cout 那一行只会……，不会……'
          ],
          minWords: 0
        },
        prediction: null,
        successCriteria: '讲出「读旧值 → 算结果 → 写回盒子」三步，并说出 cout 只展示不修改'
      },
      A: {
        intro: '机器人搬来小板凳坐好：「今天你是教授！请讲清楚等号两边谁先谁后——再挑战一个彩蛋问题。」',
        program: shieldProgram(),
        interaction: {
          prompt: '对着「energy = energy + shield * 2;」讲清楚：右边什么时候算、左边什么时候写、shield 有没有被改。彩蛋：energy = energy + 2 和 energy += 2 是不是同一个意思？',
          sentenceStarters: [
            '等号的右边先……，左边的盒子才……',
            'shield 在这一行只是被……，所以它……',
            '我觉得 energy += 2 的意思是……'
          ],
          minWords: 0
        },
        prediction: null,
        successCriteria: '讲出「右边先算、左边后写」，指出 shield 只被读取；彩蛋能说出两种写法意思相同（不要求会写 +=）'
      }
    },
    hintLadder: [
      { level: 'H1', text: '任务是把第二行的故事讲完。想一想：读到旧能量之后，机器人做的下一件事是什么？' },
      { level: 'H2', text: '回忆能量盒动画：旧数字淡出之前，等号右边先发生了一次计算。' },
      { level: 'H3', text: '你的话里最好有三个动作词：「读」「算」「存」。先别管顺序，把三个词都用上试试。' },
      { level: 'H4', text: '打个比方帮你开头：存钱罐里有 3 元，妈妈说「再放 4 元」——你先看清里面有几元，再算 3+4，再把 7 元的新总数记在心里。换成能量盒怎么说？' },
      { level: 'H5', text: '（教师解锁）教师示范前半句：「第二行先读取旧能量 3，然后算出 3 + 4 = 7……」让孩子补完「7 去了哪里、旧的 3 怎么样了」并自己完整重讲一遍。', teacherOnly: true }
    ],
    evidenceRule: { dimension: 'D8', note: '课末解释质量直接支撑路径建议：仿照句式勉强补完记 1；独立讲出读-算-存三步记 2；能迁移解释双变量或 += 记 3。同时观察 D11：孩子能否说出自己哪一步最难' },
    teacherCards: {
      truth: '解释是本课最重要的产出证据：能讲出「先读旧值、再计算、后写回」三步，说明孩子把赋值理解成了过程而不是符号。「=」是赋值不是相等、cout 只展示不修改，这两句是三步解释的配套检查。',
      demo: '让孩子对着能量盒动画讲，讲到哪一步就把动画停在哪一帧；孩子卡住时不接话，只把那一帧再播一遍。',
      questions: [
        '如果给一年级的小朋友讲这一行，你会怎么讲？',
        '今天哪个地方你觉得最难？后来是怎么想通的？',
        '下次遇到看不懂的一行代码，你打算先做什么？'
      ],
      misconceptions: [
        '把「energy = energy + 4」读成「energy 等于 energy 加 4」并认为这在数学上说不通',
        '解释时跳过「读旧值」，直接说「变成 7」，说明还没把赋值当成三步过程'
      ],
      rescueSteps: [
        '把句子开头递给孩子：「第二行先读取旧能量……」让他只补一个词也算数。',
        '回放第二行的慢动画，每停一帧问「现在发生了什么？」',
        '让孩子先用存钱罐的比方讲一遍，再换回 energy 讲一遍。'
      ],
      extension: 'A 档彩蛋展开：energy += 2 是 energy = energy + 2 的快捷写法，两者做的事一模一样；可以现场把核心程序第二行改成 += 跑给孩子看，输出不变。'
    },
    compilerCheck: { enabled: false, expectedStdout: '' }
  };

  /* ================= 汇总导出 ================= */

  var lesson1 = {
    lessonId: 'lesson1',
    title: '机器人能量站：命令怎样改变世界',
    activities: [act1, act2, act3, act4, act5, act6, act7, act8]
  };

  CppLab.content = CppLab.content || {};
  CppLab.content.lesson1 = lesson1;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = lesson1;
  }
})();
