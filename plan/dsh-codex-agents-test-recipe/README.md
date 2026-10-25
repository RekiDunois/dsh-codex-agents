# dsh-codex-agents 测试 recipe

本目录是 `plan/dsh-codex-agents-test-plan.md` v11 的可执行部分，对应第 2 节准备与第 3 节执行。

## 入口选择

正式验证使用 DSH 官方 `web` 配置档与浏览器界面，在当前 macOS 账户运行：

- `HOME` 不变，只隔离本次 `DSH_HOME`、浏览器资料目录与测试工作区。
- 不启动 Desktop，不需要专用 macOS 登录账户。
- 不用 `headless`：headless 模板缺本插件 `inject` 所需的 `workspaceRegistry` 与 `agentPresets`，装上会停在 `pending (waiting for service: workspaceRegistry)`，要靠额外补丁改宿主组合才能跑，超出计划授权。

## 前置

- 在真实源码目录执行，不能在 `worktrees/` 或 `apm-consumers/` 下。
- 必须让 direnv 生效，取得 Node 24 以上。实测为 Node 26.8.1。
- 需要 `yq`；浏览器用已安装的 Google Chrome。

## 脚本

| 脚本 | 对应计划 | 作用 |
|---|---|---|
| `prepare.sh` | 2.1—2.4 | 建隔离目录、复制凭据、写角色、打包安装、设 `maxDepth=2` |
| `start.sh` | 2.4 | 启动 web 服务，用隔离资料目录打开 Chrome |
| `static-check.sh` | 3 节 T4、T5/T7、T6 | 三处源码检查 |
| `cleanup.sh` | 4 节 | 停本次服务、删本次创建的两份全局角色与 `BASE` |

`static-check.sh` 只读产品源码，不运行产品，可在 `prepare.sh` 之后任意时刻执行。

## 执行顺序

```bash
# 1. 准备
bash plan/dsh-codex-agents-test-recipe/prepare.sh
# 记下输出的 BASE，后面都用它

# 2. 源码检查（T4、T5/T7 共享、T6 的插件侧责任）
bash plan/dsh-codex-agents-test-recipe/static-check.sh

# 3. 启动服务并打开隔离浏览器
bash plan/dsh-codex-agents-test-recipe/start.sh

# 4. 在网页里登记工作区、建会话、确认模型可用，然后按第 3 节执行 T1—T7
#    T6 最后做；T5 必须在同一会话、不重启的前提下改文件后立即调用

# 5. 收尾
bash plan/dsh-codex-agents-test-recipe/cleanup.sh
```

`BASE` 从 `prepare.sh` 输出读取，或取 `/tmp/dca-test.*` 最新一个。

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
| `start.sh` | 服务打印地址、写入 `web.url`、Chrome 以 `$BASE/browser-profile` 打开 |
| `static-check.sh` | 三处全部通过：`apply` 启动路径无 `await` 与同步读文件；`watch.ts` 用 `node:fs.watch` 并安排异步刷新；`tool.ts` 调用 `resolveMaxDepth()` 并送入 `startActivation` |

T1—T7 的业务结果尚未正式执行，按计划第 4 节表格由本地执行工程师记录。

## 已知限制

- 全局角色写在当前账户的 `$HOME/.codex/agents/`。`prepare.sh` 遇到同名文件直接失败，不覆盖；需要先改名再重跑。
- 会话目录名由工作区绝对路径转义而来，路径含空格时需另行处理。
- `start.sh` 前台等待服务进程；结束用 Ctrl-C 或 `kill "$(cat $BASE/logs/web.pid)"`。
- 本次 `maxDepth=2` 只写在 `$BASE/home/profiles/web/cordis.patch.yml`，不影响用户现有配置。
