/**
 * The single global `spawn_agent` tool.
 * @module dsh-codex-agents/tool
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
/** Model-facing tool name, shared with Codex skills. */
export const SPAWN_AGENT_TOOL = 'spawn_agent';
/**
 * Build the tool definition registered once by the top-level plugin.
 * @param ctx - Host context carrying the subagent runtime.
 * @param manager - Sole role manager for this plugin instance.
 * @returns The global `spawn_agent` definition.
 */
export function createSpawnAgentTool(ctx, manager) {
    return defineTool({
        name: SPAWN_AGENT_TOOL,
        description: 'Start a subagent with a role definition read from .codex/agents/*.toml in the calling workspace or the global Codex agents directory. '
            + 'The role provides the child persona and base tools. Use one tool call per delegation; the child result is delivered later.',
        parameters: {
            task_name: {
                type: 'string',
                required: true,
                description: 'Short task label for this delegation, persisted with the child session.',
            },
            agent_type: {
                type: 'string',
                required: true,
                description: 'Role name from the available Codex agent definitions.',
            },
            message: {
                type: 'string',
                required: true,
                description: 'Task instructions delivered to the child as its user message.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', required: true, const: 'activation' },
                    subagentId: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: `started subagent ${value.subagentId}` }],
        },
        execute(args, exec) {
            const parent = exec.agent;
            if (parent === undefined) {
                throw new Error('spawn_agent requires a calling agent');
            }
            const cwd = parent.session.header.cwd;
            if (cwd === undefined || cwd.length === 0) {
                throw new Error('spawn_agent requires the calling session to have a working directory');
            }
            return manager.delegate(args.agent_type, cwd, async ({ role }) => {
                exec.signal.throwIfAborted();
                // Read the host limit at every call; never pin it in the role preset.
                const maxDepth = ctx.subagents.resolveMaxDepth();
                const started = await ctx.subagents.startActivation({
                    provider: 'spawn',
                    label: args.task_name,
                    request: {
                        prompt: [{ type: 'text', text: args.message }],
                        parent,
                        agentPreset: role.presetId,
                        ...(maxDepth === undefined ? {} : { maxDepth }),
                    },
                    signal: exec.signal,
                    delivery: 'parent',
                });
                return { kind: 'activation', subagentId: String(started.childId) };
            });
        },
        presentCall: args => ({ card: 'generic', title: 'spawn_agent', rawInput: args }),
    });
}
