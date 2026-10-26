/**
 * Registered workspace and global role-directory discovery for one activation.
 * @module dsh-codex-agents/workspaces
 */

import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { RoleSource } from './roster.js'

/** Role directory under one registered workspace root. */
export interface WorkspaceSource extends RoleSource {
  readonly scope: 'workspace'
  readonly workspacePath: string
}

/** The user-level role directory, shared by every workspace. */
export interface GlobalSource extends RoleSource {
  readonly scope: 'global'
}

/** The caller's location and the workspace source that owns it, if any. */
export interface CallerWorkspace {
  /** Canonical caller working directory. */
  readonly cwd: string
  /** Longest registered workspace containing the caller, when one matches. */
  readonly workspace?: WorkspaceSource
}

/**
 * The global role source derived from the process `HOME`.
 * @returns Role directory under `~/.codex/agents`.
 */
export function globalRoleSource(): GlobalSource {
  const home = homedir()
  return {
    scope: 'global',
    dir: join(home, '.codex', 'agents'),
    root: home,
  }
}

/**
 * Build the role source for one registered workspace.
 * @param workspacePath - Canonical workspace root from the registry.
 * @returns Its `.codex/agents` role source.
 */
export function workspaceSource(workspacePath: string): WorkspaceSource {
  const root = resolve(workspacePath)
  return {
    scope: 'workspace',
    dir: join(root, '.codex', 'agents'),
    root,
    workspacePath: root,
  }
}

/**
 * Read every currently registered workspace as a role source.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @returns Workspace role sources in registry order.
 */
export function currentWorkspaceSources(ctx: Context): WorkspaceSource[] {
  return ctx.workspaceRegistry.list().map(workspace => workspaceSource(workspace.path))
}

/** Compare two role sources by the fields that define their identity. */
export function sameSource(left: RoleSource, right: RoleSource): boolean {
  return left.scope === right.scope && left.dir === right.dir
}

/** Source identity used as a map key. */
export function sourceId(source: RoleSource): string {
  return `${source.scope}\u0000${source.dir}`
}

/**
 * Whether `child` is `root` or below it, on a path-segment boundary.
 * @param root - Canonical directory.
 * @param child - Canonical candidate.
 * @returns True for the directory itself and its descendants.
 */
export function isWithin(root: string, child: string): boolean {
  if (child === root) return true
  return child.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Resolve a caller working directory to the longest registered workspace that
 * contains it. A caller outside every workspace can only see global roles.
 * @param ctx - Host context carrying `workspaceRegistry`.
 * @param cwd - Session header working directory.
 * @returns Canonical caller path and its owning workspace source, if any.
 */
export async function resolveCallerWorkspace(ctx: Context, cwd: string): Promise<CallerWorkspace> {
  const raw = resolve(cwd)
  const canonical = await realpath(raw).catch(() => raw)
  const matches = currentWorkspaceSources(ctx)
    .map(source => ({ source, root: source.workspacePath }))
    .filter(({ root }) => isWithin(root, canonical))
    .sort((left, right) => right.root.length - left.root.length)
  return {
    cwd: canonical,
    ...(matches[0] === undefined ? {} : { workspace: matches[0].source }),
  }
}
