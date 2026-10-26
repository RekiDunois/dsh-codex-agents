/**
 * Registered workspace and global role-directory discovery for one activation.
 * @module dsh-codex-agents/workspaces
 */
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
/**
 * The global role source derived from the process `HOME`.
 * @returns Role directory under `~/.codex/agents`.
 */
export function globalRoleSource() {
    const home = homedir();
    return {
        scope: 'global',
        dir: join(home, '.codex', 'agents'),
        root: home,
    };
}
/**
 * Build the role source for one registered workspace.
 * @param workspacePath - Canonical workspace root from the registry.
 * @returns Its `.codex/agents` role source.
 */
export function workspaceSource(workspacePath) {
    const root = resolve(workspacePath);
    return {
        scope: 'workspace',
        dir: join(root, '.codex', 'agents'),
        root,
        workspacePath: root,
    };
}
/**
 * Read every currently registered workspace as a role source.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @returns Workspace role sources in registry order.
 */
export function currentWorkspaceSources(ctx) {
    return ctx.workspaceRegistry.list().map(workspace => workspaceSource(workspace.path));
}
/** Compare two role sources by the fields that define their identity. */
export function sameSource(left, right) {
    return left.scope === right.scope && left.dir === right.dir;
}
/** Source identity used as a map key. */
export function sourceId(source) {
    return `${source.scope}\u0000${source.dir}`;
}
/**
 * Whether `child` is `root` or below it, on a path-segment boundary.
 * @param root - Canonical directory.
 * @param child - Canonical candidate.
 * @returns True for the directory itself and its descendants.
 */
export function isWithin(root, child) {
    if (child === root)
        return true;
    return child.startsWith(root.endsWith(sep) ? root : root + sep);
}
/**
 * Resolve a caller working directory to the longest registered workspace that
 * contains it. A caller outside every workspace can only see global roles.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @param cwd - Session header working directory.
 * @returns Canonical caller path and its owning workspace source, if any.
 */
export async function resolveCallerWorkspace(ctx, cwd) {
    const raw = resolve(cwd);
    const canonical = await realpath(raw).catch(() => raw);
    const matches = currentWorkspaceSources(ctx)
        .map(source => ({ source, root: source.workspacePath }))
        .filter(({ root }) => isWithin(root, canonical))
        .sort((left, right) => right.root.length - left.root.length);
    return {
        cwd: canonical,
        ...(matches[0] === undefined ? {} : { workspace: matches[0].source }),
    };
}
