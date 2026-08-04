/* =============================================================
 * trial.js — 试听诊断课内容包「星际救援·试听诊断」
 * owner: content-trial （只挂 CppLab.content.trial，不碰引擎）
 * 依据: docs/方案定稿.md §4.3 蓝图（9 活动）+ §11.2（AI 协作习惯，单列）
 *       docs/CONTRACT.md §4 LessonIR / §5 Activity schema
 * 说明:
 * - 每个活动 E/S/A 三档变体按方案 4.2 的"孩子主要操作"实质区分。
 * - 含 program 的活动 compilerCheck.expectedStdout 与 IR 手算执行结果一致
 *   （所有变体的 program 刻意设计为同一 stdout，便于活动级校验）。
 *   bughunt 例外：program 存带 bug 版，而 expectedStdout 是修好 bug 后的输出——
 *   与产品「真实C++验证」时机一致（app.js 对修好版源码编译比对）。
 * - 扩展字段（引擎侧按需消费，见集成说明）:
 *   coreDiagnostic  — 是否属于"核心诊断活动"（CONTRACT §10 提示闸门用）
 *   aiHabit         — 标记第 10 活动为 AI 协作习惯观察（存 session.lessons.trial.aiHabit）
 *   interaction.followUp        — 主交互完成后的第二段轻交互（trace+slots 等组合活动）
 *   variant.activityTypeOverride — 仅活动 8「动态挑战」使用：三档交互类型不同
 * ============================================================= */
var CppLab = (typeof window !== 'undefined')
  ? (window.CppLab = window.CppLab || {})
  : (globalThis.CppLab = globalThis.CppLab || {});

CppLab.content = CppLab.content || {};

CppLab.content.trial = {
  lessonId: 'trial',
  title: '星际救援·试听诊断',
  metadata: {
    durationMinutes: 60,
    world: '你的飞船降落在陌生星球，一只太空宠物被困在能量舱里，等你来救！',
    interestCategories: ['游戏规则', '故事和角色', '机器人与机械', '建造和创造', '数学挑战', '调试解谜', '社交展示']
  },
  activities: [

    /* =========================================================
     * 活动 1 · 0–4 分钟 · 进入任务世界（兴趣捕捉，非正式问卷）
     * ========================================================= */
    {
      id: 'trial-01-enter-world',
      lessonId: 'trial',
      order: 1,
      minutes: [0, 4],
      title: '降落！选择你的救援搭档',
      concept: '进入任务世界与兴趣捕捉',
      learningObjective: '建立任务情境；自然捕捉孩子的兴趣类别、既往经验与电脑熟悉度。',
      childPrompt: '飞船降落啦！先选一个救援搭档，再告诉它：你最想接哪种任务？',
      dimensions: ['D12', 'D10'],
      activityType: 'choice',
      visualModel: 'scene',
      coreDiagnostic: false,
      variants: {
        E: {
          intro: '欢迎来到救援星球！屏幕上有三个搭档：蓝色圆滚机器人、橙色方块机器人、绿色太空小狗。用鼠标点一点，选一个你最喜欢的吧。选好后再点一张"任务卡"，告诉搭档你最想玩哪种任务。',
          program: null,
          interaction: {
            question: '你最想接哪种救援任务？（点一张任务卡）',
            options: [
              { id: 'game',   label: '🎮 定规则的游戏任务' },
              { id: 'story',  label: '📖 有角色的故事任务' },
              { id: 'robot',  label: '🤖 机器人与机械任务' },
              { id: 'build',  label: '🏗️ 建造和创造任务' },
              { id: 'math',   label: '🧮 数学挑战任务' },
              { id: 'debug',  label: '🔍 找错解谜任务' },
              { id: 'show',   label: '🌟 做完展示给大家看' }
            ],
            multi: false
          },
          prediction: null,
          successCriteria: '孩子能自己（或在老师帮助下）用鼠标完成两次点选，并说出为什么选这张任务卡。'
        },
        S: {
          intro: '欢迎登陆！先选一个救援搭档（蓝色圆滚 / 橙色方块 / 绿色小狗），再挑一张你最想接的任务卡。挑完用一句话告诉搭档：为什么是这一张？顺便聊聊——你以前做过最满意的作品是什么？',
          program: null,
          interaction: {
            question: '你最想接哪种救援任务？选好后说说理由。',
            options: [
              { id: 'game',   label: '🎮 定规则的游戏任务' },
              { id: 'story',  label: '📖 有角色的故事任务' },
              { id: 'robot',  label: '🤖 机器人与机械任务' },
              { id: 'build',  label: '🏗️ 建造和创造任务' },
              { id: 'math',   label: '🧮 数学挑战任务' },
              { id: 'debug',  label: '🔍 找错解谜任务' },
              { id: 'show',   label: '🌟 做完展示给大家看' }
            ],
            multi: false
          },
          prediction: null,
          successCriteria: '孩子独立完成选择，能用完整的一句话说明理由，并回答一个"以前做过什么"的问题。'
        },
        A: {
          intro: '欢迎登陆，指挥官！选好你的救援搭档和任务卡后，给搭档介绍一下：你以前做过最得意的程序或作品是什么？它会做什么？是你自己从头做的，还是别人搭好框架你来改的？',
          program: null,
          interaction: {
            question: '你最想接哪种救援任务？选完介绍一个你以前的作品。',
            options: [
              { id: 'game',   label: '🎮 定规则的游戏任务' },
              { id: 'story',  label: '📖 有角色的故事任务' },
              { id: 'robot',  label: '🤖 机器人与机械任务' },
              { id: 'build',  label: '🏗️ 建造和创造任务' },
              { id: 'math',   label: '🧮 数学挑战任务' },
              { id: 'debug',  label: '🔍 找错解谜任务' },
              { id: 'show',   label: '🌟 做完展示给大家看' }
            ],
            multi: false
          },
          prediction: null,
          successCriteria: '孩子能具体描述一个既往作品（做了什么、怎么做的），可供后续任务验证其真实水平。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '现在要做两件事：先选一个搭档，再选一张任务卡。你想先从哪个开始？' },
        { level: 'H2', text: '看看屏幕上的三个搭档，用鼠标移过去它们会亮起来，点一下就选中了。' },
        { level: 'H3', text: '不用担心选错——任务卡没有对错，只是告诉搭档你喜欢什么。' },
        { level: 'H4', text: '比如有的小朋友喜欢"找错解谜"，因为像当侦探；那你更像哪一种呢？' },
        { level: 'H5', text: '老师示范：我来点给你看——移动鼠标、点一下，选中了！现在换你来选任务卡。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D12',
        note: '观察鼠标操作是否流畅（自己点选/需要代操作）、能否读懂卡片文字；同时记录兴趣类别到 session.lessons.trial.interests，记录既往经验的原话（child_action_or_quote）。电脑操作慢不降低任何计算思维等级。'
      },
      teacherCards: {
        truth: '本活动不考知识，只建立情境与采集基线：兴趣类别（单独记录，不打能力分）、既往经验（口述作品后续要用任务验证）、电脑熟悉度（D12）。开场 4 分钟的观察质量决定后面支架起点。',
        demo: '边玩边聊，把问卷藏进对话里（不要连珠炮，穿插着问）："你以前做过最满意的程序是什么？它会做什么？""那个作品是你自己打开软件做的，还是老师帮你准备好的？""平时电脑主要用来玩游戏、看视频、画画还是做作品？""你喜欢别人先演示一次，还是自己先试？"',
        questions: [
          '为什么选这张任务卡？它让你想到了什么？',
          '你以前用电脑做过什么让你特别得意的东西？',
          '如果搭档会一个超能力，你希望是什么？'
        ],
        misconceptions: [
          '孩子说"我学过编程"不等于会追踪状态——只记录原话，后续用任务验证，不据此定档。',
          '孩子沉默不代表不会——可能是陌生环境紧张，先让他点选、后让他开口。'
        ],
        rescueSteps: [
          '孩子不动鼠标：老师把手放在鼠标上示范一次，然后让孩子把手放上来再点一次。',
          '孩子说"随便/不知道"：把七张卡缩成两张对比问："游戏和故事，先挑一个？"',
          '孩子完全不说话：改成点头/摇头提问，先建立回应，再慢慢过渡到开口。'
        ],
        extension: '让孩子给搭档起个名字，并说一句"出发宣言"；名字可写进后续活动的口头文案里，增强代入感。'
      },
      compilerCheck: { enabled: false, expectedStdout: '' }
    },

    /* =========================================================
     * 活动 2 · 4–9 分钟 · 第一场小胜利（前进—捡电池—开门 排序）
     * ========================================================= */
    {
      id: 'trial-02-first-win',
      lessonId: 'trial',
      order: 2,
      minutes: [4, 9],
      title: '第一场小胜利：让搭档动起来',
      concept: '顺序执行：命令按先后逐条发生',
      learningObjective: '理解命令的先后顺序会改变结果；完成第一次"排好—运行—看动画"的成功体验。',
      childPrompt: '搭档站在通道口，电池在前面，门在最里面。把指令块排好顺序，让它一次成功！',
      dimensions: ['D2', 'D12'],
      activityType: 'ordering',
      visualModel: 'sequence',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '看，搭档面前有一条通道：先是空地，再是一节发光的电池，最里面是一扇锁住的门。下面有三块指令积木，点「上移」「下移」把它们排好顺序，再按「检查顺序」——排对了，搭档就会照着一步步做给你看！',
          program: null,
          interaction: {
            items: [
              { id: 'forward', label: '前进', icon: '👣' },
              { id: 'battery', label: '捡电池', icon: '🔋' },
              { id: 'door',    label: '开门', icon: '🚪' }
            ],
            correctOrder: ['forward', 'battery', 'door']
          },
          prediction: {
            question: '搭档第一步应该先做什么？',
            inputType: 'choice',
            options: ['先开门', '先前进', '先捡电池'],
            correct: '先前进'
          },
          successCriteria: '孩子完成排序检查通过、看到搭档按顺序行动的动画；能用自己的话说出"为什么捡电池要在开门前面"。'
        },
        S: {
          intro: '通道更长了！搭档要走到电池旁、捡起电池、再走到门口、用电池的能量开门。这里有四块指令积木，用「上移」「下移」排好顺序，再按「检查顺序」看搭档行动。排之前先想一想：如果把"捡电池"放到最后，会发生什么？',
          program: null,
          interaction: {
            items: [
              { id: 'forward1', label: '前进到电池旁', icon: '👣' },
              { id: 'battery',  label: '捡电池', icon: '🔋' },
              { id: 'forward2', label: '前进到门口', icon: '👣' },
              { id: 'door',     label: '开门', icon: '🚪' }
            ],
            correctOrder: ['forward1', 'battery', 'forward2', 'door']
          },
          prediction: {
            question: '如果把"捡电池"排在最后一步，搭档能打开门吗？',
            inputType: 'choice',
            options: ['能，顺序无所谓', '不能，开门时还没有电池'],
            correct: '不能，开门时还没有电池'
          },
          successCriteria: '孩子独立完成四块排序并运行成功；能解释顺序错了会卡在哪一步。'
        },
        A: {
          intro: '高级任务：这次的指令堆里混进了五块积木，其中一块放错位置整个任务就失败。先提交你的预测，再用「上移」「下移」排好顺序、按「检查顺序」验证。排对之后再想一想：如果故意换一个顺序，会在第几步卡住？把你的猜想讲给老师听。',
          program: null,
          interaction: {
            items: [
              { id: 'scan',     label: '扫描通道', icon: '📡' },
              { id: 'forward1', label: '前进到电池旁', icon: '👣' },
              { id: 'battery',  label: '捡电池', icon: '🔋' },
              { id: 'forward2', label: '前进到门口', icon: '👣' },
              { id: 'door',     label: '开门', icon: '🚪' }
            ],
            correctOrder: ['scan', 'forward1', 'battery', 'forward2', 'door']
          },
          prediction: {
            question: '如果把"开门"和"前进到门口"对调，搭档会在第几步出问题？',
            inputType: 'choice',
            options: ['第 1 步', '第 4 步', '不会出问题'],
            correct: '第 4 步'
          },
          successCriteria: '孩子独立排序成功，主动做"故意排错"的实验，并准确说出卡住的位置和原因。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是让搭档打开最里面的门。想一想：它现在手里有开门用的电池吗？' },
        { level: 'H2', text: '看看通道里东西的位置：电池在门的前面。搭档要先经过谁？' },
        { level: 'H3', text: '第一块积木可以先放"前进"。剩下的：捡电池和开门，哪个必须先发生？' },
        { level: 'H4', text: '就像早上出门：要先穿袜子再穿鞋。如果先"穿鞋"再"穿袜子"会怎样？这里的"电池"就像袜子哦。' },
        { level: 'H5', text: '老师演示前两块的排法（前进→捡电池），最后一块让孩子自己放，并要求说出理由。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D2',
        note: '观察三点：能否一次排对（或错后自己调整）；拖拽操作是否需要代劳（记入 D12 而非 D2）；能否解释"为什么这个顺序"。自己发现顺序错误并修正记 self_correction=true。'
      },
      teacherCards: {
        truth: '顺序执行是程序的第一原理：计算机严格逐条执行命令，先后顺序决定结果。这也是后面"逐行看变量变化"的地基。孩子此刻不需要任何语法，只需要建立"先后有意义"的直觉。',
        demo: '故意把"开门"拖到第一块，点运行——搭档在门口撞了一下，门纹丝不动。夸张地问："咦？它明明照做了呀，哪里出问题了？"引导孩子发现：命令没错，顺序错了。',
        questions: [
          '搭档是聪明地自己决定先捡电池，还是我们排什么它做什么？',
          '如果把前两块对调，会发生什么？在第几步出问题？',
          '生活里有没有"顺序错了就失败"的事情？说一个例子。'
        ],
        misconceptions: [
          '认为计算机会"自动纠正"顺序（它不会，它只忠实执行）。',
          '认为动画角色"看得见"电池所以会自己去捡（程序没有常识，只有指令）。',
          '排错后认为"这个积木坏了"而不是顺序问题。'
        ],
        rescueSteps: [
          '把积木减到两块（捡电池、开门），先排对两块建立信心，再加回其他块。',
          '让孩子用嘴巴指挥、老师来拖，把"操作困难"和"顺序思维"分开。',
          '老师排一个错误顺序运行给孩子看，让孩子当裁判说错在哪，再让他排正确版。'
        ],
        extension: '加一问："如果通道里有两节电池，指令要怎么变？"观察孩子是否自然想到重复"前进—捡电池"这组动作（为循环概念埋种子）。'
      },
      compilerCheck: { enabled: false, expectedStdout: '' }
    },

    /* =========================================================
     * 活动 3 · 9–16 分钟 · 能量预测（含运算优先级一题）
     * 三档 program 刻意同为 stdout "7"
     * ========================================================= */
    {
      id: 'trial-03-energy-predict',
      lessonId: 'trial',
      order: 3,
      minutes: [9, 16],
      title: '能量预测站',
      concept: '算式求值与运算优先级（先乘除后加减）',
      learningObjective: '先预测算式结果再运行验证；发现"乘法优先"与从左到右硬算的差别。',
      childPrompt: '充电站要给搭档充能量！先算一算充完是多少格，再按运行，看看你猜得准不准。',
      dimensions: ['D1'],
      activityType: 'predict',
      visualModel: 'energy',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '搭档走进了充电站。充电站的屏幕上会显示一个算式，能量条会按算式充起来。先用嘴巴或手指算一算，再点"运行"看能量条动起来！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy',
              expr: { kind: 'bin', op: '+',
                left: { kind: 'lit', value: 1 },
                right: { kind: 'bin', op: '*', left: { kind: 'lit', value: 2 }, right: { kind: 'lit', value: 3 } } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            question: '充电站的算式是 1 + 2 * 3（* 就是乘号）。机器先算乘法再算加法，能量会是几格？',
            inputType: 'choice',
            options: ['7', '9'],
            correct: '7'
          },
          prediction: {
            question: '热身题：3 + 4 等于几？',
            inputType: 'choice',
            options: ['6', '7', '8'],
            correct: '7'
          },
          successCriteria: '孩子完成热身加法；在两个选项中选出 7，并在动画后能跟着说出"先算乘再算加"。'
        },
        S: {
          intro: '充电站升级了！这次没有选项，你要自己算出能量数再填进去。记住机器的规矩：算式里有乘法时，先算乘法，再算加减。',
          program: [
            { op: 'declare', varType: 'int', name: 'energy',
              expr: { kind: 'bin', op: '+',
                left: { kind: 'lit', value: 3 },
                right: { kind: 'bin', op: '*', left: { kind: 'lit', value: 2 }, right: { kind: 'lit', value: 2 } } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            question: '算式是 3 + 2 * 2。充完后能量是几格？填数字。',
            inputType: 'number',
            correct: 7
          },
          prediction: {
            question: '热身题：10 - 3 等于几？',
            inputType: 'number',
            correct: 7
          },
          successCriteria: '孩子独立填出 7；如果先答 10（从左往右硬算），能在提示或动画后自己纠正并说出原因。'
        },
        A: {
          intro: '加速充电站：算式更长了。先在心里定好"先算哪一步、再算哪一步"，把最终能量填进去，再运行验证。如果你的答案和机器不一样，找找是哪一步的顺序不同。',
          program: [
            { op: 'declare', varType: 'int', name: 'energy',
              expr: { kind: 'bin', op: '-',
                left: { kind: 'bin', op: '-',
                  left: { kind: 'lit', value: 20 },
                  right: { kind: 'bin', op: '*', left: { kind: 'lit', value: 2 }, right: { kind: 'lit', value: 6 } } },
                right: { kind: 'lit', value: 1 } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            question: '算式是 20 - 2 * 6 - 1。充完后能量是几格？说说你算的每一步。',
            inputType: 'number',
            correct: 7
          },
          prediction: {
            question: '热身题：12 - 5 等于几？',
            inputType: 'number',
            correct: 7
          },
          successCriteria: '孩子独立算出 7，并能按"先乘法 2*6=12，再从左到右减"讲出完整步骤。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是算出充完电的能量格数。这个算式里有几个运算符号？分别是什么？' },
        { level: 'H2', text: '注意看算式里的乘号 *。机器的规矩是：先算乘法，再算加减。' },
        { level: 'H3', text: '先把乘法那一小块单独算出来，用它的结果换掉原来的位置，算式就变短了。' },
        { level: 'H4', text: '换个例子：2 + 3 * 4，先算 3 * 4 = 12，再算 2 + 12 = 14。用同样的办法算你的题。' },
        { level: 'H5', text: '老师带着算第一步（把乘法算出来并写下中间结果），剩下的加减让孩子完成并解释。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D1',
        note: 'D1 只决定数学支架，不得单独提升编程路径。重点记录：加减是否流利；优先级题先答错后能否自我纠正（self_correction）；是否理解"机器有固定规矩"而不是"机器随便算"。'
      },
      teacherCards: {
        truth: 'C++ 与数学一致：* 和 / 的优先级高于 + 和 -，同级从左到右。20 - 2 * 6 - 1 = 20 - 12 - 1 = 7。九岁孩子常见的错误是从左往右硬算（20-2=18，18*6…），这不是"数学差"，而是还没建立"运算有优先级"的规则意识。',
        demo: '把算式写在纸上，用圈把 2 * 6 圈起来："机器会先把圈里的算完，变成一个数，再继续。"然后现场把圈换成 12，让孩子接着算。',
        questions: [
          '算式里你打算最先算哪一小块？为什么？',
          '如果机器从左往右硬算，答案会变成多少？',
          '加个括号变成 (20 - 2) * 6 - 1，先算哪里？'
        ],
        misconceptions: [
          '从左到右硬算，忽略乘法优先。',
          '认为答错一次代表"数学不好"——本活动只观察，不据此分流编程路径。',
          '认为 * 是"星星符号"不是乘号（键盘上没有 × 键，程序里用 * 代替）。'
        ],
        rescueSteps: [
          '退回纯加减：先让孩子连做两题 a+b、a-b 建立信心。',
          '把算式抄在纸上，用彩笔圈出乘法块，物理上"先算圈内"。',
          '用实物讲：2 袋电池、每袋 6 节，"2 * 6"是先数出一共 12 节，再从 20 里扣。'
        ],
        extension: '给一题带括号的：(1 + 6) * 1 = 7，问"括号是干什么用的？"观察孩子能否说出"括号让里面先算"。'
      },
      compilerCheck: { enabled: true, expectedStdout: '7' }
    },

    /* =========================================================
     * 活动 4 · 16–25 分钟 · 状态与变量（trace + slots 组合）
     * 三档 program 刻意同为 stdout "5"
     * ========================================================= */
    {
      id: 'trial-04-state-variable',
      lessonId: 'trial',
      order: 4,
      minutes: [16, 25],
      title: '能量卡片会变身：认识变量',
      concept: '变量是保存"现在状态"的盒子；赋值 = 读旧值、算新值、写回去',
      learningObjective: '逐行追踪 energy 的变化；理解旧值与新值；改动一行后能重新预测最终值。',
      childPrompt: '搭档的能量装在一张会变身的卡片里。程序一行一行跑，卡片上的数字也一步一步变。你能在每一步之前猜中它吗？',
      dimensions: ['D3', 'D4'],
      activityType: 'trace',
      visualModel: 'energy',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '看屏幕中间：一张写着 energy（能量）的卡片。程序每走一行，卡片上的数字就换一次。我们一行一行走，每走一行前你先猜数字，猜完再看卡片变身！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 2 } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 3 } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            checkpoints: [
              { afterStep: 0, question: '第一行走完了，现在卡片上是几？', inputType: 'choice', options: ['2', '3', '5'], correct: '2' },
              { afterStep: 1, question: '这一行是"能量 = 能量 + 3"。卡片会变成几？', inputType: 'choice', options: ['3', '5', '23'], correct: '5' }
            ],
            followUp: {
              type: 'slots',
              goal: { type: 'finalVar', name: 'energy', value: 6 },
              slots: [
                { stepIndex: 1, path: 'expr.right', label: '把 +3 换成 + 几，最后能量正好是 6？', inputType: 'choice', choices: [3, 4, 5] }
              ]
            }
          },
          prediction: {
            question: '给"装能量的盒子"起名字，哪个一看就懂？',
            inputType: 'choice',
            options: ['energy（能量）', 'x'],
            correct: 'energy（能量）'
          },
          successCriteria: '孩子在两个检查点都能选对（或错后看动画自我纠正）；换数字任务能选出 4 让能量变成 6。'
        },
        S: {
          intro: '这次程序有三行会改动能量卡片：先装进 3，再加 4，再减 2。每走一行前，把你猜的数字填进去，走完对答案。最后我们改一行，看你能不能重新预测！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 3 } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 4 } } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '-', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 2 } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            checkpoints: [
              { afterStep: 0, question: '第一行走完，energy 是几？', inputType: 'number', correct: 3 },
              { afterStep: 1, question: '"energy = energy + 4"走完，energy 是几？它读的是旧值几？', inputType: 'number', correct: 7 },
              { afterStep: 2, question: '"energy = energy - 2"走完，energy 是几？', inputType: 'number', correct: 5 }
            ],
            followUp: {
              type: 'slots',
              goal: { type: 'finalVar', name: 'energy', value: 6 },
              slots: [
                { stepIndex: 1, path: 'expr.right', label: '只改第二行的加数，让最后能量正好是 6。该填几？', inputType: 'number' }
              ]
            }
          },
          prediction: {
            question: '装能量的盒子叫什么名字最合适？',
            inputType: 'choice',
            options: ['a', 'energy', 'shuzi123'],
            correct: 'energy'
          },
          successCriteria: '孩子三个检查点独立答对；改行任务能推出填 5（3+5-2=6），并说出"第二行读的是旧值 3"。'
        },
        A: {
          intro: '加速任务：这次有两张卡片——energy（能量）和 shield（护盾），它们还会互相影响！每一步之前，把两张卡片的数字都说出来。走完后我们改一行初始值，你重新预测最终能量。',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 3 } },
            { op: 'declare', varType: 'int', name: 'shield', expr: { kind: 'lit', value: 2 } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'energy' }, right: { kind: 'var', name: 'shield' } } },
            { op: 'assign', name: 'shield',
              expr: { kind: 'bin', op: '-', left: { kind: 'var', name: 'shield' }, right: { kind: 'lit', value: 1 } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            checkpoints: [
              { afterStep: 2, question: '"energy = energy + shield"走完，energy 是几？', inputType: 'number', correct: 5 },
              { afterStep: 3, question: '"shield = shield - 1"走完，shield 是几？energy 有没有跟着变？（填 energy 现在的值）', inputType: 'number', correct: 5 }
            ],
            followUp: {
              type: 'slots',
              goal: { type: 'finalVar', name: 'energy', value: 7 },
              slots: [
                { stepIndex: 1, path: 'expr', label: '只改 shield 的初始值，让最后 energy 正好是 7。shield 一开始该是几？', inputType: 'number' }
              ]
            }
          },
          prediction: {
            question: '第三行 energy = energy + shield 执行时，用的是 shield 的旧值还是新值？',
            inputType: 'choice',
            options: ['那一刻卡片上的值（旧值）', '后面才出现的新值'],
            correct: '那一刻卡片上的值（旧值）'
          },
          successCriteria: '孩子能同时追踪两个变量；能发现"shield 后来变了，energy 不会跟着变"；改初始值任务推出 4（3+4=7）。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是猜中卡片每一步的数字。现在这一行还没走，卡片上的数字是多少？' },
        { level: 'H2', text: '看等号右边：它用到的 energy 是"现在卡片上"的数字，也就是旧值。' },
        { level: 'H3', text: '按三步来：第一步读出旧值，第二步算出新数，第三步把新数写回卡片。你卡在哪一步？' },
        { level: 'H4', text: '换个例子：卡片上是 10，走一行"energy = energy + 2"，先读 10，算 10+2=12，卡片变 12。用同样三步走你的题。' },
        { level: 'H5', text: '老师带着走一行（大声念：读旧值→计算→写回），下一行让孩子自己念着走完并解释。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D3',
        note: '核心路径指标。逐检查点记录对错与提示档；重点观察是否会"回头看卡片当前值"（状态意识）。变量命名选择与"旧值/新值"的解释记 D4 佐证。A 档观察双变量是否互不干扰地追踪。'
      },
      teacherCards: {
        truth: '变量是有名字的存储位置，保存"现在的状态"。energy = energy + 4 不是数学等式，而是动作：读出旧值 3 → 计算 3+4=7 → 把 7 写回。孩子最大的坎是"同一个名字，值会变"。命名的意义：energy 让人一眼看懂盒子里装的是什么，x 则要靠猜。',
        demo: '拿一张真的纸卡写上 energy=3 放在桌上。念"energy = energy + 4"时，先指着卡片说"读到 3"，再口算"3+4=7"，然后划掉 3 写上 7："看，盒子还是这个盒子，里面的数换了。"',
        questions: [
          '这一行等号右边的 energy，指的是哪一刻的数字？',
          '为什么这个盒子叫 energy 不叫 x？哪个名字让别人更容易看懂？',
          '如果把加 4 和减 2 两行对调，最后的能量会变吗？为什么？'
        ],
        misconceptions: [
          '把 energy = energy + 4 当数学方程，觉得"两边不相等，写错了"。',
          '认为变量的值"全都记得"，不明白新值会覆盖旧值。',
          '（A 档）认为 shield 后来变了，之前算进 energy 的部分也会跟着变。'
        ],
        rescueSteps: [
          '退到纸卡片：老师念行，孩子当"卡片管理员"负责划旧写新，先做动作再谈概念。',
          '每行只问一个问题："现在卡片上是几？"不追问原理，先把追踪的动作练顺。',
          '减少行数：只留"装入 3"和"加 4"两行，追踪成功后再加回第三行。'
        ],
        extension: '问"如果第二行写成 energy = 4（没有旧值），最后是多少？"观察孩子能否区分"覆盖式赋值"和"基于旧值更新"。'
      },
      compilerCheck: { enabled: true, expectedStdout: '5' }
    },

    /* =========================================================
     * 活动 5 · 25–33 分钟 · 智能舱门与找错（bughunt：> 应为 >=）
     * program 存带 bug 版（直接运行输出 "门还是关的"）；
     * expectedStdout 是修好版（>=）的真实编译输出 "门开了！"（产品验证时机）
     * ========================================================= */
    {
      id: 'trial-05-door-bughunt',
      lessonId: 'trial',
      order: 5,
      minutes: [25, 33],
      title: '智能舱门的秘密：差一点点的规则',
      concept: '条件判断与边界：> 和 >= 只差"正好等于"那一格',
      learningObjective: '理解规则只在条件成立时执行；发现 energy > 5 在能量正好为 5 时不开门，改为 >= 修复。',
      childPrompt: '舱门是智能的：能量够了才开。可是今天能量明明满 5 格，门却不开！这一定是规则里藏了一个小 bug，把它揪出来！',
      dimensions: ['D5', 'D8'],
      activityType: 'bughunt',
      visualModel: 'door',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '舱门上有一盏判断灯：规则成立亮绿✓，不成立亮红✗。门的规则写着 energy > 5（能量大于 5 才开）。搭档现在正好有 5 格能量。先猜门开不开，再运行看灯，最后把有问题的地方点出来！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 5 } },
            { op: 'if',
              cond: { kind: 'bin', op: '>', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 5 } },
              then: [ { op: 'output', expr: { kind: 'lit', value: '门开了！' } } ],
              else: [ { op: 'output', expr: { kind: 'lit', value: '门还是关的' } } ] }
          ],
          interaction: {
            bug: {
              stepIndex: 1,
              wrongPiece: 'energy > 5',
              rightPiece: 'energy >= 5',
              whyChild: '"大于 5"不包括 5 自己，所以能量正好是 5 时，判断灯亮红✗，门不开。"大于或等于 5"（>=）才把 5 也算进去。'
            }
          },
          prediction: {
            question: '规则是"能量大于 5 才开门"。搭档正好有 5 格能量，门会开吗？',
            inputType: 'choice',
            options: ['会开', '不会开'],
            correct: '不会开'
          },
          successCriteria: '孩子看到红✗后能点中规则里的 > 符号说"问题在这"，并在老师帮助下说出"5 不算大于 5"。'
        },
        S: {
          intro: '维修任务来了！门的规则是 energy > 5，可是能量 5 格时门不开，宠物还等着救呢。先预测、再运行看判断灯，然后自己动手把规则改对，让 5 格能量也能开门。改完再运行一次验证！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 5 } },
            { op: 'if',
              cond: { kind: 'bin', op: '>', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 5 } },
              then: [ { op: 'output', expr: { kind: 'lit', value: '门开了！' } } ],
              else: [ { op: 'output', expr: { kind: 'lit', value: '门还是关的' } } ] }
          ],
          interaction: {
            bug: {
              stepIndex: 1,
              wrongPiece: 'energy > 5',
              rightPiece: 'energy >= 5',
              whyChild: 'energy > 5 问的是"能量比 5 多吗"，5 不比 5 多，所以是假，走了"门还是关的"那条路。改成 energy >= 5（大于或等于），5 也算够，门就开了。'
            }
          },
          prediction: {
            question: '能量正好 5 格，规则 energy > 5 是真还是假？',
            inputType: 'choice',
            options: ['真（门开）', '假（门不开）'],
            correct: '假（门不开）'
          },
          successCriteria: '孩子自己把 > 改成 >= 并重新运行验证成功；能解释"差的就是正好等于 5 这一种情况"。'
        },
        A: {
          intro: '这扇门更聪明：要能量够、还要有钥匙才开。规则是 energy > 5 而且 hasKey 是真。现在钥匙有了、能量正好 5 格，门却不开。先判断问题出在哪个条件，改对它，再做边界测试：把能量分别调成 4、5、6，验证三种情况门的表现都正确。',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 5 } },
            { op: 'declare', varType: 'bool', name: 'hasKey', expr: { kind: 'lit', value: true } },
            { op: 'if',
              cond: { kind: 'bin', op: '&&',
                left: { kind: 'bin', op: '>', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 5 } },
                right: { kind: 'var', name: 'hasKey' } },
              then: [ { op: 'output', expr: { kind: 'lit', value: '门开了！' } } ],
              else: [ { op: 'output', expr: { kind: 'lit', value: '门还是关的' } } ] }
          ],
          interaction: {
            bug: {
              stepIndex: 2,
              wrongPiece: 'energy > 5',
              rightPiece: 'energy >= 5',
              whyChild: '两个条件要同时为真门才开。hasKey 是真没问题；出错的是 energy > 5——能量正好 5 时它是假。改成 energy >= 5 后，5 格能量加钥匙就能开门；4 格时仍然不开，这才是设计想要的。'
            }
          },
          prediction: {
            question: '能量 5、有钥匙，规则是 energy > 5 而且 hasKey。哪个条件是假的？',
            inputType: 'choice',
            options: ['energy > 5 是假的', 'hasKey 是假的', '两个都是假的'],
            correct: 'energy > 5 是假的'
          },
          successCriteria: '孩子先定位到出错的子条件再修改；主动完成 4/5/6 三个边界测试并说出每种结果为什么正确。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是让 5 格能量也能开门。先看判断灯：现在它亮的是✓还是✗？' },
        { level: 'H2', text: '盯住规则里的 > 符号。"大于 5"这句话，把"正好等于 5"算进去了吗？' },
        { level: 'H3', text: '问自己：5 比 5 大吗？如果不大，那规则就是假，门就不开。要让 5 也过关，符号得换一个。' },
        { level: 'H4', text: '换个例子：游乐设施写"身高超过 120 才能玩"，正好 120 的小朋友能玩吗？要让他也能玩，牌子该怎么改？' },
        { level: 'H5', text: '老师展示：把 > 改成 >=，但先别运行——让孩子预测改完后 4、5、6 三种能量各自开不开，说对了再运行验证。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D5',
        note: '同时记 D8 佐证：是否先看判断灯/状态再猜原因（而不是乱改）；能否把问题定位到具体符号；改完是否主动重新运行验证。能自发提出"试试 4 和 6"记边界意识加分与 transfer_result。'
      },
      teacherCards: {
        truth: 'if 语句只在条件为真时执行分支；energy > 5 在 energy 为 5 时结果是假（5 不大于 5），>= 才包含相等。这类"差一"边界错误（off-by-one）是真实工程里最常见的 bug 之一。program 里放的就是带 bug 版本，运行输出"门还是关的"是正确的诊断起点，不是课件坏了。',
        demo: '在纸上画数轴 3、4、5、6、7：用手盖住 5 说"这是 > 5 的世界，5 自己进不来"；然后把手挪开说"这是 >= 5 的世界，5 也进来了"。再回屏幕运行对照判断灯。',
        questions: [
          '判断灯亮红✗，说明规则那句话是真还是假？',
          '> 和 >= 只差在哪一个数字上？',
          '改完以后，能量 4 格时门该开吗？怎么证明给我看？'
        ],
        misconceptions: [
          '认为"5 够大了，机器应该懂我的意思"——机器只按符号办事，不猜心思。',
          '认为门不开是程序坏了/电脑坏了，而不是规则写得不准。',
          '把 >= 读成"大于然后等于"两件事，不理解它是"两者满足其一即可"。'
        ],
        rescueSteps: [
          '先脱离代码玩口头游戏："大于 5 的数请举手：6 算吗？5 算吗？"用身体反应建立边界感。',
          '把数字改成 8 运行一次（门开了），再改回 5（门不开），对比"什么变了"，帮孩子锁定条件那一行。',
          '老师指着 > 直接问"5 > 5，真的还是假的？"把大问题缩成一个小判断。'
        ],
        extension: '追加一问："如果规则想要的就是必须超过 5、正好 5 不许开，那现在的程序算有 bug 吗？"引导孩子发现：bug 是"和想要的规则不一致"，不是符号本身有错。'
      },
      compilerCheck: { enabled: true, expectedStdout: '门开了！' }
    },

    /* =========================================================
     * 活动 6 · 33–43 分钟 · 函数机器（teach-transfer：充电机+3 → 护盾机器）
     * 三档演示 program 同为 stdout "5"
     * ========================================================= */
    {
      id: 'trial-06-function-machine',
      lessonId: 'trial',
      order: 6,
      minutes: [33, 43],
      title: '神奇函数机器：放进去，变出来',
      concept: '函数是"输入 → 处理 → 输出"的机器；同一台机器能处理不同输入',
      learningObjective: '通过充电机建立输入—处理—输出模型，并把它迁移到没见过的护盾机器上。',
      childPrompt: '基地里有一排神奇机器：放一个数进去，机器咔嚓处理一下，吐一个新数出来。学会看懂一台，你就能看懂一整排！',
      dimensions: ['D7', 'D9'],
      activityType: 'teach-transfer',
      visualModel: 'function',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '这台绿色的机器叫"充电机"。看好了：放进 2，机器咔嚓一下，出来 5！它肚子里的规则是"加 3"。我们再喂它几个数试试，然后你去看看旁边那台新机器。',
          program: [
            { op: 'declare', varType: 'int', name: 'power', expr: { kind: 'lit', value: 2 } },
            { op: 'assign', name: 'power',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'power' }, right: { kind: 'lit', value: 3 } } },
            { op: 'output', expr: { kind: 'var', name: 'power' } }
          ],
          interaction: {
            teach: {
              title: '充电机：肚子里的规则是 +3',
              script: [
                { say: '看这台充电机：左边是进口，右边是出口。', show: 'machine-idle' },
                { say: '放进 2……咔嚓！出来 5。它把 2 加了 3。', show: 'feed-2-out-5' },
                { say: '再放进 4……咔嚓！出来 7。还是加 3！', show: 'feed-4-out-7' },
                { say: '同一台机器，规则不变：不管放几，都加 3。', show: 'rule-plus-3' }
              ]
            },
            transfer: {
              question: '旁边这台蓝色的"护盾机器"，肚子里的规则是"加 2"。放进 4，会出来几？',
              inputType: 'choice',
              options: ['6', '7', '8'],
              correct: '6'
            }
          },
          prediction: {
            question: '先猜猜：充电机的规则是加 3，放进 10 会出来几？',
            inputType: 'choice',
            options: ['13', '30', '10'],
            correct: '13'
          },
          successCriteria: '孩子能用充电机的经验答对护盾机器的题，并说出"机器不一样，但都是放进去、处理、出来"。'
        },
        S: {
          intro: '充电机你已经看会了：放进 2 出来 5，放进 4 出来 7，规则是 +3。现在基地新装了一台"护盾机器"，规则是 +5。不用运行，直接算出它的输出，再想想：这两台机器哪里一样、哪里不一样？',
          program: [
            { op: 'declare', varType: 'int', name: 'power', expr: { kind: 'lit', value: 2 } },
            { op: 'assign', name: 'power',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'power' }, right: { kind: 'lit', value: 3 } } },
            { op: 'output', expr: { kind: 'var', name: 'power' } }
          ],
          interaction: {
            teach: {
              title: '充电机：输入 → +3 → 输出',
              script: [
                { say: '充电机的三件事：收到输入、按规则处理、送出输出。', show: 'machine-anatomy' },
                { say: '输入 2 → 处理 +3 → 输出 5。', show: 'feed-2-out-5' },
                { say: '输入 7 → 处理 +3 → 输出 10。规则从来不变，变的只是输入。', show: 'feed-7-out-10' }
              ]
            },
            transfer: {
              question: '护盾机器的规则是 +5。放进 4，输出是几？填数字。',
              inputType: 'number',
              correct: 9
            }
          },
          prediction: {
            question: '热身：充电机（+3）放进 6，出来几？',
            inputType: 'number',
            correct: 9
          },
          successCriteria: '孩子不看动画直接算对护盾机器输出，并能用"输入、处理、输出"三个词描述任何一台机器。'
        },
        A: {
          intro: '侦探任务：护盾机器的铭牌掉了，没人知道它的规则！只有两条实验记录——放进 3 出来 12，放进 5 出来 14。先推理出它的规则，再预测：放进 10 会出来几？小心，有一个"看起来也对"的陷阱规则哦。',
          program: [
            { op: 'declare', varType: 'int', name: 'power', expr: { kind: 'lit', value: 2 } },
            { op: 'assign', name: 'power',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'power' }, right: { kind: 'lit', value: 3 } } },
            { op: 'output', expr: { kind: 'var', name: 'power' } }
          ],
          interaction: {
            teach: {
              title: '充电机复习 + 侦探规则',
              script: [
                { say: '充电机：输入 2 → +3 → 输出 5。规则藏在机器肚子里，但可以靠实验猜出来。', show: 'feed-2-out-5' },
                { say: '侦探法则：一条记录可能对应好几种规则，两条记录就能排除假规则。', show: 'detective-rule' }
              ]
            },
            transfer: {
              question: '护盾机器：放进 3 出来 12，放进 5 出来 14。放进 10 会出来几？（先想想 3→12 是"乘 4"还是"加 9"，再用第二条记录检验）',
              inputType: 'number',
              correct: 19
            }
          },
          prediction: {
            question: '只看第一条记录"放进 3 出来 12"，下面哪两种规则都说得通？',
            inputType: 'choice',
            options: ['乘 4 和 加 9', '加 4 和 乘 9', '只有乘 4 说得通'],
            correct: '乘 4 和 加 9'
          },
          successCriteria: '孩子用第二条记录排除"乘 4"（5*4=20 不是 14），确认规则是 +9，答出 19，并解释排除过程。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是算出新机器的输出。先说说：这台机器的输入是几？它肚子里的规则是什么？' },
        { level: 'H2', text: '每台机器都做三件事：收输入、按规则处理、送输出。新机器只是规则不同，三件事一模一样。' },
        { level: 'H3', text: '把充电机那套办法照搬过来：先写下输入，再套上这台机器自己的规则算一步。' },
        { level: 'H4', text: '换个例子：有台"翻倍机"规则是乘 2，放进 6 出来 12。照这个套路，你的机器放进那个数会出来几？' },
        { level: 'H5', text: '老师带孩子把新机器的算式列在纸上（输入 □ → 规则 □ → 输出 □），填前两格，最后一格让孩子算并解释。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D7',
        note: '迁移表现同时记 D9（最重要的路径指标之一）：现场教完充电机后，孩子解护盾机器需要哪档支持（独立/一次概念提示/逐步示范），填 transfer_result。A 档另观察能否用第二条记录排除假规则（假设检验意识）。'
      },
      teacherCards: {
        truth: '函数机器是函数概念的具象版：输入=参数，处理=函数体，输出=返回值。演示程序 power=2; power=power+3; 输出 5，就是充电机的代码化身。诊断关键不是孩子会不会加法，而是模式能否迁移：换一台规则不同的机器，"输入→处理→输出"的框架还在不在。',
        demo: '用一个纸盒当机器：写着 +3 的充电机。孩子递进写着 2 的纸条，老师在盒子里换成 5 递出来。玩两轮后换一张 +5 的贴纸盖上去："机器还是这个盒子，规则换了。"然后回屏幕看代码版。',
        questions: [
          '充电机和护盾机器，哪里一模一样？哪里不一样？',
          '如果给充电机连续喂两次 2，两次的输出一样吗？为什么？',
          '你能发明一台自己的机器吗？说出它的规则和一组输入输出。'
        ],
        misconceptions: [
          '认为每台新机器都要从零学起，看不到"输入→处理→输出"的共同骨架。',
          '认为机器会记住上一次的输入（每次处理都是独立的）。',
          '（A 档）只用一条记录就断定规则，不会用第二条记录检验。'
        ],
        rescueSteps: [
          '回到充电机多喂几个数（1、5、10），让孩子抢答输出，把"规则不变"练到脱口而出。',
          '把三件事画成三个格子：输入□ 处理□ 输出□，每题都先填格子再回答。',
          '老师演示护盾机器的第一个数，第二个数让孩子接手（半迁移过渡）。'
        ],
        extension: '倒着玩："护盾机器（+5）吐出了 12，刚才放进去的是几？"观察孩子能否逆向运算（为反推参数和调试打底）。'
      },
      compilerCheck: { enabled: true, expectedStdout: '5' }
    },

    /* =========================================================
     * 活动 7 · 43–51 分钟 · 场景分解（ordering + choice 组合）
     * ========================================================= */
    {
      id: 'trial-07-scene-decompose',
      lessonId: 'trial',
      order: 7,
      minutes: [43, 51],
      title: '大救援计划：把任务拆成步骤和规则',
      concept: '问题分解：把一个大场景拆成有顺序的步骤，并识别其中的"判断规则"',
      learningObjective: '将"救出宠物"的场景拆成正确顺序的步骤；区分"动作"和"判断"；检查计划有没有漏洞。',
      childPrompt: '终于到了救援时刻！救出太空宠物要做好几件事：拿钥匙、检查能量、开门、救出宠物……把计划排清楚，一步都不能乱！',
      dimensions: ['D6', 'D5'],
      activityType: 'ordering',
      visualModel: 'scene',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '救援计划板上有四张步骤卡：拿钥匙、检查能量、开门、救出宠物。把它们按先后顺序摆到计划板上。摆好后还有一个小问题等着你：这四张卡里，有一张和其他三张不一样哦。',
          program: null,
          interaction: {
            items: [
              { id: 'key',    label: '拿钥匙', icon: '🔑' },
              { id: 'check',  label: '检查能量够不够', icon: '🔋' },
              { id: 'open',   label: '开门', icon: '🚪' },
              { id: 'rescue', label: '救出宠物', icon: '🐾' }
            ],
            correctOrder: ['key', 'check', 'open', 'rescue'],
            followUp: {
              type: 'choice',
              question: '哪一张卡不是"做动作"，而是"问一个问题再决定"？',
              options: [
                { id: 'q-key',   label: '拿钥匙' },
                { id: 'q-check', label: '检查能量够不够', correct: true },
                { id: 'q-open',  label: '开门' }
              ],
              multi: false
            }
          },
          prediction: {
            question: '救出宠物这张卡，应该排在第一张还是最后一张？',
            inputType: 'choice',
            options: ['第一张', '最后一张'],
            correct: '最后一张'
          },
          successCriteria: '孩子摆出合理顺序（检查能量在开门前即可），并在提示下指出"检查能量"是在问问题、不是做动作。'
        },
        S: {
          intro: '这次的计划板有五张卡，多了一张"走到舱门前"。先排好顺序，再回答两个计划师问题：哪一步是"判断"？如果检查发现能量不够，一个好计划应该怎么办？',
          program: null,
          interaction: {
            items: [
              { id: 'key',    label: '拿钥匙', icon: '🔑' },
              { id: 'walk',   label: '走到舱门前', icon: '👣' },
              { id: 'check',  label: '检查能量够不够', icon: '🔋' },
              { id: 'open',   label: '开门', icon: '🚪' },
              { id: 'rescue', label: '救出宠物', icon: '🐾' }
            ],
            correctOrder: ['key', 'walk', 'check', 'open', 'rescue'],
            followUp: {
              type: 'choice',
              question: '如果"检查能量"发现能量不够，好的计划接下来应该做什么？',
              options: [
                { id: 'q-force', label: '不管它，硬开门' },
                { id: 'q-charge', label: '先去充电，再回来重新检查', correct: true },
                { id: 'q-quit',  label: '直接放弃救援' }
              ],
              multi: false
            }
          },
          prediction: {
            question: '"检查能量"这张卡放在"开门"的前面还是后面才有用？',
            inputType: 'choice',
            options: ['前面', '后面', '都一样'],
            correct: '前面'
          },
          successCriteria: '孩子独立排出五步顺序；能说出"检查是判断，判断要放在动作之前才有用"，并为"能量不够"补出合理的备用路线。'
        },
        A: {
          intro: '总指挥任务：六张卡（有的是动作，有的是判断），先排出完整计划。然后当一回"漏洞审查员"：这份计划里哪个判断漏了会最危险？如果宠物身边有警报器，计划还要加什么规则？',
          program: null,
          interaction: {
            items: [
              { id: 'scan',   label: '扫描房间找到宠物位置', icon: '📡' },
              { id: 'key',    label: '拿钥匙', icon: '🔑' },
              { id: 'walk',   label: '走到舱门前', icon: '👣' },
              { id: 'check',  label: '检查能量够不够', icon: '🔋' },
              { id: 'open',   label: '开门', icon: '🚪' },
              { id: 'rescue', label: '救出宠物', icon: '🐾' }
            ],
            correctOrder: ['scan', 'key', 'walk', 'check', 'open', 'rescue'],
            followUp: {
              type: 'choice',
              question: '如果整份计划里删掉"检查能量够不够"，最可能发生什么？',
              options: [
                { id: 'q-fine',  label: '没影响，照样成功' },
                { id: 'q-stuck', label: '能量不足时开门失败，搭档卡在门口', correct: true },
                { id: 'q-fast',  label: '计划反而更快更安全' }
              ],
              multi: false
            }
          },
          prediction: {
            question: '这六张卡里，有几张是"判断"（问问题再决定），不是"动作"？',
            inputType: 'number',
            correct: 1
          },
          successCriteria: '孩子独立排出六步；能区分动作与判断；能推演"删掉判断"的后果，并主动为新情况（警报器）口头补出一条新规则。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '目标是排出一份不会失败的救援计划。最后一张卡应该是什么？先把终点定下来。' },
        { level: 'H2', text: '每张卡问自己一句："做这件事之前，必须先做完哪件事？"比如开门之前，手里得有什么？' },
        { level: 'H3', text: '先把"拿钥匙"和"救出宠物"放到头尾，中间只剩几张卡，一张张试。' },
        { level: 'H4', text: '想想泡面计划：烧水→撕开面饼→看水开了没→下面。"看水开了没"是不是和其他步骤不太一样？它在问问题！' },
        { level: 'H5', text: '老师摆出前一半计划，让孩子接着摆后一半，每放一张说一句"因为前面已经……所以现在可以……"。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D6',
        note: '项目能力指标。记录：拆步是否有序；能否识别"检查能量"是条件（记 D5 佐证）；能否发现漏判断的风险（遗漏检查意识）。孩子若自发提出"能量不够先去充电"这类分支路线，记高质量证据并录原话。'
      },
      teacherCards: {
        truth: '分解是把大问题拆成可执行的小步骤；步骤分两类——动作（做事）和判断（问问题决定走哪条路）。"检查能量"就是未来 if 语句的种子。好计划的标志：顺序合理 + 关键判断没有遗漏 + 判断失败时有出路。',
        demo: '把计划念成一个"如果"句子给孩子听："先拿钥匙，走到门前，如果能量够就开门救宠物。"重音放在"如果"上，然后问："这个"如果"对应计划板上的哪张卡？"',
        questions: [
          '为什么"检查能量"要放在"开门"前面？放在后面还有用吗？',
          '这份计划里，哪些卡是"做事"，哪张卡是"问问题"？',
          '如果钥匙不见了，你的计划会卡在哪一步？要加什么新步骤？'
        ],
        misconceptions: [
          '把判断当成普通动作，感觉不到"检查"会让计划走向不同的路。',
          '认为步骤顺序"差不多就行"，没有意识到某些步骤有严格的先后依赖。',
          '计划只写成功路线，从不考虑"检查不通过怎么办"。'
        ],
        rescueSteps: [
          '把卡减到三张（拿钥匙、开门、救宠物），排对后再逐张加回判断卡。',
          '让孩子闭上眼，老师念一份乱序计划，孩子喊"停！"指出第一处不对劲的地方。',
          '演出来：老师扮搭档严格照孩子的计划行动，缺什么就真的卡住，让漏洞自己现形。'
        ],
        extension: '追问："如果要救的宠物有三只，分别在三扇门后面，计划要抄三遍吗？有没有更聪明的办法？"为循环与函数复用埋下伏笔。'
      },
      compilerCheck: { enabled: false, expectedStdout: '' }
    },

    /* =========================================================
     * 活动 8 · 51–56 分钟 · 动态挑战（三档交互差异最大化）
     * E=ordering 图块 / S=slots 补代码 / A=freeEdit 调试短 C++
     * S 档 program stdout "10"
     * ========================================================= */
    {
      id: 'trial-08-dynamic-challenge',
      lessonId: 'trial',
      order: 8,
      minutes: [51, 56],
      title: '终极挑战：启动返航飞船',
      concept: '综合运用：在当前支架的最高难度上独立完成一个小任务',
      learningObjective: '在尽量少提示的条件下探明孩子的当前上限、独立性与代码经验真实性。',
      childPrompt: '宠物救出来了，最后一件事——启动飞船返航！这是给你的专属挑战，尽量自己完成，搭档相信你！',
      dimensions: ['D9', 'D8'],
      activityType: 'slots',
      visualModel: 'energy',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '返航前的最后检查！这里有四块指令积木：检查燃料、关舱门、系安全带、点火起飞。想一想哪个必须最后做，把它们排成安全的启动顺序，然后运行看飞船起飞动画！',
          program: null,
          activityTypeOverride: 'ordering',
          interaction: {
            items: [
              { id: 'fuel',   label: '检查燃料', icon: '⛽' },
              { id: 'hatch',  label: '关好舱门', icon: '🚪' },
              { id: 'belt',   label: '系安全带', icon: '🪢' },
              { id: 'launch', label: '点火起飞', icon: '🚀' }
            ],
            correctOrder: ['fuel', 'hatch', 'belt', 'launch']
          },
          prediction: {
            question: '四件事里，哪一件必须放在最后？',
            inputType: 'choice',
            options: ['检查燃料', '点火起飞', '关好舱门'],
            correct: '点火起飞'
          },
          successCriteria: '孩子尽量不靠提示排出安全顺序（点火必须最后；舱门在起飞前关好），并说出一条"为什么"。'
        },
        S: {
          intro: '飞船引擎需要正好 10 格能量才能起飞！现在能量是 6 格。代码里有两个空槽：一个加能量、一个放掉多余的能量。把两个空槽填上合适的数字，让最后的能量正好等于 10。先心算验证，再运行！',
          program: [
            { op: 'declare', varType: 'int', name: 'energy', expr: { kind: 'lit', value: 6 } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '+', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 6 } } },
            { op: 'assign', name: 'energy',
              expr: { kind: 'bin', op: '-', left: { kind: 'var', name: 'energy' }, right: { kind: 'lit', value: 2 } } },
            { op: 'output', expr: { kind: 'var', name: 'energy' } }
          ],
          interaction: {
            goal: { type: 'finalVar', name: 'energy', value: 10 },
            slots: [
              { stepIndex: 1, path: 'expr.right', label: '充能：加几格？', inputType: 'number' },
              { stepIndex: 2, path: 'expr.right', label: '放气减压：放掉几格？', inputType: 'number' }
            ]
          },
          prediction: {
            question: '起飞需要 10 格，现在有 6 格。加的数减去放掉的数，合起来应该等于几？',
            inputType: 'number',
            correct: 4
          },
          successCriteria: '孩子独立填出一组让能量等于 10 的数字（如加 6 放 2、加 5 放 1），运行验证成功，并能解释自己的算法。'
        },
        A: {
          intro: '真正的加速挑战：下面是一段真的 C++ 启动程序，但它有 bug——明明能量足够，屏幕却打出"能量不足"。这是控制台模式：你可以自由修改代码，然后用"真实C++验证"运行。规则只有一条：最多改动一行，让飞船打印"启动成功"。改之前先说出你的诊断！',
          program: null,
          activityTypeOverride: 'freeEdit',
          interaction: {
            starterCode: '#include <iostream>\n\nint main() {\n    int energy = 8;\n    energy = energy - 3;\n    if (energy > 5) {\n        std::cout << "启动成功";\n    } else {\n        std::cout << "能量不足";\n    }\n    return 0;\n}\n',
            goal: '只改动一行，让程序打印出"启动成功"。改之前先说出：现在 energy 走到 if 那一行时是几？为什么走进了 else？',
            consoleMode: true
          },
          prediction: {
            question: '先诊断：程序走到 if 那一行时，energy 的值是几？',
            inputType: 'number',
            correct: 5
          },
          successCriteria: '孩子先追踪出 energy=5、说出 5 > 5 为假，再选一种一行修法（如 > 改 >=、-3 改 -2、>5 改 >4）并编译验证打印出"启动成功"。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '这是你的专属挑战！先用自己的话说说：任务要达到的目标是什么？' },
        { level: 'H2', text: '先弄清"现在"：现在的能量（或顺序）是什么状态？离目标还差多少？' },
        { level: 'H3', text: '把任务拆成两小步：先让数字（或顺序）接近目标，再微调最后一步。先做第一小步。' },
        { level: 'H4', text: '换个数字想：如果现在是 3 格、目标 5 格，你会怎么办？用同样的想法回到你的题。' },
        { level: 'H5', text: '老师完成第一处改动并解说思路，剩下的改动与验证必须由孩子完成并解释为什么这样改。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D9',
        note: '本活动的提示使用情况是判断"当前上限"的关键：记录首个提示出现在哪一步、每档提示后能否推进。A 档同时验证"自称学过"的真实性（能否读代码、追踪值、定位 bug），佐证记 D8；若 A 档明显吃力，这是 5.3 限制条款的直接证据（自称学过但追不了状态，不进加速线）。'
      },
      teacherCards: {
        truth: '这是压力测试位：同一个"启动飞船"目标，三档给出完全不同的操作面。E 考顺序综合，S 考"目标值反推填数"（6+x-y=10 有多组解，任何一组都算对），A 考真实代码调试（energy=8-3=5，5>5 为假所以走 else；>= 是最优雅的一行修法）。观察重点是独立性：先让孩子撑一撑，不要急着给提示。',
        demo: '开场只说一句"这次搭档不帮忙了，你是主驾驶"，然后明显地退后一步（物理上退后），把键盘鼠标完全交给孩子，计时观察 60 秒内孩子的第一个动作。',
        questions: [
          '你打算先做什么？为什么从这里下手？',
          '怎么证明你已经完成了任务？带我看证据。',
          '如果再来一次，你会用不同的做法吗？'
        ],
        misconceptions: [
          '（S 档）认为两个空槽只有唯一答案，不敢填自己算的组合——其实等式成立即可。',
          '（A 档）不追踪值就乱改代码碰运气（改一处运行一次连蒙带猜）。',
          '认为求助等于失败——要说明"选对提示"也是本领（记 D11）。'
        ],
        rescueSteps: [
          '孩子完全僵住 60 秒以上：只重复一遍任务目标（H1 级），不给方法。',
          'S 档卡住：把目标改成"先让能量变成 12，别管放气"，拆成单槽任务成功后再合并。',
          'A 档读不动代码：老师逐行念代码（不解释），让孩子当"卡片管理员"报 energy 的值，把任务降为带读追踪。'
        ],
        extension: '完成得快的孩子：E 档问"如果忘了关舱门，应该在哪一步之前发现？"；S 档追加"再想一组不同的数字也让能量等于 10"；A 档追加"把修好的规则改成必须严格超过 5 格才起飞，哪种改法最诚实？"'
      },
      compilerCheck: { enabled: true, expectedStdout: '10' }
    },

    /* =========================================================
     * 活动 9 · 56–60 分钟 · 孩子讲解与反馈（explain + 兴趣选择）
     * ========================================================= */
    {
      id: 'trial-09-child-explain',
      lessonId: 'trial',
      order: 9,
      minutes: [56, 60],
      title: '小教练时间：讲给搭档听',
      concept: '元认知与表达：能讲明白，才是真的懂',
      learningObjective: '孩子选择最喜欢的任务，向机器人讲明白一个概念；同时收集兴趣走向作为下一课主题依据。',
      childPrompt: '救援成功！搭档有个小请求：它今天跟着你闯了这么多关，却还没搞懂其中的道理。挑一个你最喜欢的任务，当一回小教练，讲到它点头为止！',
      dimensions: ['D11', 'D10'],
      activityType: 'explain',
      visualModel: 'none',
      coreDiagnostic: true,
      variants: {
        E: {
          intro: '搭档歪着头问："今天哪一关你最喜欢呀？能教教我吗？"你可以用说的，老师帮你记下来。开头接不上没关系，下面有几个"开头句"帮你起步。',
          program: null,
          interaction: {
            prompt: '挑一个你最喜欢的任务，给搭档讲明白里面的一个道理。',
            sentenceStarters: [
              '我最喜欢的任务是……因为……',
              '要先……然后才能……',
              '能量卡片上的数字会……',
              '门不开是因为……'
            ],
            minWords: 0,
            followUp: {
              type: 'choice',
              question: '下一次的任务，你最想要哪种？',
              options: [
                { id: 'game',  label: '🎮 定规则的游戏' },
                { id: 'story', label: '📖 有角色的故事' },
                { id: 'robot', label: '🤖 机器人与机械' },
                { id: 'build', label: '🏗️ 建造和创造' },
                { id: 'math',  label: '🧮 数学挑战' },
                { id: 'debug', label: '🔍 找错解谜' },
                { id: 'show',  label: '🌟 展示给大家看' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子借助开头句说出至少一句完整的讲解（说清一个"先后"或"变化"即可），并选出下次想要的任务类型。'
        },
        S: {
          intro: '搭档说："请当我的小教练！讲明白一个今天的道理，再考考我。"讲完后出一道小问题考搭档（老师扮演搭档回答），看看它有没有听懂你的课。',
          program: null,
          interaction: {
            prompt: '选一个任务讲明白它的道理，讲完出一道小问题考考搭档。',
            sentenceStarters: [
              '这个任务的关键是……',
              '很多人以为……其实……',
              '如果不这样做，就会……',
              '我考考你：如果……会怎么样？'
            ],
            minWords: 0,
            followUp: {
              type: 'choice',
              question: '下一次的任务，你最想要哪种？',
              options: [
                { id: 'game',  label: '🎮 定规则的游戏' },
                { id: 'story', label: '📖 有角色的故事' },
                { id: 'robot', label: '🤖 机器人与机械' },
                { id: 'build', label: '🏗️ 建造和创造' },
                { id: 'math',  label: '🧮 数学挑战' },
                { id: 'debug', label: '🔍 找错解谜' },
                { id: 'show',  label: '🌟 展示给大家看' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子能用 2-3 句话讲清一个概念（含一个"为什么"），并主动出题考搭档；选出下次任务类型。'
        },
        A: {
          intro: '搭档想请你录一堂"一分钟微课"：讲明白今天的一个概念，并且回答它的刁钻追问——"如果反过来会怎样？"讲得让一个没上过今天课的小朋友也能听懂，才算过关！',
          program: null,
          interaction: {
            prompt: '开讲你的一分钟微课：选一个概念，讲明白它，并准备回答"如果反过来/换个数字会怎样"。',
            sentenceStarters: [
              '这个概念用一句话说就是……',
              '举个例子……换个数字也一样……',
              '它最容易搞错的地方是……',
              '如果反过来做，结果会……'
            ],
            minWords: 20,
            followUp: {
              type: 'choice',
              question: '下一次的任务，你最想要哪种？',
              options: [
                { id: 'game',  label: '🎮 定规则的游戏' },
                { id: 'story', label: '📖 有角色的故事' },
                { id: 'robot', label: '🤖 机器人与机械' },
                { id: 'build', label: '🏗️ 建造和创造' },
                { id: 'math',  label: '🧮 数学挑战' },
                { id: 'debug', label: '🔍 找错解谜' },
                { id: 'show',  label: '🌟 展示给大家看' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子能连贯讲解一个概念、自带例子，并能接住一个"如果……会怎样"的追问；选出下次任务类型。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '先别想"怎么讲"，先挑：今天哪一关让你玩得最开心？就讲它！' },
        { level: 'H2', text: '想想那一关里"最重要的一件事"是什么？顺序？能量卡片？还是那个 > 符号？' },
        { level: 'H3', text: '用这个句式开头就行："要……必须先……，因为……"，把空填上，你的讲解就成了一半。' },
        { level: 'H4', text: '假装搭档是个一年级的小朋友，一个词都不懂。你会先给它看什么、再说什么？' },
        { level: 'H5', text: '老师先示范讲 30 秒（故意讲得平平），让孩子来挑毛病并讲一个更好的版本。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D11',
        note: '记录孩子的讲解原话（answer_or_code），标注：讲的是操作（我点了这里）还是概念（因为旧值先被读出来）；能否描述"我哪里最难/我哪里还不懂"。兴趣选择追加写入 session.lessons.trial.interests。坚持度与情绪记 D10 佐证，不贴性格标签。'
      },
      teacherCards: {
        truth: '能解释是评分尺度里 3 级的标志。讲解质量分层：复述操作 < 描述现象 < 说出因果 < 举出新例子。此环节同时是下一课的选题会：孩子的讲解内容 + 兴趣选择，直接写进家长报告的"兴趣与参与方式"和"推荐起点"。',
        demo: '老师扮演"笨搭档"，故意听错："哦！我懂了，先开门再捡电池对吧？"观察孩子会不会纠正你、怎么纠正——纠正的质量就是理解的深度。',
        questions: [
          '你讲的这个道理，能再举一个今天没出现过的新例子吗？',
          '今天哪一关最难？难在哪一步？',
          '如果下次还有更难的关卡，你想先学会什么再去挑战？'
        ],
        misconceptions: [
          '孩子复述操作步骤（"我先点了这个再点了那个"）被误当成概念理解——要追问"为什么"。',
          '孩子讲不出来被误判为不懂——可能是表达通道问题，换成"你演示、我配音"再观察。',
          '把活泼或安静当成能力信号——参与方式只记录，不评分。'
        ],
        rescueSteps: [
          '让孩子边操作边讲："你做给我看，嘴巴跟上手。"动作会带出语言。',
          '给二选一的支架："门不开，是因为能量不够，还是因为规则里的符号？"让讲解从选择开始。',
          '老师讲一半突然停住："然后呢？"把接力棒递给孩子补完最后一句。'
        ],
        extension: '请孩子给今天的冒险起一个"电影名字"，并预告续集："下一集你觉得会发生什么？"把兴趣线索再挖深一层。'
      },
      compilerCheck: { enabled: false, expectedStdout: '' }
    },

    /* =========================================================
     * 活动 10 · 试听末尾附加 · AI 协作习惯观察（方案 11.2）
     * 单列观察项，不计入核心编程能力；结果存 lessons.trial.aiHabit
     * ========================================================= */
    {
      id: 'trial-10-ai-habit',
      lessonId: 'trial',
      order: 10,
      minutes: [58, 60],
      title: '彩蛋任务：向 AI 帮手求助',
      concept: 'AI 协作习惯：怎样描述问题、是否索要答案、是否验证建议',
      learningObjective: '单列观察孩子与 AI 帮手协作的自然习惯：描述问题的方式、对答案的态度、验证意识。不计入核心编程能力。',
      childPrompt: '飞船上还有一位神秘乘客——AI 帮手"星星"。假如刚才那扇打不开的门又坏了，你会怎么向星星求助呢？',
      dimensions: ['D11'],
      activityType: 'explain',
      visualModel: 'none',
      coreDiagnostic: false,
      aiHabit: true,
      variants: {
        E: {
          intro: '星星是一位 AI 帮手，它没看到刚才发生的事。假装门又打不开了，你会对星星说什么？用嘴巴说就行，老师帮你把话带给星星（由老师扮演星星回应）。',
          program: null,
          interaction: {
            prompt: '把门打不开的问题，讲给没在现场的星星听，让它能帮上忙。',
            sentenceStarters: [
              '星星你好，我的门……',
              '我想让它……可是它……',
              '我已经试过……'
            ],
            minWords: 0,
            followUp: {
              type: 'choice',
              question: '星星给了你一个建议："试试把符号改一改。"你接下来会做什么？',
              options: [
                { id: 'copy',   label: '直接照它说的改，改完就算修好了' },
                { id: 'verify', label: '先改改看，运行一下，亲眼确认门开没开' },
                { id: 'why',    label: '先问星星：为什么要这样改？' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子愿意开口向星星描述问题（哪怕只有一句），并在选择题里做出选择（无对错，仅记录习惯）。'
        },
        S: {
          intro: '星星是 AI 帮手，但它有个特点：你的问题描述得越清楚，它帮得越准。假装门又打不开了，试着把"发生了什么、你想要什么、你试过什么"都告诉它。然后看看你会怎么对待它的建议。',
          program: null,
          interaction: {
            prompt: '向星星求助：说清楚发生了什么、你想要什么结果、你已经试过什么。',
            sentenceStarters: [
              '现在的情况是……',
              '我想要的结果是……',
              '我已经试过……但是……'
            ],
            minWords: 0,
            followUp: {
              type: 'choice',
              question: '星星回答："大概是第 2 行的问题吧。"你接下来最想做什么？',
              options: [
                { id: 'copy',   label: '让星星直接把正确代码写出来给我抄' },
                { id: 'verify', label: '自己去看第 2 行，检查星星说得对不对' },
                { id: 'ignore', label: '不理它，随便改改试试' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子的求助包含至少两个要素（现象/目标/已尝试），并对星星的建议表现出检查或追问的倾向（仅记录，无对错）。'
        },
        A: {
          intro: '高级挑战：星星很聪明，但它偶尔也会说错。假装门又打不开了，先向它求助；等它给出建议后，你要判断——它说得对吗？怎么证明？记住：AI 的话不是标准答案，运行结果才是。',
          program: null,
          interaction: {
            prompt: '向星星描述问题并求助；拿到建议后，说出你打算怎么验证它对不对。',
            sentenceStarters: [
              '我的问题是……我期待的是……实际发生的是……',
              '星星的建议是……我觉得它对/不对，因为……',
              '要验证它，我可以……'
            ],
            minWords: 15,
            followUp: {
              type: 'choice',
              question: '星星说："把 energy > 5 改成 energy == 5 就行。"这个建议其实有漏洞，你会怎么发现它？',
              options: [
                { id: 'copy',   label: '相信星星，直接改' },
                { id: 'test',   label: '改完用 4、5、6 三种能量各跑一次，看哪种出问题' },
                { id: 'ask',    label: '再问一次星星"你确定吗"，它说确定就改' }
              ],
              multi: false
            }
          },
          prediction: null,
          successCriteria: '孩子能结构化描述问题，并主动提出验证方法（如多组输入测试）；能意识到 == 5 会让 6 格能量反而开不了门（仅记录判断过程）。'
        }
      },
      hintLadder: [
        { level: 'H1', text: '星星没看到刚才的事。先告诉它：出问题的是哪个东西？' },
        { level: 'H2', text: '帮手最想知道三件事：发生了什么、你想要什么、你试过什么。先说第一件。' },
        { level: 'H3', text: '照这个模板说："我的门____，我想让它____，我试过____。"' },
        { level: 'H4', text: '想象你给朋友打电话修玩具：只说"坏了"他帮不上，说"按了按钮灯不亮"他就懂了。跟星星也一样。' },
        { level: 'H5', text: '老师示范一次"糟糕的求助"（只说"它坏了快帮我"），让孩子指出缺了什么信息，再自己说一个更好的版本。', teacherOnly: true }
      ],
      evidenceRule: {
        dimension: 'D11',
        note: '单列为"AI 协作习惯"，不计入核心编程能力，结果写入 session.lessons.trial.aiHabit。观察四点：如何描述问题（只喊坏了/说清现象目标）；是否直接索要完整答案；能否判断 AI 建议的对错；是否想到运行验证。followUp 选项无标准答案，选什么记什么，不评分。'
      },
      teacherCards: {
        truth: '本活动依据方案 11.2：核心诊断完成后才进行，避免污染基线。观察的是习惯而非能力：好的 AI 协作 = 描述清楚 + 不盲抄 + 用运行结果验证。老师扮演"星星"回应时保持中性，可以故意给一个略有瑕疵的建议（如 == 5），观察孩子的反应。结果单列，绝不写进能力维度分。',
        demo: '老师扮星星，用固定腔调回应。若孩子只说"门坏了"，星星回答："我知道了！可是……哪扇门呀？它怎么了呀？"用角色扮演自然引出"描述要具体"，不说教。',
        questions: [
          '星星和老师有什么不一样？它什么时候可能说错？',
          '如果星星给的建议改完还是不行，你下一步做什么？',
          '什么时候适合问星星，什么时候适合自己再试试？'
        ],
        misconceptions: [
          '认为 AI 永远是对的，建议直接照抄不验证。',
          '认为问 AI 是作弊——要说明"会求助、会验证"本身就是本领。',
          '把"让 AI 直接给答案"当成最快的路（观察但不当场批评，记录习惯即可）。'
        ],
        rescueSteps: [
          '孩子不知道说什么：老师先示范一个"半好"的求助，让孩子补上缺的那一半信息。',
          '孩子只想要答案：星星回应"我可以给你一个小线索哦"，观察孩子接受线索还是坚持要答案。',
          '孩子紧张不敢跟"AI"说话：改为写小纸条/老师转述，降低社交压力。'
        ],
        extension: '和孩子约定一句"AI 求助咒语"（说清现象、目标、已试过的），告诉他以后的课里见到真的 AI 帮手时，这句咒语同样管用。'
      },
      compilerCheck: { enabled: false, expectedStdout: '' }
    }
  ]
};

if (typeof module !== 'undefined' && module.exports) { module.exports = CppLab.content.trial; }
