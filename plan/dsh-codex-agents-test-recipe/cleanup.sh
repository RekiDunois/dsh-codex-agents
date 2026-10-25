#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：按测试计划 v11 第 4 节收尾。
#
# 用法（仓库根）：
#   bash plan/dsh-codex-agents-test-recipe/cleanup.sh
#   KEEP_BASE=1 bash plan/dsh-codex-agents-test-recipe/cleanup.sh
#
# 只删除第 2.3 节确认由本次创建的两份全局角色文件，以及本次 BASE。
# 不停止或重启任何日常应用或服务；其它已有角色保持原状。

set -euo pipefail

note() { printf '· %s\n' "$1"; }

BASE="${BASE:-}"
if [ -z "$BASE" ]; then
  BASE="$(ls -dt /tmp/dca-test.* 2>/dev/null | head -1 || true)"
  test -n "$BASE" || { printf '没有可清理的目录\n'; exit 0; }
fi
test -d "$BASE" || { printf '目录不存在：%s\n' "$BASE"; exit 0; }
test -f "$BASE/logs/paths.env" || { printf '缺少 %s，无法确认清理范围\n' "$BASE/logs/paths.env"; exit 1; }
# shellcheck disable=SC1091
. "$BASE/logs/paths.env"

note "清理：${BASE}"

# 先停止本次 web 服务。只停自己记录的进程号，且确认命令行确实是 dsh web，
# 避免进程号被系统回收后误杀无关进程。
if [ -f "$BASE/logs/web.pid" ]; then
  WPID="$(cat "$BASE/logs/web.pid")"
  if kill -0 "$WPID" 2>/dev/null; then
    if ps -p "$WPID" -o command= 2>/dev/null | grep -q 'dsh web'; then
      kill "$WPID" 2>/dev/null || true
      note "已停止本次 web 服务（PID ${WPID}）"
    else
      note "PID ${WPID} 已不是本次 web 服务，跳过，不误停其它进程"
    fi
  fi
fi

# 计划第 4 节要求关闭本次临时浏览器窗口。测试资料目录固定在 BASE 之外，
# 被占用时不影响删除 BASE，但窗口仍开着会让下一轮复用同一会话状态，
# 因此仍提示关闭；不擅自结束用户的浏览器进程。
if [ -n "${BROWSER_PROFILE:-}" ] && pgrep -f "user-data-dir=${BROWSER_PROFILE}" >/dev/null 2>&1; then
  printf '提示：测试浏览器窗口仍开着（资料目录 %s）。\n' "$BROWSER_PROFILE" >&2
  printf '请关闭它；本脚本不会替你结束浏览器进程。BASE 仍会被清理。\n' >&2
fi

# 只删本次新建的两份全局角色
if [ -n "${GLOBAL_AGENTS:-}" ]; then
  for file in reviewer.toml global-only.toml; do
    if [ -f "$GLOBAL_AGENTS/$file" ]; then
      rm -f "$GLOBAL_AGENTS/$file"
      note "已删除 ${GLOBAL_AGENTS}/${file}"
    fi
  done
fi

if [ "${KEEP_BASE:-0}" = "1" ]; then
  note "按要求保留 ${BASE} 供复核"
else
  rm -rf "$BASE"
  note "已删除 ${BASE}"
fi

note "其它已有角色与日常应用未改动"
