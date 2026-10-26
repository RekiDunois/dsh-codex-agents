import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presetDefinition, presetIdFor } from '../lib/preset.js'

const role = (scope, dir, name) => ({
  name,
  file: `${dir}/${name}.toml`,
  source: { scope, dir, root: dir },
  contentHash: 'hash',
  description: 'desc',
  developerInstructions: 'persona',
})

test('preset id is stable and matches the documented shape', () => {
  const first = presetIdFor('workspace', '/w/a', 'reviewer')
  const second = presetIdFor('workspace', '/w/a', 'reviewer')
  assert.equal(first, second)
  assert.match(first, /^dshca_reviewer_[0-9a-f]{24}$/)
})

test('preset id differs across workspace directories and scopes', () => {
  const a = presetIdFor('workspace', '/w/a', 'reviewer')
  const b = presetIdFor('workspace', '/w/b', 'reviewer')
  const global = presetIdFor('global', '/h', 'reviewer')
  assert.notEqual(a, b)
  assert.notEqual(a, global)
})

test('preset contains persona first and no nested dsh-codex-agents row', () => {
  const definition = presetDefinition(role('workspace', '/w/a', 'reviewer'))
  assert.equal(definition.id, presetIdFor('workspace', '/w/a', 'reviewer'))
  assert.deepEqual(definition.plugins[0], {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: { prefix: 'persona' },
  })
  assert.equal(
    definition.plugins.some(plugin => plugin.name === 'dsh-codex-agents'),
    false,
  )
})
