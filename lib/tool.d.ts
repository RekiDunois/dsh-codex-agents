/**
 * The single global `spawn_agent` tool.
 * @module dsh-codex-agents/tool
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RoleManager } from './manager.js';
/** Model-facing tool name, shared with Codex skills. */
export declare const SPAWN_AGENT_TOOL = "spawn_agent";
/**
 * Build the tool definition registered once by the top-level plugin.
 * @param ctx - Host context carrying the subagent runtime.
 * @param manager - Sole role manager for this plugin instance.
 * @returns The global `spawn_agent` definition.
 */
export declare function createSpawnAgentTool(ctx: Context, manager: RoleManager): import("@deepseek-ai/dsh-tools").ToolDefinition;
