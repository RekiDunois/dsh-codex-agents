import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAvailable, mergeRoster, resolveRole } from '../lib/roster.js'

const source = (scope, dir) => ({ scope, dir, root: dir, ...(scope === 'workspace' ? { workspacePath: dir } : {}) })

const role = (name, scope, dir, marker) => ({
  name,
  file: `${dir}/${name}.toml`,
  source: source(scope, dir),
  contentHash: marker,
  description: name,
  developerInstructions: marker,
})

/** Build a SourceRoster from usable roles and declared-but-unusable names. */
const roster = ({ roles = [], errors = [], opaque = [] } = {}) => {
  const byName = new Map()
  const declared = new Map()
  for (const item of roles) {
    byName.set(item.name, item)
    declared.set(item.name, { files: [item.file] })
  }
  for (const item of errors) {
    declared.set(item.name, { files: [item.file], error: `${item.file}: ${item.reason}` })
  }
  return { roles: byName, declared, opaque }
}

test('project roles override global roles with the same name', () => {
  const project = roster({
    roles: [role('reviewer', 'workspace', '/w/a', 'OLD')],
  })
  const global = roster({
    roles: [
      role('reviewer', 'global', '/h', 'WORLD'),
      role('global_only', 'global', '/h', 'GLOBAL'),
    ],
  })
  const merged = mergeRoster(project, global)
  assert.equal(merged.roles.get('reviewer').developerInstructions, 'OLD')
  assert.equal(merged.roles.get('global_only').developerInstructions, 'GLOBAL')
})

test('a declared project name that fails to load never falls back to the global role', () => {
  const project = roster({
    errors: [{ name: 'reviewer', file: '/w/a/reviewer.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('reviewer', 'global', '/h', 'WORLD')] })
  const merged = mergeRoster(project, global)
  assert.equal(merged.roles.has('reviewer'), false)
  assert.match(merged.errors.get('reviewer'), /\/w\/a\/reviewer\.toml: invalid TOML/)
  assert.equal(formatAvailable(merged), '(none)')
})

test('a duplicate name inside one directory is not selectable and does not fall back', () => {
  const project = roster({
    errors: [{ name: 'reviewer', file: '/w/a/one.toml, /w/a/two.toml', reason: 'duplicate role name' }],
  })
  const global = roster({ roles: [role('reviewer', 'global', '/h', 'WORLD')] })
  const merged = mergeRoster(project, global)
  assert.equal(merged.roles.has('reviewer'), false)
  assert.ok(merged.errors.has('reviewer'))
})

test('project files with an unknown name are exposed so callers refuse global fallback', () => {
  const project = roster({
    opaque: [{ file: '/w/a/broken.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('global_only', 'global', '/h', 'GLOBAL')] })
  const merged = mergeRoster(project, global)
  assert.deepEqual(merged.opaque, [{ file: '/w/a/broken.toml', reason: 'invalid TOML' }])
})

test('a broken global declaration reports its file instead of an unknown name', () => {
  const global = roster({
    errors: [{ name: 'reviewer', file: '/h/reviewer.toml', reason: 'registration failed' }],
  })
  const merged = mergeRoster(undefined, global)
  assert.equal(merged.roles.has('reviewer'), false)
  assert.match(merged.errors.get('reviewer'), /\/h\/reviewer\.toml: registration failed/)
})

test('a caller without a workspace sees only global roles', () => {
  const global = roster({ roles: [role('global_only', 'global', '/h', 'GLOBAL')] })
  const merged = mergeRoster(undefined, global)
  assert.deepEqual([...merged.roles.keys()], ['global_only'])
  assert.equal(formatAvailable(merged), 'global_only')
})

test('available names are sorted', () => {
  const merged = roster({
    roles: [
      role('zeta', 'global', '/h', 'Z'),
      role('alpha', 'global', '/h', 'A'),
    ],
  })
  assert.equal(formatAvailable(merged), 'alpha, zeta')
})

test('a global role is refused while a project file name is unknown', () => {
  const project = roster({
    opaque: [{ file: '/w/a/opaque.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('global_only', 'global', '/h', 'GLOBAL')] })
  const merged = mergeRoster(project, global)
  const resolution = resolveRole(merged, 'global_only')
  assert.equal(resolution.kind, 'project-error')
  assert.match(resolution.message, /opaque\.toml/)
})

test('a project role stays selectable while another project file name is unknown', () => {
  const project = roster({
    roles: [role('reviewer', 'workspace', '/w/a', 'OLD')],
    opaque: [{ file: '/w/a/opaque.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('reviewer', 'global', '/h', 'WORLD')] })
  const merged = mergeRoster(project, global)
  const resolution = resolveRole(merged, 'reviewer')
  assert.equal(resolution.kind, 'role')
  assert.equal(resolution.role.developerInstructions, 'OLD')
})

test('a declared project role error wins over a global role with the same name', () => {
  const project = roster({
    errors: [{ name: 'reviewer', file: '/w/a/reviewer.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('reviewer', 'global', '/h', 'WORLD')] })
  const merged = mergeRoster(project, global)
  const resolution = resolveRole(merged, 'reviewer')
  assert.equal(resolution.kind, 'project-error')
  assert.match(resolution.message, /reviewer\.toml: invalid TOML/)
})

test('an unknown name stays unknown when the project has no broken files', () => {
  const merged = mergeRoster(roster({ roles: [role('reviewer', 'workspace', '/w/a', 'OLD')] }), roster({}))
  assert.equal(resolveRole(merged, 'nobody').kind, 'unknown')
})

test('a broken project role with a known name does not block other global roles', () => {
  const project = roster({
    errors: [{ name: 'reviewer', file: '/w/a/reviewer.toml', reason: 'invalid TOML' }],
  })
  const global = roster({ roles: [role('global_only', 'global', '/h', 'GLOBAL')] })
  const merged = mergeRoster(project, global)
  const resolution = resolveRole(merged, 'global_only')
  assert.equal(resolution.kind, 'role')
  assert.equal(resolution.role.developerInstructions, 'GLOBAL')
})
