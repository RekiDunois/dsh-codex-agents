# dsh-codex-agents 测试计划

- 版本：v8
- 日期：2026-10-25
- 状态：修订待复核；正式测试尚未执行
- 依据：已通过执行计划审核的 `plan/dsh-codex-agents.md` v11（`180a8228f2fed138ca8014029f2927956364d217`）第 2 节，及 PR #1 当前六条业务成功标准
- 目标宿主：`@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.3`；对应已核对宿主源码 `deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60`
- 本轮修订：补齐同名项目角色优先与错误名单隔离场景；删除未要求的报错路径断言；细化输入文件、正式安装、操作顺序、结果读取、深度配置及失败处理；T4 不再限制 `apply` 只能包含两种操作；不增加监听器失效模拟、子代理重复加载检查或其它内部实现证明。
- 生效范围：仅本文件。此前测试计划与评论用于说明历史，不作为额外必测要求。

## 1. 被测对象与验收边界

产品是通过正式 `npm pack` → `dsh plugin --profile ... add` 安装的 `dsh-codex-agents` 插件。正式运行通过独立配置档的 DSH 网页界面使用 `spawn_agent(task_name, agent_type, message)`。执行时记录被测提交号、实际安装包、宿主版本、配置和各项结果。

本次只对下表 T1—T7 的业务结果作出判断。使用现有会话日志中已经记录的角色编号、系统提示、工具调用及返回值；这些是直接观察入口，无需新建记录器或判定程序。安装、预检和启动日志只用于确认测试能够进行，不单列产品验收。

| 编号 | 对应目标 | 输入或场景 | 预期业务结果 | 直接检查 |
|---|---|---|---|---|
| T1 | 1 | 已登记工作区甲的 `reviewer` 角色，首次调用 `spawn_agent` | 成功启动子代理；其预设编号为 `dshca_reviewer_` 加 24 位十六进制字符；子代理使用甲的 `MARKER_OLD` 角色指令 | 父会话工具结果、子会话头和系统提示 |
| T2 | 2 | 甲、乙及全局均有同名 `reviewer`，三份角色指令互不相同 | 甲调用选甲角色、乙调用选乙角色，均不落到全局同名角色；甲、乙预设编号不同 | 复用 T1 的甲结果，与乙子会话角色内容和编号比较 |
| T3 | 2、3 | 甲调用全局独有的 `global_only`，再调用不存在的 `nobody`；乙另有独有的 `beta_only` | 全局独有角色可启动；未知角色明确失败并列出甲可见的 `reviewer`、`global_only`，不出现 `beta_only`，不启动未知角色的子代理 | 父会话两次工具结果；成功子会话的角色内容 |
| T4 | 4 | 检查顶层插件加载入口，并复用第一次实际会话请求 | 插件初始化不会同步扫描全部角色或等待预设注册完成；会话可使用 `spawn_agent` | 读取 `src/index.ts` 初始化路径；复用 T1 首轮请求的工具列表及实际返回 |
| T5 | 5 | 在不重启的情况下修改甲的 `reviewer` 指令，随即再次委派 | 新子代理使用 `MARKER_NEW`，不使用 `MARKER_OLD`；预设编号保持不变 | T1 与 T5 两个子会话的系统提示和预设编号 |
| T6 | 6、7 | 让已启动子代理通过 `spawn_agent` 再委派；分别使用宿主深度上限 1 和 2 | 子代理能使用同名工具；上限 1 时不得成功启动下一层，上限 2 时成功启动下一层 | 子会话可用工具及实际工具结果、下一层子会话 |
| T7 | 5 | 会话运行期间添加、随后删除甲的 `extra.toml`，每次变化后再次委派 | 新增角色可以启动；删除后明确报告未知角色，名单不再包含 `extra`；无需重启 | 甲的工具结果和新增角色的子会话内容 |

推荐顺序：准备环境 → T4 的源码核对 → T1 → T2 → T3 → T5 → T7 → T6（深度 1、2）。T4 的运行结果直接复用 T1，不额外执行一轮。T6 改宿主配置时可能重启，因此放最后。

**不在本轮测试的内容**：强制丢失文件监听事件、证明监听器回调次数、检查子代理是否重复装载插件或内部管理器数量、生成逐调用跟踪、模拟编号冲突和复杂并发、穷举异常文件、测启动耗时、宿主原生预设下拉框隔离、安装程序自身功能，以及尚未支持的 `model`、`sandbox_mode`、`mcp_servers` 等字段。监听或工具生命周期方面的代码要求由执行计划约束实现者；本次只检查它们直接影响的上述业务结果。文件监听偶发漏报不保证产生专门报错，也不因此新增故障模拟用例。

## 2. 隔离环境与安装准备

以下命令在 **macOS** 上、进入目标仓库的实际工作目录后，**在同一个终端会话依次执行**（保留 `BASE`、`PROFILE` 等变量）。`BASE` 是每次正式尝试独有的仓库外目录；所有配置、会话、浏览器状态、模型日志都留在此处，不访问用户真实 `~/.codex/agents/`。已存在且适用的干净安装、构建和预检可按原记录复用，不能仅因提交编号或文档改变而重复安装。

### 2.1 检查目标版本和必要命令

```bash
# 当前目录必须是 dsh-codex-agents 的生产仓库，不是 worktrees/ 或 apm-consumers/。
PRODUCER="$(pwd -P)"
SOURCE_SHA="$(git rev-parse HEAD)"
printf '生产目录：%s\n被测提交：%s\n' "$PRODUCER" "$SOURCE_SHA"

DSH_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
NODE_BIN="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin"
export PATH="$NODE_BIN:$PATH"
test -x "$DSH_BIN"
for cmd in node npm pnpm jq zstd git tar mktemp find; do
  command -v "$cmd" || exit 1
done

BASE="$(mktemp -d /tmp/dca-test.XXXXXX)"
mkdir -p "$BASE/home" "$BASE/test-home/.codex/agents" \
  "$BASE/Documents" "$BASE/consumer-a/.codex/agents" \
  "$BASE/consumer-b/.codex/agents" "$BASE/logs" "$BASE/dist"
PROFILE="$BASE/home/profiles/dca-test"
printf '隔离目录：%s\n' "$BASE"
```

`pnpm` 必须在执行 `dsh plugin` 时可用，因为正式安装命令由 DSH 转交给它。缺少命令或目标版本不符时，先由本地测试工程师补齐环境并记录；不把依赖缺失直接判为产品业务失败。不要把真实 `HOME` 或 `DSH_HOME` 带进 DSH 命令。

### 2.2 写入明确且互不混淆的测试角色

在首次启动插件前写好四份文件。`name` 是角色的实际调用名称，文件名只用于发现文件；标记属于角色指令，不在父会话的调用提示里透露。

```bash
cat > "$BASE/consumer-a/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "甲工作区的审核角色"
developer_instructions = """
甲工作区专用审核角色，识别标记 MARKER_OLD。
请在回答职责时原样写出你的识别标记。
"""
TOML

cat > "$BASE/consumer-b/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "乙工作区的审核角色"
developer_instructions = """
乙工作区专用审核角色，识别标记 MARKER_BETA。
请在回答职责时原样写出你的识别标记。
"""
TOML

cat > "$BASE/test-home/.codex/agents/reviewer.toml" <<'TOML'
name = "reviewer"
description = "全局同名审核角色"
developer_instructions = """
全局审核角色，识别标记 MARKER_WORLD。
请在回答职责时原样写出你的识别标记。
"""
TOML

cat > "$BASE/test-home/.codex/agents/global-only.toml" <<'TOML'
name = "global_only"
description = "仅全局可用的角色"
developer_instructions = """
全局独有角色，识别标记 MARKER_GLOBAL。
请在回答职责时原样写出你的识别标记。
"""
TOML

cat > "$BASE/consumer-b/.codex/agents/beta-only.toml" <<'TOML'
name = "beta_only"
description = "仅乙工作区可用的角色"
developer_instructions = """
乙工作区独有角色，识别标记 MARKER_BONLY。
"""
TOML
```

T1、T2 的两次调用就能同时判断两个工作区隔离与项目同名优先级：全局 `reviewer` 是故意设置的同名竞争者，不需要第三次专门委派。乙独有的 `beta_only` 只用于 T3 错误名单，亦不需要启动它。

### 2.3 构建、正式打包与安装

```bash
cd "$PRODUCER"
npm install
npm run build
npm run typecheck
npm pack --pack-destination "$BASE/dist"
PKG="$(find "$BASE/dist" -maxdepth 1 -type f -name 'dsh-codex-agents-*.tgz' -print -quit)"
test -n "$PKG" && test -s "$PKG"

# 此命令只生成隔离配置档和配置清单，不启动服务。
HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
  "$DSH_BIN" --profile dca-test --from-default-profile web \
  --dump-config > "$BASE/logs/template-config.txt"

# fresh 模板的本地补丁：只更换默认文档目录，避免写入真实工作区。
cat >> "$PROFILE/cordis.patch.yml" <<EOF
- id: workspace-controller
  name: '@deepseek-ai/dsh-api-workspace-controller'
  config:
    documentsDirectory: "$BASE/Documents"
EOF

HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
  "$DSH_BIN" plugin --profile dca-test add "$PKG"

HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
  "$DSH_BIN" --profile dca-test --dump-config \
  > "$BASE/logs/installed-config.txt"
```

确认 `--dump-config` 未报告未匹配的补丁行，已安装配置含目标插件、`workspace-controller` 和 `subagent`。如果目标模板已经对 `workspace-controller` 提供同一 `id` 的本地覆写，应在已有行修改 `documentsDirectory`，不得再追加第二条同 `id` 定义。安装包必须来自本次记录的生产源码；如构建改变了被测源码或安装失败，停止该安装并由产品实现者纠正，不能手改消费配置或包内代码来伪造通过。

### 2.4 启动并登记两个工作区

```bash
# 每次重新启动前清空本轮启动日志，防止旧地址混入。
: > "$BASE/logs/boot.log"
HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
  "$DSH_BIN" --profile dca-test --no-open --port 0 \
  --host 127.0.0.1 > "$BASE/logs/boot.log" 2>&1 &
printf '%s\n' "$!" > "$BASE/logs/pid"

# 最多等待 60 秒取得本轮本地访问地址。这只是启动预检的停止条件，
# 不是插件性能通过标准；进程退出或超时均保留日志后停止受影响项。
READY=0
for i in $(seq 1 60); do
  if ! kill -0 "$(cat "$BASE/logs/pid")" 2>/dev/null; then break; fi
  if grep -Eq 'https?://127\.0\.0\.1:[0-9]+' "$BASE/logs/boot.log"; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  printf '本次实例未取得本地访问地址；检查 %s\n' "$BASE/logs/boot.log" >&2
  exit 1
fi
```

只使用本轮启动日志实际输出的访问地址，不从默认端口推测。上面的 `grep` 只检查非结构化启动日志，不参与业务结果判断。进程退出或预检超时时保留 `boot.log` 并记环境/启动问题，不能直接推定“同步扫描阻塞”。浏览器使用本次独立配置档打开日志中的本地地址，不复用生产浏览器登录资料。

在网页左侧依次执行“添加工作区” → 选择 `$BASE/consumer-a` 和 `$BASE/consumer-b` → 分别进入工作区新建会话。确认界面显示两个已登记目录后继续。需要核对落盘登记时，`$BASE/home/storages/workspace.json` 的 `tables.workspaces` 是以记录键索引的对象，可以使用：

```bash
jq -r '.tables.workspaces | to_entries[] | .value.path' \
  "$BASE/home/storages/workspace.json"
```

输出应包含甲、乙的绝对路径。若版本的存储布局不同，以宿主正式工作区界面或现有登记接口为准，不为读存储文件再建转换程序。

执行人把已有合法的 `DEEPSEEK_API_KEY` 注入**本次 DSH 进程的环境变量**；不要写入仓库、日志或配置文件。先在隔离工作区发送普通一句话以确认模型可用；这仅是预检，不算 T1—T7 结果。模型/访问故障导致目标调用无法实际完成时记“无法判断”，不据此判插件业务失败。

## 3. 如何读取本轮必要的业务结果

优先直接使用网页中的调用结果和子会话内容；需要核对实际预设编号、提示及工具时，再读取宿主现成会话文件。以下读取命令只是查看已有数据，不安装采集程序，不要求逐调用全链路证据。

```bash
# CHILD_ID 从父会话实际返回的 started subagent <id> 抄录。
CHILD_ID="请替换为实际子会话编号"
CHILD="$(find "$BASE/home/sessions" -type f \
  -path "*/$CHILD_ID/session.v4.jsonl.zstd" -print -quit)"
test -n "$CHILD"

# 子会话身份（预设编号、来源、父会话）。
zstd -dc "$CHILD" | jq -c \
  'select(.type == "session") | {id, agentPreset, origin, parentSession}'

# 子会话实际系统提示：核对对应 TOML 唯一标记。
zstd -dc "$CHILD" | jq -r \
  'select(.type == "system/message") |
   .data.message.content[]? | select(.type == "text") | .text'

# T6 使用：子会话本轮拥有的工具名、实际工具返回值。
zstd -dc "$CHILD" | jq -r \
  'select(.type == "request/header") | .data.header.tools[]?.name'
zstd -dc "$CHILD" | jq -r \
  'select(.type == "tool/result") |
   .data.message.content[]? | select(.type == "text") | .text'
```

当需要读取父会话结果时，从上述 `parentSession` 得到 `PARENT_ID`，再用相同 `find` 路径办法找到父会话文件，读取其中 `tool/result` 的文本字段。对于未成功启动子代理的错误调用，直接看父会话网页工具结果或父会话 `tool/result`。只核对目标所需的字段和标记；不要把日志中原始凭据或整份会话提交到仓库。

## 4. 按顺序执行 T1—T7

### T4：启动不被同步扫描或注册阻塞（先做静态部分）

1. 打开本次被测版本的 `src/index.ts`，查看 `apply` 的执行路径及其调用的初始化函数：角色目录扫描、TOML 读取、预设注册是否被放到后台异步任务中；`apply` 不能同步遍历全部工作区逐个读文件，也不能等所有预设完成注册才返回。允许初始化管理器、注册 `spawn_agent`、订阅工作区变化、建立后台调度入口和安排清理。
2. 检查是否存在初始化直接等待目录扫描或 `agentPresets.register` 完成的路径。存在并确实导致等待则 T4 业务失败；只因初始化含其他合法操作不能判失败。
3. 不另发测试提示；完成 T1 后直接复用其第一次请求：`request/header` 的工具列表有 `spawn_agent`，且父会话拿到了实际委派返回。
4. 不用服务地址输出时间、固定角色数量或全局耗时阈值判定启动性能；没有设置性能目标。

### T1：甲工作区角色正常启动

1. 确认甲工作区已经登记，`reviewer.toml` 仍含 `MARKER_OLD`。在甲工作区新会话发送：“请使用 `spawn_agent`；`task_name` 填 `t1`，`agent_type` 填 `reviewer`，`message` 填‘请按自己的角色要求介绍职责’。”
2. 查看父会话 `spawn_agent` 的实际工具返回，预期为 `started subagent <id>`。若代理没有真实调用工具，不得根据其文字自述判通过。
3. 根据该 `id` 打开子会话；`origin` 为 `subagent`，`agentPreset` 符合 `^dshca_reviewer_[0-9a-f]{24}$`。系统提示出现 `MARKER_OLD`，不应出现全局同名标记 `MARKER_WORLD`。
4. 记录这个子会话的实际 `agentPreset` 为 `A_PRESET`，后续 T2、T5 复用；不重复跑 T1。

### T2：甲乙隔离、项目角色优先于全局同名

1. 使用已有 T1 结果作为甲的证据：甲实际标记是 `MARKER_OLD`，没有 `MARKER_BETA` 或 `MARKER_WORLD`。
2. 在乙工作区新会话发送同样的 `spawn_agent` 调用，改 `task_name=t2`；`agent_type` 仍为 `reviewer`。不要在提示中提供乙的标记。
3. 检查乙成功返回子会话 `id`，新子会话系统提示含 `MARKER_BETA`，不含 `MARKER_OLD`、`MARKER_WORLD`。
4. 乙 `agentPreset` 也符合 `^dshca_reviewer_[0-9a-f]{24}$`，但与 `A_PRESET` 不相等。记录 `B_PRESET`。
5. 两个已发生的调用足以判断跨工作区同名隔离与项目优先，无需再启动全局 `reviewer` 作重复证明。

### T3：全局独有角色及未知角色错误名单

1. 在甲的会话调用 `spawn_agent(task_name="t3a", agent_type="global_only", message="请介绍自己的职责")`。
2. 应成功返回子会话；其系统提示含 `MARKER_GLOBAL`，预设编号符合 `^dshca_global_only_[0-9a-f]{24}$`。这证明即使甲存在自己的角色目录，全局独有角色仍可调用。
3. 在同一甲会话调用 `spawn_agent(task_name="t3b", agent_type="nobody", message="请说明你的职责")`。
4. 预期返回明确的 `Unknown agent_type` 错误，指明 `nobody` 不存在，列出甲可见的 `reviewer`、`global_only`；名单中没有乙独有的 `beta_only`。未知角色调用不得产生新子会话。
5. **不检查错误文本包含目录绝对路径**，v11 的业务要求是显示可用角色，不要求泄露文件路径；角色名按 TOML 的 `name` 判断。

### T5：修改后下一次委派使用新角色，无需重启

1. 在甲先保留 T1 的 `A_PRESET` 和旧系统提示结果。保持原 DSH 进程与甲会话，不重启。
2. 将 `$BASE/consumer-a/.codex/agents/reviewer.toml` 中的 `MARKER_OLD` 改为 `MARKER_NEW`，其它 TOML 字段保持不变并保存。两个标记互不包含；不需要为了测试故意阻断文件事件，也不需要修改文件时间戳。
3. 保存后立即在原甲会话调用 `spawn_agent(task_name="t5", agent_type="reviewer", message="请按自己的角色要求介绍职责")`，**不等待固定监听延迟**。
4. 从新子会话系统提示确认出现 `MARKER_NEW` 且不含 `MARKER_OLD`；`agentPreset` 必须等于 `A_PRESET`。若再次调用仍使用旧角色指令，按产品业务失败报告。
5. 已在运行的旧子代理由宿主既有预设代际能力保留，本轮不为认证宿主内部版本保留逻辑另建并发任务或采集工具。如执行期间恰有旧子代理尚在运行，可以直接记录其旧系统提示，不新增通过条件。

### T7：角色文件新增和删除后，下一次调用正确

1. 仍使用甲的同一会话和 DSH 进程。新建 `$BASE/consumer-a/.codex/agents/extra.toml`：

   ```toml
   name = "extra"
   description = "本次新增的角色"
   developer_instructions = """
   甲工作区临时角色，识别标记 MARKER_EXTRA。
   """
   ```

2. 文件保存后立即调用 `spawn_agent(task_name="t7a", agent_type="extra", message="请介绍自己的职责")`。应成功启动，子会话角色内容含 `MARKER_EXTRA`。
3. 删除上述 `extra.toml`，不重启，在同一会话调用 `spawn_agent(task_name="t7b", agent_type="extra", message="请介绍自己的职责")`。
4. 应明确返回未知 `extra` 的错误，其可用角色名单没有 `extra`，也不创建这次调用对应的子会话。
5. 这里只判断文件变化引起的业务结果。不强制关闭监听器、丢弃系统事件、读取内部监听器状态或证明回调执行次数。失败时定位并修复监听/调用前刷新代码属于产品实现者的工作，不增加测试设施。

### T6：子代理再委派及宿主层数上限

1. 保持宿主默认 `maxDepth=1`。在甲工作区的父会话发送：“请调用 `spawn_agent`，使用 `task_name=t6-outer`、`agent_type=reviewer`，`message` 填‘请尝试调用 `spawn_agent`，使用 `task_name=t6-inner`、`agent_type=reviewer`，并报告实际工具结果’。”
2. 父调用成功后，在第一层子会话的 `request/header` 核对工具列表包含 `spawn_agent`。如果它实际调用第二层委派，宿主应因深度上限返回限制错误，不得产生第二层子代理（即父会话的孙级子会话）。错误文案可随宿主变化，不要求可见文本必须逐字包含 `SubagentDepthError`。
3. 如果模型遵守“已达层数上限”的提示而根本没有尝试第二次工具调用，这不等于证明限制生效；保留本次真实结果，并将“越限调用拦截”标为**无法判断**，不得填“通过”或为追求通过擅自换提示、提高限额重复试验。
4. 在**同一个测试终端**执行下列命令备份隔离配置并设置宿主上限 2。此处是在已有宿主 `subagent` 配置行上做覆写，不能增加第二个实例；同名行如已出现在本地补丁，直接修改该行，勿再追加。

   ```bash
   cp "$PROFILE/cordis.patch.yml" "$BASE/logs/cordis-before-depth.yml"
   cat >> "$PROFILE/cordis.patch.yml" <<'YAML'
   - id: subagent
     name: '@deepseek-ai/dsh-subagent'
     config:
       maxDepth: 2
   YAML
   HOME="$BASE/test-home" DSH_HOME="$BASE/home" \
     "$DSH_BIN" --profile dca-test --dump-config \
     > "$BASE/logs/config-depth-2.txt"
   ```

   核对该配置档实际生效的 `subagent.maxDepth` 为 `2`，且没有补丁未匹配错误；不借修改配置增加其它产品权限。

5. 使用下节统一的安全停止、启动方式重启**本次隔离 DSH 实例**；不能重启别的用户服务。确认新配置有效，在甲工作区新会话重复步骤 1 的完整调用参数。
6. 第一层子代理应真实调用 `spawn_agent`，返回 `started subagent <id>`，并产生对应下一层子会话。仅子代理说“已经调用”或工具出现在列表里不算通过。
7. 结束后把 `$BASE/logs/cordis-before-depth.yml` 复制回 `$PROFILE/cordis.patch.yml`，恢复默认配置。记录本次实际使用的两个上限、各自会话结果及重启情况。若本轮结束并销毁隔离目录，无需为了恢复而额外启动一次 DSH。

本项依据业务调用结果判断子代理再委派和当前宿主上限；不另要求检查子预设插件数组、重复加载次数、管理器实例数量或内部调用轨迹。子预设不加载本插件的要求已经由执行计划对 `base-plugins.ts` 的定义和宿主全局工具约定约束实现者。

## 5. 安全停止、重试和清理

停止或重启时，在当前测试终端执行以下命令。它只处理 2.4 节记录的进程号；如果进程号已经被别的程序占用，拒绝操作。

```bash
PID="$(cat "$BASE/logs/pid")"
CMD="$(ps -p "$PID" -o command=)" || CMD=""
case "$CMD" in
  *dca-test*) ;;
  *) printf '进程不属于本次 dca-test：%s\n' "$CMD" >&2; exit 1 ;;
esac
kill "$PID"
STOPPED=0
for i in $(seq 1 30); do
  if ! kill -0 "$PID" 2>/dev/null; then STOPPED=1; break; fi
  sleep 1
done
if [ "$STOPPED" -ne 1 ]; then
  printf '本次实例尚未退出，不重启；保留记录供处理\n' >&2
  exit 1
fi
```

仅在确认上述进程已停止后，重新运行 2.4 节的启动命令，覆盖本轮 `boot.log` 并更新 `pid`。若运行时已自行退出，不得盲目重用旧进程号发送信号。

- 可重试的外部故障：模型连接超时、包管理器下载失败、隔离端口占用。**同一组输入与配置最多 2 次正式尝试**；每次记录结果，确认不会重复产生有影响的子代理任务后才能重试。
- 不可通过重试消除的业务失败：错误人格、错误工作区角色、未知角色静默回退、更新后仍是旧指令、越限成功等。原失败保留，交产品实现者；不得修改期望、配置或提示来获得通过。
- 缺命令、模型不可用、无法读取所需结果、启动退出或无法实际触发二次委派：记录“无法判断”或“未执行”及原因，不误报业务失败。环境故障不影响已经由合法调用得到的有效结果。
- 输入、配置、方法或产品代码确有修订时，仅重新检查受影响的必测项；未受影响的有效结果引用已有记录。
- 结束时仅清理 `BASE` 下的独立服务与临时数据；未经确认不删除仍需要复核的原始记录，不接触用户真实代理目录或配置。

## 6. 执行记录与交接

正式测试完成后，在本文件下表填入简短结果；原始会话、配置和启动日志保留在独立 `$BASE` 目录，不提交仓库。记录本次 `SOURCE_SHA`、实际宿主版本、测试配置档、隔离目录、必要操作及结果。仅在本轮确有正式结果时填写，不预设通过。

| 项 | 结果（通过／业务失败／无法判断／未执行） | 被测提交 | 实际输入与观察到的结果 | 原始记录位置或复用来源 |
|---|---|---|---|---|
| T1 | 未执行 | — | — | — |
| T2 | 未执行 | — | — | — |
| T3 | 未执行 | — | — | — |
| T4 | 未执行 | — | — | — |
| T5 | 未执行 | — | — | — |
| T6 | 未执行 | — | — | — |
| T7 | 未执行 | — | — | — |

**当前交接**：本文件是测试计划修订候选，不代表第一、第二关口已批准；当前无第三关口正式结果。测试计划审核者复核目标覆盖、具体步骤及是否超范围；通过后由本地测试工程师按本文件准备与接线，再由执行工程师进行正式业务验证。若本对话无真实独立子代理能力，不把作者自查写成独立批准。
