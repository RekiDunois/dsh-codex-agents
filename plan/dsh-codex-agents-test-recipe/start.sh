#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：启动本次 web 服务并输出浏览器访问地址。
#
# 用法（仓库根）：
#   BASE=/tmp/dca-test.实际目录 bash plan/dsh-codex-agents-test-recipe/start.sh
#
# 对应测试计划 v13 第 2.4 节。服务在本终端前台运行，Ctrl-C 结束；
# 浏览器由执行工程师的现有工具管理，不规定资料目录。

set -euo pipefail

DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

fail() { printf '错误：%s\n' "$1" >&2; exit 1; }
note() { printf '· %s\n' "$1"; }

BASE="${BASE:-}"
test -n "$BASE" || fail "必须显式传入本次 prepare.sh 输出的 BASE 目录"
# shellcheck disable=SC1091
. "$BASE/logs/paths.env"

test -d "$BASE/home/profiles/web" || fail "本次 web 配置档不存在：${BASE}/home/profiles/web"
test -d "$BASE/consumer-a" || fail "缺少测试工作区：${BASE}/consumer-a"

note "工作区：${BASE}/consumer-a"
note "DSH_HOME：${BASE}/home"

# 浏览器由执行工程师自己的浏览器 MCP 负责：本脚本不启动、不关闭浏览器，
# 也不管理它的资料目录。只把地址交出来，由 MCP 打开并操作。
MCP_CONFIG="$BASE/logs/mcp.json"
if test -f "$MCP_CONFIG"; then
  note "检测到浏览器 MCP 配置：${MCP_CONFIG}（内容由执行工程师提供，本脚本不解释）"
fi

# 服务在后台启动，等地址出现；地址含访问凭据，只在本机使用。
# 子 shell 用 exec 换成真正的 dsh 进程，$! 才是服务本身而不是包装 shell，
# 否则 cleanup.sh 记到的进程号既杀不掉服务，也无法用它核对身份。
LOG="$BASE/logs/web.log"
: > "$LOG"
( cd "$BASE/consumer-a" && exec env DSH_HOME="$BASE/home" "$DSH_BIN" web --no-open --host 127.0.0.1 --port 0 ) \
  > "$LOG" 2>&1 &
PID=$!
printf '%s\n' "$PID" > "$BASE/logs/web.pid"

note "等待服务就绪（PID ${PID}）"
URL=""
for _ in $(seq 1 300); do
  # grep 在日志还没有地址时返回非零；set -e 下必须容错，否则首次循环就退出
  URL="$(grep -o 'dsh web: http[^ ]*' "$LOG" 2>/dev/null | head -1 | sed 's/^dsh web: //' || true)"
  [ -n "$URL" ] && break
  if ! kill -0 "$PID" 2>/dev/null; then
    printf '%s\n' "服务进程已退出，日志尾部：" >&2
    tail -20 "$LOG" >&2
    fail "web 服务启动失败"
  fi
  sleep 0.2
done
[ -n "$URL" ] || { tail -20 "$LOG" >&2; fail "等待地址超时，见 ${LOG}"; }

printf '%s\n' "$URL" > "$BASE/logs/web.url"
note "服务地址已写入 ${BASE}/logs/web.url"

cat <<TXT

服务在进程 ${PID} 中运行。

用你的浏览器 MCP 打开这个地址（地址含访问凭据，只在本机使用）：
  ${URL}

浏览器用哪个资料目录、是否首次运行，全由该 MCP 自行处理，本 recipe 不参与。

在网页里：
  1. 「添加工作区」登记 ${BASE}/consumer-a 与 ${BASE}/consumer-b
  2. 分别在两个工作区建会话
  3. 发一条简短消息确认模型可用（不计入 T1—T7）

模型配置：默认值若能直接使用已复制的凭据，不需要迁移任何设置。
若默认值用不了（例如原桌面配置用了自定义提供方或端点），按计划第 2.2 节，
从 ${SOURCE_DSH_HOME}/profiles/desktop/cordis.patch.yml 只提取所需的提供方、
模型与端点条目，写进本次配置档 ${PROFILE}/cordis.patch.yml，然后重启本服务。
不更换测试目标模型。仍不可用时，受影响项记「无法判断」，不算插件业务失败。

结束后 Ctrl-C 或：
  kill "\$(cat ${BASE}/logs/web.pid)"

TXT

wait "$PID"
