/**
 * Role definition parsed from one `.codex/agents/*.toml` file.
 * @module dsh-codex-agents/toml
 */

import { parse } from 'smol-toml'

/** One validated Codex role definition. */
export interface AgentDefinition {
  /** Callable role name; also the `spawn_agent` `agent_type`. */
  readonly name: string
  /** Short role description copied into the preset metadata. */
  readonly description: string
  /** Role instructions used as the preset persona prefix. */
  readonly developerInstructions: string
}

/** A role TOML file that cannot be used; carries the file and the reason. */
export class AgentTomlError extends Error {
  /**
   * @param file - Absolute path of the rejected TOML file.
   * @param reason - Human-readable validation or parse problem.
   * @param options - Optional cause.
   */
  constructor(readonly file: string, reason: string, options?: ErrorOptions) {
    super(`${file}: ${reason}`, options)
    this.name = 'AgentTomlError'
  }
}

/** Role names accepted by `spawn_agent` and by preset identity. */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Parse and validate one role TOML document.
 * @param text - Raw TOML file content.
 * @param file - Absolute path used in diagnostics.
 * @returns The validated definition.
 * @throws {@link AgentTomlError} when the TOML or a required field is invalid.
 */
export function parseAgentToml(text: string, file: string): AgentDefinition {
  let data: unknown
  try {
    data = parse(text)
  } catch (error) {
    throw new AgentTomlError(file, `invalid TOML: ${(error as Error).message}`, { cause: error })
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AgentTomlError(file, 'the TOML document must be a table')
  }
  const table = data as Record<string, unknown>
  const name = table.name
  const description = table.description
  const instructions = table.developer_instructions
  if (typeof name !== 'string' || name.length === 0) {
    throw new AgentTomlError(file, 'missing required string field "name"')
  }
  if (!NAME_PATTERN.test(name)) {
    throw new AgentTomlError(file, `"name" must match ${NAME_PATTERN.source} (got ${JSON.stringify(name)})`)
  }
  if (typeof description !== 'string') {
    throw new AgentTomlError(file, 'missing required string field "description"')
  }
  if (typeof instructions !== 'string') {
    throw new AgentTomlError(file, 'missing required string field "developer_instructions"')
  }
  return { name, description, developerInstructions: instructions }
}
