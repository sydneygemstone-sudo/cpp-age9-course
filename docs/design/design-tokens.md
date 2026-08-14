# 设计 tokens 规范 · 剧场模式视觉地基（2026-08-14 草案）

> 依据：`docs/调研-三侧线与产品化-20260814.md` 侧线 3 方案 A（剧场模式）。
> 本文档 + `docs/design/samples/` 三张样板页（cover / activity / celebrate）供 Dean 过目拍板；
> 拍板前**不改任何现有文件**（周六首课闸门）。拍板后再批量套用到 `css/main.css` 与全部活动。
>
> 命名前缀统一 `--cpp-*`（新命名空间，不与现有 `--c-*` 冲突；落地期做一层映射即可平滑过渡，见 §6）。

## 0. 继承的硬约束（来自 CONTRACT §13 与 main.css 实测，不许破坏）

| 约束 | 来源 | token 化落点 |
|---|---|---|
| 儿童端正文 ≥ 17px | CONTRACT §13 / P1-4 | 字号阶梯的地板是 `--cpp-text-base` |
| 触控目标 ≥ 44px（iPad 触屏） | §13-2 | `--cpp-tap-min: 44px`；主按钮更大 |
| 同屏高亮主按钮 ≤ 2 | 红线 §14.5 | 剧场模式原则 ③（见 §5） |
| `body.no-anim` 与 `prefers-reduced-motion` 下动画瞬时完成 | CONTRACT §12 | 所有动效 token 必须可被这两个开关归零 |
| 页面永不整体滚动（全屏 slide 外壳） | §13-2 | 剧场模式原则 ①；`100dvh` + `overflow:hidden` |
| 主题机制走 `body[data-theme="robot|pet|adventure"]` | main.css 既有做法 | 三主题色板全部挂在该属性下 |
| 零外部依赖（file:// 双击可用） | 仓库定位 | 只用系统字体栈与 emoji，无网络字体/图片 |

## 1. 字号阶梯（clamp 随视口缩放，投影 / iPad / 笔记本通吃）

| token | 值 | 用途 |
|---|---|---|
| `--cpp-text-xs` | `13px` | 仅限成人侧 meta（版本号、教师链接）；**孩子要读的文字不许用** |
| `--cpp-text-sm` | `15px` | 辅助标签、kicker、计数 |
| `--cpp-text-base` | `clamp(17px, 1vw + 12px, 19px)` | 正文地板（≥17px，继承现有 body 规则） |
| `--cpp-text-lg` | `clamp(19px, 1.2vw + 13px, 22px)` | 活动提问、反馈标题 |
| `--cpp-text-xl` | `clamp(24px, 2vw + 14px, 32px)` | 活动标题（h2 级） |
| `--cpp-text-2xl` | `clamp(32px, 3.5vw + 16px, 48px)` | 页级大标题（封面课名、庆祝语） |
| `--cpp-text-hero` | `clamp(44px, 6vw + 18px, 76px)` | 剧场主角字（封面主标题、勋章名） |
| `--cpp-text-code` | `clamp(16px, .9vw + 12px, 18px)` | 代码等宽字 |
| 字体栈 `--cpp-font` | `system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` | 与现有 `--font` 一致 |
| 等宽栈 `--cpp-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | 代码与英文术语 chip |

行高：正文 `1.6`，标题 `1.25`，代码 `1.7`（沿用现有值，不新设 token）。

## 2. 间距 / 圆角 / 触控

| token | 值 | | token | 值 |
|---|---|---|---|---|
| `--cpp-space-1` | `4px` | | `--cpp-radius-sm` | `8px` |
| `--cpp-space-2` | `8px` | | `--cpp-radius-md` | `14px`（对齐现有 `--radius`） |
| `--cpp-space-3` | `12px` | | `--cpp-radius-lg` | `22px`（剧场大卡片） |
| `--cpp-space-4` | `16px` | | `--cpp-radius-pill` | `999px` |
| `--cpp-space-5` | `24px` | | `--cpp-tap-min` | `44px`（触控地板） |
| `--cpp-space-6` | `32px` | | `--cpp-tap-cta` | `64px`（剧场主按钮高度） |
| `--cpp-space-7` | `48px` | | | |
| `--cpp-space-8` | `64px` | | | |

## 3. 动效（时长 / 缓动）与阴影

| token | 值 | 用途 |
|---|---|---|
| `--cpp-dur-fast` | `120ms` | 按压、hover 反馈 |
| `--cpp-dur-base` | `200ms` | 抽屉、chip 状态切换 |
| `--cpp-dur-slow` | `320ms` | 卡片进出场 |
| `--cpp-dur-ritual` | `700ms` | 活动切换「过渡仪式」（幕布/发射动画） |
| `--cpp-ease-out` | `cubic-bezier(.22, .8, .35, 1)` | 默认出场 |
| `--cpp-ease-pop` | `cubic-bezier(.34, 1.4, .5, 1)` | 庆祝弹跳（轻微过冲，不夸张） |
| `--cpp-shadow-sm` | `0 2px 10px rgba(23, 32, 55, .08)` | 静置卡片 |
| `--cpp-shadow-md` | `0 6px 18px rgba(23, 32, 55, .14)` | 悬浮 / 抽屉 |
| `--cpp-shadow-lg` | `0 14px 40px rgba(23, 32, 55, .20)` | 剧场主卡、modal |

**归零规则（必须写死在实现里）**：`body.no-anim *` 与 `@media (prefers-reduced-motion: reduce)` 下，
所有 `transition`/`animation` 置 `none !important`——与现有 main.css 行为一致。

## 4. 三主题色板

设计原则：**主色随主题走**（现状是三主题共用蓝色主按钮，只换 accent——剧场模式把主题感做进主色）。
色板锚定现有色相不另起炉灶：robot=现有蓝 `#3b82f6` 家族；pet=现有草地绿 `#65a30d` 家族与淡草底 `#f3f9ee`；adventure=现有火把橙 `#d97706` 家族与淡岩底 `#faf6ec`。

对比度要求（投影可读 + 护眼）：正文文字对背景 ≥ 4.5:1；大字按钮（≥19px 粗体）文字对按钮底 ≥ 3:1；
`-soft` 淡色只做**面**（底色/高亮块），永远不做文字色。

### 🤖 robot 机器人世界（默认）

| token | 值 | 角色 |
|---|---|---|
| `--cpp-bg` | `#edf3fb` | 背景（舞台底，微冷蓝白） |
| `--cpp-surface` | `#ffffff` | 表面（卡片/面板） |
| `--cpp-primary` | `#2e6fe0` | 主色（主按钮、当前态；白字对它 4.0:1） |
| `--cpp-primary-soft` | `#dbeafe` | 主色淡面 |
| `--cpp-accent` | `#b45309` | 强调（高亮、勋章描边；作小字时对白底 4.8:1） |
| `--cpp-accent-soft` | `#fef3c7` | 强调淡面 |
| `--cpp-ink` | `#1e293b` | 文字主色（对 bg 13:1） |
| `--cpp-muted` | `#526079` | 次要文字（对 bg 5.9:1） |

### 🐶 pet 宠物乐园

| token | 值 | 角色 |
|---|---|---|
| `--cpp-bg` | `#f0f8e9` | 背景（淡草地） |
| `--cpp-surface` | `#ffffff` | 表面 |
| `--cpp-primary` | `#4d8b1f` | 主色（草地绿加深保对比；白字 4.0:1） |
| `--cpp-primary-soft` | `#e3f3cf` | 主色淡面 |
| `--cpp-accent` | `#b45309` | 强调（蜂蜜橙棕） |
| `--cpp-accent-soft` | `#fdeeca` | 强调淡面 |
| `--cpp-ink` | `#22301b` | 文字主色 |
| `--cpp-muted` | `#556349` | 次要文字 |

### 🎒 adventure 探险王国

| token | 值 | 角色 |
|---|---|---|
| `--cpp-bg` | `#faf4e6` | 背景（淡岩沙色） |
| `--cpp-surface` | `#fffdf6` | 表面（暖白） |
| `--cpp-primary` | `#b45309` | 主色（火把橙加深保对比；白字 4.5:1） |
| `--cpp-primary-soft` | `#fde8cd` | 主色淡面 |
| `--cpp-accent` | `#b91c1c` | 强调（宝石红） |
| `--cpp-accent-soft` | `#fbe3e0` | 强调淡面 |
| `--cpp-ink` | `#33261a` | 文字主色 |
| `--cpp-muted` | `#6b5b47` | 次要文字 |

### 跨主题固定色（不随主题变，语义恒定）

| token | 值 | 角色 |
|---|---|---|
| `--cpp-ok` / `--cpp-ok-soft` | `#16a34a` / `#dcfce7` | 正确 / 通过（配 ✓，不许只靠颜色） |
| `--cpp-err` / `--cpp-err-soft` | `#dc2626` / `#fee2e2` | 错误（配 ✗） |
| `--cpp-code-bg` / `--cpp-code-ink` | `#0f172a` / `#e2e8f0` | 代码台深底——**三主题统一**，让「代码区」成为跨主题的稳定视觉锚点 |

## 5. 剧场模式四条布局原则

1. **一屏一活动**：`100dvh` 全屏舞台、页面永不滚动；一屏只呈现当前活动的「一件事」（一段剧情、一张代码卡、一次提问）；容器 `clamp`/`vw` 缩放而不是滚动，iPad 横屏与笔记本同构。
2. **非当前操作收进抽屉**：舞台上只留「此刻要按的」；单步/提示/输出/重来等全部收进边缘抽屉（默认收起，一个把手呼出，`--cpp-dur-base` 滑入）；顶栏退化为一条细「舞台眉」——进度点 + 抽屉把手 + 主题标识，不再放一排开关。
3. **大字号大点击区**：孩子用触屏 iPad——正文 ≥17px、主行动按钮高度 ≥ `--cpp-tap-cta`(64px) 且占据视觉 C 位、一切可点 ≥ `--cpp-tap-min`(44px)；同屏高亮主按钮 ≤ 2（红线 §14.5），理想状态是 1。
4. **活动切换有主题化过渡仪式**：活动完成 → `--cpp-dur-ritual`(700ms) 的全屏过渡（robot 舱门开合 / pet 栅栏门推开 / adventure 火把点亮），仪式动画只换台不传信息（`no-anim` 下直接跳切，零信息损失）；过渡词与图标走 `js/engine/theme.js` 词典，不另造文案。

## 6. 双语术语 chip（Dean 定案：中文为主，编程术语中英对照）

术语统一用小 chip 样式：中文在前，英文用等宽字体（`--cpp-mono`）小号跟随，如「编译 `compile`」「变量 `variable`」「输出 `output`」。
chip 规格：底 `--cpp-primary-soft`、圆角 `--cpp-radius-pill`、内边距 `2px 10px`、英文 `--cpp-text-sm` 等宽、与正文基线对齐。
只有**编程术语**上 chip；故事词（能量豆、舱门…）不上，避免满屏标签。样板页 `samples/*.html` 内的 `.term` 类即此规格的参考实现。

## 7. 落地映射（拍板后的下一步，本批不做）

- `css/main.css` 顶部把 `--c-*` 旧 token 指向 `--cpp-*` 新 token（如 `--c-primary: var(--cpp-primary)`），旧样式零改动先吃到新色板；再逐屏套剧场布局。
- 三张样板页即验收基准：cover=封面页、activity=活动页、celebrate=庆祝页；`file://` 双击即看，右上角可切三主题。
- 1936 断言与引擎/内容资产全保留——本规范只动渲染层。
