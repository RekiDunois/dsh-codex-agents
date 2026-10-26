/**
 * Top-level plugin entry: declare dependencies, register the sole global tool,
 * and own the shutdown ordering.
 * @module dsh-codex-agents
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "dsh-codex-agents";
/** Services that must be present before the global tool can be registered. */
export declare const inject: string[];
/** No user-facing configuration in this version; directory names are fixed. */
export declare const Config: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
/** Inferred plugin configuration. */
export type Config = ReturnType<typeof Config>;
/**
 * Register the global delegation tool and hand scanning/watch setup to a later
 * event-loop task. This function never reads role files or registers presets
 * synchronously.
 * @param ctx - Top-level plugin context.
 * @param config - Validated plugin config (empty in this version).
 */
export declare function apply(ctx: Context, config: Config): void;
