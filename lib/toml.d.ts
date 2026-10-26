/**
 * Role definition parsed from one `.codex/agents/*.toml` file.
 * @module dsh-codex-agents/toml
 */
/** One validated Codex role definition. */
export interface AgentDefinition {
    /** Callable role name; also the `spawn_agent` `agent_type`. */
    readonly name: string;
    /** Short role description copied into the preset metadata. */
    readonly description: string;
    /** Role instructions used as the preset persona prefix. */
    readonly developerInstructions: string;
}
/** A role TOML file that cannot be used; carries the file and the reason. */
export declare class AgentTomlError extends Error {
    readonly file: string;
    /**
     * @param file - Absolute path of the rejected TOML file.
     * @param reason - Human-readable validation or parse problem.
     * @param options - Optional cause.
     */
    constructor(file: string, reason: string, options?: ErrorOptions);
}
/**
 * Parse and validate one role TOML document.
 * @param text - Raw TOML file content.
 * @param file - Absolute path used in diagnostics.
 * @returns The validated definition.
 * @throws {@link AgentTomlError} when the TOML or a required field is invalid.
 */
export declare function parseAgentToml(text: string, file: string): AgentDefinition;
