# 修复：适配 DSH 0.2.2-rc.2 的 startActivation 平铺参数

- 版本：v1
- 日期：2026-11-12
- 状态：用户（验收决定人）直接确认本轮修复范围与流程：按 local-execution-engineer 规则修复，新建 PR，整 PR 走快速合并审核
- 目标仓库：`RekiDunois/dsh-codex-agents`
- 基线：`main` @ `0e28f93`（PR #1、#2 已合并）
- 目标运行时：`@deepseek-ai/dsh@0.2.2-rc.2`（桌面 nightly 今日更新）
- 上一版计划：`plan/dsh-codex-agents.md`（v13，PR #1 已交付并合并）

## 1. 背景与问题

DSH 0.2.2-rc.2 将 `ctx.subagents.startActivation()` 的入参 `SubagentActivationSpec`
从「嵌套 `request` 对象」改为「平铺字段」：`prompt`、`parent`、`agentPreset`、
`maxDepth` 等直接位于 spec 顶层，嵌套 `request` 字段已删除（官方升级指南
`v0.2.1-rc.2/subagent-activation-options` 记载该变更；npm 对比确认 0.2.1-rc.3 至
0.2.2-rc.1 仍为嵌套，仅 0.2.2-rc.2 平铺）。

当前 `src/tool.ts` 仍按旧格式调用：

```ts
startActivation({
  provider: 'spawn',
  label: args.task_name,
  request: { prompt, parent, agentPreset, maxDepth },
  signal: exec.signal,
  delivery: 'parent',
})
```

新实现读取 `spec.parent.id`，`spec.parent` 为 `undefined`，抛出
`TypeError: Cannot read properties of undefined (reading 'id')`。
已在真实运行环境复现：`spawn_agent`（角色 `implementation_reviewer` 存在）返回该错误。

## 2. 本轮目标与范围

1. `spawn_agent` 在 DSH 0.2.2-rc.2 下能用真实存在的角色成功启动子代理（回归修复）。
2. 行为不变：`provider: 'spawn'`、`delivery: 'parent'`、调用时读取宿主
   `resolveMaxDepth()`、角色 preset 选取逻辑、错误信息、监听与注册逻辑均不修改。
3. 只修改 `startActivation` 调用形状与相应开发依赖版本；不新增功能、不改其余 API。

**非目标**：不处理 0.2.2 新增的可选 `name` 字段（不传时宿主自动生成 `agent-N` 名，
不影响功能）；不处理 `@deepseek-ai/dsh-subagent-codex` 的版本不兼容告警（已禁用，与本工具无关）。

## 3. 实现

- `src/tool.ts`：把 `request` 内的 `prompt`、`parent`、`agentPreset`、`maxDepth`
  平铺到 `startActivation` spec 顶层，删除 `request` 键。
- `package.json` / `package-lock.json`：devDependencies 中 `@deepseek-ai/dsh-*`
  相关包由 `0.2.1-rc.3` 升到 `0.2.2-rc.2`，使 `tsc` 类型检查与实际宿主 API 一致；
  版本号 `0.1.0` → `0.1.1`。peerDependencies 范围 `>=0.2.1-rc.3 <0.3.0` 已覆盖
  0.2.2-rc.2，保持不变。
- 回归测试 `test/tool.test.mjs`（先于实现编写）：以假 `ctx.subagents` 捕获
  `startActivation` 的入参，断言 spec 顶层包含 `prompt/parent/agentPreset/maxDepth`
  且不存在 `request` 键。

## 4. 必测清单

| # | 业务目标 | 输入/场景 | 预期结果 | 检查方式 |
|---|---|---|---|---|
| T1 | 调用形状回归 | 单测执行 `tool.execute`，假 manager 直接回调 role | spec 平铺、无 `request` 键、字段值正确 | `node --test test/tool.test.mjs` 断言 |
| T2 | 真实运行可用 | 桌面 profile 安装修复版后调用 `spawn_agent`（角色 `implementation_reviewer`） | 启动成功返回 `{kind:'activation', subagentId}`，子代理能完成简单任务 | 实际工具调用结果 |
| T3 | 构建与既有测试 | `npm run build` + `npm test` | 类型检查通过；既有 4 个单测全部通过 | 命令输出 |

## 5. 流程

1. 分支 `fix/dsh-codex-agents-0.2.2-startactivation`（基线 `main` @ 0e28f93）。
2. 先写回归测试（按 git-guidelines），再改实现；构建并跑通 T1、T3。
3. 推送分支，创建新 PR（base `main`）。
4. 通过插件管理器把分支版本安装进 desktop profile（正式安装路径），做 T2。
5. 实现符合性审核（implementation_reviewer）后，整 PR 走快速合并审核并给出结论。
6. PR 合并后把 profile 依赖还原为默认分支并重新安装（收尾项）。
