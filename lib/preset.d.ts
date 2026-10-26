/**
 * Deterministic preset identity and content for one role source.
 * @module dsh-codex-agents/preset
 */
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
import type { RosterRole, RoleScope } from './roster.js';
/**
 * Stable identity of one role source: scope, canonical source directory, and
 * role name. TOML content is deliberately excluded so an edit keeps the id.
 * @param scope - Workspace or global role source.
 * @param dir - Canonical source directory.
 * @param name - TOML role name.
 * @returns The role identity string.
 */
export declare function roleKey(scope: RoleScope, dir: string, name: string): string;
/**
 * Preset id derived only from the role source and name.
 * @param scope - Workspace or global role source.
 * @param dir - Canonical source directory.
 * @param name - TOML role name.
 * @returns `dshca_<name>_<24 hex characters>`.
 */
export declare function presetIdFor(scope: RoleScope, dir: string, name: string): string;
/**
 * Build the declarative preset registered for one role.
 * @param role - Role whose persona and metadata are copied.
 * @returns Preset definition with persona plus the shared base capability rows.
 */
export declare function presetDefinition(role: RosterRole): PresetDefinition;
