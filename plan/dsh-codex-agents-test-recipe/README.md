# dsh-codex-agents 测试 recipe

本目录是 `plan/dsh-codex-agents-test-plan.md` v13 的可执行部分，对应第 2 节准备与第 3 节执行。

## 入口选择

正式验证使用 DSH 官方 `web` 配置档与浏览器界面，在当前 macOS 账户运行：

- `HOME` 不变，只隔离本次 `DSH_HOME` 与测试工作区。
- 浏览器由执行工程师自己的浏览器 MCP 负责：本 recipe 不启动、不关闭浏览器，也不管理它的资料目录，只交出 web 地址。
- 不启动 Desktop，不需要专用 macOS 登录账户。
- 不用 `headless`：headless 模板缺本插件 `inject` 所需的 `workspaceRegistry` 与 `agentPresets`，装上会停在 `pending (waiting for service: workspaceRegistry)`，要靠额外补丁改宿主组合才能跑，超出计划授权。

## 前置

- 在真实源码目录执行，不能在 `worktrees/` 或 `apm-consumers/` 下。本仓库的 PR 工作树 `../worktree/dsh-codex-agents-pr1-execution` 与主检出共用同一 `.git`，属于同一仓库的检出而非拷贝，可以直接作为来源目录；`prepare.sh` 的守卫只拦共识点名的 `worktrees/` 与 `apm-consumers/`。
- 必须让 direnv 生效，取得 Node 24 以上。实测为 Node 26.8.1。
- 需要 `yq`。
- 一个可用的浏览器 MCP，能打开 URL 并在页面里点击、输入。没有 MCP 时，把地址手动粘到任意浏览器也能做，只是界面操作要手工完成。

## 脚本

| 脚本 | 对应计划 | 作用 |
|---|---|---|
| `prepare.sh` | 2.1—2.4 | 建隔离目录、复制凭据、写角色、打包安装、设 `maxDepth=2` |
| `start.sh` | 2.4 | 启动 web 服务并输出地址，交给浏览器 MCP |
| `static-check.sh` | 3 节 T4、T5/T7、T6 | 打印计划原句与相关代码位置，供人工判断 |
| `cleanup.sh` | 4 节 | 停本次服务、删本次创建的两份全局角色；保留 `BASE` |

`static-check.sh` 不做通过/失败判定，只把计划要求核对的原句和相关代码段摆出来。三项是否成立，按计划第 3 节原文由执行工程师判断并记录。它只读产品源码，不运行产品。

## 执行顺序

```bash
# 1. 首次准备（已有适用的隔离安装则跳过本步骤），记录实际测试目录
bash plan/dsh-codex-agents-test-recipe/prepare.sh
export BASE="/tmp/dca-test.实际目录"  # 填入上一步输出的真实路径；后续必须显式传入

# 2. 打印源码检查材料（T4、T5/T7 共享、T6 的插件侧责任）
bash plan/dsh-codex-agents-test-recipe/static-check.sh

# 3. 启动服务，输出地址
bash plan/dsh-codex-agents-test-recipe/start.sh
#    然后用你的浏览器 MCP 打开 $BASE/logs/web.url 里的地址

# 4. 在网页里完成下列准备，再按第 3 节执行 T1—T7
#    a. 「添加工作区」登记 $BASE/consumer-a 与 $BASE/consumer-b
#    b. 两个工作区各建一个会话
#    c. 发一条简短消息确认模型可用（环境预检，不计入 T1—T7）
#    d. 默认模型用不了已复制凭据时，按下方「模型配置」处理
#    T6 最后做；T5 必须在同一会话、不重启的前提下改文件后立即调用

# 5. 通过 MCP 关闭本次页面，然后收尾
bash plan/dsh-codex-agents-test-recipe/cleanup.sh
```


## 复用已有隔离安装

对照[正式测试计划第 2.5 节](../dsh-codex-agents-test-plan.md)复用仍适用的 `BASE`。已有有效通过结果直接引用；产品行为改变、确需测试新包时，才从受影响的产品提交重新创建干净消费者。

1. 从第一次 `prepare.sh` 的输出取得实际 `BASE`；按第 2.5 节读取 `$BASE/logs/paths.env`，确认原安装包及网页配置仍在。
2. 按测试计划第 2.3 节的**原命令**恢复三份项目角色文件和上次 `cleanup.sh` 删除的两份全局角色文件；先执行其中的全局文件冲突检查，不覆盖用户原有文件。删除本次隔离工作区里 T7 遗留的 `extra.toml`，使 T1 能从 `MARKER_OLD` 开始。
3. 直接启动原安装，按受影响的必测项创建本轮会话并执行。**不要再调用 `prepare.sh`、打包或安装插件。**

```bash
export BASE="/tmp/dca-test.实际目录"  # 使用之前记录的真实路径
test -f "$BASE/logs/paths.env" || exit 1
. "$BASE/logs/paths.env"
test -s "$PKG" && test -f "$PROFILE/cordis.patch.yml" || exit 1
rm -f "$BASE/consumer-a/.codex/agents/extra.toml"

# 此处按测试计划第 2.3 节重做角色文件创建命令。
bash plan/dsh-codex-agents-test-recipe/start.sh
```

沿用 `$BASE` 内现有工作区、模型与 `maxDepth` 设置；仅恢复本轮必测所需的可变输入。执行记录注明复用的 `BASE`、`SOURCE_SHA`、正式安装包和已有结果来源。本轮结束仍使用 `cleanup.sh`，保留运行记录。

## 模型配置

默认值若能直接使用已复制的凭据，不需要迁移任何设置，在网页「设置 → 模型」确认最终生效配置即可。

默认值用不了时（例如原桌面配置用了自定义提供方或端点），按计划第 2.2 节，从 `$SOURCE_DSH_HOME/profiles/desktop/cordis.patch.yml` 只提取所需的提供方、模型与端点条目，写进 `$BASE/home/profiles/web/cordis.patch.yml`，重启服务。不更换测试目标模型。

仍不可用时，受影响项记「无法判断」，不算插件业务失败。

## 浏览器与收尾

浏览器完全交给执行工程师的 MCP：本 recipe 不启动浏览器、不指定资料目录、不处理首次运行提示，也不结束浏览器进程。`start.sh` 只负责把地址写到 `$BASE/logs/web.url` 并打印出来。

计划第 4 节「关闭本次测试网页」由执行工程师完成。`cleanup.sh` 只停本次 web 服务、删本次创建的两份全局角色，保留 `$BASE` 供审核。

`BASE` 必须由执行工程师按 `prepare.sh` 输出明确指定，脚本不再自动选择最新目录。

## 证据位置

| 内容 | 位置 |
|---|---|
| 隔离目录与路径变量 | `$BASE/logs/paths.env` |
| 服务地址（含访问凭据，不写公开记录） | `$BASE/logs/web.url` |
| 服务日志 | `$BASE/logs/web.log` |
| 打包与安装日志 | `$BASE/logs/npm-*.log`、`$BASE/logs/plugin-add.log` |
| 源码检查输出 | 执行 `static-check.sh` 时的终端输出 |

业务结果按计划第 3 节优先取网页工具卡片与子代理会话内容；显示不足时再按现成会话记录定位，不默认读 `session.v4.jsonl.zstd`。

## 准备阶段已验证的部分

以下只说明准备资产可用，不是正式测试结果：

| 检查 | 结果 |
|---|---|
| `prepare.sh` | 从零跑通：打包、安装到 web 配置档、`maxDepth` 写入为 2 |
| 插件安装 | `--dump-config` 中出现 `dsh-codex-agents` 三处 |
| `start.sh` | 服务打印地址并写入 `web.url`；浏览器交给 MCP |
| `static-check.sh` | 能打印三处检查所需的计划原句与代码位置 |

T1—T7 的业务结果尚未正式执行，按计划第 4 节表格由本地执行工程师记录。

## 已知限制

- 全局角色写在当前账户的 `$HOME/.codex/agents/`。`prepare.sh` 同时检查文件名与 TOML 里的 `name`，任一冲突就失败，不覆盖；需先改名再重跑。角色名冲突会让 T2、T3 的场景输入失真，不能只改文件名绕过。
- 多轮测试会留下多个 `/tmp/dca-test.*`。每次启动或清理必须使用对应的 `BASE`，不自动选最新目录。
- 会话目录名由工作区绝对路径转义而来，路径含空格时需另行处理。
- `start.sh` 前台等待服务进程；结束用 Ctrl-C 或 `kill "$(cat $BASE/logs/web.pid)"`。
- 浏览器 MCP 是否可用由执行工程师确认；不可用时把地址手动粘到浏览器，界面操作改由人工完成。
- `cleanup.sh` 只在确认命令行是 DSH 的 web 入口（`cli.js web`）时才结束进程，避免进程号被回收后误杀无关进程。
- 本次 `maxDepth=2` 只写在 `$BASE/home/profiles/web/cordis.patch.yml`，不影响用户现有配置。
