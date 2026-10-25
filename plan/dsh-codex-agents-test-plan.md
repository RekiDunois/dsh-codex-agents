# dsh-codex-agents 测试计划

- 版本：v9
- 日期：2026-10-26
- 状态：已修订，待独立复核；未进行正式测试
- 目标：PR #1 已确认的六条业务成功标准，以及已通过审核的 `plan/dsh-codex-agents.md` v11
- 目标宿主参考版本：`@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.3`，参考源码 `deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60`；正式执行只记录实际版本及适用性
- 本版调整：通过隔离的 DSH Desktop 正式插件安装与原生界面运行；复用桌面端已保存凭证的独立副本；删除独立浏览器、网页服务端口检查、宿主递归拦截双配置试验、预设 ID 格式检查和重复的内部会话取证。未增加业务测试。

## 1. 必测清单

验收只针对本插件。宿主预设注册器、工作区服务、安装器、浏览器和递归拦截器的内部正确性不在本次测试范围；本插件是否选择正确角色、传递当前宿主上限以及完成委派仍需检查。正常工具返回和子代理实际答复是主要观察入口；不能用模型声称“已调用”替代真实工具结果。

| 编号 | 对应业务目标 | 输入或场景 | 预期业务结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 1 | 甲工作区的 `reviewer` TOML，调用 `spawn_agent` | 启动子代理，实际使用甲角色的 `MARKER_OLD` 指令 | 工具启动结果、子代理答复及必要时现成会话记录 |
| T2 | 2 | 甲、乙和全局都有同名 `reviewer` | 甲选甲、乙选乙，均不选全局同名角色 | 复用 T1 的甲结果，与乙结果比较 |
| T3 | 2、3 | 甲调用全局独有 `global_only`，再调用未知 `nobody`；乙有独有 `beta_only` | 全局独有角色可用；未知角色报错且列出甲可见角色，不列出乙独有角色、不启动未知子代理 | 两次工具结果；成功子代理答复 |
| T4 | 4 | 查看本插件顶层加载路径并复用 T1 首次委派 | 插件入口不等待角色目录扫描或预设预注册完成；首次会话可调用 `spawn_agent` | 一次生产源码检查与 T1 结果 |
| T5 | 5 | 不重启，把甲 `reviewer` 指令从 `MARKER_OLD` 改为 `MARKER_NEW` 后立即再次调用 | 新子代理使用新指令 | 新旧两次子代理答复，必要时核对现成系统提示 |
| T6 | 6 | 在宿主允许两层委派的隔离配置下，由子代理再次调用 `spawn_agent` | 第一层子代理实际调用同一工具并成功启动下一层；插件使用宿主当前的 `maxDepth` | 两层实际工具结果；检查插件委派处读取并传递 `resolveMaxDepth()` 的代码 |
| T7 | 5 | 在甲新增再删除 `extra.toml`，每次变化后立即调用 | 新增后可启动，删除后报未知角色且不再列出 `extra`，全程无需重启 | 两次工具结果，新增角色的答复 |

T1—T7 是现有已确认目标的检查入口。T4 复用 T1，不新增启动试验；T6 只运行一次允许再委派的场景，不用另一组配置重新证明宿主拦截行为。T5、T7 直接检查角色文件变化带来的业务结果，不要求强制丢失监听事件、读取监听器状态或建立追踪程序。

## 2. 正式运行环境与安装

### 2.1 唯一隔离入口

本版正式运行使用 **DSH Desktop 原生应用窗口及其受管理的 `desktop` 配置档**，不使用额外浏览器，不启动 `dsh web`，不需要网页端口或浏览器配置档。Desktop 的 `desktop` 配置档由 Electron 管理，不能通过普通 `dsh --profile desktop` 启动；正式插件安装使用 Desktop 自带的 `dsh plugin --profile desktop add` 入口。

**桌面端隔离条件**：在已经准备好的**专用 macOS 测试登录账户**中执行以下步骤（已有账户直接复用，一次正式尝试只新建 `BASE`）。这使 Electron 自身的应用数据、会话资料与日常登录账户分离。`DSH_HOME` 另设为本次 `BASE/home`。不准在日常账户只替换 `DSH_HOME` 就启动第二个 Desktop：宿主源码仍会使用 Electron 的用户数据目录，单独改 `DSH_HOME` 不能证明桌面界面状态已隔离。若测试账户或进入该账户的操作权限尚未准备好，本地测试工程师记录环境未就绪，暂停正式模型测试；不接入日常账户的应用数据、会话或浏览器状态。

在专用测试账户中进入本仓库的实际源码目录，确认它不是 `worktrees/` 或 `apm-consumers/`。本次固定以下路径并使用同一终端：

```bash
PRODUCER="$(pwd -P)"
SOURCE_SHA="$(git rev-parse HEAD)"
DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
DESKTOP_APP="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"
test -x "$DSH_BIN" && test -x "$DESKTOP_APP"
printf '产品提交：%s\n' "$SOURCE_SHA"
"$DSH_BIN" --version

umask 077
BASE="$(mktemp -d /tmp/dca-test.XXXXXX)"
mkdir -p "$BASE/home" "$BASE/dist" "$BASE/logs" \
  "$BASE/consumer-a/.codex/agents" "$BASE/consumer-b/.codex/agents"
PROFILE="$BASE/home/profiles/desktop"
printf '本次隔离目录：%s\n' "$BASE"
```

记录实际运行版本；若与计划参考版本不同，先确认本次结果对该宿主仍适用，不因版本字符串不同就把插件判为失败。`BASE` 内的安装、工作区、会话、运行记录必须独立于源码仓库和日常用户状态。复用既有有效的正式安装或测试结论时引用原记录，不因提交号变化自动重新安装。

### 2.2 复用桌面端凭证与模型选择

本地测试工程师从**日常 Desktop 用户已经保存**的配置准备一次受控输入：原 `DSH_HOME/.credentials.yaml` 的本机只读副本，以及当前已选择的提供方、模型和必要端点配置。副本须由有权限的人员在本机交给测试账户，保存在仅测试账户可读的路径；**不输出凭证明文、不上传仓库、不复制整个日常桌面配置档、插件树或会话**。测试账户使用下列命令安装副本；`CREDENTIAL_COPY` 的实际绝对路径由本地测试工程师在受控记录中写明：

```bash
CREDENTIAL_COPY="/实际由测试工程师准备的凭证副本绝对路径"
test -r "$CREDENTIAL_COPY" || exit 1
install -m 600 "$CREDENTIAL_COPY" "$BASE/home/.credentials.yaml"
```

受管理凭证文件本来就由 DSH 按 `$DSH_HOME/.credentials.yaml` 读取，测试实例从隔离 `DSH_HOME` 读取自己的副本，**不要求在启动后注入 `DEEPSEEK_API_KEY`**。该副本可能包含其他提供方记录，仅保存在本机私有 `BASE` 中，不回写来源，测试结束按第 5 节处理。若来源没有可用的已保存模型凭证，标为环境未就绪，不向产品报告业务失败。

在**第一次正式业务请求之前**，本地测试工程师把日常 Desktop 当前生效的提供方／模型／必要端点设置落实到本次独立 `desktop` 配置档。若内置默认配置能够用凭证副本直接调用模型，不必迁移任何配置。其他情况由原账户的本地测试工程师读取**当前实际生效的**桌面模型配置来源，仅提取所需条目（保留原有提供方与模型，不另外更换）：

```bash
# SOURCE_MODEL_PATCH 为原桌面配置档中实际包含模型设置的文件；
# MODEL_ROWS_COPY 是将交给测试账户的受控临时文件，仅在原账户内运行这一步。
SOURCE_MODEL_PATCH="/原桌面端实际模型配置文件绝对路径"
MODEL_ROWS_COPY="/受控交接目录/model-rows.yml"
umask 077
yq '[.[] | select(.id == "agent-default-model" or .id == "llm-deepseek" or .id == "llm-pi-ai")]' \
  "$SOURCE_MODEL_PATCH" > "$MODEL_ROWS_COPY"
chmod 600 "$MODEL_ROWS_COPY"
```

若原配置由多份正式覆盖文件共同决定，按原有优先级核对目标模型的相关条目后再交接，不能把不相关插件、用户工作区、工具权限或会话一起复制。测试账户在第 2.4 节创建自身配置档后再载入这些条目。执行时在独立桌面端“设置 → 模型”确认生效的提供方和模型，记录选择及配置来源，不读取或打印凭证值。无法取得必要受控配置时暂停受影响项。

参考：DSH 的 [本地凭证存储说明](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/credentials-local/README.zh.md) 和 [Desktop 插件管理入口](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/desktop/README.zh.md#bundled-command-runtime)。

### 2.3 创建两组测试角色

以下五个输入文件均在 `BASE` 内。角色名取 TOML 的 `name`，不是文件名；标记只写在角色指令中，父会话调用消息不直接告知标记。

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
mkdir -p "$BASE/test-home/.codex/agents"
cat > "$BASE/test-home/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "全局同名角色"
developer_instructions = """
全局角色，识别标记 MARKER_WORLD。
被问到职责时，请报告自己的识别标记。
"""
TOML
cat > "$BASE/test-home/.codex/agents/global-only.toml" <<'TOML'
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

测试用全局角色必须在 Desktop 启动时可见的 `HOME/.codex/agents` 下。本版在专用测试登录账户中将 `HOME` 指向一次性 `$BASE/test-home`，因此须在**关闭 Desktop 后**从同一终端用以下环境启动测试应用：

```bash
mkdir -p "$BASE/test-home/Library"
# 保留已有应用安装和运行时，切换的只是本次受控用户主目录与 DSH_HOME。
# 不用 open -a：该方式不保证把这两个变量传给新应用进程。
cd "$BASE/consumer-a"
HOME="$BASE/test-home" DSH_HOME="$BASE/home" "$DESKTOP_APP"
```

专用 macOS 账户保证 Electron 用户数据与日常账户相隔离。**上述 `HOME` 覆盖只用于让产品按正式全局角色路径读取测试 TOML；不得以它单独声称 Electron 用户数据也受到隔离。** 桌面端退出后才能执行 `desktop` 插件包操作。

### 2.4 正式打包、安装及启用

首次打开测试 Desktop，使其在 `$BASE/home/profiles/desktop` 初始化本次配置档，然后用应用菜单**完全退出**（关闭窗口不等于退出）。以下操作仅在确认这次 Desktop 已退出后执行。若前一步准备了模型配置条目副本，先在测试账户执行：

```bash
MODEL_ROWS_COPY="/实际由测试工程师交付的 model-rows.yml 绝对路径"
test -r "$MODEL_ROWS_COPY" && command -v yq || exit 1
MODEL_ROWS_COPY="$MODEL_ROWS_COPY" yq -i \
  '(. // []) += (load(strenv(MODEL_ROWS_COPY)) // [])' \
  "$PROFILE/cordis.patch.yml"
```

未准备模型配置条目副本且内置默认配置已足够时，直接跳过该段。只向**本次新建的** `desktop` 配置档加入条目，不编辑来源文件；不允许加入同一 `id` 的第二份覆盖。

```bash
cd "$PRODUCER"
npm install
npm pack --pack-destination "$BASE/dist"
PKG="$(find "$BASE/dist" -maxdepth 1 -name 'dsh-codex-agents-*.tgz' -type f -print -quit)"
test -n "$PKG" && test -s "$PKG"

HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
  "$DSH_BIN" plugin --profile desktop add "$PKG"
test -f "$PROFILE/cordis.patch.yml"
```

`npm pack` 按产品声明的 `prepack` 构建正式发布产物；本轮不重复要求运行 `npm run typecheck`、DSH 源码单元测试或宿主内部集成测试。若发布包没有可加载入口，交产品实现者修复生产包，不手改已安装消费者。

T6 需要允许父代理 → 子代理 → 孙代理一次合法委派，在本次配置档中使用宿主支持的 `maxDepth: 2`。本地测试工程师若尚未设置，可在测试配置档增加如下单条覆盖（同 `id` 已有覆盖时合并该条，不重复增加）：

```bash
# 在本次新建配置档尚无 subagent 覆盖行时执行一次；
# 通过 YAML 结构追加，避免把条目直接拼接到可能是 [] 的空列表之后。
test "$(yq '[.[] | select(.id == "subagent")] | length' "$PROFILE/cordis.patch.yml")" = 0 || exit 1
yq -i '(. // []) += [{"id": "subagent", "config": {"maxDepth": 2}}]' \
  "$PROFILE/cordis.patch.yml"
```

该设置仅用于使 **T6 的合法业务路径能够运行**。保留已有宿主其它必需配置，不改变插件的工具、代理角色或委派实现；记录本次实际生效值。无需再改回 1、重启做宿主上限拒绝试验，也无需额外验证宿主 `SubagentDepthError`。

完成凭证及模型配置后，用第 2.3 节命令重新打开隔离 Desktop。通过应用自带的“添加工作区”依次登记 `$BASE/consumer-a`、`$BASE/consumer-b`，分别创建会话；只需看工作区是否出现在当前界面，不默认另读宿主 `workspace.json`。先发送一条简短正常消息确认所选模型可用，作为必要环境预检；不把这条回复列入 T1—T7 的通过结果。模型或桌面启动故障记录为“无法判断”，不冒充插件失败。

## 3. 执行 T1—T7

**T4（静态部分，先看一次）**：在本次被测产品源码中沿 `src/index.ts` 顶层 `apply` 的直接初始化路径检查：不得同步逐工作区读角色 TOML，也不得等待所有预设注册完成才返回。允许注册工具、订阅工作区变化、调度后台刷新。随后复用 T1 第一次正常委派说明工具可用，不计时、不模拟大量角色文件。仅据启动服务成功不能判 T4 通过。

**T1**：甲工作区新会话发送：“调用 `spawn_agent`，`task_name=t1`，`agent_type=reviewer`，`message=请按照你自己的角色说明介绍职责并报告角色标记`。”核对确实有 `spawn_agent` 工具调用并启动子代理，子代理答复包含 `MARKER_OLD`，不包含 `MARKER_WORLD`。不得让父提示带上任何待判的标记文本。

**T2**：直接复用 T1 的甲结果。乙工作区新会话按 T1 的消息调用 `reviewer`（`task_name=t2`），应成功并答复 `MARKER_BETA`，不出现甲或全局的标记。无需再专门运行第三次全局同名角色。

**T3**：在甲先调用 `spawn_agent(task_name="t3a", agent_type="global_only", message="请介绍职责并报告自己的角色标记")`，应成功，子代理答复 `MARKER_GLOBAL`；再调用 `spawn_agent(task_name="t3b", agent_type="nobody", message="请介绍职责")`，应明确返回未知角色错误，列出甲可用的 `reviewer`、`global_only`，不列出乙独有的 `beta_only`，不启动 `nobody` 子代理。不要求错误包含角色文件路径或固定完整句式。

**T5**：保持桌面进程与甲会话不重启，将 `$BASE/consumer-a/.codex/agents/reviewer.toml` 内的 `MARKER_OLD` 改为不互相包含的 `MARKER_NEW`，立即按 T1 调用（`task_name=t5`）。本次新子代理必须报告 `MARKER_NEW`，不能继续使用 `MARKER_OLD`。只判断实际新角色指令，**不追加预设 ID 格式或内部代际检查**。

**T7**：仍在同一甲会话、同一桌面进程中，新建 `$BASE/consumer-a/.codex/agents/extra.toml`：

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

上述所有业务结果优先直接采用 Desktop 当前工具卡片与子代理会话内容。仅当显示信息不足以判断某项时，再按现成会话记录定位与该项相关的内容；不默认读取 `session.v4.jsonl.zstd`、枚举所有 `request/header`、重建调用链或添加采集程序。

## 4. 重试、停止与记录

- 外部可重试故障限模型请求超时、临时下载错误和非产品原因的独立测试进程故障：**同输入、配置、模型及版本最多两次正式尝试**。先记录第一次结果并确认不会重复造成业务副作用；已确定的业务失败不得通过重试抹掉。
- 插件业务失败（选错角色、未知角色回退、文件变化后仍使用旧指令、无法合法再委派）保留实际失败，交产品实现者。模型凭证不可用、无合法测试桌面隔离条件或缺少可观察结果记录“无法判断／未执行”，只暂停受影响项。
- 如产品或步骤修订，只复核受影响项目；有效旧通过结果引用已有记录，不因提交号改变重跑。
- 测试结束通过**退出本次专用 Desktop**停止测试运行，不停止或重启任何日常用户应用／服务。原始结果、必要运行配置及凭证副本保存在 `BASE` 下受控位置，直到复核完成；随后仅删除本次 `BASE`。不提交凭证、会话原文或临时文件到 Git。

| 编号 | 结果（通过／业务失败／无法判断／未执行） | 实际输入与观察到的结果 | 记录位置或复用来源 |
|---|---|---|---|
| T1 | 未执行 | — | — |
| T2 | 未执行 | — | — |
| T3 | 未执行 | — | — |
| T4 | 未执行 | — | — |
| T5 | 未执行 | — | — |
| T6 | 未执行 | — | — |
| T7 | 未执行 | — | — |

执行记录同时写明产品提交 `SOURCE_SHA`、正式包路径、实际 Desktop/DSH 版本、隔离账户与 `BASE`、生效提供方／模型及必要的配置覆盖、正式尝试与失败原因。配置和输出只保存检查这些业务目标所需的部分。

**交接**：本文件是 v9 完整待审候选，未由编写者自行批准第一、第二关口。由独立测试计划审核者核对上述目标覆盖和可执行性，随后本地测试工程师在已隔离的 Desktop 环境准备及接线，执行工程师运行并记录正式结果。没有独立子代理复核，不将本次自查写为独立批准。
