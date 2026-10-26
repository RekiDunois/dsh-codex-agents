/**
 * Top-level plugin entry: declare dependencies, register the sole global tool,
 * and own the shutdown ordering.
 * @module dsh-codex-agents
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { createManager } from './manager.js'
import { createSpawnAgentTool } from './tool.js'

/** Cordis plugin name. */
export const name = 'dsh-codex-agents'

/** Services that must be present before the global tool can be registered. */
export const inject = ['tools', 'subagents', 'agentPresets', 'workspaceRegistry']

/** No user-facing configuration in this version; directory names are fixed. */
export const Config = z.object({})

/** Inferred plugin configuration. */
export type Config = ReturnType<typeof Config>

/**
 * Register the global delegation tool and hand scanning/watch setup to a later
 * event-loop task. This function never reads role files or registers presets
 * synchronously.
 * @param ctx - Top-level plugin context.
 * @param config - Validated plugin config (empty in this version).
 */
export function apply(ctx: Context, config: Config): void {
  void config
  const manager = createManager(ctx)
  const unregister = ctx.tools.register(createSpawnAgentTool(ctx, manager))
  // The host must finish activating this plugin before preset trees mount.
  const startTimer = setTimeout(() => { manager.start() }, 0)
  let cleaned = false
  ctx.effect(() => async () => {
    if (cleaned) return
    cleaned = true
    clearTimeout(startTimer)
    // 1. Refuse new delegations. 2. Remove this instance's global tool.
    // 3. Stop watchers/background work, then wait for accepted setup and
    //    registrations to settle before disposing only our own presets.
    manager.close()
    try {
      unregister()
    } catch {
      // The host may already have removed the registration with its own effect.
    }
    await manager.shutdown()
  }, 'dsh-codex-agents.lifecycle')
}
