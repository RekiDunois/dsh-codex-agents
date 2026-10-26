#!/usr/bin/env bash
# dsh-codex-agents 测试 recipe：按测试计划 v12 第 2 节准备隔离的 web 运行环境。
#
# 用法（仓库根，必须让 direnv 生效以取得 Node 24+）：
#   bash plan/dsh-codex-agents-test-recipe/prepare.sh
#
# 本脚本对应 v12 第 2.1—2.4 节，只做环境准备与安装，不执行 T1—T7。
# 隔离范围：只隔离本次 DSH_HOME 与测试工作区；
# HOME 不变，全局角色按计划写入 $HOME/.codex/agents，仅新建、不覆盖。

set -euo pipefail

PRODUCER="$(pwd -P)"
SOURCE_SHA="$(git rev-parse HEAD)"
DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

fail() { printf '错误：%s\n' "$1" >&2; exit 1; }
note() { printf '· %s\n' "$1"; }

# ---------- 2.1 源码位置与隔离目录 ----------
note "检查来源仓库位置"
case "$PRODUCER" in
  */worktrees/*|*/apm-consumers/*) fail "请在真实源码目录执行，不要在 ${PRODUCER}" ;;
esac
test -f package.json || fail "缺少 package.json，产品尚未实现"
test -f src/index.ts || fail "缺少 src/index.ts，产品尚未实现"
test -x "$DSH_BIN" || fail "找不到 dsh 命令行：${DSH_BIN}"
command -v yq >/dev/null || fail "需要 yq"

note "检查 Node 版本"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node $(node --version) 低于 24；请在仓库根用 direnv exec 执行"
printf '· node=%s\n' "$(node --version)"

# 在指定本轮 DSH_HOME 前记下现有受管理凭据的来源
SOURCE_DSH_HOME="$HOME/.dsh"
if [ -n "${DSH_HOME:-}" ]; then SOURCE_DSH_HOME="$DSH_HOME"; fi

umask 077
BASE="$(mktemp -d /tmp/dca-test.XXXXXX)"
mkdir -p "$BASE"/{home,dist,logs,consumer-a/.codex/agents,consumer-b/.codex/agents}
PROFILE="$BASE/home/profiles/web"

# 值一律加引号，路径含空格时 source 才不会断词
cat > "$BASE/logs/paths.env" <<ENV
BASE="$BASE"
PRODUCER="$PRODUCER"
SOURCE_SHA="$SOURCE_SHA"
PROFILE="$PROFILE"
SOURCE_DSH_HOME="$SOURCE_DSH_HOME"
ENV
note "隔离目录：${BASE}"
note "产品提交：${SOURCE_SHA}"
"$DSH_BIN" --version 2>&1 | sed 's/^/· dsh /'

# ---------- 2.2 复用已有模型凭据 ----------
note "复制受管理凭据到本次隔离目录"
CREDENTIAL_SOURCE="$SOURCE_DSH_HOME/.credentials.yaml"
if test -r "$CREDENTIAL_SOURCE"; then
  install -m 600 "$CREDENTIAL_SOURCE" "$BASE/home/.credentials.yaml"
  note "已复制凭据（不打印内容）"
else
  note "没有找到 ${CREDENTIAL_SOURCE}，将由执行工程师确认环境变量方式可用"
fi

# ---------- 2.3 两组测试角色 ----------
note "写入项目角色"
cat > "$BASE/consumer-a/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "甲工作区角色"
developer_instructions = """
甲工作区的审核角色，识别标记 MARKER_OLD。
被问到职责时，请报告自己的识别标记。
"""
TOML
cat > "$BASE/consumer-b/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "乙工作区角色"
developer_instructions = """
乙工作区的审核角色，识别标记 MARKER_BETA。
被问到职责时，请报告自己的识别标记。
"""
TOML
cat > "$BASE/consumer-b/.codex/agents/beta-only.toml" <<'TOML'
name = "beta_only"
description = "乙工作区独有"
developer_instructions = """
乙工作区独有角色，识别标记 MARKER_BONLY。
"""
TOML

note "写入全局角色到 ${HOME}/.codex/agents（仅新建，不覆盖）"
GLOBAL_AGENTS="$HOME/.codex/agents"
mkdir -p "$GLOBAL_AGENTS"

# 计划第 2.3 节要求：文件名或 TOML 角色名与已有角色冲突都要在正式运行前处理。
# 文件名冲突会直接覆盖，角色名冲突会让 T2、T3 的场景输入失真，两者都拦下。
for file in reviewer.toml global-only.toml; do
  if test -e "$GLOBAL_AGENTS/$file"; then
    fail "已存在 ${GLOBAL_AGENTS}/${file}，不得覆盖。请先选择不冲突的测试名称并同步场景输入"
  fi
done
for name in reviewer global_only; do
  for existing in "$GLOBAL_AGENTS"/*.toml; do
    test -e "$existing" || continue
    got="$(yq -p toml -oy '.name // ""' "$existing" 2>/dev/null || true)"
    if [ "$got" = "$name" ]; then
      fail "已有角色 ${existing} 的 name 也是 ${name}，会让 T2、T3 场景失真。请改名后重跑"
    fi
  done
done
note "全局角色文件名与角色名均无冲突"
cat > "$GLOBAL_AGENTS/reviewer.toml" <<'TOML'
name = "reviewer"
description = "全局同名角色"
developer_instructions = """
全局角色，识别标记 MARKER_WORLD。
被问到职责时，请报告自己的识别标记。
"""
TOML
cat > "$GLOBAL_AGENTS/global-only.toml" <<'TOML'
name = "global_only"
description = "仅全局可用"
developer_instructions = """
全局独有角色，识别标记 MARKER_GLOBAL。
被问到职责时，请报告自己的识别标记。
"""
TOML
printf 'GLOBAL_AGENTS="%s"\n' "$GLOBAL_AGENTS" >> "$BASE/logs/paths.env"

# ---------- 2.4 打包、安装 ----------
note "构建与打包"
npm install --silent > "$BASE/logs/npm-install.log" 2>&1 || fail "npm install 失败，见 ${BASE}/logs/npm-install.log"
npm pack --pack-destination "$BASE/dist" > "$BASE/logs/npm-pack.log" 2>&1 || fail "npm pack 失败，见 ${BASE}/logs/npm-pack.log"
PKG="$(find "$BASE/dist" -maxdepth 1 -name 'dsh-codex-agents-*.tgz' -type f -print -quit)"
test -n "$PKG" && test -s "$PKG" || fail "没有生成安装包"
printf 'PKG="%s"\n' "$PKG" >> "$BASE/logs/paths.env"

note "安装到本次 web 配置档"
DSH_HOME="$BASE/home" "$DSH_BIN" plugin --profile web add "$PKG" \
  > "$BASE/logs/plugin-add.log" 2>&1 || fail "安装失败，见 ${BASE}/logs/plugin-add.log"
test -f "$PROFILE/cordis.patch.yml" || fail "安装后缺少 ${PROFILE}/cordis.patch.yml"

note "设置 T6 需要的 maxDepth=2"
PATCH_FILE="$PROFILE/cordis.patch.yml"
if test "$(yq '[.[] | select(.id == "subagent")] | length' "$PATCH_FILE")" = 0; then
  yq -i '(. // []) += [{"id": "subagent", "config": {"maxDepth": 2}}]' "$PATCH_FILE" \
    || fail "写入 maxDepth 失败"
else
  yq -i '(.[] | select(.id == "subagent") | .config.maxDepth) = 2' "$PATCH_FILE" \
    || fail "更新 maxDepth 失败"
fi
ACTUAL="$(yq '[.[] | select(.id == "subagent")][0].config.maxDepth' "$PATCH_FILE")"
[ "$ACTUAL" = "2" ] || fail "maxDepth 未生效，实际为 ${ACTUAL}"
printf 'MAXDEPTH=%s\n' "$ACTUAL" >> "$BASE/logs/paths.env"

cat <<TXT

准备完成：${BASE}

后续在运行终端先设置本次目录：
  export BASE="${BASE}"

后续按顺序：
  bash plan/dsh-codex-agents-test-recipe/start.sh    # 启动 web 服务并打开隔离浏览器
  bash plan/dsh-codex-agents-test-recipe/static-check.sh
  （在网页里登记两个工作区、建会话，然后按第 3 节执行 T1—T7）
  bash plan/dsh-codex-agents-test-recipe/cleanup.sh

TXT
