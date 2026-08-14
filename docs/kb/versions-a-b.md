# 知识节点：A/B 版本关系与「合并」结论

> 节点属性：`type: 版本取证` · `status: 已定案（2026-08-14）` · 关联节点：[[qa-snapshot-20260813]]

## 结论（先看这条）
**A 版（`/Users/gemstone/cpp-course`）是 B 版（`/Users/Shared/最后冲刺/C++课`）的严格超集，"合并 B 到 A" 是空操作，已天然完成。** B 只当历史快照，不从那边继续开发。

## 取证链（全部本机实测）
| 事实 | 证据命令 | 日期 |
|---|---|---|
| B 的 tip `dfb8cb7` 是 A HEAD 的祖先 | `git merge-base --is-ancestor dfb8cb7 HEAD` → IS_ANCESTOR | 2026-08-13 |
| A 比 B 多 3 个提交（a4e87b0 / fe57469 / 01f97ed） | `git log --oneline dfb8cb7..HEAD` | 2026-08-13 |
| B 缺 server.js / sync.js / make-seed.js / test-sync.js / .gitignore / 使用手册 / qa 脚本——即 B 没有服务器模式（方式 A） | `git diff --name-status dfb8cb7..HEAD` | 2026-08-13 |
| B 无新提交、工作区干净（仅未跟踪 .DS_Store）、无未提交内容可捞 | `git -C <B> status --porcelain` + `log -3` | **2026-08-14** |
| B 测试 6 个 / 1916 断言 / 0 失败（比 A 少 test-sync 20 条，其余计数一致） | 逐个跑 `node <B>/js/tests/test-*.js` | 2026-08-13 |
| iPad 适配、codex 118 条清零均在共同祖先内，非 B 独有 | `git log` + index.html meta 核对 | 2026-08-13 |
| B 无 remote（孤本）；A 有 remote `github.com/sydneygemstone-sudo/cpp-age9-course` | `git remote -v` | 2026-08-13 |

## 历史坑（为什么要写这个节点）
Dean 曾交代「最后冲刺里的都是独立 worktree、版本都更新」——**对紫薇斗数成立，对本线实测是反的**：冲刺侧停在 2026-08-05，本仓库走到 2026-08-12。接手本线的任何 session：**直接用本仓库，别去冲刺侧开发，也别再花时间查"要不要合并"**——本节点已定案。

## 遗留决定（闸门，等 Dean）
- B 目录的删除/归档/移动属闸门项，worker 不自行处理。2026-08-14 Dean 说"把冲刺仓库合并过来"，经实测确认为空操作；**B 目录本身怎么处置（留着/归档/删）尚无 Dean 明示**。
- B 侧 git 可能报 dubious ownership：命令带 `-c safe.directory=<路径>`，绝不改全局 git 配置。
