# dsh-codex-agents 测试计划

- 版本：v7
- 日期：2026-10-25
- 状态：待审核
- 依据：`plan/dsh-codex-agents.md` v11（提交 `180a822`）第 2 节的七条目标与必须保持的行为
- 上一版：v6 依据执行计划 v8；v11 改为顶层预注册、全局工具、目录监听、调用前读实际内容、无磁盘索引、固定 24 位编号，旧版「首次调用才注册」「预设内再加载插件」「生成索引文件」的预期全部作废，本版按新架构重写
- 范围：T1–T7 覆盖第 2 节七条目标，一项一条；其中 T4 是静态核对加一次首轮确认，不做计时判定。单元测试与第 9 节其余反例列入未决与交接

## 被测对象

| 项 | 值 |
|---|---|
| 产品 | `dsh-codex-agents` DSH 插件 |
| 版本 | 分支 `plan/dsh-codex-agents-plugin` 的提交，执行时记录 `git rev-parse HEAD` |
| 安装源 | 该提交 `npm pack` 的产物，经 `dsh plugin add` 装入，不用目录软链或可编辑安装 |
| 运行入口 | 本次专用测试配置档启动的 DSH 网页界面 |
| 观察对象 | 父会话与子会话日志；`spawn_agent` 的 `tool/result`；不再有 `.dsh/agents-index.json` 可看 |

## 必测清单

| 编号 | 依据 | 输入或场景 | 预期结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 目标 1 | 工作区 A 根下放 `.codex/agents/reviewer.toml`，会话内调用 `spawn_agent(task_name="t1", agent_type="reviewer", message=...)` | 返回 `started subagent <id>`；子会话 `agentPreset` 匹配 `^dshca_reviewer_[0-9a-f]{24}$`；子会话系统提示含 toml 正文标记 `MARKER_OLD` | 读父会话 `tool/result`、子会话 `session` 与 `system/message` |
| T2 | 目标 2 | 工作区 A 与 B 各放 `name = "reviewer"` 的 toml，标记分别为 `MARKER_OLD`、`MARKER_BETA`，分别在两个工作区的会话里调用 | 两个子会话人格各自只含本项目标记；两个 `agentPreset` 不同但都匹配 `^dshca_reviewer_[0-9a-f]{24}$` | 比对两份子会话的 `system/message` 与 `agentPreset` |
| T3 | 目标 2、3 | 工作区 A 的会话依次调用 `agent_type` 为 `global_only`（仅全局目录有）与 `nobody`（两处都没有） | `global_only` 成功起子 agent 且人格含 `MARKER_GLOBAL`；`nobody` 报错文本含 `Unknown agent_type "nobody"`、`reviewer`、`global_only` 与两个目录路径；不出现工作区 B 独有的角色名；两次都不产生多余子会话 | 读父会话 `tool/result`；核对报错名单不含 B 的角色 |
| T4 | 目标 4 | 静态核对 `src/index.ts` 的 `apply`：不逐目录读文件、不 `await` 扫描或注册，后台队列在 `apply` 返回后才调度 | `apply` 体内只有工具注册与后台任务调度；没有任何 `await` 指向扫描、解析或 `register`；首轮请求的工具列表含 `spawn_agent` | 读 `apply` 实现；确认首轮 `request/header` 的 `tools[].name` 含 `spawn_agent` 且该轮正常回复 |
| T5 | 目标 5 | 把工作区 A 的标记从 `MARKER_OLD` 改成 `MARKER_NEW`，紧接着在同一会话再次调用 | 新子会话人格含 `MARKER_NEW`、不含 `MARKER_OLD`；`agentPreset` 与 T1 完全相同；无需重启 | 读第二个子会话日志 |
| T6 | 目标 6、7 | 在会话 A 起子 agent，要求它在自己会话内再调 `spawn_agent`；再改宿主 `maxDepth` 为 `2` 重试 | 子会话工具列表含 `spawn_agent`；宿主上限为 `1` 时第二层委派报 `SubagentDepthError`；改为 `2` 后第二层成功并产生第三层子会话 | 读子会话 `request/header` 的 `tools[].name`；读第二层 `tool/result` |
| T7 | 目标 5、第 9 节 | 在运行中的会话里新增一个角色 toml、删除一个已有 toml，随后各调用一次 | 新增角色可立即调用；删除的角色报未知角色且不再出现于名单；无需重启 | 读父会话两次 `tool/result` |

执行顺序：T4（静态核对，随时可做）→ T1 → T2 → T3 → T5 → T7 → T6（上限 1）→ T6（上限 2）。T5 必须早于任何重启；T6 改宿主配置后要重启，放在最后，免得影响前面的用例。

范围外：安装流程本身的验收；`model`、`sandbox_mode`、`mcp_servers` 的语义；宿主原生预设下拉框的可见性（v11 明确不属隔离范围）；性能与资源开销指标。

## 环境与准备

全部材料放在仓库外，不提交 Git。工作区 A、B 分别对应 `consumer-a`、`consumer-b`。

| 步骤 | 命令或操作 | 通过标准 |
|---|---|---|
| 建目录 | `BASE=/tmp/dca-test`，建 `home`、`test-home/.codex/agents`、`Documents`、`consumer-a/.codex/agents`、`consumer-b/.codex/agents`、`logs`、`dist` | 目录存在 |
| 全局角色 | `$BASE/test-home/.codex/agents/global-only.toml` 写 `name = "global_only"`，正文含 `MARKER_GLOBAL` | 文件存在 |
| 构建 | 被测仓库根执行 `npm install`、`npm run build`、`npm run typecheck` | 三条命令均通过 |
| 打包 | `npm pack --pack-destination "$BASE/dist"`，`tar -tzf` 检查内容 | 含 `lib/index.js`、`lib/index.d.ts`、`cordis.patch.yml`、locale 与图标 |
| 建配置档 | `HOME="$BASE/test-home" DSH_HOME="$BASE/home" dsh --profile dca-test --from-default-profile web --dump-config` | 生成 `$BASE/home/profiles/dca-test/` |
| 隔离默认工作区 | 在该配置档 `cordis.patch.yml` 追加 `workspace-controller` 行，`documentsDirectory: /tmp/dca-test/Documents` | 启动后默认工作区落在 `$BASE/Documents` 下 |
| 装插件 | `HOME="$BASE/test-home" DSH_HOME="$BASE/home" dsh plugin --profile dca-test add "$BASE/dist"/dsh-codex-agents-*.tgz` | `jq -r '.dsh.profile.bundles[]' .../package.json` 含 `dsh-codex-agents` |
| 启动 | 用下方统一命令启动 | 本轮 `boot.log` 出现地址，`logs/pid` 存本轮进程号 |
| 注册工作区 | 侧栏「添加工作区…」加入 `consumer-a`、`consumer-b` | `jq -r '.tables.workspaces[] | .path' "$BASE/home/storages/workspace.json"` 含两个路径 |
| 模型可用 | 在默认工作区发「回复 ok」 | 有模型回复 |

每次启动与重启都用这两条命令，启动前先覆盖旧 `boot.log`，避免把上一轮的就绪记录当成本轮结果：

```bash
HOME="$BASE/test-home" DSH_HOME="$BASE/home" dsh --profile dca-test --no-open --port 0 --host 127.0.0.1 > "$BASE/logs/boot.log" 2>&1 &
printf '%s\n' "$!" > "$BASE/logs/pid"
```

重启前只结束本次实例：先确认 `$BASE/logs/pid` 的进程号属于本次启动，再 `kill "$(cat "$BASE/logs/pid")"`，等 `kill -0` 返回非零后重启，不得停止其它进程。执行人事先在终端导出 `DEEPSEEK_API_KEY`，不写进仓库或日志。

`HOME` 与 `DSH_HOME` 都指向 `$BASE` 下的目录，是本项能控制全局角色内容的前提：插件按 `~/.codex/agents/` 定位全局目录，而 `~/.` 跟随 `HOME`。注册工作区只为让界面上能建出 cwd 指向该目录的会话，v11 的角色范围由 `workspaceRegistry.list()` 决定，不扫描未登记目录。

`dsh` 路径为 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`；`node` 为同目录下 `runtime/primary-runtime/dependencies/node/bin/node`。

工作区 A 的 `.codex/agents/reviewer.toml`：

```toml
name = "reviewer"
description = "只读审核测试用角色"
developer_instructions = """
只读审核角色。项目标记：MARKER_OLD。
回答时先复述本段标记。
"""
```

工作区 B 用同名文件、标记改为 `MARKER_BETA`。

## 执行步骤

```bash
# 子会话：id 取自 spawn_agent 返回的 started subagent <id>
CHILD="$BASE/home/sessions/--tmp-dca-test-consumer-a--/<id>/session.v4.jsonl.zstd"
zstd -dc "$CHILD" | jq -c 'select(.type=="session") | {id, agentPreset, origin, parentSession}'
zstd -dc "$CHILD" | jq -r 'select(.type=="system/message") | .data.message.content[0].text' | grep -c MARKER_OLD
zstd -dc "$CHILD" | jq -r 'select(.type=="request/header") | .data.header.tools[]?.name' | sort -u

# 父会话：子会话的 parentSession 就是父会话目录名
PARENT="$BASE/home/sessions/--tmp-dca-test-consumer-a--/<parentSession>/session.v4.jsonl.zstd"
zstd -dc "$PARENT" | jq -c 'select(.type=="tool/result") | .data.message.content[0].text' | tail -5
```

工作区 B 的会话目录同理为 `--tmp-dca-test-consumer-b--`。

**T1**：在工作区 A 的会话发「调用 `spawn_agent`，`task_name` 用 t1，`agent_type` 用 reviewer，`message` 说一句你的职责」。判定：`tool/result` 匹配 `started subagent <id>`；子会话 `agentPreset` 匹配 `^dshca_reviewer_[0-9a-f]{24}$`、`origin` 为 `subagent`；`system/message` 含 `MARKER_OLD`。v11 取消了 `.dsh/agents-index.json`，不再检查索引文件。

**T2**：在工作区 B 的会话发同一条提示，`task_name` 用 t2。判定：B 的子会话 `system/message` 含 `MARKER_BETA` 且不含 `MARKER_OLD`；两个 `agentPreset` 都匹配 `^dshca_reviewer_[0-9a-f]{24}$` 但取值不同，因为编号含来源目录，不含文件内容。

**T3**：在工作区 A 的会话先发「调用 `spawn_agent`，`task_name` 用 t3a，`agent_type` 用 global_only，`message` 说一句你的职责」。判定：返回 `started subagent <id>`，子会话 `system/message` 含 `MARKER_GLOBAL`，`agentPreset` 匹配 `^dshca_global_only_[0-9a-f]{24}$`。

再发「调用 `spawn_agent`，`task_name` 用 t3b，`agent_type` 用 nobody」。判定：`tool/result` 文本含 `Unknown agent_type "nobody"`、`reviewer`、`global_only` 与 `$BASE/consumer-a/.codex/agents`、`$BASE/test-home/.codex/agents` 两个路径；文本不含工作区 B 独有的角色名；这一轮不新增子会话目录。

**T5**：把工作区 A 的标记从 `MARKER_OLD` 改成 `MARKER_NEW`，`stat -f %m` 确认 mtime 已变，并立即（不等待）在同一会话再发 T1 的提示，`task_name` 用 t5。判定：新子会话 `system/message` 含 `MARKER_NEW` 且不含 `MARKER_OLD`；`agentPreset` 与 T1 完全相同。v11 要求调用前重读实际内容，所以「改完立即调用」正是本条的关键输入，不能先等待或重启。

**T7**：在工作区 A 的会话里，先新增 `.codex/agents/extra.toml`（`name = "extra"`，正文含 `MARKER_EXTRA`），再发「调用 `spawn_agent`，`task_name` 用 t7a，`agent_type` 用 extra」。判定：返回 `started subagent <id>`，子会话含 `MARKER_EXTRA`，无需重启。

随后删除 `.codex/agents/extra.toml`，再发「调用 `spawn_agent`，`task_name` 用 t7b，`agent_type` 用 extra」。判定：报错含 `Unknown agent_type "extra"`，且可用名单里不再出现 `extra`。

**T6**：宿主 `maxDepth` 默认值是 `1`，一层就到顶，因此本项要先验限层、再抬上限验成功。

第一步，上限保持默认 `1`。在工作区 A 的会话发「调用 `spawn_agent`，`task_name` 用 t6，`agent_type` 用 reviewer，`message` 要求你在自己会话里再调用一次 `spawn_agent`，`agent_type` 用 reviewer」。判定：子会话首个 `request/header` 的 `tools[].name` 含 `spawn_agent`（全局工具被子代理继承）；子会话内那次调用报 `SubagentDepthError`，不产生第三层子会话。

第二步，把宿主上限抬到 `2`。`maxDepth` 是宿主 `subagent` 行的配置，不是本插件的配置，改的是测试配置档 `cordis.patch.yml`：

```yaml
- id: subagent
  name: '@deepseek-ai/dsh-subagent'
  config:
    maxDepth: 2
```

按统一命令重启，重复上面同一提示。判定：子会话内那次调用返回 `started subagent <id>`，产生第三层子会话。

第三步，删掉这条 `config` 恢复默认，按统一命令重启。改动与恢复记进结果记录，写清改前值、改后值和重启次数。

**T4**：本条以静态核对为主，只做一次运行时确认。

先读 `src/index.ts` 的 `apply`，逐条确认：函数体内只有 `ctx.tools.register` 与后台任务调度；没有任何 `await` 指向目录扫描、TOML 解析或 `agentPresets.register`；扫描入口在 `apply` 返回之后才启动。再读 `src/manager.ts`，确认初扫与注册走的是限并发队列，且每批之间有让出事件循环的 `await`。这两处任一不成立即记业务失败。

再做一次运行时确认：按统一命令冷启动，等地址出现后进入会话，发 T1 的提示（`task_name` 用 t4）。判定：父会话首个 `request/header` 的 `data.header.tools[].name` 含 `spawn_agent`，且该轮出现 `assistant/message` 与 `turn/end`。

不测启动耗时。宿主 `dsh-web-app` 在 `loader.await()` 之后才打印地址，即等全部插件加载完才输出，插件若同步阻塞只会让地址一起推迟，地址时刻无法区分两种情况，用它作判定只会得到假阴性。

## 结果记录

执行后在 `plan/` 内追加记录，原始输出留在 `$BASE/logs`。

| 编号 | 状态 | 实际产品版本 | 命令或输入 | 观察结果 | 记录位置 |
|---|---|---|---|---|---|
| T1 | | | | | |
| T2 | | | | | |
| T3 | | | | | |
| T4 | | | | | |
| T5 | | | | | |
| T6 | | | | | |
| T7 | | | | | |

状态只用：通过、业务失败、无法判断、未执行。无法判断时写明环境或测试问题，不写成通过。

## 重试与停止

- 可重试的外部故障：模型服务连接错误或超时、包管理器网络失败、端口占用。同一条件最多重试 2 次，记录触发原因与结果。
- 不可重试：业务结果不符预期、报错文本不符、编号格式不符。按业务失败记录，不放宽预期、不改输入、不换判定方式。
- 改动提示词、toml 内容、入口、配置档设置或断言，视为方案修订，先说明受影响项再继续。
- 出现以下情况停止并保留现场：服务无法启动、模型持续不可用、插件加载报错、`smol-toml` 或 `@deepseek-ai/schemastery` 未随依赖装入。受影响项记未执行或无法判断。
- 收工前 `kill` 本次进程号，再决定是否删除 `$BASE`。

## 未决与交接

1. 验收环境由验收决定人确认为独立 `HOME` 与 `DSH_HOME` 加自制 web 配置档，不用 `desktop` 配置档：`headless` 与 `sdk` 缺 `agent-presets`，插件 `inject` 四项缺一不激活；共用真实配置档会把角色写进用户已有工作区。
2. v11 第 11 节明确本轮只改执行计划，测试计划的旧预期由测试计划负责人按已批准范围修订。本版据此重写，未新增超出第 2 节七条目标的用例。
3. 执行计划第 9 节其余反例（目录原子替换、工作区删除与扫描并发、预设 ID 被外部占用、插件卸载后重载）本次不列为必测项。它们需要构造并发或外部占用条件，建议作为独立用例另行批准。
4. 单元测试文件清单（`toml`、`roster`、`preset`、`manager`、`watch` 等）属生产模块自测，本次不列为必测项。
5. 模型密钥由执行人提供。独立 `HOME` 与 `DSH_HOME` 读不到用户 `~/.dsh/.credentials.yaml`，密钥只能经环境变量传入；不可用时依赖模型的测试项记无法判断。
6. 全局角色只放 `$BASE/test-home/.codex/agents/`，不得读取、创建或修改用户真实 `~/.codex/agents/`。`HOME` 同时影响配置档缓存与包管理器路径，出现与 `HOME` 相关的加载异常时记无法判断并保留日志。
7. 专用计划审核角色 `plan_reviewer` 在当前环境不可用：DSH 预设只有 `implementation-reviewer`，本机也没有 codex 命令行。计划审核由验收决定人承担，不用普通代理替代。
