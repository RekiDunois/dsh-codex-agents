#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：为 v11 第 3 节的三处源码检查定位材料。
#
# 用法（仓库根）：
#   bash plan/dsh-codex-agents-test-recipe/static-check.sh
#
# 本脚本不做通过/失败判定。测试计划 v11 第 3 节要求的是"读取被测产品源码
# 并确认某项行为"，结论由执行工程师按计划原文人工判断。脚本只负责：
#   1. 打印计划要求核对的原句；
#   2. 把相关代码段与出现位置摆出来，便于逐条对照。
# 因此它不构成新的判定器，也不新增计划之外的通过条件。

set -uo pipefail

head2() { printf '\n===== %s =====\n' "$1"; }
have() { printf '\n--- %s ---\n' "$1"; }

test -f src/index.ts || { printf '错误：找不到 src/index.ts\n' >&2; exit 1; }
test -f src/watch.ts || { printf '错误：找不到 src/watch.ts\n' >&2; exit 1; }
test -f src/tool.ts || { printf '错误：找不到 src/tool.ts\n' >&2; exit 1; }

head2 "T4"
cat <<'TXT'
计划原文：沿 src/index.ts 顶层 apply 的直接初始化路径检查：不得同步逐工作区
读角色 TOML，也不得等待所有预设注册完成才返回。允许注册工具、订阅工作区变化、
调度后台刷新。
TXT
have "src/index.ts 中 apply 到 ctx.effect 之间的代码（直接初始化路径）"
sed -n '/export function apply/,/ctx.effect/p' src/index.ts
have "该路径内的 await 与同步文件读取调用（供对照，是否违规由执行人判断）"
sed -n '/export function apply/,/ctx.effect/p' src/index.ts | grep -nE 'await |readFileSync|readdirSync' || printf '(无)\n'

head2 "T5 / T7"
cat <<'TXT'
计划原文：读取 src/watch.ts、src/manager.ts 相关代码，确认顶层用 node:fs.watch
监听角色目录，收到 change／rename 后会安排异步读取并刷新对应角色预设。
TXT
have "src/watch.ts 中的 fs.watch 调用"
grep -nE 'watch\(|node:fs' src/watch.ts || printf '(无)\n'
have "src/watch.ts 中 change／rename 的处理位置"
grep -nE 'change|rename' src/watch.ts || printf '(无)\n'
have "src/watch.ts 与 src/manager.ts 中的刷新调度位置"
grep -nE 'refresh|schedule|queue|dirty|pending' src/watch.ts src/manager.ts || printf '(无)\n'

head2 "T6（插件侧责任）"
cat <<'TXT'
计划原文：在被测产品 src/tool.ts 的委派处确认它每次从
ctx.subagents.resolveMaxDepth() 获取现行值并送入 startActivation 请求。
TXT
have "src/tool.ts 中 resolveMaxDepth 与 startActivation 的调用位置"
grep -nE 'resolveMaxDepth|startActivation' src/tool.ts || printf '(无)\n'
have "src/tool.ts 中 maxDepth 送入请求的代码段"
grep -n -B3 -A6 'maxDepth' src/tool.ts || printf '(无)\n'

printf '\n以上为材料输出。三项是否成立，按计划 v11 第 3 节原文由执行工程师判断并记录。\n'
