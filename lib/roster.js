/**
 * Project/global role merging for one `spawn_agent` caller.
 * @module dsh-codex-agents/roster
 */
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
export function mergeRoster(project, global) {
    const roles = new Map(global.roles);
    const errors = new Map();
    for (const [name, declared] of global.declared) {
        if (global.roles.has(name))
            continue;
        if (declared.error !== undefined)
            errors.set(name, declared.error);
    }
    if (project !== undefined) {
        for (const [name, declared] of project.declared) {
            const role = project.roles.get(name);
            errors.delete(name);
            if (role !== undefined) {
                roles.set(name, role);
                continue;
            }
            roles.delete(name);
            errors.set(name, declared.error ?? `${declared.files.join(', ')}: role is not available`);
        }
    }
    return {
        roles,
        errors,
        opaque: project?.opaque ?? [],
    };
}
/**
 * Resolve one requested `agent_type` without ever substituting a global role
 * for a name the project declares or might declare.
 * @param roster - Merged roster for the caller.
 * @param agentType - Requested role name.
 * @returns The project role, a project error, or an unknown name.
 */
export function resolveRole(roster, agentType) {
    const role = roster.roles.get(agentType);
    if (role !== undefined) {
        if (role.source.scope === 'workspace' || roster.opaque.length === 0) {
            return { kind: 'role', role };
        }
        // A project file with an unknown name could declare this global role too.
        return { kind: 'project-error', message: describeOpaque(roster.opaque) };
    }
    const failure = roster.errors.get(agentType);
    if (failure !== undefined) {
        return { kind: 'project-error', message: `agent_type "${agentType}" is unavailable: ${failure}` };
    }
    if (roster.opaque.length > 0) {
        return { kind: 'project-error', message: describeOpaque(roster.opaque) };
    }
    return { kind: 'unknown' };
}
/**
 * One-line diagnostics for unreadable project role files.
 * @param opaque - Files whose declared name is unknown.
 * @returns Sentence listing every file and reason.
 */
function describeOpaque(opaque) {
    const details = opaque.map(entry => `${entry.file}: ${entry.reason}`).join('; ');
    return `project role files could not be read, so the global role cannot be used safely: ${details}`;
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
