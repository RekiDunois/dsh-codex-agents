import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AgentTomlError, parseAgentToml } from '../lib/toml.js'

const VALID = `
name = "reviewer"
description = "review only"
developer_instructions = """
read and review
"""
`

test('parses the three required fields', () => {
  const role = parseAgentToml(VALID, '/tmp/reviewer.toml')
  assert.equal(role.name, 'reviewer')
  assert.equal(role.description, 'review only')
  assert.equal(role.developerInstructions, 'read and review\n')
})

test('rejects a missing name field', () => {
  assert.throws(
    () => parseAgentToml('description = "x"\ndeveloper_instructions = "y"\n', '/tmp/bad.toml'),
    (error) => error instanceof AgentTomlError && /missing required string field "name"/.test(error.message),
  )
})

test('rejects an invalid role name', () => {
  assert.throws(
    () => parseAgentToml('name = "a b"\ndescription = "x"\ndeveloper_instructions = "y"\n', '/tmp/bad.toml'),
    (error) => error instanceof AgentTomlError && /must match/.test(error.message),
  )
})

test('rejects malformed TOML with the file path', () => {
  assert.throws(
    () => parseAgentToml('name = [\n', '/tmp/bad.toml'),
    (error) => error instanceof AgentTomlError && error.message.startsWith('/tmp/bad.toml: invalid TOML'),
  )
})
