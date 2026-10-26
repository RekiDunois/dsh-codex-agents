import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoleDirectoryWatcher } from '../lib/watch.js'

const waitFor = async (predicate, timeoutMs = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

const sourceOf = root => ({
  scope: 'workspace',
  dir: join(root, '.codex', 'agents'),
  root,
  workspacePath: root,
})

const touch = (root, marker) => {
  writeFileSync(join(root, '.codex', 'agents', 'reviewer.toml'), `name = "reviewer"\n# ${marker}\n`)
}

test('a role directory created after sync is watched', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshca-watch-'))
  let events = 0
  const watcher = new RoleDirectoryWatcher(() => { events++ }, () => {})
  try {
    watcher.sync([sourceOf(root)])
    mkdirSync(join(root, '.codex', 'agents'), { recursive: true })
    touch(root, 'created')
    assert.ok(await waitFor(() => events >= 1), 'creation under the new directory was observed')
  } finally {
    watcher.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a recreated .codex/agents directory is watched again through its parent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshca-watch-'))
  mkdirSync(join(root, '.codex', 'agents'), { recursive: true })
  touch(root, 'first')
  let events = 0
  const watcher = new RoleDirectoryWatcher(() => { events++ }, () => {})
  try {
    watcher.sync([sourceOf(root)])
    assert.ok(await waitFor(() => events >= 1), 'initial change was observed')
    const before = events

    rmSync(join(root, '.codex'), { recursive: true, force: true })
    assert.ok(await waitFor(() => events > before), 'removal was observed')

    mkdirSync(join(root, '.codex', 'agents'), { recursive: true })
    const afterRemoval = events
    touch(root, 'second')
    assert.ok(await waitFor(() => events > afterRemoval), 'change after recreation was observed')
  } finally {
    watcher.close()
    rmSync(root, { recursive: true, force: true })
  }
})
