/**
 * Role definition parsed from one `.codex/agents/*.toml` file.
 * @module dsh-codex-agents/toml
 */
import { parse } from 'smol-toml';
/** A role TOML file that cannot be used; carries the file and the reason. */
export class AgentTomlError extends Error {
    file;
    /**
     * @param file - Absolute path of the rejected TOML file.
     * @param reason - Human-readable validation or parse problem.
     * @param options - Optional cause.
     */
    constructor(file, reason, options) {
        super(`${file}: ${reason}`, options);
        this.file = file;
        this.name = 'AgentTomlError';
    }
}
/** Role names accepted by `spawn_agent` and by preset identity. */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
/**
 * Parse and validate one role TOML document.
 * @param text - Raw TOML file content.
 * @param file - Absolute path used in diagnostics.
 * @returns The validated definition.
 * @throws {@link AgentTomlError} when the TOML or a required field is invalid.
 */
export function parseAgentToml(text, file) {
    let data;
    try {
        data = parse(text);
    }
    catch (error) {
        throw new AgentTomlError(file, `invalid TOML: ${error.message}`, { cause: error });
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new AgentTomlError(file, 'the TOML document must be a table');
    }
    const table = data;
    const name = table.name;
    const description = table.description;
    const instructions = table.developer_instructions;
    if (typeof name !== 'string' || name.length === 0) {
        throw new AgentTomlError(file, 'missing required string field "name"');
    }
    if (!NAME_PATTERN.test(name)) {
        throw new AgentTomlError(file, `"name" must match ${NAME_PATTERN.source} (got ${JSON.stringify(name)})`);
    }
    if (typeof description !== 'string') {
        throw new AgentTomlError(file, 'missing required string field "description"');
    }
    if (typeof instructions !== 'string') {
        throw new AgentTomlError(file, 'missing required string field "developer_instructions"');
    }
    return { name, description, developerInstructions: instructions };
}
