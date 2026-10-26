#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：按测试计划 v13 第 4 节收尾。
#
# 用法（仓库根）：
#   BASE=/tmp/dca-test.实际目录 bash plan/dsh-codex-agents-test-recipe/cleanup.sh
#
# 只删除第 2.3 节确认由本次创建的两份全局角色文件，保留本次 BASE 和运行记录。
# 不停止或重启任何日常应用或服务；其它已有角色保持原状。

set -euo pipefail

note() { printf '· %s\n' "$1"; }

BASE="${BASE:-}"
test -n "$BASE" || { printf '错误：必须显式传入本次 prepare.sh 输出的 BASE 目录\n' >&2; exit 1; }
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

# 浏览器由执行工程师的 MCP 管理，本脚本不检查也不结束浏览器进程。
# 计划第 4 节"关闭本次临时浏览器窗口"由执行工程师通过 MCP 完成。

# 只删本次新建的两份全局角色
if [ -n "${GLOBAL_AGENTS:-}" ]; then
  for file in reviewer.toml global-only.toml; do
    if [ -f "$GLOBAL_AGENTS/$file" ]; then
      rm -f "$GLOBAL_AGENTS/$file"
      note "已删除 ${GLOBAL_AGENTS}/${file}"
    fi
  done
fi

note "保留 ${BASE} 及运行记录供复核"

note "其它已有角色与日常应用未改动"
