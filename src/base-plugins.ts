/**
 * Base capability rows granted to every generated agent preset.
 *
 * The list intentionally excludes this plugin: a child uses the host-global
 * `spawn_agent` instead of mounting a second role manager.
 * @module dsh-codex-agents/base-plugins
 */

import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'

/** One child plugin row of a generated preset. */
export type PresetPlugin = PresetDefinition['plugins'][number]

/** True on Windows, where the bash row is replaced by pwsh. */
const WINDOWS = process.platform === 'win32'

/**
 * Shared tool rows for generated role presets. These mirror the shipped
 * `standard` preset's basic coding tools and keep the platform command tool
 * selection.
 */
export const BASE_PLUGINS: readonly PresetPlugin[] = [
  {
    id: 'agent-instructions',
    name: '@deepseek-ai/dsh-agent-instructions',
    config: { maxBytes: 65536 },
  },
  {
    id: 'time-context',
    name: '@deepseek-ai/dsh-time-context',
  },
  {
    id: 'tool-bash',
    name: '@deepseek-ai/dsh-tool-bash',
    disabled: WINDOWS,
  },
  {
    id: 'tool-pwsh',
    name: '@deepseek-ai/dsh-tool-pwsh',
    disabled: !WINDOWS,
  },
  {
    id: 'tool-fs',
    name: '@deepseek-ai/dsh-tool-fs',
  },
  {
    id: 'tool-fs-search',
    name: '@deepseek-ai/dsh-tool-fs-search',
    config: { sampleOverCapGlobResults: false },
  },
  {
    id: 'tool-jobs',
    name: '@deepseek-ai/dsh-tool-jobs',
  },
  {
    id: 'skill-filesystem',
    name: '@deepseek-ai/dsh-skill-filesystem',
  },
  {
    id: 'tool-skill',
    name: '@deepseek-ai/dsh-tool-skill',
  },
  {
    id: 'tool-todo',
    name: '@deepseek-ai/dsh-tool-todo',
    config: { allowParallelInProgress: true },
  },
]
