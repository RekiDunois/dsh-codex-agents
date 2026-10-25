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

# 浏览器资料目录固定在本轮之外的路径：它会被 Chrome 写成 13 MB 左右，
# 且 cleanup.sh 会删除整个 BASE。固定路径让首次运行弹窗只出现一次，
# 之后每轮复用同一个测试专用资料，不再重复弹窗，也不影响日常浏览器。
BROWSER_PROFILE="${BROWSER_PROFILE:-/tmp/dca-browser-profile}"
printf 'BROWSER_PROFILE="%s"\n' "$BROWSER_PROFILE" >> "$BASE/logs/paths.env"

note "工作区：${BASE}/consumer-a"
note "DSH_HOME：${BASE}/home"
note "浏览器资料：${BROWSER_PROFILE}（测试专用，跨轮复用）"

# 预置首次运行标记与干净退出状态，抑制"首次运行"与"恢复页面"提示。
# 没有这一步，每换一个全新资料目录都会弹一次。
mkdir -p "$BROWSER_PROFILE/Default"
test -e "$BROWSER_PROFILE/First Run" || : > "$BROWSER_PROFILE/First Run"
if ! test -e "$BROWSER_PROFILE/Default/Preferences"; then
  printf '{"profile":{"exit_type":"Normal","exited_cleanly":true},"browser":{"has_seen_welcome_page":true}}' \
    > "$BROWSER_PROFILE/Default/Preferences"
fi

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
  open -na "Google Chrome" --args --user-data-dir="$BROWSER_PROFILE" \
    --no-first-run --no-default-browser-check --new-window "$URL"
  note "已用测试专用资料目录打开 Chrome：${BROWSER_PROFILE}"
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

模型配置：默认值若能直接使用已复制的凭据，不需要迁移任何设置。
若默认值用不了（例如原桌面配置用了自定义提供方或端点），按计划第 2.2 节，
从 ${SOURCE_DSH_HOME}/profiles/desktop/cordis.patch.yml 只提取所需的提供方、
模型与端点条目，写进本次配置档 ${PROFILE}/cordis.patch.yml，然后重启本服务。
不更换测试目标模型。仍不可用时，受影响项记「无法判断」，不算插件业务失败。

结束后 Ctrl-C 或：
  kill "\$(cat ${BASE}/logs/web.pid)"
请同时关闭本次打开的 Chrome 窗口，否则 cleanup.sh 会拒绝删除 BASE。

TXT

wait "$PID"
