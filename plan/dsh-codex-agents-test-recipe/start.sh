#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：启动本次 web 服务并用隔离浏览器资料目录打开。
#
# 用法（仓库根）：
#   bash plan/dsh-codex-agents-test-recipe/start.sh
#
# 对应测试计划 v11 第 2.4 节。服务在本终端前台运行，Ctrl-C 结束；
# 浏览器使用 $BASE/browser-profile，不复用日常资料目录。

set -euo pipefail

DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

fail() { printf '错误：%s\n' "$1" >&2; exit 1; }
note() { printf '· %s\n' "$1"; }

BASE="${BASE:-}"
if [ -z "$BASE" ]; then
  BASE="$(ls -dt /tmp/dca-test.* 2>/dev/null | head -1 || true)"
  test -n "$BASE" || fail "找不到 /tmp/dca-test.*，请先执行 prepare.sh"
fi
# shellcheck disable=SC1091
. "$BASE/logs/paths.env"

test -d "$BASE/home/profiles/web" || fail "本次 web 配置档不存在：${BASE}/home/profiles/web"
test -d "$BASE/consumer-a" || fail "缺少测试工作区：${BASE}/consumer-a"

note "工作区：${BASE}/consumer-a"
note "DSH_HOME：${BASE}/home"
note "浏览器资料：${BASE}/browser-profile"

# 服务在后台启动，等地址出现后再打开浏览器；地址含访问凭据，只在本机使用
LOG="$BASE/logs/web.log"
: > "$LOG"
( cd "$BASE/consumer-a" && DSH_HOME="$BASE/home" "$DSH_BIN" web --no-open --host 127.0.0.1 --port 0 ) \
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

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --user-data-dir="$BASE/browser-profile" --new-window "$URL"
  note "已用隔离资料目录打开 Chrome"
else
  note "没有找到 Chrome，请用其它 Chromium 浏览器的等效参数打开："
  printf '  %s\n' "$URL"
fi

cat <<TXT

服务在前台进程 ${PID} 中运行，地址：${BASE}/logs/web.url

在网页里：
  1. 「添加工作区」登记 ${BASE}/consumer-a 与 ${BASE}/consumer-b
  2. 分别在两个工作区建会话
  3. 发一条简短消息确认模型可用（不计入 T1—T7）

结束后 Ctrl-C 或：
  kill "\$(cat ${BASE}/logs/web.pid)"

TXT

wait "$PID"
