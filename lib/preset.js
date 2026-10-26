/**
 * Deterministic preset identity and content for one role source.
 * @module dsh-codex-agents/preset
 */
import { createHash } from 'node:crypto';
import { BASE_PLUGINS } from './base-plugins.js';
/**
 * Stable identity of one role source: scope, canonical source directory, and
 * role name. TOML content is deliberately excluded so an edit keeps the id.
 * @param scope - Workspace or global role source.
 * @param dir - Canonical source directory.
 * @param name - TOML role name.
 * @returns The role identity string.
 */
export function roleKey(scope, dir, name) {
    return `${scope}\u0000${dir}\u0000${name}`;
}
/**
 * Preset id derived only from the role source and name.
 * @param scope - Workspace or global role source.
 * @param dir - Canonical source directory.
 * @param name - TOML role name.
 * @returns `dshca_<name>_<24 hex characters>`.
 */
export function presetIdFor(scope, dir, name) {
    const digest = createHash('sha256').update(roleKey(scope, dir, name)).digest('hex');
    return `dshca_${name}_${digest.slice(0, 24)}`;
}
/**
 * Build the declarative preset registered for one role.
 * @param role - Role whose persona and metadata are copied.
 * @returns Preset definition with persona plus the shared base capability rows.
 */
export function presetDefinition(role) {
    return {
        id: presetIdFor(role.source.scope, role.source.dir, role.name),
        name: role.name,
        description: role.description,
        plugins: [
            {
                id: 'persona',
                name: '@deepseek-ai/dsh-persona',
                config: { prefix: role.developerInstructions },
            },
            ...BASE_PLUGINS,
        ],
    };
}
