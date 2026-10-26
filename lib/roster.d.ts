/**
 * Project/global role merging for one `spawn_agent` caller.
 * @module dsh-codex-agents/roster
 */
/** Where a role file was found. */
export type RoleScope = 'workspace' | 'global';
/** One role directory: a workspace's `.codex/agents` or the global directory. */
export interface RoleSource {
    /** Whether this directory belongs to a registered workspace or the user home. */
    readonly scope: RoleScope;
    /** Absolute directory that holds the role TOML files. */
    readonly dir: string;
    /** Registered workspace root (workspace scope) or the user home (global scope). */
    readonly root: string;
    /** Canonical workspace path for workspace sources. */
    readonly workspacePath?: string;
}
/** One usable role parsed from a source directory. */
export interface RosterRole {
    /** TOML `name`; the key used by `spawn_agent` and by merging. */
    readonly name: string;
    /** Absolute TOML path. */
    readonly file: string;
    /** Directory this role was read from. */
    readonly source: RoleSource;
    /** SHA-256 of the file's current text. */
    readonly contentHash: string;
    /** Role description copied into the preset. */
    readonly description: string;
    /** Role instructions copied into the preset persona. */
    readonly developerInstructions: string;
}
/** One name a directory declares, whether or not it can be used. */
export interface DeclaredRole {
    /** Files that declare this name, including unreadable ones reusing a trusted name. */
    readonly files: readonly string[];
    /** Why the name cannot be used, when it cannot. */
    readonly error?: string;
}
/** One role file whose declared name cannot be determined. */
export interface OpaqueRoleFile {
    /** Absolute TOML path. */
    readonly file: string;
    /** Why the file could not be read or parsed far enough to expose its name. */
    readonly reason: string;
}
/** One directory's parsed state before merging. */
export interface SourceRoster {
    /** Usable roles keyed by TOML `name`. */
    readonly roles: ReadonlyMap<string, RosterRole>;
    /** Every name this directory declares, usable or not. */
    readonly declared: ReadonlyMap<string, DeclaredRole>;
    /** Files whose declared name cannot be determined. */
    readonly opaque: readonly OpaqueRoleFile[];
}
/** Merged roster visible to one caller. */
export interface MergedRoster {
    /** Selectable roles keyed by name; project roles take precedence over global ones. */
    readonly roles: ReadonlyMap<string, RosterRole>;
    /** Why a requested project name cannot be used; these names never fall back to global. */
    readonly errors: ReadonlyMap<string, string>;
    /** Project files whose names are unknown and therefore block unsafe global fallback. */
    readonly opaque: readonly OpaqueRoleFile[];
}
/**
 * Merge the caller workspace roster over the global roster by `name`.
 *
 * A name the project declares stays owned by the project even when its file or
 * preset cannot be used: the caller gets that project error instead of a
 * global role with a different persona. A project file whose name cannot be
 * determined blocks global fallback entirely, because it could declare any
 * name. Global duplicates that the project does not redeclare simply stay
 * unavailable.
 * @param project - Roster of the caller's workspace, or undefined when the caller is outside every registered workspace.
 * @param global - Roster of the global role directory.
 * @returns Roles, project errors, and unknown-name project files visible to this caller.
 */
export declare function mergeRoster(project: SourceRoster | undefined, global: SourceRoster): MergedRoster;
/** Result of resolving one requested role name against a merged roster. */
export type RoleResolution = {
    readonly kind: 'role';
    readonly role: RosterRole;
} | {
    readonly kind: 'project-error';
    readonly message: string;
} | {
    readonly kind: 'unknown';
};
/**
 * Resolve one requested `agent_type` without ever substituting a global role
 * for a name the project declares or might declare.
 * @param roster - Merged roster for the caller.
 * @param agentType - Requested role name.
 * @returns The project role, a project error, or an unknown name.
 */
export declare function resolveRole(roster: MergedRoster, agentType: string): RoleResolution;
/**
 * Format the sorted name list used by unknown-role diagnostics.
 * @param roster - Roles visible to the caller.
 * @returns Comma-separated names, or `(none)`.
 */
export declare function formatAvailable(roster: Pick<MergedRoster, 'roles'>): string;
