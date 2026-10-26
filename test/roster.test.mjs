import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAvailable, mergeRoster } from '../lib/roster.js'

const source = (scope, dir) => ({ scope, dir, root: dir, ...(scope === 'workspace' ? { workspacePath: dir } : {}) })

const role = (name, scope, dir, marker) => ({
  name,
  file: `${dir}/${name}.toml`,
  source: source(scope, dir),
  contentHash: marker,
  description: name,
  developerInstructions: marker,
})

test('project roles override global roles with the same name', () => {
  const project = {
    roles: new Map([['reviewer', role('reviewer', 'workspace', '/w/a', 'OLD')]]),
    conflicts: new Map(),
  }
  const global = {
    roles: new Map([
      ['reviewer', role('reviewer', 'global', '/h', 'WORLD')],
      ['global_only', role('global_only', 'global', '/h', 'GLOBAL')],
    ]),
    conflicts: new Map(),
  }
  const merged = mergeRoster(project, global)
  assert.equal(merged.roles.get('reviewer').developerInstructions, 'OLD')
  assert.equal(merged.roles.get('global_only').developerInstructions, 'GLOBAL')
})

test('a duplicate name inside one directory is not selectable', () => {
  const project = {
    roles: new Map(),
    conflicts: new Map([['reviewer', ['/w/a/one.toml', '/w/a/two.toml']]]),
  }
  const global = {
    roles: new Map([['reviewer', role('reviewer', 'global', '/h', 'WORLD')]]),
    conflicts: new Map(),
  }
  const merged = mergeRoster(project, global)
  assert.equal(merged.roles.has('reviewer'), false)
  assert.deepEqual(merged.conflicts, ['reviewer'])
})

test('a caller without a workspace sees only global roles', () => {
  const global = {
    roles: new Map([['global_only', role('global_only', 'global', '/h', 'GLOBAL')]]),
    conflicts: new Map(),
  }
  const merged = mergeRoster(undefined, global)
  assert.deepEqual([...merged.roles.keys()], ['global_only'])
  assert.equal(formatAvailable(merged), 'global_only')
})

test('available names are sorted', () => {
  const merged = {
    roles: new Map([
      ['zeta', role('zeta', 'global', '/h', 'Z')],
      ['alpha', role('alpha', 'global', '/h', 'A')],
    ]),
    conflicts: [],
  }
  assert.equal(formatAvailable(merged), 'alpha, zeta')
})
