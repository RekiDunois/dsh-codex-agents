# dsh-codex-agents

在 DeepSeek Harness（DSH）中复用 Codex 的角色文件和 `spawn_agent` 委派写法，让已有技能能够按角色启动 DSH 子代理。

插件读取项目和全局的 `.codex/agents/*.toml`，将角色指令注册为 DSH agent preset，并通过 DSH 自身的子代理运行时执行任务。

## 功能

- **按角色委派**：提供一个全局 `spawn_agent` 工具，接受 `task_name`、`agent_type` 和 `message`。
- **角色选择隔离**：根据调用会话的工作目录选择所属的已登记工作区；同名项目角色优先于全局角色。
- **角色热更新**：新增、修改、删除角色文件后刷新；`.codex` 或 `agents` 目录删除重建后重新绑定监听。每次委派前也会读取当前内容。
- **异步结果交付**：工具先返回子代理 ID，子代理结果随后交给父代理。嵌套委派沿用宿主当前的深度限制。
- **基础工具可用**：角色子代理带有文件读写与搜索、命令执行、后台任务、技能和待办等基础能力；命令工具按平台使用 Bash 或 PowerShell。

## 安装

支持 DSH `>=0.2.1-rc.3 <0.3.0`。所用配置档须提供 `tools`、`subagents`、`agentPresets` 和 `workspaceRegistry` 服务；现有验收使用官方 `web` 配置档，默认 `headless` 配置缺少所需服务。

当前可从源码构建本地安装包。先安装 Node.js 24+、npm 和兼容的 DSH，并确保 `dsh` 命令可用：

```bash
git clone https://github.com/RekiDunois/dsh-codex-agents.git
cd dsh-codex-agents
npm ci
npm pack
dsh plugin --profile web add "$PWD/dsh-codex-agents-0.1.0.tgz"
```

`npm pack` 会通过 `prepack` 自动构建 `lib/`。上例按当前 `package.json` 的版本写出包名；版本变化后使用命令实际生成的文件。将 `web` 换成你实际使用、且具备上述服务的配置档。若 DSH 已在运行，重启对应配置档以加载新安装的插件。

插件本身没有用户配置项。模型、凭据、子代理深度等继续由 DSH 宿主管理；它不会安装或配置 MCP 服务。

## 定义角色

将文件放在已登记工作区的 `.codex/agents/`，例如 `.codex/agents/reviewer.toml`：

```toml
name = "reviewer"
description = "检查代码变更及其影响"
developer_instructions = """
阅读相关源码和变更，报告具体问题、影响及最小修正建议。
未获授权时保持只读，不执行测试或修改文件。
"""
```

三个字段均须为字符串。角色名允许字母、数字、下划线和连字符，调用时使用 TOML 中的 `name`。全局角色放在运行 DSH 的用户目录 `~/.codex/agents/`；该路径不随 `DSH_HOME` 改变。

角色选择规则：

1. 会话位于多个嵌套的已登记工作区中时，选择路径最长的工作区。
2. 读取该工作区根目录下的 `.codex/agents/`，并合并全局角色；项目同名角色优先。
3. 会话不属于任何已登记工作区时，只使用全局角色。
4. 同一目录中的重名角色不可用。项目已声明的角色加载失败时，报出错误，不改用全局同名角色；若项目坏文件的角色名无法确定，也会阻止不安全的全局回退。

仅扫描角色目录直接包含的非隐藏 `.toml` 文件，不递归寻找任意父目录中的角色。

## 委派任务

在技能或给主代理的指令中明确角色与任务，例如：

> 使用 spawn_agent，将代码审核任务交给 reviewer 角色，并将本次 diff 和审核范围传给它。

对应工具参数：

```json
{
  "task_name": "review_changes",
  "agent_type": "reviewer",
  "message": "检查本次变更的正确性与兼容性，只报告有证据的问题，不修改文件。"
}
```

调用成功后返回：

```json
{ "kind": "activation", "subagentId": "..." }
```

调用会话必须有工作目录。未知的 `agent_type` 会报错并列出当前可见角色；它不会自动创建角色。

## 兼容范围

- 当前桥接 `name`、`description` 和 `developer_instructions`。额外的 Codex TOML 字段不会自动映射为 DSH 模型、权限、沙箱或工具配置。
- 兼容范围是上述 `spawn_agent` 三参数委派接口；子代理实际由 DSH 运行，使用宿主的生命周期与结果交付机制。
- 角色文件修改会影响后续委派；插件不提供修改已启动子代理行为的接口。
- 工作区注册删除与正在交接的委派之间，不保证瞬时原子切换。

## 开发与验证

```bash
npm ci
npm run typecheck
npm test
npm run build
```

正式场景与已有验证记录见[测试计划](plan/dsh-codex-agents-test-plan.md)；需要复现时参考[测试 recipe](plan/dsh-codex-agents-test-recipe/README.md)。架构与设计边界见[执行计划](plan/dsh-codex-agents.md)。
