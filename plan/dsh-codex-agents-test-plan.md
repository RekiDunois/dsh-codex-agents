# dsh-codex-agents 测试计划

- 版本：v1
- 日期：2026-10-25
- 状态：待审核
- 依据：`plan/dsh-codex-agents.md` 的成功标准 1–5
- 范围：只覆盖这五条成功标准，一项一条；执行计划「测试」一节的单元测试与边界表其余条目列入未决与交接

## 被测对象

| 项 | 值 |
|---|---|
| 产品 | `dsh-codex-agents` DSH 插件 |
| 版本 | 分支 `plan/dsh-codex-agents-plugin` 的提交，执行时记录 `git rev-parse HEAD` |
| 安装源 | 该提交用 `pnpm pack` 生成的安装包，走 `dsh plugin add` 受支持路径，不用目录软链或可编辑安装 |
| 运行入口 | 本次专用测试配置档启动的 DSH 网页界面 |
| 观察对象 | 父会话与子会话日志、项目内 `.dsh/agents-index.json` |

## 必测清单

| 编号 | 依据 | 输入或场景 | 预期结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 成功标准 1 | 项目 A 放 `.codex/agents/reviewer.toml`，会话内调用 `spawn_agent(task_name="t1", agent_type="reviewer", message=...)` | 返回 `started subagent <id>`；子会话 `agentPreset` 为 `reviewer`；子会话系统提示含 toml 正文标记 `MARKER_A`；项目 A 生成 `.dsh/agents-index.json` | 读父会话 `tool/result`、子会话 `session` 与 `system/message`、索引文件 |
| T2 | 成功标准 2 | 项目 A 与项目 B 各放 `name = "reviewer"` 的 toml，正文标记分别为 `MARKER_A`、`MARKER_B`，分别在两个项目的会话里调用 | 两个子会话的人格各自只含本项目标记；两个子会话 `agentPreset` 取值不同 | 比对两份子会话的 `system/message` 与 `agentPreset` |
| T3 | 成功标准 3 | 调用 `spawn_agent(agent_type="nobody", ...)` | 工具结果为错误文本，含 `Unknown agent_type "nobody"` 与可用角色名 `reviewer`，且未创建子会话 | 读父会话 `tool/result` 文本；确认会话目录下无新增子会话 |
| T4 | 成功标准 4 | 项目 A 放 20000 个 toml，清空索引后冷启动，扫描未结束时发出提示 | 首个请求的工具列表已含 `spawn_agent`；扫描未结束时界面可输入、可发送并收到模型回复 | 比对首个 `request/header` 的 `tools[].name`、首个 `user/message` 的 `time` 与索引 mtime |
| T5 | 成功标准 5 | 把项目 A 的标记改成 `MARKER_A2` 后，在同一会话再次调用 `spawn_agent(agent_type="reviewer")` | 新子会话系统提示含 `MARKER_A2`、不含 `MARKER_A`；`agentPreset` 与 T1 的取值不同 | 读第二个子会话日志与索引的 `mtimeMs`、`hash` |

执行顺序：T1 → T2 → T3 → T5 → T4。T5 必须早于 T4 的冷启动，否则「不重启即生效」失去对照。

范围外：安装流程本身的验收；`model`、`sandbox_mode`、`mcp_servers` 的语义；预设下拉框观感（执行计划已列为已知限制）；性能与并发指标。

## 环境与准备

全部材料放在仓库外，不提交 Git。工作区 A、B 分别对应下面的 `consumer-a`、`consumer-b`。

| 步骤 | 命令或操作 | 通过标准 |
|---|---|---|
| 建目录 | `BASE=/tmp/dca-test`，建 `home`、`Documents`、`consumer-a/.codex/agents`、`consumer-b/.codex/agents`、`logs`、`dist` | 目录存在 |
| 打包 | 被测仓库根执行 `pnpm pack --pack-destination "$BASE/dist"`，`tar -tzf` 检查内容 | 含 `package.json`、`cordis.patch.yml`、运行入口；缺入口则停止 |
| 建配置档 | `DSH_HOME="$BASE/home" dsh --profile dca-test --from-default-profile web --dump-config` | 生成 `$BASE/home/profiles/dca-test/` |
| 隔离默认工作区 | 在该配置档 `cordis.patch.yml` 追加 `workspace-controller` 行，`documentsDirectory: /tmp/dca-test/Documents` | 启动后默认工作区落在 `$BASE/Documents` 下 |
| 装插件 | `DSH_HOME="$BASE/home" dsh plugin --profile dca-test add "$BASE/dist"/dsh-codex-agents-*.tgz` | `jq -r '.dsh.profile.bundles[]' .../package.json` 含 `dsh-codex-agents` |
| 启动 | `DEEPSEEK_API_KEY=<执行人提供> DSH_HOME="$BASE/home" dsh --profile dca-test --no-open --port 0 --host 127.0.0.1 > "$BASE/logs/boot.log" 2>&1 &` | `boot.log` 出现 `dsh web: http://127.0.0.1:<port>/?token=...` |
| 注册工作区 | 侧栏「添加工作区…」加入 `consumer-a`、`consumer-b` | `jq -r '.tables.workspaces[] | .path' "$BASE/home/storages/workspace.json"` 含两个路径 |
| 模型可用 | 在默认工作区发「回复 ok」 | 有模型回复 |

两条命令路径：`dsh` 为 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`；`node` 为同目录下 `runtime/primary-runtime/dependencies/node/bin/node`。密钥只经环境变量传入，不写进仓库或记录文件。

项目 A 的 `.codex/agents/reviewer.toml`：

```toml
name = "reviewer"
description = "只读审核测试用角色"
developer_instructions = """
只读审核角色。项目标记：MARKER_A。
回答时先复述本段标记。
"""
```

项目 B 用同名文件、标记改为 `MARKER_B`。T4 前在项目 A 批量生成 20000 个角色（`for i in $(seq 1 20000)` 写 `bulk_$i.toml`），用于把扫描窗口撑到可观察，文件数不参与判定。

## 执行步骤

```bash
# 子会话：id 取自 spawn_agent 返回的 started subagent <id>
CHILD="$BASE/home/sessions/--tmp-dca-test-consumer-a--/<id>/session.v4.jsonl.zstd"
zstd -dc "$CHILD" | jq -c 'select(.type=="session") | {id, agentPreset, origin, parentSession}'
zstd -dc "$CHILD" | jq -r 'select(.type=="system/message") | .data.message.content[0].text' | grep -c MARKER_A

# 父会话：子会话的 parentSession 就是父会话目录名
PARENT="$BASE/home/sessions/--tmp-dca-test-consumer-a--/<parentSession>/session.v4.jsonl.zstd"
zstd -dc "$PARENT" | jq -c 'select(.type=="tool/result") | .data.message.content[0].text' | tail -5

# 索引
jq -c '.agents[] | {name, hash, presetId, mtimeMs, error}' "$BASE/consumer-a/.dsh/agents-index.json"
```

项目 B 的会话目录同理为 `--tmp-dca-test-consumer-b--`。

**T1**：在项目 A 的会话发「调用 `spawn_agent`，`task_name` 用 t1，`agent_type` 用 reviewer，`message` 说一句你的职责」。判定：`tool/result` 匹配 `started subagent <id>`；子会话 `agentPreset` 为 `reviewer`、`origin` 为 `subagent`；`system/message` 含 `MARKER_A`；索引含 `name` 为 `reviewer` 的条目。

**T2**：在项目 B 的会话发同一条提示，`task_name` 用 t2。判定：项目 B 子会话 `system/message` 含 `MARKER_B` 且不含 `MARKER_A`；两个子会话 `agentPreset` 不同，后注册的那个形如 `reviewer_` 加 8 位十六进制。索引的 `presetId` 记 toml 的 `name`，降级只发生在注册时，因此以子会话 `agentPreset` 为准。

**T3**：在项目 A 的会话发「调用 `spawn_agent`，`task_name` 用 t3，`agent_type` 用 nobody」。判定：`tool/result` 文本含 `Unknown agent_type "nobody"` 与 `reviewer`；这一轮之后 `sessions/--tmp-dca-test-consumer-a--/` 下没有新增子会话目录。全局角色也会出现在可用列表里，判定只要求含 `reviewer`。

**T5**：把项目 A 的标记改成 `MARKER_A2`，用 `stat -f %m` 确认 mtime 已变。同一会话再发 T1 的提示，`task_name` 用 t5，全程不重启。判定：新子会话 `system/message` 含 `MARKER_A2` 且不含 `MARKER_A`；`agentPreset` 与 T1 不同；索引的 `hash` 与 `mtimeMs` 已更新。

**T4**：删 `$BASE/consumer-a/.dsh` 后按上表重启，`until grep -q "dsh web: http" "$BASE/logs/boot.log"; do sleep 0.2; done` 记录就绪时刻。立即打开界面，在扫描结束前发出 T1 的提示（`task_name` 用 t4）。判定三条同时成立：父会话首个 `request/header` 的 `data.header.tools[].name` 含 `spawn_agent`；首个 `user/message` 的 `time` 早于索引 mtime（`stat -f %m` 乘 1000 比较），说明发信时扫描未结束；该轮收到 `assistant/message` 与 `turn/end`，等待期间界面可输入可发送。若发信时索引已存在，说明窗口不够，把批量文件数翻倍重做一次，最多到 80000；仍观察不到则记无法判断并附两个时刻。

## 结果记录

执行后在 `plan/` 内追加记录，原始输出留在 `$BASE/logs`。

| 编号 | 状态 | 实际产品版本 | 命令或输入 | 观察结果 | 记录位置 |
|---|---|---|---|---|---|
| T1 | | | | | |
| T2 | | | | | |
| T3 | | | | | |
| T4 | | | | | |
| T5 | | | | | |

状态只用：通过、业务失败、无法判断、未执行。无法判断时写明环境或测试问题，不写成通过。

## 重试与停止

- 可重试的外部故障：模型服务连接错误或超时、包管理器网络失败、端口占用。同一条件最多重试 2 次，记录触发原因与结果。
- 不可重试：业务结果不符预期、报错文本不符、索引字段不符。按业务失败记录，不放宽预期、不改输入、不换判定方式。
- 改动提示词、toml 内容、入口、配置档设置或断言，视为方案修订，先说明受影响项再继续。
- 出现以下情况停止并保留现场：服务无法启动、模型持续不可用、插件加载报错。受影响项记未执行或无法判断。
- 收工前 `kill` 启动时记下的进程号，再决定是否删除 `$BASE`。

## 未决与交接

1. 执行计划没有构建与打包步骤，`pnpm pack` 之前需要先有编译产物与 `files` 字段。缺这部分时 T1–T5 都无法开始，由产品实现负责人补齐，测试项保持未执行。
2. 模型密钥由执行人提供。本次用独立 DSH_HOME，读不到用户 `~/.dsh/.credentials.yaml` 里的记录，密钥只能经环境变量传入；不可用时依赖模型的测试项记无法判断。
3. 执行计划「测试」一节的四个 `node:test` 文件与边界表其余条目（回退全局、坏 toml 隔离、目录不可写、并发去重）本次不列为必测项。若要纳入，建议各补一条独立用例，而不是塞进这五条。
4. 全局回退目录是用户真实的 `~/.codex/agents`，本次只读不改；其中已有角色会出现在 T3 的可用角色列表里，判定只要求含 `reviewer`。全局索引的落盘位置执行计划未写明，由实现确认，不影响本次判定。
5. 专用计划审核角色 `plan_reviewer` 在当前环境不可用：DSH 预设只有 `implementation-reviewer`，本机也没有 codex 命令行。计划审核由验收决定人承担，不用普通代理替代。
