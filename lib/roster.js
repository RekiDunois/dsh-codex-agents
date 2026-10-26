/**
 * Project/global role merging for one `spawn_agent` caller.
 * @module dsh-codex-agents/roster
 */
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
export function mergeRoster(project, global) {
    const roles = new Map(global.roles);
    const conflicts = [];
    if (project !== undefined) {
        for (const [name, role] of project.roles)
            roles.set(name, role);
        for (const name of project.conflicts.keys()) {
            roles.delete(name);
            conflicts.push(name);
        }
    }
    return { roles, conflicts: conflicts.sort() };
}
/**
 * Format the sorted name list used by unknown-role diagnostics.
 * @param roster - Roles visible to the caller.
 * @returns Comma-separated names, or `(none)`.
 */
export function formatAvailable(roster) {
    const names = [...roster.roles.keys()].sort();
    return names.length === 0 ? '(none)' : names.join(', ');
}
