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
    /** Existing ancestor boundary used when rebinding a missing directory watch. */
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
/** One directory's parsed state before merging. */
export interface SourceRoster {
    /** Usable roles keyed by TOML `name`. */
    readonly roles: ReadonlyMap<string, RosterRole>;
    /** Names declared by more than one file in this directory, with those files. */
    readonly conflicts: ReadonlyMap<string, readonly string[]>;
}
/** Merged roster visible to one caller, plus the names hidden by a conflict. */
export interface MergedRoster {
    /** Selectable roles keyed by name; project roles override global ones. */
    readonly roles: ReadonlyMap<string, RosterRole>;
    /** Names that cannot be selected because the caller's project directory is ambiguous. */
    readonly conflicts: readonly string[];
}
/**
 * Merge the caller workspace roster over the global roster by `name`.
 *
 * A name declared twice in the same directory is ambiguous and is not made
 * selectable again by a global role with the same name; silently substituting
 * another persona would be worse than reporting the unknown role. Global
 * duplicates that the project does not redeclare simply stay unavailable.
 * @param project - Roster of the caller's workspace, or undefined when the caller is outside every registered workspace.
 * @param global - Roster of the global character directory.
 * @returns Roles visible to this caller.
 */
export declare function mergeRoster(project: SourceRoster | undefined, global: SourceRoster): MergedRoster;
/**
 * Format the sorted name list used by unknown-role diagnostics.
 * @param roster - Roles visible to the caller.
 * @returns Comma-separated names, or `(none)`.
 */
export declare function formatAvailable(roster: MergedRoster): string;
