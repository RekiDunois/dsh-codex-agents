# dsh-codex-agents 测试计划

- 版本：v2
- 日期：2026-10-25
- 状态：待审核
- 依据：`plan/dsh-codex-agents.md` v4（提交 `1b89210`）的成功标准 1–5
- 上一版：v1 依据执行计划 v1，本次按 v4 的编号规则、按需扫描、角色合并三处改动重写预期
- 范围：只覆盖五条成功标准，一项一条；执行计划「测试」一节的单元测试与边界表其余条目列入未决与交接

## 被测对象

| 项 | 值 |
|---|---|
| 产品 | `dsh-codex-agents` DSH 插件 |
| 版本 | 分支 `plan/dsh-codex-agents-plugin` 的提交，执行时记录 `git rev-parse HEAD` |
| 安装源 | 该提交 `npm pack` 的产物，经 `dsh plugin add` 装入，不用目录软链或可编辑安装 |
| 运行入口 | 本次专用测试配置档启动的 DSH 网页界面 |
| 观察对象 | 父会话与子会话日志、项目根下 `.dsh/agents-index.json` |

## 必测清单

| 编号 | 依据 | 输入或场景 | 预期结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 成功标准 1 | 项目 A 放 `.codex/agents/reviewer.toml`，会话内调用 `spawn_agent(task_name="t1", agent_type="reviewer", message=...)` | 返回 `started subagent <id>`；子会话 `agentPreset` 形如 `dshca_reviewer_` 加 5 位数字；子会话系统提示含 toml 正文标记 `MARKER_A`；项目 A 根下生成 `.dsh/agents-index.json` 且含 `name` 为 `reviewer`、`scope` 为 `project` 的条目 | 读父会话 `tool/result`、子会话 `session` 与 `system/message`、索引文件 |
| T2 | 成功标准 2 | 项目 A 与项目 B 各放 `name = "reviewer"` 的 toml，正文标记分别为 `MARKER_A`、`MARKER_B`，分别在两个项目的会话里调用 | 两个子会话人格各自只含本项目标记；两个 `agentPreset` 不同，且都符合 `dshca_reviewer_` 加 5 位数字 | 比对两份子会话的 `system/message` 与 `agentPreset`，比对两个项目的索引 |
| T3 | 成功标准 3 | 项目 A 内调用 `spawn_agent(agent_type="nobody", ...)`；运行前先记录 `~/.codex/agents` 里的角色名 | 报错文本含 `Unknown agent_type "nobody"`、项目角色 `reviewer`、运行前记录到的全局角色名，以及项目目录与全局目录两个路径；未创建子会话 | 读父会话 `tool/result` 文本；确认会话目录下无新增子会话 |
| T4 | 成功标准 4 | 项目 A 放 2000 个 toml，清空索引后冷启动，就绪后立即进入会话 | 就绪时索引文件不存在；首个请求的工具列表已含 `spawn_agent`；界面可输入、可发送并收到模型回复；首次调用之后索引文件才出现 | 比对 `boot.log` 就绪时刻与索引文件、首个 `request/header` 的 `tools[].name`、父会话的回复事件 |
| T5 | 成功标准 5 | 把项目 A 的标记改成 `MARKER_A2` 后，在同一会话再次调用 `spawn_agent(agent_type="reviewer")` | 新子会话系统提示含 `MARKER_A2`、不含 `MARKER_A`；`agentPreset` 与 T1 完全相同，不因内容变化而变；索引该条目 `mtimeMs` 与 `size` 已更新 | 读第二个子会话日志与索引条目 |

执行顺序：T1 → T2 → T3 → T5 → T4。T5 必须早于 T4 的冷启动，否则「改文件不换编号」失去对照。

范围外：安装流程本身的验收；`model`、`sandbox_mode`、`mcp_servers` 的语义；预设下拉框观感（执行计划已列为已知限制）；性能与并发指标。

## 环境与准备

全部材料放在仓库外，不提交 Git。下面的项目 A、B 分别对应 `consumer-a`、`consumer-b`。

| 步骤 | 命令或操作 | 通过标准 |
|---|---|---|
| 建目录 | `BASE=/tmp/dca-test`，建 `home`、`Documents`、`consumer-a/.codex/agents`、`consumer-b/.codex/agents`、`logs`、`dist` | 目录存在 |
| 构建 | 被测仓库根执行 `npm install`、`npm run build`、`npm run typecheck` | 三条命令均通过 |
| 打包 | `npm pack --pack-destination "$BASE/dist"`，`tar -tzf` 检查内容 | 含 `lib/index.js`、`lib/index.d.ts`、`cordis.patch.yml`、locale 与图标 |
| 建配置档 | `DSH_HOME="$BASE/home" dsh --profile dca-test --from-default-profile web --dump-config` | 生成 `$BASE/home/profiles/dca-test/` |
| 隔离默认工作区 | 在该配置档 `cordis.patch.yml` 追加 `workspace-controller` 行，`documentsDirectory: /tmp/dca-test/Documents` | 启动后默认工作区落在 `$BASE/Documents` 下 |
| 装插件 | `DSH_HOME="$BASE/home" dsh plugin --profile dca-test add "$BASE/dist"/dsh-codex-agents-*.tgz` | `jq -r '.dsh.profile.bundles[]' .../package.json` 含 `dsh-codex-agents` |
| 启动 | `DEEPSEEK_API_KEY=<执行人提供> DSH_HOME="$BASE/home" dsh --profile dca-test --no-open --port 0 --host 127.0.0.1 > "$BASE/logs/boot.log" 2>&1 &` | `boot.log` 出现 `dsh web: http://127.0.0.1:<port>/?token=...` |
| 注册工作区 | 侧栏「添加工作区…」加入 `consumer-a`、`consumer-b` | `jq -r '.tables.workspaces[] | .path' "$BASE/home/storages/workspace.json"` 含两个路径 |
| 模型可用 | 在默认工作区发「回复 ok」 | 有模型回复 |

注册工作区只为在界面上建出 cwd 指向该目录的会话；v4 已不再枚举工作区，插件只按会话 cwd 定位项目。

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

项目 B 用同名文件、标记改为 `MARKER_B`。T4 前在项目 A 批量生成 2000 个角色（`for i in $(seq 1 2000)` 写 `bulk_$i.toml`），用于让「启动若真扫描」在就绪耗时和索引落盘上留下痕迹；文件数不参与判定。

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
jq -c '.agents[] | {name, scope, presetId, mtimeMs, size, error}' "$BASE/consumer-a/.dsh/agents-index.json"
```

项目 B 的会话目录同理为 `--tmp-dca-test-consumer-b--`。

**T1**：在项目 A 的会话发「调用 `spawn_agent`，`task_name` 用 t1，`agent_type` 用 reviewer，`message` 说一句你的职责」。判定：`tool/result` 匹配 `started subagent <id>`；子会话 `agentPreset` 匹配 `^dshca_reviewer_[0-9]{5}$`、`origin` 为 `subagent`；`system/message` 含 `MARKER_A`；索引含 `name` 为 `reviewer`、`scope` 为 `project` 的条目，其 `presetId` 与子会话 `agentPreset` 一致。

**T2**：在项目 B 的会话发同一条提示，`task_name` 用 t2。判定：项目 B 子会话 `system/message` 含 `MARKER_B` 且不含 `MARKER_A`；两个子会话的 `agentPreset` 都匹配 `^dshca_reviewer_[0-9]{5}$` 但取值不同，因为 v4 的编号由项目根路径算出，不含文件内容哈希。

**T3**：先执行 `ls ~/.codex/agents/*.toml | xargs -n1 basename` 记录全局角色文件名，再在项目 A 的会话发「调用 `spawn_agent`，`task_name` 用 t3，`agent_type` 用 nobody」。判定：`tool/result` 文本含 `Unknown agent_type "nobody"`；含 `reviewer`；含运行前记录到的全局角色名；含项目 A 与 `~/.codex/agents` 两个目录路径；这一轮之后 `sessions/--tmp-dca-test-consumer-a--/` 下没有新增子会话目录。

**T5**：把项目 A 的标记改成 `MARKER_A2`，用 `stat -f %m` 确认 mtime 已变。同一会话再发 T1 的提示，`task_name` 用 t5，全程不重启。判定：新子会话 `system/message` 含 `MARKER_A2` 且不含 `MARKER_A`；`agentPreset` 与 T1 完全相同；索引该条目 `mtimeMs` 或 `size` 已变化而 `presetId` 未变。顺带记录改前改后预设下拉框的条目数，v4 验收步骤 9 要求不因改文件而多出条目。

**T4**：删 `$BASE/consumer-a/.dsh` 后按上表重启，用 `until grep -q "dsh web: http" "$BASE/logs/boot.log"; do sleep 0.2; done` 等到地址打印，记下此刻。判定四条同时成立：

1. 此刻 `$BASE/consumer-a/.dsh/agents-index.json` 不存在，说明启动没有扫描；
2. 父会话首个 `request/header` 的 `data.header.tools[].name` 含 `spawn_agent`；
3. 发出 T1 的提示（`task_name` 用 t4）后该轮出现 `assistant/message` 与 `turn/end`，等待期间界面可输入可发送；
4. 该次调用之后索引文件才出现，说明扫描推迟到了首次调用。

就绪耗时用 `stat -f %m "$BASE/logs/boot.log"` 记录，只登记不判定。若就绪时索引已存在，说明启动仍在扫描，本项记业务失败，不必翻倍文件数。

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
- 不可重试：业务结果不符预期、报错文本不符、索引字段不符、编号不符。按业务失败记录，不放宽预期、不改输入、不换判定方式。
- 改动提示词、toml 内容、入口、配置档设置或断言，视为方案修订，先说明受影响项再继续。
- 出现以下情况停止并保留现场：服务无法启动、模型持续不可用、插件加载报错、`smol-toml` 未随依赖装入。受影响项记未执行或无法判断。
- 收工前 `kill` 启动时记下的进程号，再决定是否删除 `$BASE`。

## 未决与交接

1. v4 验收步骤 2 要求把插件装进 `desktop` 配置档并经界面安装。本计划改用独立 DSH_HOME 下的自制配置档加 `dsh plugin add`，原因有两条：`desktop` 由 Electron 独占，命令行拒绝操作；共用真实配置档会把索引文件写进用户已有的项目。这一处偏离需验收决定人确认；若必须按 v4 原文执行，需先说明如何在用户真实环境中隔离。
2. v4 验收步骤 11 要求「连续委派两层」验证 `maxDepth`。但 `BASE_PLUGINS` 刻意不含 `tool-subagent`，子 agent 没有 `spawn_agent`，无法从子 agent 再发起一次委派，该步骤按现设计走不通。本计划不设此项，建议实现时确认是补一个入口还是改验收写法。
3. 执行计划「测试」一节的六个 `node:test` 文件与边界表其余条目（索引不可写降级、项目根找不到时写家目录、`maxDepth` 能力不匹配）本次不列为必测项。若要纳入，建议各补一条独立用例。
4. 模型密钥由执行人提供。本次用独立 DSH_HOME，读不到用户 `~/.dsh/.credentials.yaml` 里的记录，密钥只能经环境变量传入；不可用时依赖模型的测试项记无法判断。
5. 全局角色目录是用户真实的 `~/.codex/agents`，本次只读不改。T3 依赖它当前已有的角色名，因此要求运行前先记录一份名单；名单与断言不一致时记无法判断，不算业务失败。
6. 专用计划审核角色 `plan_reviewer` 在当前环境不可用：DSH 预设只有 `implementation-reviewer`，本机也没有 codex 命令行。计划审核由验收决定人承担，不用普通代理替代。
