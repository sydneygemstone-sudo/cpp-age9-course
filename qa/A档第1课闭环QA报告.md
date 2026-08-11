# A 档第 1 课闭环 QA 报告

- 结果：不通过：产品正常路径存在严重阻断；恢复后状态达到 8/8
- 档位 / 主题：A 加速档 / 机器人世界
- 运行时间：2026/8/11 13:33:07（Australia/Sydney）
- 浏览器执行器：`/private/tmp/cpplab-playwright-browsers/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`
- CDP 浏览器版本：`HeadlessChrome/145.0.7632.6`

## 逐活动结果

1. **回到任务世界** / 点击“只保存现在的值/旧值会被新值盖掉”选项 / done=1/8 / 1.22 秒
2. **命令排队** / 输入预测 2 → 提交 → 用“上移”排成建立盒子/+4/-1/报告 → 检查顺序 / done=2/8；DONE | 1📦 建立能量盒，先放进  > 2⚡ 吃到能量豆，获得 4  > 3🔦 打开探照灯，使用 1 > 4📢 向屏幕报告现在的能量 / 3.19 秒
3. **能量盒** / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,answer,step,answer,chip => READY） / done=3/8 / 4.12 秒
4. **代码透视镜** / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,answer,step,step,answer => READY） / done=4/8 / 3.22 秒
5. **正好到 10** / 预测 → 单步执行 → 回答检查点（轨迹：predict,slot:boost 的值：1,slot-ok,step,step,step,step,step => READY） / done=5/8 / 3.66 秒
6. **真实 C++** / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,step,step => READY） / done=6/8 / 2.20 秒
7. **我的改造** / 选蓝色圆滚滚 → 出发能量 2 → 依次选 +4、-1、×2 → 保存 → 真实 C++ 验证 → 因产品丢失下一关按钮而刷新/继续恢复 / card=10/verified=true/events=3；transition=BLOCKED_THEN_RECOVERED / 17.36 秒
8. **讲给机器人听** / dump 真实 DOM → 点击“等号的右边先…”句子开头 → 输入 A 档双变量解释 → “我讲完啦” → “去领我的徽章” / done=8/8；badge=🏅 去领我的徽章！；end=今天的探险完成啦！ / 3.22 秒

## 8 关完成清单与作品卡

1. ✅ `lesson1-01-return-world`
2. ✅ `lesson1-02-command-queue`
3. ✅ `lesson1-03-energy-box`
4. ✅ `lesson1-04-code-xray`
5. ✅ `lesson1-05-reach-ten`
6. ✅ `lesson1-06-real-cpp`
7. ✅ `lesson1-07-my-remix`
8. ✅ `lesson1-08-teach-robot`

```json
{
  "title": "闪电小队长 的作品",
  "skin": "robo-blue",
  "initialEnergy": 2,
  "events": [
    "吃到能量豆（能量 +4）",
    "打开探照灯（能量 -1）",
    "太阳能加倍（能量 ×2）"
  ],
  "finalEnergy": 10,
  "explanation": "从 2 出发，先加 4、再减 1，最后乘 2，正好是 10。",
  "focusCode": "int energy = 2;\nenergy = energy + 4;\nenergy = energy - 1;\nenergy = energy * 2;\nstd::cout << energy;",
  "verified": true,
  "savedAt": "2026-08-11T03:32:52.155Z"
}
```

## 1. 活动 8 结论与证据

**(b) 产品/内容问题。** 活动 8 本身可完成；真正阻断发生在活动 7 的“先保存、后真实验证”路径：保存后原本存在的“下一个任务！”被验证结果反馈清空，孩子无法用正常页面交互进入活动 8。QA 通过刷新并点击“继续我的任务”做了显式恢复，才继续验证活动 8。

正常路径的直接证据：保存后输出为 `下一个任务！`，真实验证结束后为 `NO_NEXT_BUTTON`。验证后页面真实 DOM：

```json
{
  "当前任务": "任务 7 / 8",
  "页面标题": "我的改造",
  "反馈区": "🎉 真实C++编译通过！作品卡打上了「已通过真实 C++ 验证」的印章！",
  "可见按钮": [
    "⚡机器人能量站：命令怎样改变世界",
    "⛶ 全屏",
    "✨ 动画：开",
    "🔔 声音：关",
    "蓝色圆滚滚",
    "橙色方块侠",
    "绿色电力狗",
    "1",
    "2",
    "3",
    "5",
    "8",
    "吃到能量豆（能量 +4）",
    "打开探照灯（能量 -1）",
    "帮小猫充电（能量 -2）",
    "超级快充（能量 +6）",
    "太阳能加倍（能量 ×2）",
    "💾 保存我的作品卡",
    "🧪 用真实C++验证我的故事",
    "💡 提示",
    "🔄 重置",
    "💡 求提示"
  ],
  "下一个任务按钮数": 0
}
```

显式恢复后，真正的 A 档活动 8 DOM（可见按钮全文、面板标题、input/textarea 列表及“讲明白”面板 HTML）：

```json
{
  "当前任务": "任务 8 / 8",
  "页面标题": "讲给机器人听",
  "面板标题": [
    "🗺 任务场景",
    "讲给机器人听",
    "🗣 讲明白",
    "⌨️ 代码台",
    "📦 变量卡",
    "🕒 执行时间线",
    "🖥 机器人说（输出）"
  ],
  "可见按钮": [
    {
      "全文": "⚡机器人能量站：命令怎样改变世界",
      "disabled": false,
      "class": "brand"
    },
    {
      "全文": "⛶ 全屏",
      "disabled": false,
      "class": "toggle-btn"
    },
    {
      "全文": "✨ 动画：开",
      "disabled": false,
      "class": "toggle-btn on"
    },
    {
      "全文": "🔔 声音：关",
      "disabled": false,
      "class": "toggle-btn"
    },
    {
      "全文": "等号的右边先……，左边的盒子才………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "shield 在这一行只是被……，所以它………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "我觉得 energy += 2 的意思是………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "🎤 我讲完啦",
      "disabled": false,
      "class": "btn btn-accent"
    },
    {
      "全文": "图块",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "聚焦代码",
      "disabled": false,
      "class": "code-tab active"
    },
    {
      "全文": "完整程序",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "自由编辑",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "🔭 查看完整程序",
      "disabled": false,
      "class": "btn btn-sm btn-ghost code-peek"
    },
    {
      "全文": "💡 提示",
      "disabled": false,
      "class": "hint-toggle"
    },
    {
      "全文": "👣 单步",
      "disabled": false,
      "class": "btn btn-primary"
    },
    {
      "全文": "▶ 运行",
      "disabled": false,
      "class": "btn btn-primary"
    },
    {
      "全文": "🔄 重置",
      "disabled": false,
      "class": "btn"
    },
    {
      "全文": "💡 求提示",
      "disabled": false,
      "class": "btn"
    }
  ],
  "输入控件": [
    {
      "tag": "textarea",
      "type": "textarea",
      "placeholder": "可以打字，也可以直接讲给老师听～",
      "value": "",
      "class": "explain-area"
    }
  ],
  "讲明白面板HTML": "<div class=\"panel\"><div class=\"panel-title\">🗣 讲明白</div><p class=\"activity-prompt\">对着「energy = energy + shield * 2;」讲清楚：右边什么时候算、左边什么时候写、shield 有没有被改。彩蛋：energy = energy + 2 和 energy += 2 是不是同一个意思？</p><div class=\"chip-row\"><button class=\"chip\" type=\"button\">等号的右边先……，左边的盒子才………</button><button class=\"chip\" type=\"button\">shield 在这一行只是被……，所以它………</button><button class=\"chip\" type=\"button\">我觉得 energy += 2 的意思是………</button></div><textarea class=\"explain-area\" placeholder=\"可以打字，也可以直接讲给老师听～\" style=\"margin-top: 10px;\"></textarea><p class=\"form-hint\">说不清楚也没关系，讲给老师听就行！</p><button class=\"btn btn-accent\" type=\"button\" style=\"margin-top: 10px;\">🎤 我讲完啦</button></div>"
}
```

活动 8 的 textarea 能接受 A 档双变量解释；点击“🎤 我讲完啦”后，状态变为 `done=8/8`，按钮变为“🏅 去领我的徽章！”，随后可进入课末徽章页。因此活动 8 表单/内容本身可完成。

## 2. qa/ 修改内容

- `qa/cdp-lesson1.mjs`：按活动 7 分组标题和按钮全文精确选择 A 档参考解；保留“先保存、后验证”；新增活动 7→8 产品门禁断言与显式刷新恢复；dump 真正活动 8 DOM；填写 A 档双变量解释并核验徽章按钮；记录逐活动耗时；支持 `-o/--output` 写报告；保留指定 Chrome 为默认路径并提供本次受限环境的 QA 执行器覆盖参数；有界等待测试 Chrome 退出并删除隔离 profile。
- `qa/A档第1课闭环QA报告.md`：本次生成的闭环 QA 报告。
- 本 QA worker 未修改 `js/`、`docs/`、`server/` 源文件、`index.html`、`teacher.html` 或 `tools/`。

## 3. 最终 QA 完整运行输出

```text
QA 浏览器: /private/tmp/cpplab-playwright-browsers/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell
CDP 浏览器版本: HeadlessChrome/145.0.7632.6
QA 地址: http://127.0.0.1:8099
起点: {"doneIds":[],"doneCount":0,"card":null,"finalEnergy":null,"path":"A"}
✅ 种子是 A 档  << {"doneIds":[],"doneCount":0,"card":null,"finalEnergy":null,"path":"A"}
✅ 进入第 1 课  << 返回任务世界
✅ 活动 1 完成  << ["lesson1-01-return-world"]

--- 活动 2（验证：预测必须排在检查顺序之前）---
   先提交预测 → submitted:就猜这个！
✅ 排序前能提交预测（教案新顺序成立）  << submitted:就猜这个！
   排序 → DONE | 1📦 建立能量盒，先放进  > 2⚡ 吃到能量豆，获得 4  > 3🔦 打开探照灯，使用 1 > 4📢 向屏幕报告现在的能量
✅ 活动 2 完成  << DONE | 1📦 建立能量盒，先放进  > 2⚡ 吃到能量豆，获得 4  > 3🔦 打开探照灯，使用 1 > 4📢 向屏幕报告现在的能量 / done=2

--- 活动 3 ---
    predict,step,step,answer,step,answer,chip => READY
✅ 活动 3 完成  << done=3 ep,step,answer,step,answer,chip => READY

--- 活动 4 ---
    predict,step,step,answer,step,step,answer => READY
✅ 活动 4 完成  << done=4 ep,step,answer,step,step,answer => READY

--- 活动 5 ---
    predict,slot:boost 的值：1,slot-ok,step,step,step,step,step => READY
✅ 活动 5 完成  << done=5 lot-ok,step,step,step,step,step => READY

--- 活动 6 ---
    predict,step,step,step,step => READY
✅ 活动 6 完成  << done=6 predict,step,step,step,step => READY

--- 活动 7（验证：先保存后验证，印章不被覆盖）---
   A 档选项 → {"results":["OK","OK","OK","OK","OK"],"clicks":["蓝色圆滚滚","2","吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"],"selected":[{"group":"选一个机器人伙伴","values":["蓝色圆滚滚"]},{"group":"选择出发能量","values":["2"]},{"group":"挑选故事事件（可以多选）","values":["吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"]},{"group":"我的一句话解释（会印在作品卡上）","values":[]}],"preview":"📖 故事预演：机器人最后的能量是 10 格。"}
✅ 活动 7 真正选中 A 档参考解  << {"results":["OK","OK","OK","OK","OK"],"clicks":["蓝色圆滚滚","2","吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"],"selected":[{"group":"选一个机器人伙伴","values":["蓝色圆滚滚"]},{"group":"选择出发能量","values":["2"]},{"group":"挑选故事事件（可以多选）","values":["吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"]},{"group":"我的一句话解释（会印在作品卡上）","values":[]}],"preview":"📖 故事预演：机器人最后的能量是 10 格。"}
✅ 活动 7 先保存成功且尚未盖验证章  << 点了「💾 保存我的作品卡」verified=false
✅ 活动 7 保存内容是 10 能量 / 3 事件 / 加倍最后  << {"最终能量":10,"已验证":false,"事件":["吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"]}
   保存后下一关按钮 → 下一个任务！
   点验证 → ⏳ 验证中…
✅ 验证后作品卡仍在且印章为 true  << verified=true
   作品卡: {"最终能量":10,"已验证":true,"事件数":3,"事件":["吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"]}
[活动 7→8 验证后真实 DOM dump]
{
  "当前任务": "任务 7 / 8",
  "页面标题": "我的改造",
  "反馈区": "🎉 真实C++编译通过！作品卡打上了「已通过真实 C++ 验证」的印章！",
  "可见按钮": [
    "⚡机器人能量站：命令怎样改变世界",
    "⛶ 全屏",
    "✨ 动画：开",
    "🔔 声音：关",
    "蓝色圆滚滚",
    "橙色方块侠",
    "绿色电力狗",
    "1",
    "2",
    "3",
    "5",
    "8",
    "吃到能量豆（能量 +4）",
    "打开探照灯（能量 -1）",
    "帮小猫充电（能量 -2）",
    "超级快充（能量 +6）",
    "太阳能加倍（能量 ×2）",
    "💾 保存我的作品卡",
    "🧪 用真实C++验证我的故事",
    "💡 提示",
    "🔄 重置",
    "💡 求提示"
  ],
  "下一个任务按钮数": 0
}
   验证后点下一关 → NO_NEXT_BUTTON
❌ 活动 7 保存→验证后仍有正常下一关路径（产品门禁）  << 保存后曾出现，但验证反馈后 NO_NEXT_BUTTON
   [恢复取证] 刷新并从「继续我的任务」进入第一个未完成活动
   [恢复取证] 点了 → 🚀继续我的任务上次玩到「机器人能量站：命令怎样改变世界」，接着来！
✅ 进入真实活动 8  << {"task":"任务 8 / 8","title":"讲给机器人听"}

--- 活动 8 ---
[活动 8 真实 DOM dump]
{
  "当前任务": "任务 8 / 8",
  "页面标题": "讲给机器人听",
  "面板标题": [
    "🗺 任务场景",
    "讲给机器人听",
    "🗣 讲明白",
    "⌨️ 代码台",
    "📦 变量卡",
    "🕒 执行时间线",
    "🖥 机器人说（输出）"
  ],
  "可见按钮": [
    {
      "全文": "⚡机器人能量站：命令怎样改变世界",
      "disabled": false,
      "class": "brand"
    },
    {
      "全文": "⛶ 全屏",
      "disabled": false,
      "class": "toggle-btn"
    },
    {
      "全文": "✨ 动画：开",
      "disabled": false,
      "class": "toggle-btn on"
    },
    {
      "全文": "🔔 声音：关",
      "disabled": false,
      "class": "toggle-btn"
    },
    {
      "全文": "等号的右边先……，左边的盒子才………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "shield 在这一行只是被……，所以它………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "我觉得 energy += 2 的意思是………",
      "disabled": false,
      "class": "chip"
    },
    {
      "全文": "🎤 我讲完啦",
      "disabled": false,
      "class": "btn btn-accent"
    },
    {
      "全文": "图块",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "聚焦代码",
      "disabled": false,
      "class": "code-tab active"
    },
    {
      "全文": "完整程序",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "自由编辑",
      "disabled": false,
      "class": "code-tab"
    },
    {
      "全文": "🔭 查看完整程序",
      "disabled": false,
      "class": "btn btn-sm btn-ghost code-peek"
    },
    {
      "全文": "💡 提示",
      "disabled": false,
      "class": "hint-toggle"
    },
    {
      "全文": "👣 单步",
      "disabled": false,
      "class": "btn btn-primary"
    },
    {
      "全文": "▶ 运行",
      "disabled": false,
      "class": "btn btn-primary"
    },
    {
      "全文": "🔄 重置",
      "disabled": false,
      "class": "btn"
    },
    {
      "全文": "💡 求提示",
      "disabled": false,
      "class": "btn"
    }
  ],
  "输入控件": [
    {
      "tag": "textarea",
      "type": "textarea",
      "placeholder": "可以打字，也可以直接讲给老师听～",
      "value": "",
      "class": "explain-area"
    }
  ],
  "讲明白面板HTML": "<div class=\"panel\"><div class=\"panel-title\">🗣 讲明白</div><p class=\"activity-prompt\">对着「energy = energy + shield * 2;」讲清楚：右边什么时候算、左边什么时候写、shield 有没有被改。彩蛋：energy = energy + 2 和 energy += 2 是不是同一个意思？</p><div class=\"chip-row\"><button class=\"chip\" type=\"button\">等号的右边先……，左边的盒子才………</button><button class=\"chip\" type=\"button\">shield 在这一行只是被……，所以它………</button><button class=\"chip\" type=\"button\">我觉得 energy += 2 的意思是………</button></div><textarea class=\"explain-area\" placeholder=\"可以打字，也可以直接讲给老师听～\" style=\"margin-top: 10px;\"></textarea><p class=\"form-hint\">说不清楚也没关系，讲给老师听就行！</p><button class=\"btn btn-accent\" type=\"button\" style=\"margin-top: 10px;\">🎤 我讲完啦</button></div>"
}
   句子开头 + A 档解释 → {"starter":"等号的右边先……，左边的盒子才………","textarea":"等号的右边先读取 energy 和 shield，算出 shield × 2 后加到旧 energy；左边的 energy 盒子最后才写入新值。shield 只被读取，没有被改。energy += 2 和 energy = energy + 2 意思相同。"}
   提交讲解 → 🎤 我讲完啦
✅ 活动 8 完成  << done=8/8
✅ 活动 8 完成按钮变为徽章按钮  << 🏅 去领我的徽章！
✅ 全 8 关闭环  << ["lesson1-01-return-world","lesson1-02-command-queue","lesson1-03-energy-box","lesson1-04-code-xray","lesson1-05-reach-ten","lesson1-06-real-cpp","lesson1-07-my-remix","lesson1-08-teach-robot"]
✅ 进入课末徽章页  << 🏅 去领我的徽章！ / 今天的探险完成啦！

===== A 档第 1 课逐活动结果 =====
1. 回到任务世界 / 点击“只保存现在的值/旧值会被新值盖掉”选项 / done=1/8 / 1.22 秒
2. 命令排队 / 输入预测 2 → 提交 → 用“上移”排成建立盒子/+4/-1/报告 → 检查顺序 / done=2/8；DONE | 1📦 建立能量盒，先放进  > 2⚡ 吃到能量豆，获得 4  > 3🔦 打开探照灯，使用 1 > 4📢 向屏幕报告现在的能量 / 3.19 秒
3. 能量盒 / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,answer,step,answer,chip => READY） / done=3/8 / 4.12 秒
4. 代码透视镜 / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,answer,step,step,answer => READY） / done=4/8 / 3.22 秒
5. 正好到 10 / 预测 → 单步执行 → 回答检查点（轨迹：predict,slot:boost 的值：1,slot-ok,step,step,step,step,step => READY） / done=5/8 / 3.66 秒
6. 真实 C++ / 预测 → 单步执行 → 回答检查点（轨迹：predict,step,step,step,step => READY） / done=6/8 / 2.20 秒
7. 我的改造 / 选蓝色圆滚滚 → 出发能量 2 → 依次选 +4、-1、×2 → 保存 → 真实 C++ 验证 → 因产品丢失下一关按钮而刷新/继续恢复 / card=10/verified=true/events=3；transition=BLOCKED_THEN_RECOVERED / 17.36 秒
8. 讲给机器人听 / dump 真实 DOM → 点击“等号的右边先…”句子开头 → 输入 A 档双变量解释 → “我讲完啦” → “去领我的徽章” / done=8/8；badge=🏅 去领我的徽章！；end=今天的探险完成啦！ / 3.22 秒

===== 8 关完成清单 =====
1. ✅ lesson1-01-return-world
2. ✅ lesson1-02-command-queue
3. ✅ lesson1-03-energy-box
4. ✅ lesson1-04-code-xray
5. ✅ lesson1-05-reach-ten
6. ✅ lesson1-06-real-cpp
7. ✅ lesson1-07-my-remix
8. ✅ lesson1-08-teach-robot
最终作品卡: {"标题":"闪电小队长 的作品","皮肤":"robo-blue","出发能量":2,"事件":["吃到能量豆（能量 +4）","打开探照灯（能量 -1）","太阳能加倍（能量 ×2）"],"最终能量":10,"解释":"从 2 出发，先加 4、再减 1，最后乘 2，正好是 10。","已验证":true}

===== 闭环 QA：18 通过 / 1 失败 =====
页面无未捕获异常。
浏览器清理：processExited=true profileRemoved=true
```

## 4. 发现但未修改的产品问题

1. **严重：活动 7→8 正常路径被真实验证反馈封死。** “保存我的作品卡”先完成活动并生成“下一个任务！”，但验证成功后的反馈替换同一个 `#feedback-area` 且 actions 为空，按钮消失；`ui.completed` 已为 true，再次保存只提示“作品卡更新好啦”，不会重建下一关按钮。最小修复建议：验证完成时若 `ui.completed` 为 true，保留/重建“下一个任务！” action，或把编译结果写到独立 `#compile-area`，不要覆盖完成反馈。
2. **高风险：A 档活动 7 的完成条件未被产品 UI 强制。** 未修 QA 的基线真实点击只选到皮肤和出发能量，0 个事件、最终能量 2 仍被标为活动完成并可获得真实验证章：

   ```text
✅ 活动 7 先保存成功  << 点了「💾 保存我的作品卡」card=true
✅ 验证后作品卡仍在  << verified=true
作品卡: {"最终能量":2,"已验证":true,"事件数":0}
❌ 活动 8 完成  << done=7/8
   ```

   最小修复建议：保存前按当前变体校验 A 档 `events.length >= 3` 且预演最终能量为 10；更稳妥的是把成功条件做成内容驱动的机器可判定规则。
3. **低优先级可疑：句子开头的省略号重复。** A 档内容本身已以“……”结尾，渲染器又统一追加“…”；真实 DOM 中出现“才………”、“所以它………”等不整齐文案。建议渲染前判断末尾是否已有省略号。

## 执行环境说明

- 本次 Codex 执行沙箱禁止 GUI Chrome 注册 macOS Mach 服务，因此实际取证使用 `/private/tmp` 下的 Chrome Headless Shell 145，并加 `--single-process --no-zygote`；脚本默认值仍是用户指定的 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。
- 沙箱无权终止已有的 8099 服务器进程；每轮仍删除 `server/data`，并通过生产服务器自带的 `/api/reset` + `/api/state` 重新注入 `server/seed.json`。脚本起点再次断言 `path=A, done=0, card=null`，避免残留进度。
- 范围复核时发现 `docs/教案/第1课教案.md` 的文件修改时间在本任务期间变为 2026-08-11 13:18:52；本 QA worker 的全部写入目标均在 `qa/`，未对该文件执行写操作。仓库没有 Git 元数据，无法在本地对这项并发/外部变更做内容归因，因此予以保留并如实记录。
