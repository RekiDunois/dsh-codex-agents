/**
 * Base capability rows granted to every generated agent preset.
 *
 * The list intentionally excludes this plugin: a child uses the host-global
 * `spawn_agent` instead of mounting a second role manager.
 * @module dsh-codex-agents/base-plugins
 */
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
/** One child plugin row of a generated preset. */
export type PresetPlugin = PresetDefinition['plugins'][number];
/**
 * Shared tool rows for generated role presets. These mirror the shipped
 * `standard` preset's basic coding tools and keep the platform command tool
 * selection.
 */
export declare const BASE_PLUGINS: readonly PresetPlugin[];
