#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：v11 第 3 节要求的三处源码检查。
#
# 用法（仓库根）：
#   bash plan/dsh-codex-agents-test-recipe/static-check.sh
#
# 覆盖三处，均只读被测产品源码，不运行产品：
#   T4      apply 不等待扫描或全部预设注册
#   T5/T7   watch.ts 用 node:fs.watch 监听角色目录并安排异步刷新
#   T6      tool.ts 每次从 ctx.subagents.resolveMaxDepth() 取值送入 startActivation
#
# 计划明确不要求：计时、模拟大量角色文件、事件轨迹、预设 ID 格式检查。

set -euo pipefail

fail() { printf '错误：%s\n' "$1" >&2; exit 1; }
note() { printf '· %s\n' "$1"; }
head2() { printf '\n== %s ==\n' "$1"; }

test -f src/index.ts || fail "找不到 src/index.ts"
test -f src/watch.ts || fail "找不到 src/watch.ts"
test -f src/tool.ts || fail "找不到 src/tool.ts"

head2 "T4：apply 不等待扫描或全部预设注册"
# apply 的同步部分到 ctx.effect 之前；卸载回调里的 await 属于清理路径，
# 不影响启动是否阻塞，因此只取这一段判断。
APPLY_START="$(sed -n '/export function apply/,/ctx.effect/p' src/index.ts)"
printf '%s' "$APPLY_START" | grep -q 'ctx.tools.register' \
  || fail "apply 里没有注册全局工具"
if printf '%s' "$APPLY_START" | grep -q 'await '; then
  printf '%s\n' "$APPLY_START" | grep -n 'await ' >&2
  fail "apply 启动路径出现 await，可能在等待扫描或预设注册"
fi
note "启动路径没有 await"
if printf '%s' "$APPLY_START" | grep -qE 'readFileSync|readdirSync|globSync'; then
  fail "apply 启动路径出现同步文件读取，会同步逐工作区读角色 TOML"
fi
note "启动路径没有同步读角色文件"
printf '%s' "$APPLY_START" | grep -qE 'setTimeout|queueMicrotask|setImmediate' \
  || fail "apply 没有把扫描推迟到后续事件循环任务"
note "扫描由后续事件循环任务启动"

head2 "T5/T7：目录监听与异步刷新"
grep -q 'node:fs' src/watch.ts || fail "watch.ts 没有引用 node:fs"
grep -qE '\.watch\(|watch\(' src/watch.ts || fail "watch.ts 没有调用 fs.watch"
note "watch.ts 使用 node:fs.watch 监听目录"
grep -qE 'change|rename' src/watch.ts || fail "watch.ts 没有处理 change 或 rename 事件"
note "处理 change 或 rename 事件"
grep -qE 'refresh|schedule|queue|dirty|pending' src/watch.ts src/manager.ts \
  || fail "没有找到异步刷新调度"
note "收到事件后安排异步刷新"
if grep -q 'readFileSync' src/watch.ts; then
  fail "watch.ts 用同步读文件，会阻塞事件循环"
fi
note "watch.ts 没有同步读文件"

head2 "T6：委派处读取宿主当前层数"
grep -q 'resolveMaxDepth' src/tool.ts \
  || fail "tool.ts 没有调用 ctx.subagents.resolveMaxDepth()"
note "tool.ts 调用 resolveMaxDepth()"
grep -q 'startActivation' src/tool.ts || fail "tool.ts 没有调用 startActivation"
note "tool.ts 调用 startActivation"
grep -qE 'maxDepth' src/tool.ts || fail "tool.ts 没有把 maxDepth 送入请求"
note "maxDepth 被送入启动请求"

printf '\n三处源码检查全部通过。\n'
