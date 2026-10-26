# dsh-codex-agents 测试计划

- 版本：v13
- 日期：2026-10-26
- 状态：执行状态已记录；第一、第二关结论见独立审核记录（[PR #1 测试计划第 13 版审核评论](https://github.com/RekiDunois/dsh-codex-agents/pull/1#issuecomment-6409879693)）。T1—T7 已于 2026-10-26 按本计划执行，逐项结果与执行记录见第 4 节及 4.1；第三关待独立审核
- 目标：PR #1 已确认的六条业务成功标准，以及 `plan/dsh-codex-agents.md` v12（产品设计沿用已批准的 v11）
- 目标宿主参考版本：`@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.3`，参考源码 `deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60`；正式执行只记录实际版本及适用性
- 本版调整：沿用 v12 的网页入口、当前账户 `HOME`、隔离 `DSH_HOME` 与测试工作区、不单独管理浏览器资料目录及保留运行记录的约定；第 2.5 节补齐复用已有隔离安装时恢复测试输入的步骤。T1—T7、检查方式与范围不变。

## 1. 必测清单

验收只针对本插件。宿主预设注册器、工作区服务、安装器、浏览器和递归拦截器的内部正确性不在本次测试范围；本插件是否选择正确角色、传递当前宿主上限以及完成委派仍需检查。正常工具返回和子代理实际答复是主要观察入口；不能用模型声称“已调用”替代真实工具结果。

| 编号 | 对应业务目标 | 输入或场景 | 预期业务结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 1 | 甲工作区的 `reviewer` TOML，调用 `spawn_agent` | 启动子代理，实际使用甲角色的 `MARKER_OLD` 指令 | 工具启动结果、子代理答复及必要时现成会话记录 |
| T2 | 2 | 甲、乙和全局都有同名 `reviewer` | 甲选甲、乙选乙，均不选全局同名角色 | 复用 T1 的甲结果，与乙结果比较 |
| T3 | 2、3 | 甲调用全局独有 `global_only`，再调用未知 `nobody`；乙有独有 `beta_only` | 全局独有角色可用；未知角色报错且列出甲可见角色，不列出乙独有角色、不启动未知子代理 | 两次工具结果；成功子代理答复 |
| T4 | 4 | 查看本插件顶层加载路径并复用 T1 首次委派 | 插件入口不等待角色目录扫描或预设预注册完成；首次会话可调用 `spawn_agent` | 一次生产源码检查与 T1 结果 |
| T5 | 5 | 不重启，把甲 `reviewer` 指令从 `MARKER_OLD` 改为 `MARKER_NEW` 后立即再次调用 | 新子代理使用新指令 | 新旧两次子代理答复；与 T7 共用一次目录监听到异步刷新路径的源码检查 |
| T6 | 6 | 在宿主允许两层委派的隔离配置下，由子代理再次调用 `spawn_agent` | 第一层子代理实际调用同一工具并成功启动下一层；插件使用宿主当前的 `maxDepth` | 两层实际工具结果；检查插件委派处读取并传递 `resolveMaxDepth()` 的代码 |
| T7 | 5 | 在甲新增再删除 `extra.toml`，每次变化后立即调用 | 新增后可启动，删除后报未知角色且不再列出 `extra`，全程无需重启 | 两次工具结果，新增角色的答复 |

T1—T7 是现有已确认目标的检查入口。T4 复用 T1，不新增启动试验；T6 只运行一次允许再委派的场景，不用另一组配置重新证明宿主拦截行为。T5、T7 直接检查文件变化后的业务结果，并共用一次生产源码检查确认目录事件确实安排异步刷新；不额外运行监听试验，不要求强制丢失监听事件、读取监听器状态或建立追踪程序。

## 2. 正式运行环境与安装

### 2.1 官方网页入口与独立运行目录

本轮正式验证使用 DSH 官方的 `web` 配置档和浏览器界面。它沿用宿主的角色预设、工作区与子代理服务，检查对象仍是本插件的 `spawn_agent`；不把桌面应用外壳列入验收。采用此入口是为了避免桌面应用另行使用当前账户的 Electron 数据目录，**不要求专用 macOS 登录账户，不覆盖或修改 `HOME`**。

仅对本次 DSH 进程和插件安装命令指定独立 `DSH_HOME`，浏览器由执行工程师使用现有工具打开测试网页，不规定资料目录。日常 DSH 配置档和会话不用于本次测试，无需退出或修改桌面应用。可复用仍有效的隔离安装和已通过结果。

在本仓库实际源码目录执行；不得把 `worktrees/` 或 `apm-consumers/` 当作来源仓库：

```bash
PRODUCER="$(pwd -P)"
SOURCE_SHA="$(git rev-parse HEAD)"
DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
test -x "$DSH_BIN" || exit 1
printf '产品提交：%s\n' "$SOURCE_SHA"
"$DSH_BIN" --version

# 在指定本轮 DSH_HOME 前记下现有受管理凭据的来源。
SOURCE_DSH_HOME="$HOME/.dsh"
if test -n "$DSH_HOME"; then SOURCE_DSH_HOME="$DSH_HOME"; fi

umask 077
BASE="$(mktemp -d /tmp/dca-test.XXXXXX)"
mkdir -p "$BASE/home" "$BASE/dist" "$BASE/logs" \
  "$BASE/consumer-a/.codex/agents" "$BASE/consumer-b/.codex/agents"
PROFILE="$BASE/home/profiles/web"
printf '本次隔离目录：%s\n' "$BASE"
```

记录实际宿主版本及 `BASE`。本次 Web 配置档、会话和插件安装只写到 `BASE`；若宿主版本与参考版本不同，判断本次结果是否仍适用，不仅因版本号改变而重跑。

### 2.2 复用已有模型凭据

继续使用已确定的提供方和模型，不为测试另申请账号或密钥。测试进程可直接继承现有有效的模型环境变量；需要受管理凭据时，从本机当前账户的原 `DSH_HOME` 只读复制凭据文件到本次隔离目录：

```bash
CREDENTIAL_SOURCE="$SOURCE_DSH_HOME/.credentials.yaml"
if test -r "$CREDENTIAL_SOURCE"; then
  install -m 600 "$CREDENTIAL_SOURCE" "$BASE/home/.credentials.yaml"
fi
```

仅本次 `$BASE/home/.credentials.yaml` 可由测试进程写入；不改来源文件，不打印凭据值，不复制日常会话或整个配置档。若原桌面配置档的模型选择含必要的自定义提供方、模型或端点，本地测试工程师从当前实际生效的配置来源（例如 `$SOURCE_DSH_HOME/profiles/desktop/cordis.patch.yml`）只提取相关设置，在本轮新建的网页配置档中配置；默认值已能使用同一模型时不做迁移。可在测试网页的“设置 → 模型”确认最终生效配置。没有可用凭据或必要设置时，受影响项记为环境未就绪，不算插件业务失败。

依据：[DSH 本地凭据说明](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/credentials-local/README.zh.md)、[官方网页入口](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/web-app/README.zh.md)。

### 2.3 创建两组测试角色

甲、乙项目角色放在 `BASE` 内；全局角色两份临时文件放在当前账户实际的 `$HOME/.codex/agents/`，`HOME` 保持不变。角色名取 TOML 的 `name`，不是文件名；标记只写在角色指令中，父会话调用消息不直接告知标记。仅新建本次测试拥有的文件，不覆盖或修改任何已有全局角色；如果文件名或 TOML 角色名与已有角色冲突，由本地测试工程师在正式运行前选择不冲突的测试名称并同步场景输入，不能覆盖原文件。

```bash
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
GLOBAL_AGENTS="$HOME/.codex/agents"
mkdir -p "$GLOBAL_AGENTS"
# 本次仅新建以下两份文件；不得覆盖当前账户已有角色文件。
for file in reviewer.toml global-only.toml; do
  if test -e "$GLOBAL_AGENTS/$file"; then
    printf "已有全局角色文件，不得覆盖；先处理测试输入名称冲突：%s\n" "$GLOBAL_AGENTS/$file"
    exit 1
  fi
done
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
cat > "$BASE/consumer-b/.codex/agents/beta-only.toml" <<'TOML'
name = "beta_only"
description = "乙工作区独有"
developer_instructions = """
乙工作区独有角色，识别标记 MARKER_BONLY。
"""
TOML
```

本次全局角色只在测试期间临时加入当前 `HOME` 下的角色目录；测试结束后仅删除确认由本次创建的两份文件。已有角色文件保持原状，不要求专用账户或修改 `HOME`。

### 2.4 正式打包、安装与启动

首次准备此隔离运行目录时，从被测源码构建正式安装包，并通过宿主插件管理命令安装到本次 `web` 配置档。已有有效隔离安装直接复用，不能因提交编号变化自动重装。

```bash
cd "$PRODUCER"
npm install
npm pack --pack-destination "$BASE/dist"
PKG="$(find "$BASE/dist" -maxdepth 1 -name 'dsh-codex-agents-*.tgz' -type f -print -quit)"
test -n "$PKG" && test -s "$PKG" || exit 1

DSH_HOME="$BASE/home" "$DSH_BIN" plugin --profile web add "$PKG"
test -f "$PROFILE/cordis.patch.yml" || exit 1
```

`npm pack` 按产品 `prepack` 生成可安装产物；若正式包无法加载，交产品实现者修复，不手改消费者。本轮不另加类型检查或宿主源码测试作为通过条件。

T6 的合法调用链需要允许两次委派（父代理 → 子代理 → 孙代理）。在**本次独立** `$PROFILE/cordis.patch.yml` 中设置 `subagent` 行的 `maxDepth=2`，不编辑用户现有配置。已存在该行时仅改此字段，其余配置保持不变：

```bash
PATCH="$PROFILE/cordis.patch.yml"
if test "$(yq '[.[] | select(.id == "subagent")] | length' "$PATCH")" = 0; then
  yq -i '(. // []) += [{"id": "subagent", "config": {"maxDepth": 2}}]' "$PATCH"
else
  yq -i '(.[] | select(.id == "subagent") | .config.maxDepth) = 2' "$PATCH"
fi
```

记录实际生效的设置。无需额外切换成 1 来测试宿主已经实现的拦截器，也不重新验证其异常类型。

从甲项目目录启动正式 Web 运行时，保持该终端中的进程运行，直到测试结束：

```bash
cd "$BASE/consumer-a"
DSH_HOME="$BASE/home" "$DSH_BIN" web --no-open --host 127.0.0.1 --port 0
```

`--port 0` 让系统分配空闲端口；启动时终端打印一条 `dsh web:` 地址。该地址包含进程访问凭据，只在本机使用，不写入公开记录。由执行工程师使用现有浏览器控制工具打开完整地址，也可手动在浏览器中打开。本次不要求独立浏览器资料目录；访问地址不得写入公开记录。不需要启动 Desktop，也不需要专用 macOS 用户。

在测试网页中使用“添加工作区”登记 `$BASE/consumer-a`、`$BASE/consumer-b` 并分别创建会话。确认当前提供方、模型与必要端点配置正确；如果默认值不能使用已保存凭据，在**本次 Web 设置页**配置原本已确定的模型，不更换测试目标模型。发送一条简短正常消息确认模型可用，作为环境预检，不计入 T1—T7 通过结果。网页或模型环境故障记为“无法判断”，不能当成插件业务失败。

依据：[官方网页运行参数与会话](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/web-app/README.zh.md)、[CLI 配置档及插件安装说明](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/cli/README.zh.md)。


### 2.5 复用已有隔离安装

已有安装仍适用于待检查的业务行为、配置与宿主版本，且确需重新执行受影响的必测项时，复用上次的 `BASE`。已取得当前有效通过结果的项目直接引用原记录，不因产品提交编号变化而重跑；若新产品提交实际改变受影响项，则从新提交经第 2.4 节正式安装生成新消费者，不能用旧包代替新版本。

```bash
# 填写上次 prepare.sh 实际输出的目录；不要再次执行 prepare.sh。
export BASE="/tmp/dca-test.实际目录"
test -f "$BASE/logs/paths.env" || exit 1
. "$BASE/logs/paths.env"
test -s "$PKG" || exit 1
test -f "$PROFILE/cordis.patch.yml" || exit 1

# T7 创建的文件只在本次隔离工作区中清理；角色正文按第 2.3 节恢复。
rm -f "$BASE/consumer-a/.codex/agents/extra.toml"
```

随后**只重做第 2.3 节创建测试角色的命令**：甲 `reviewer` 恢复 `MARKER_OLD`，乙 `reviewer` 和 `beta_only` 恢复原始内容；全局 `reviewer` 与 `global_only` 若已由上次 `cleanup.sh` 删除，则按该节的文件冲突检查后重新创建。不得覆盖用户已有全局角色；发生冲突时沿用第 2.3 节的更名约定。这里仅重置测试输入，不重新创建 `BASE`，也不运行 `npm install`、`npm pack` 或 `dsh plugin add`。

从仓库根目录直接执行 `bash plan/dsh-codex-agents-test-recipe/start.sh`；复用原工作区登记和网页配置，按需要建立本轮新会话，只检查确实受影响的 T1—T7 项目。T5、T7 所需的前后调用仍在各自规定的同一会话内完成。记录复用的 `BASE`、`SOURCE_SHA`、安装包、配置及原通过结果来源。

## 3. 执行 T1—T7

**T4（静态部分，先看一次）**：在本次被测产品源码中沿 `src/index.ts` 顶层 `apply` 的直接初始化路径检查：不得同步逐工作区读角色 TOML，也不得等待所有预设注册完成才返回。允许注册工具、订阅工作区变化、调度后台刷新。随后复用 T1 第一次正常委派说明工具可用，不计时、不模拟大量角色文件。仅据启动服务成功不能判 T4 通过。

**T1**：甲工作区新会话发送：“调用 `spawn_agent`，`task_name=t1`，`agent_type=reviewer`，`message=请按照你自己的角色说明介绍职责并报告角色标记`。”核对确实有 `spawn_agent` 工具调用并启动子代理，子代理答复包含 `MARKER_OLD`，不包含 `MARKER_WORLD`。不得让父提示带上任何待判的标记文本。

**T2**：直接复用 T1 的甲结果。乙工作区新会话按 T1 的消息调用 `reviewer`（`task_name=t2`），应成功并答复 `MARKER_BETA`，不出现甲或全局的标记。无需再专门运行第三次全局同名角色。

**T3**：在甲先调用 `spawn_agent(task_name="t3a", agent_type="global_only", message="请介绍职责并报告自己的角色标记")`，应成功，子代理答复 `MARKER_GLOBAL`；再调用 `spawn_agent(task_name="t3b", agent_type="nobody", message="请介绍职责")`，应明确返回未知角色错误，列出甲可用的 `reviewer`、`global_only`，不列出乙独有的 `beta_only`，不启动 `nobody` 子代理。不要求错误包含角色文件路径或固定完整句式。

**T5/T7（共享一次静态检查）**：读取本次被测产品的 `src/watch.ts`、`src/manager.ts` 相关代码，确认顶层用 `node:fs.watch` 监听角色目录，收到 `change`／`rename` 后会安排异步读取并刷新对应角色预设。只检查该产品路径，不验证操作系统监听服务、不运行额外监听试验，也不采集事件轨迹。

**T5**：保持本次网页服务进程与甲会话不重启，将 `$BASE/consumer-a/.codex/agents/reviewer.toml` 内的 `MARKER_OLD` 改为不互相包含的 `MARKER_NEW`，立即按 T1 调用（`task_name=t5`）。本次新子代理必须报告 `MARKER_NEW`，不能继续使用 `MARKER_OLD`。只判断实际新角色指令，**不追加预设 ID 格式或内部代际检查**。

**T7**：仍在同一甲会话、同一网页服务进程中，新建 `$BASE/consumer-a/.codex/agents/extra.toml`：

```toml
name = "extra"
description = "甲工作区临时角色"
developer_instructions = """
甲临时角色，识别标记 MARKER_EXTRA。
被问到职责时，请报告自己的识别标记。
"""
```

保存后立即调用 `spawn_agent(task_name="t7a", agent_type="extra", message="请介绍职责并报告角色标记")`，应启动并报告 `MARKER_EXTRA`。删除 `extra.toml` 后立即再次调用同名角色（`task_name=t7b`），应明确报未知，名单不含 `extra`，不启动子代理。无需监听事件轨迹或模拟事件丢失。

**T6（最后做）**：确认本次隔离宿主配置允许 `maxDepth=2`。在甲父会话调用 `spawn_agent(task_name="t6-outer", agent_type="reviewer", message="请实际调用 spawn_agent，task_name=t6-inner，agent_type=reviewer，message=请介绍职责；然后报告这次工具调用的实际结果")`。检查第一层子代理**真实调用** `spawn_agent`，实际启动下一层子代理，不以它口头说“已委派”作为证据。针对“遵守宿主现行上限”的插件责任，在被测产品 `src/tool.ts` 的委派处确认它每次从 `ctx.subagents.resolveMaxDepth()` 获取现行值并送入 `startActivation` 请求。此处不另测宿主上限 1 的拦截实现。如果第一层模型没有实际发出工具调用，记录“无法判断”，不临场变换提示、模型或配置追求通过。

上述所有业务结果优先直接采用网页界面当前工具卡片与子代理会话内容。仅当显示信息不足以判断某项时，再按现成会话记录定位与该项相关的内容；不默认读取 `session.v4.jsonl.zstd`、枚举所有 `request/header`、重建调用链或添加采集程序。

## 4. 重试、停止与记录

- 外部可重试故障限模型请求超时、临时下载错误和非产品原因的独立测试进程故障：**同输入、配置、模型及版本最多两次正式尝试**。先记录第一次结果并确认不会重复造成业务副作用；已确定的业务失败不得通过重试抹掉。
- 插件业务失败（选错角色、未知角色回退、文件变化后仍使用旧指令、无法合法再委派）保留实际失败，交产品实现者。模型凭证不可用、独立网页配置档无法启动或缺少可观察结果时记录“无法判断／未执行”，只暂停受影响项。
- 如产品或步骤修订，只复核受影响项目；有效旧通过结果引用已有记录，不因提交号改变重跑。
- 测试结束停止本次 `web` 服务并关闭测试网页，不停止或重启日常应用／服务。只删除第 2.3 节确认由本次创建的 `$HOME/.codex/agents/reviewer.toml`、`global-only.toml`，不得删除或覆盖其它角色。`cleanup.sh` 不删除 `BASE`，正式运行记录保留供复核；不提交凭据、会话原文或临时文件到 Git。

| 编号 | 结果（通过／业务失败／无法判断／未执行） | 实际输入与观察到的结果 | 记录位置或复用来源 |
|---|---|---|---|
| T1 | 通过 | 甲 `consumer-a` 会话调用 `spawn_agent(task_name="t1", agent_type="reviewer", message=…)`，工具卡显示子代理 t1 启动并完成（6 秒），答复含 `MARKER_OLD`，全文不含 `MARKER_WORLD`；子代理会话预设为 `dshca_reviewer_72e917d8…`（甲工作区来源） | `$BASE/logs/evidence/T1-snapshot.txt`、`T1-screenshot.txt` |
| T2 | 通过 | 复用 T1 甲结果；乙 `consumer-b` 会话按同一消息调用 `t2`，工具卡显示子代理 t2 启动并完成，答复含 `MARKER_BETA`，未出现甲或全局标记；子代理会话预设为 `dshca_reviewer_ca98c7b3…`（乙工作区来源），与 T1 的甲预设不同 | `$BASE/logs/evidence/T2-snapshot.txt` |
| T3 | 通过 | 甲调用 `t3a`/`global_only` 成功，答复含 `MARKER_GLOBAL`（预设 `dshca_global_only_4aa39718…`）；再调用 `t3b`/`nobody` 返回 `Error: Unknown agent_type "nobody". Available: global_only, implementation_reviewer, plan_reviewer, reviewer`，未启动子代理，名单不含乙独有的 `beta_only` | `$BASE/logs/evidence/T3a-snapshot.txt`、`T3b-snapshot.txt` |
| T4 | 通过 | `src/index.ts` 的 `apply` 到 `ctx.effect` 之间无 `await`、无同步目录读取：只 `createManager`、`ctx.tools.register`，扫描由 `setTimeout(…, 0)` 延后到 `manager.start()`；随后复用 T1 首次委派成功，说明工具在首次会话可用 | `$BASE/logs/evidence/static-check.txt`、`T1-snapshot.txt` |
| T5 | 通过 | 不重启服务、同一甲会话内把 `consumer-a/.codex/agents/reviewer.toml` 的 `MARKER_OLD` 改为 `MARKER_NEW` 后立即调用 `t5`，新子代理答复 `MARKER_NEW`，不再使用旧标记；共享源码检查确认 `src/watch.ts` 用 `node:fs.watch` 监听，事件经 `schedule()` 防抖后异步刷新 | `$BASE/logs/evidence/T5-snapshot.txt`、`static-check.txt` |
| T6 | 通过 | 隔离配置 `subagent.config.maxDepth=2`。甲父会话调用 `t6-outer`（reviewer），该子代理真实调用 `spawn_agent(task_name="t6-inner")` 并得到 `started subagent 1d80a3d4…`，内层答复 `MARKER_NEW`；内层会话 `delegationDepth=2`、外层 `delegationDepth=1`。插件侧 `src/tool.ts` 每次调用先 `ctx.subagents.resolveMaxDepth()` 再送入 `startActivation` 请求 | `$BASE/logs/evidence/T6-twolevel-snapshot.txt`、`static-check.txt`、`$BASE/home/sessions/…` |
| T7 | 通过 | 同一甲会话内新建 `extra.toml` 后立即调用 `t7a`/`extra`，子代理启动并答复 `MARKER_EXTRA`（预设 `dshca_extra_1d506eae…`）；删除该文件后立即调用 `t7b`/`extra`，返回 `Error: Unknown agent_type "extra". Available: global_only, implementation_reviewer, plan_reviewer, reviewer`，未启动子代理，名单不含 `extra`；全程未重启 | `$BASE/logs/evidence/T7a-snapshot.txt`、`T7b-snapshot.txt` |

T1—T7 全部取得当前有效通过结果，无业务失败项。

执行记录同时写明产品提交 `SOURCE_SHA`、正式包路径、实际 DSH 网页运行时版本、隔离的 `DSH_HOME` 与 `BASE`、生效提供方／模型及必要的配置覆盖、正式尝试与失败原因。配置和输出只保存检查这些业务目标所需的部分。

### 4.1 正式执行记录（2026-10-26）

| 项目 | 实际值 |
|---|---|
| 产品提交 `SOURCE_SHA` | `59ea676ee54471b75364524bbe45f25205296efc`（`src/`、`lib/`、`locale/`、`package.json` 与打包时所用 `e15e872` 完全相同） |
| 正式安装包 | `/tmp/dca-test.ptjKdb/dist/dsh-codex-agents-0.1.0.tgz`，由 `dsh plugin --profile web add` 安装到隔离配置档 |
| DSH 网页运行时 | `dsh 0.2.1-rc.3` |
| 隔离 `DSH_HOME` | `/tmp/dca-test.ptjKdb/home`（`BASE=/tmp/dca-test.ptjKdb`，沿用准备阶段安装，未重新打包或安装） |
| 测试工作区 | `$BASE/consumer-a`、`$BASE/consumer-b`；全局角色目录为当前账户 `$HOME/.codex/agents` |
| 生效模型 | 提供方 `deepseek-official`、模型 `deepseek-flash`、推理等级 `high`（未做额外覆盖） |
| 配置覆盖 | 仅 `subagent.config.maxDepth=2`，写在本次 `$BASE/home/profiles/web/cordis.patch.yml` |
| 环境预检 | 甲会话发送“环境预检：请用一句话回复…”，模型返回“模型可用。”，不计入 T1—T7 |
| 正式尝试 | 每项一次；无外部故障重试，无业务失败 |
| 操作偏差 | 网页「添加工作区」按钮在本轮 headless 浏览器中不弹出目录选择框，两个工作区改由页面内调用宿主同一 `workspace/create` 接口登记（路径为 `$BASE/consumer-a`、`$BASE/consumer-b`），随后的工作区列表、会话创建与 T1—T7 全部在网页界面完成；产品代码与业务检查方式未变 |
| T6 过程记录 | 第一次 T6 消息未按计划原文套外层 `spawn_agent(task_name="t6-outer", …)`，只把内层指令正文发给了父会话，因此仅启动了单层 `t6-inner`（`delegationDepth=1`），不计入 T6；随后按计划原文重新发送 `t6-outer` 消息，取得两层真实委派结果，作为 T6 正式结果 |
| 收尾 | `cleanup.sh` 停止 web 服务（PID 98942）、删除本次创建的两份全局角色，`BASE` 与运行记录保留；关闭测试网页与浏览器进程 |

**交接**：T1—T7 已由本地执行工程师按 v13 执行并记录，第三关待独立测试计划审核者复核。本记录不代表合并批准。
