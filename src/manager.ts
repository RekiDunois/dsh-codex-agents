/**
 * Sole role-directory manager: background pre-registration, directory event
 * refreshes, per-call content verification, preset replacement, and teardown.
 * @module dsh-codex-agents/manager
 */

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context, Logger } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { parseAgentToml as parseToml } from './toml.js'
import { formatAvailable, mergeRoster } from './roster.js'
import type { RosterRole, RoleSource, SourceRoster } from './roster.js'
import { presetDefinition, presetIdFor, roleKey } from './preset.js'
import { RoleDirectoryWatcher } from './watch.js'
import { currentWorkspaceSources, globalRoleSource, resolveCallerWorkspace, sourceId } from './workspaces.js'

/** Interval used to hand control back to the host between registration batches. */
const YIELD_MS = 0

/** Debounce for workspace-registry changes. */
const WORKSPACE_DEBOUNCE_MS = 25

/** One role file parsed in the current directory pass. */
interface ParsedRole {
  readonly file: string
  readonly contentHash: string
  readonly definition: ReturnType<typeof parseToml>
}

/** One successfully registered role. */
interface RoleRecord extends RosterRole {
  readonly key: string
  readonly presetId: string
  readonly dispose: () => Promise<void>
}

/** Mutable state of one role directory. */
interface SourceState {
  source: RoleSource
  readonly records: Map<string, RoleRecord>
  conflicts: Map<string, readonly string[]>
  errors: Map<string, string>
  pending: boolean
  disposed: boolean
  tail: Promise<void>
}

/** A role record selected for one caller. */
export interface SelectedRole {
  readonly role: RoleRecord
}

/** Resolve one caller's role and run a short exclusive action with it. */
export type DelegationAction<T> = (role: SelectedRole) => Promise<T>

/**
 * Serial queue with a fixed concurrency of one. Registration mounts full
 * preset plugin trees, so unbounded parallel registration is avoided and each
 * task yields to the host event loop before the next starts.
 */
class SerialRegistrationQueue {
  private tail: Promise<void> = Promise.resolve()

  /**
   * @param task - Work that may mount one preset.
   * @returns The task's own result.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.then(
      async () => { await new Promise(resolve => setTimeout(resolve, YIELD_MS)) },
      async () => { await new Promise(resolve => setTimeout(resolve, YIELD_MS)) },
    )
    return result
  }

  /** Wait for everything currently queued. */
  idle(): Promise<void> {
    return this.tail
  }
}

/**
 * One manager per top-level plugin instance. It owns every read, watch,
 * registration, replacement, and disposal of role presets.
 */
export class RoleManager {
  private readonly log: Logger
  private readonly watcher: RoleDirectoryWatcher
  private readonly states = new Map<string, SourceState>()
  private readonly deadSources = new Set<string>()
  private readonly locks = new Map<string, Promise<void>>()
  private readonly registrations = new SerialRegistrationQueue()
  private readonly offDomain: () => boolean
  private closed = false
  private workspaceTimer: NodeJS.Timeout | undefined
  private syncTail: Promise<void> = Promise.resolve()
  private activeCalls = 0
  private readonly idleWaiters: Array<() => void> = []

  /**
   * @param ctx - Host context whose services own the registries.
   */
  constructor(private readonly ctx: Context) {
    this.log = ctx.logger('dsh-codex-agents')
    this.watcher = new RoleDirectoryWatcher(
      source => { this.queueSourceRefresh(source) },
      (source, error) => { this.log.warn(`watch ${source.dir}: ${error.message}`) },
    )
    this.offDomain = ctx.on('domain/changed', change => {
      if (change.domain === 'workspace') this.scheduleWorkspaceSync()
    })
  }

  /** Start the deferred initial scan. Must run after the plugin's apply returns. */
  start(): void {
    if (this.closed) return
    this.scheduleWorkspaceSync()
  }

  /** Stop accepting new delegations and stop all watchers/timers. */
  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.workspaceTimer !== undefined) {
      clearTimeout(this.workspaceTimer)
      this.workspaceTimer = undefined
    }
    this.offDomain()
    this.watcher.close()
  }

  /**
   * Stop background work, wait for in-flight delegations and registrations,
   * then dispose every preset this instance registered.
   */
  async shutdown(): Promise<void> {
    this.close()
    await this.whenIdle()
    await this.syncTail.catch(() => undefined)
    await Promise.allSettled([...this.states.values()].map(state => state.tail))
    await this.registrations.idle().catch(() => undefined)
    const states = [...this.states.values()]
    this.states.clear()
    for (const state of states) {
      state.disposed = true
      for (const name of [...state.records.keys()]) {
        const record = state.records.get(name)
        if (record === undefined) continue
        state.records.delete(name)
        await this.disposeRecord(record)
      }
    }
  }

  /**
   * Refresh the caller's role directories from actual file content, then run
   * `action` under the selected role's short lock so the preset cannot be
   * replaced between selection and activation acceptance.
   * @param agentType - Requested role name.
   * @param cwd - Caller session working directory.
   * @param action - Start-activation callback receiving the selected role.
   * @returns The action's result.
   */
  async delegate<T>(agentType: string, cwd: string, action: DelegationAction<T>): Promise<T> {
    if (this.closed) throw new Error('dsh-codex-agents is unloading; spawn_agent is unavailable')
    const release = this.beginCall()
    try {
      const caller = await resolveCallerWorkspace(this.ctx, cwd)
      const sources: RoleSource[] = caller.workspace === undefined
        ? [globalRoleSource()]
        : [caller.workspace, globalRoleSource()]
      this.watcher.sync([...currentWorkspaceSources(this.ctx), globalRoleSource()])
      for (const source of sources) this.deadSources.delete(sourceId(source))
      await Promise.all(sources.map(source => this.refreshSource(source)))

      const globalState = this.states.get(sourceId(globalRoleSource()))
      if (globalState === undefined) throw new Error('global agent role directory is unavailable')
      const projectState = caller.workspace === undefined
        ? undefined
        : this.states.get(sourceId(caller.workspace))
      const roster = mergeRoster(
        projectState === undefined ? undefined : this.snapshot(projectState),
        this.snapshot(globalState),
      )
      const role = roster.roles.get(agentType)
      if (role === undefined) {
        throw new Error(`Unknown agent_type "${agentType}". Available: ${formatAvailable(roster)}`)
      }
      const key = roleKey(role.source.scope, role.source.dir, role.name)
      return await this.withRoleLock(key, async () => {
        const state = this.states.get(sourceId(role.source))
        const current = state?.records.get(role.name)
        if (current === undefined || current.contentHash !== role.contentHash) {
          throw new Error(`agent_type "${agentType}" changed while starting the delegation; retry the call`)
        }
        return action({ role: current })
      })
    } finally {
      release()
    }
  }

  /** Schedule one debounced workspace-registry reconciliation. */
  private scheduleWorkspaceSync(): void {
    if (this.closed || this.workspaceTimer !== undefined) return
    this.workspaceTimer = setTimeout(() => {
      this.workspaceTimer = undefined
      void this.enqueueWorkspaceSync()
    }, WORKSPACE_DEBOUNCE_MS)
  }

  /** Queue one full workspace reconciliation behind previous ones. */
  private enqueueWorkspaceSync(): Promise<void> {
    this.syncTail = this.syncTail.then(
      async () => { await this.syncWorkspaces() },
      async () => { await this.syncWorkspaces() },
    )
    return this.syncTail
  }

  /** Reconcile watches and role presets with the current workspace registry. */
  private async syncWorkspaces(): Promise<void> {
    if (this.closed) return
    const sources: RoleSource[] = [...currentWorkspaceSources(this.ctx), globalRoleSource()]
    this.watcher.sync(sources)
    const wanted = new Set(sources.map(sourceId))
    for (const [id, state] of [...this.states]) {
      if (wanted.has(id)) continue
      await this.removeState(state)
    }
    for (const source of sources) {
      if (this.closed) return
      this.deadSources.delete(sourceId(source))
      await this.refreshSource(source)
    }
  }

  /** Queue a refresh for one source and let it coalesce with pending ones. */
  private queueSourceRefresh(source: RoleSource): void {
    if (this.closed || this.deadSources.has(sourceId(source))) return
    const state = this.stateFor(source)
    state.pending = true
    state.tail = state.tail.then(
      async () => { await this.drain(state) },
      async () => { await this.drain(state) },
    )
  }

  /** Run one refresh of the current directory and the manager's own bookkeeping. */
  private async drain(state: SourceState): Promise<void> {
    while (state.pending && !state.disposed) {
      state.pending = false
      try {
        await this.refreshSourceNow(state)
      } catch (error) {
        this.log.warn(`refresh ${state.source.dir}: ${(error as Error).message}`)
      }
    }
  }

  /** Refresh one source and await the queued work, including any coalesced pass. */
  private refreshSource(source: RoleSource): Promise<void> {
    if (this.deadSources.has(sourceId(source))) return Promise.resolve()
    const state = this.stateFor(source)
    state.pending = true
    state.tail = state.tail.then(
      async () => { await this.drain(state) },
      async () => { await this.drain(state) },
    )
    return state.tail
  }

  /** Read the directory, parse role files, and reconcile records. */
  private async refreshSourceNow(state: SourceState): Promise<void> {
    if (state.disposed) return
    let fileNames: string[]
    try {
      fileNames = (await readdir(state.source.dir))
        .filter(name => name.endsWith('.toml') && !name.startsWith('.'))
        .sort()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        fileNames = []
      } else {
        // An unreadable directory is not evidence that its old roles are still current.
        for (const name of [...state.records.keys()]) {
          const record = state.records.get(name)
          if (record !== undefined) await this.removeRecord(state, record)
        }
        throw error
      }
    }

    const declared = new Map<string, ParsedRole[]>()
    const errors = new Map<string, string>()
    for (const fileName of fileNames) {
      const file = join(state.source.dir, fileName)
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        errors.set(file, (error as Error).message)
        continue
      }
      try {
        const definition = parseToml(text, file)
        const list = declared.get(definition.name) ?? []
        list.push({ file, contentHash: hashText(text), definition })
        declared.set(definition.name, list)
      } catch (error) {
        errors.set(file, (error as Error).message)
      }
    }

    const parsed = new Map<string, ParsedRole>()
    const conflicts = new Map<string, readonly string[]>()
    for (const [name, list] of declared) {
      if (list.length > 1) {
        conflicts.set(name, list.map(entry => entry.file))
        for (const entry of list) this.log.warn(`${entry.file}: duplicate role name "${name}" in one directory; role hidden`)
      } else if (list[0] !== undefined) {
        parsed.set(name, list[0])
      }
    }

    for (const [name, record] of [...state.records]) {
      if (!parsed.has(name)) await this.removeRecord(state, record)
    }
    for (const [name, next] of parsed) {
      const record = state.records.get(name)
      if (record !== undefined && record.contentHash === next.contentHash) continue
      if (record === undefined) await this.installRecord(state, next)
      else await this.replaceRecord(state, record, next)
    }
    state.conflicts = conflicts
    state.errors = errors
  }

  /** Register a role file that currently has no record. */
  private async installRecord(state: SourceState, next: ParsedRole): Promise<void> {
    const name = next.definition.name
    const key = roleKey(state.source.scope, state.source.dir, name)
    await this.withRoleLock(key, async () => {
      if (state.disposed || state.records.has(name)) return
      const record = await this.createRecord(state, next)
      if (record !== undefined) state.records.set(name, record)
    })
  }

  /** Replace a changed role file while keeping its preset id. */
  private async replaceRecord(state: SourceState, previous: RoleRecord, next: ParsedRole): Promise<void> {
    await this.withRoleLock(previous.key, async () => {
      if (state.disposed || state.records.get(previous.name) !== previous) return
      state.records.delete(previous.name)
      await this.disposeRecord(previous)
      const record = await this.createRecord(state, next)
      if (record !== undefined) state.records.set(previous.name, record)
    })
  }

  /** Remove a role whose file disappeared, became invalid, or entered a conflict. */
  private async removeRecord(state: SourceState, record: RoleRecord): Promise<void> {
    await this.withRoleLock(record.key, async () => {
      if (state.records.get(record.name) !== record) return
      state.records.delete(record.name)
      await this.disposeRecord(record)
    })
  }

  /** Drop one source's records after its workspace registration disappears. */
  private async removeState(state: SourceState): Promise<void> {
    const id = sourceId(state.source)
    state.disposed = true
    state.pending = false
    this.deadSources.add(id)
    this.states.delete(id)
    await state.tail.catch(() => undefined)
    for (const name of [...state.records.keys()]) {
      const record = state.records.get(name)
      if (record === undefined) continue
      state.records.delete(name)
      await this.disposeRecord(record)
    }
  }

  /** Mount one preset and verify the host can resolve it. */
  private async createRecord(state: SourceState, next: ParsedRole): Promise<RoleRecord | undefined> {
    const definition = next.definition
    const role: RosterRole = {
      name: definition.name,
      file: next.file,
      source: state.source,
      contentHash: next.contentHash,
      description: definition.description,
      developerInstructions: definition.developerInstructions,
    }
    const presetId = presetIdFor(role.source.scope, role.source.dir, role.name)
    let dispose: (() => Promise<void>) | undefined
    try {
      dispose = await this.registrations.run(() => this.ctx.agentPresets.register(presetDefinition(role)))
      const resolved = await this.ctx.agentPresets.resolve(presetId)
      if (resolved.broken !== undefined) {
        await dispose()
        this.log.warn(`preset ${presetId} is unusable: ${resolved.broken}`)
        return undefined
      }
    } catch (error) {
      if (dispose !== undefined) await dispose()
      const message = (error as Error).message
      state.errors.set(next.file, message)
      this.log.warn(`register ${next.file}: ${message}`)
      return undefined
    }
    return {
      ...role,
      key: roleKey(role.source.scope, role.source.dir, role.name),
      presetId,
      dispose,
    }
  }

  /** Dispose one record, reporting but not propagating teardown failures. */
  private async disposeRecord(record: RoleRecord): Promise<void> {
    try {
      await record.dispose()
    } catch (error) {
      this.log.warn(`dispose preset ${record.presetId}: ${(error as Error).message}`)
    }
  }

  /** Snapshot one source's usable roles for merging. */
  private snapshot(state: SourceState): SourceRoster {
    return {
      roles: new Map(state.records),
      conflicts: state.conflicts,
    }
  }

  /** Get or create the state for a source. */
  private stateFor(source: RoleSource): SourceState {
    const id = sourceId(source)
    let state = this.states.get(id)
    if (state === undefined) {
      state = {
        source,
        records: new Map(),
        conflicts: new Map(),
        errors: new Map(),
        pending: false,
        disposed: false,
        tail: Promise.resolve(),
      }
      this.states.set(id, state)
    } else {
      state.source = source
    }
    return state
  }

  /** Serialize work for one role identity without blocking other roles. */
  private async withRoleLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    this.locks.set(key, previous.then(() => gate))
    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /** Mark one delegation in flight; the returned callback marks it settled. */
  private beginCall(): () => void {
    this.activeCalls++
    let done = false
    return () => {
      if (done) return
      done = true
      this.activeCalls--
      if (this.activeCalls === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve()
      }
    }
  }

  /** Wait until no delegation is inside its setup or activation handoff. */
  private whenIdle(): Promise<void> {
    if (this.activeCalls === 0) return Promise.resolve()
    return new Promise(resolve => { this.idleWaiters.push(resolve) })
  }
}

/** Create a manager for one top-level plugin instance. */
export function createManager(ctx: Context): RoleManager {
  return new RoleManager(ctx)
}

/** SHA-256 of role file text. */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
