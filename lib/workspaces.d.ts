/**
 * Registered workspace and global role-directory discovery for one activation.
 * @module dsh-codex-agents/workspaces
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RoleSource } from './roster.js';
/** Role directory under one registered workspace root. */
export interface WorkspaceSource extends RoleSource {
    readonly scope: 'workspace';
    readonly workspacePath: string;
}
/** The user-level role directory, shared by every workspace. */
export interface GlobalSource extends RoleSource {
    readonly scope: 'global';
}
/** The caller's location and the workspace source that owns it, if any. */
export interface CallerWorkspace {
    /** Canonical caller working directory. */
    readonly cwd: string;
    /** Longest registered workspace containing the caller, when one matches. */
    readonly workspace?: WorkspaceSource;
}
/**
 * The global role source derived from the process `HOME`.
 * @returns Role directory under `~/.codex/agents`.
 */
export declare function globalRoleSource(): GlobalSource;
/**
 * Build the role source for one registered workspace.
 * @param workspacePath - Canonical workspace root from the registry.
 * @returns Its `.codex/agents` role source.
 */
export declare function workspaceSource(workspacePath: string): WorkspaceSource;
/**
 * Read every currently registered workspace as a role source.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @returns Workspace role sources in registry order.
 */
export declare function currentWorkspaceSources(ctx: Context): WorkspaceSource[];
/** Compare two role sources by the fields that define their identity. */
export declare function sameSource(left: RoleSource, right: RoleSource): boolean;
/** Source identity used as a map key. */
export declare function sourceId(source: RoleSource): string;
/**
 * Whether `child` is `root` or below it, on a path-segment boundary.
 * @param root - Canonical directory.
 * @param child - Canonical candidate.
 * @returns True for the directory itself and its descendants.
 */
export declare function isWithin(root: string, child: string): boolean;
/**
 * Resolve a caller working directory to the longest registered workspace that
 * contains it. A caller outside every workspace can only see global roles.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @param cwd - Session header working directory.
 * @returns Canonical caller path and its owning workspace source, if any.
 */
export declare function resolveCallerWorkspace(ctx: Context, cwd: string): Promise<CallerWorkspace>;
