/**
 * Sole role-directory manager: background pre-registration, directory event
 * refreshes, per-call content verification, preset replacement, and teardown.
 * @module dsh-codex-agents/manager
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAgentToml as parseToml } from './toml.js';
import { formatAvailable, mergeRoster, resolveRole } from './roster.js';
import { presetDefinition, presetIdFor, roleKey } from './preset.js';
import { RoleDirectoryWatcher } from './watch.js';
import { currentWorkspaceSources, globalRoleSource, resolveCallerWorkspace, sourceId } from './workspaces.js';
/** Interval used to hand control back to the host between registration batches. */
const YIELD_MS = 0;
/** Debounce for workspace-registry changes. */
const WORKSPACE_DEBOUNCE_MS = 25;
/**
 * Serial queue with a fixed concurrency of one. Registration mounts full
 * preset plugin trees, so unbounded parallel registration is avoided and each
 * task yields to the host event loop before the next starts.
 */
class SerialRegistrationQueue {
    tail = Promise.resolve();
    /**
     * @param task - Work that may mount one preset.
     * @returns The task's own result.
     */
    run(task) {
        const result = this.tail.then(task, task);
        this.tail = result.then(async () => { await new Promise(resolve => setTimeout(resolve, YIELD_MS)); }, async () => { await new Promise(resolve => setTimeout(resolve, YIELD_MS)); });
        return result;
    }
    /** Wait for everything currently queued. */
    idle() {
        return this.tail;
    }
}
/**
 * One manager per top-level plugin instance. It owns every read, watch,
 * registration, replacement, and disposal of role presets.
 */
export class RoleManager {
    ctx;
    log;
    watcher;
    states = new Map();
    deadSources = new Set();
    locks = new Map();
    registrations = new SerialRegistrationQueue();
    offDomain;
    closed = false;
    workspaceTimer;
    syncTail = Promise.resolve();
    activeCalls = 0;
    idleWaiters = [];
    /**
     * @param ctx - Host context whose services own the registries.
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.log = ctx.logger('dsh-codex-agents');
        this.watcher = new RoleDirectoryWatcher(source => { this.queueSourceRefresh(source); }, (source, error) => { this.log.warn(`watch ${source.dir}: ${error.message}`); });
        this.offDomain = ctx.on('domain/changed', change => {
            if (change.domain === 'workspace')
                this.scheduleWorkspaceSync();
        });
    }
    /** Start the deferred initial scan. Must run after the plugin's apply returns. */
    start() {
        if (this.closed)
            return;
        this.scheduleWorkspaceSync();
    }
    /** Stop accepting new delegations and stop all watchers/timers. */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.workspaceTimer !== undefined) {
            clearTimeout(this.workspaceTimer);
            this.workspaceTimer = undefined;
        }
        this.offDomain();
        this.watcher.close();
    }
    /**
     * Stop background work, wait for in-flight delegations and registrations,
     * then dispose every preset this instance registered.
     */
    async shutdown() {
        this.close();
        await this.whenIdle();
        await this.syncTail.catch(() => undefined);
        await Promise.allSettled([...this.states.values()].map(state => state.tail));
        await this.registrations.idle().catch(() => undefined);
        const states = [...this.states.values()];
        this.states.clear();
        for (const state of states) {
            state.disposed = true;
            for (const name of [...state.records.keys()]) {
                const record = state.records.get(name);
                if (record === undefined)
                    continue;
                state.records.delete(name);
                await this.disposeRecord(record);
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
    async delegate(agentType, cwd, action) {
        if (this.closed)
            throw new Error('dsh-codex-agents is unloading; spawn_agent is unavailable');
        const release = this.beginCall();
        try {
            const caller = await resolveCallerWorkspace(this.ctx, cwd);
            const sources = caller.workspace === undefined
                ? [globalRoleSource()]
                : [caller.workspace, globalRoleSource()];
            this.watcher.sync([...currentWorkspaceSources(this.ctx), globalRoleSource()]);
            for (const source of sources)
                this.deadSources.delete(sourceId(source));
            await Promise.all(sources.map(source => this.refreshSource(source)));
            const globalState = this.states.get(sourceId(globalRoleSource()));
            if (globalState === undefined)
                throw new Error('global agent role directory is unavailable');
            const projectState = caller.workspace === undefined
                ? undefined
                : this.states.get(sourceId(caller.workspace));
            const roster = mergeRoster(projectState === undefined ? undefined : this.snapshot(projectState), this.snapshot(globalState));
            const resolution = resolveRole(roster, agentType);
            if (resolution.kind === 'project-error')
                throw new Error(resolution.message);
            if (resolution.kind === 'unknown') {
                throw new Error(`Unknown agent_type "${agentType}". Available: ${formatAvailable(roster)}`);
            }
            const role = resolution.role;
            const key = roleKey(role.source.scope, role.source.dir, role.name);
            return await this.withRoleLock(key, async () => {
                const state = this.states.get(sourceId(role.source));
                const current = state?.records.get(role.name);
                if (current === undefined || current.contentHash !== role.contentHash) {
                    throw new Error(`agent_type "${agentType}" changed while starting the delegation; retry the call`);
                }
                return action({ role: current });
            });
        }
        finally {
            release();
        }
    }
    /** Schedule one debounced workspace-registry reconciliation. */
    scheduleWorkspaceSync() {
        if (this.closed || this.workspaceTimer !== undefined)
            return;
        this.workspaceTimer = setTimeout(() => {
            this.workspaceTimer = undefined;
            void this.enqueueWorkspaceSync();
        }, WORKSPACE_DEBOUNCE_MS);
    }
    /** Queue one full workspace reconciliation behind previous ones. */
    enqueueWorkspaceSync() {
        this.syncTail = this.syncTail.then(async () => { await this.syncWorkspaces(); }, async () => { await this.syncWorkspaces(); });
        return this.syncTail;
    }
    /** Reconcile watches and role presets with the current workspace registry. */
    async syncWorkspaces() {
        if (this.closed)
            return;
        const sources = [...currentWorkspaceSources(this.ctx), globalRoleSource()];
        this.watcher.sync(sources);
        const wanted = new Set(sources.map(sourceId));
        for (const [id, state] of [...this.states]) {
            if (wanted.has(id))
                continue;
            await this.removeState(state);
        }
        for (const source of sources) {
            if (this.closed)
                return;
            this.deadSources.delete(sourceId(source));
            await this.refreshSource(source);
        }
    }
    /** Queue a refresh for one source and let it coalesce with pending ones. */
    queueSourceRefresh(source) {
        if (this.closed || this.deadSources.has(sourceId(source)))
            return;
        const state = this.stateFor(source);
        state.pending = true;
        state.tail = state.tail.then(async () => { await this.drain(state); }, async () => { await this.drain(state); });
    }
    /** Run one refresh of the current directory and the manager's own bookkeeping. */
    async drain(state) {
        while (state.pending && !state.disposed) {
            state.pending = false;
            try {
                await this.refreshSourceNow(state);
            }
            catch (error) {
                this.log.warn(`refresh ${state.source.dir}: ${error.message}`);
            }
        }
    }
    /** Refresh one source and await the queued work, including any coalesced pass. */
    refreshSource(source) {
        if (this.deadSources.has(sourceId(source)))
            return Promise.resolve();
        const state = this.stateFor(source);
        state.pending = true;
        state.tail = state.tail.then(async () => { await this.drain(state); }, async () => { await this.drain(state); });
        return state.tail;
    }
    /** Read the directory, parse role files, and reconcile records. */
    async refreshSourceNow(state) {
        if (state.disposed)
            return;
        let fileNames;
        try {
            fileNames = (await readdir(state.source.dir))
                .filter(name => name.endsWith('.toml') && !name.startsWith('.'))
                .sort();
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT' && code !== 'ENOTDIR') {
                // An unreadable directory is not evidence that its old roles are still current.
                for (const name of [...state.records.keys()]) {
                    const record = state.records.get(name);
                    if (record !== undefined)
                        await this.removeRecord(state, record);
                }
                state.declared = new Map();
                state.opaque = new Map();
                state.trustedNames.clear();
                throw error;
            }
            fileNames = [];
        }
        state.errors.clear();
        const parsed = new Map();
        const brokenByName = new Map();
        const opaque = new Map();
        const present = new Set();
        for (const fileName of fileNames) {
            const file = join(state.source.dir, fileName);
            present.add(file);
            let text;
            try {
                text = await readFile(file, 'utf8');
            }
            catch (error) {
                this.noteBrokenFile(state, file, error.message, brokenByName, opaque);
                continue;
            }
            try {
                const definition = parseToml(text, file);
                state.trustedNames.set(file, definition.name);
                const list = parsed.get(definition.name) ?? [];
                list.push({ file, contentHash: hashText(text), definition });
                parsed.set(definition.name, list);
            }
            catch (error) {
                this.noteBrokenFile(state, file, error.message, brokenByName, opaque);
            }
        }
        for (const file of [...state.trustedNames.keys()]) {
            if (!present.has(file))
                state.trustedNames.delete(file);
        }
        const candidates = new Map();
        const declared = new Map();
        for (const name of new Set([...parsed.keys(), ...brokenByName.keys()])) {
            const valid = parsed.get(name) ?? [];
            const broken = brokenByName.get(name) ?? [];
            const files = [...valid.map(entry => entry.file), ...broken];
            if (valid.length === 1 && broken.length === 0) {
                candidates.set(name, valid[0]);
                declared.set(name, { files });
                continue;
            }
            let reason;
            if (valid.length > 1) {
                reason = `duplicate role name "${name}" in one directory; role hidden`;
                for (const entry of valid)
                    this.log.warn(`${entry.file}: ${reason}`);
            }
            else if (valid.length === 1) {
                reason = `role name "${name}" is declared by ${files.join(', ')}; one file could not be read`;
            }
            else if (broken[0] !== undefined) {
                reason = `${broken[0]}: ${state.errors.get(broken[0]) ?? 'role could not be read'}`;
            }
            else {
                reason = `role name "${name}" is not available`;
            }
            declared.set(name, { files, error: reason });
        }
        for (const [name, record] of [...state.records]) {
            if (!candidates.has(name))
                await this.removeRecord(state, record);
        }
        for (const [name, next] of candidates) {
            const record = state.records.get(name);
            if (record !== undefined && record.contentHash === next.contentHash)
                continue;
            if (record === undefined)
                await this.installRecord(state, next);
            else
                await this.replaceRecord(state, record, next);
        }
        // A declared name whose preset could not be mounted stays owned by this
        // directory, so callers see the project file error instead of a global role.
        for (const [name, next] of candidates) {
            if (state.records.has(name))
                continue;
            const entry = declared.get(name) ?? { files: [next.file] };
            const reason = state.errors.get(next.file) ?? 'role preset is not available';
            declared.set(name, { files: entry.files, error: entry.error ?? `${next.file}: ${reason}` });
        }
        state.declared = declared;
        state.opaque = opaque;
    }
    /** Record one file that could not be read or parsed, keeping its trusted name owned. */
    noteBrokenFile(state, file, reason, brokenByName, opaque) {
        state.errors.set(file, reason);
        const trusted = state.trustedNames.get(file);
        if (trusted === undefined) {
            opaque.set(file, { file, reason });
            return;
        }
        const list = brokenByName.get(trusted) ?? [];
        list.push(file);
        brokenByName.set(trusted, list);
    }
    /** Register a role file that currently has no record. */
    async installRecord(state, next) {
        const name = next.definition.name;
        const key = roleKey(state.source.scope, state.source.dir, name);
        await this.withRoleLock(key, async () => {
            if (state.disposed || state.records.has(name))
                return;
            const record = await this.createRecord(state, next);
            if (record !== undefined)
                state.records.set(name, record);
        });
    }
    /** Replace a changed role file while keeping its preset id. */
    async replaceRecord(state, previous, next) {
        await this.withRoleLock(previous.key, async () => {
            if (state.disposed || state.records.get(previous.name) !== previous)
                return;
            state.records.delete(previous.name);
            await this.disposeRecord(previous);
            const record = await this.createRecord(state, next);
            if (record !== undefined)
                state.records.set(previous.name, record);
        });
    }
    /** Remove a role whose file disappeared, became invalid, or entered a conflict. */
    async removeRecord(state, record) {
        await this.withRoleLock(record.key, async () => {
            if (state.records.get(record.name) !== record)
                return;
            state.records.delete(record.name);
            await this.disposeRecord(record);
        });
    }
    /** Drop one source's records after its workspace registration disappears. */
    async removeState(state) {
        const id = sourceId(state.source);
        state.disposed = true;
        state.pending = false;
        this.deadSources.add(id);
        this.states.delete(id);
        await state.tail.catch(() => undefined);
        for (const name of [...state.records.keys()]) {
            const record = state.records.get(name);
            if (record === undefined)
                continue;
            state.records.delete(name);
            await this.disposeRecord(record);
        }
    }
    /** Mount one preset and verify the host can resolve it. */
    async createRecord(state, next) {
        const definition = next.definition;
        const role = {
            name: definition.name,
            file: next.file,
            source: state.source,
            contentHash: next.contentHash,
            description: definition.description,
            developerInstructions: definition.developerInstructions,
        };
        const presetId = presetIdFor(role.source.scope, role.source.dir, role.name);
        let dispose;
        try {
            dispose = await this.registrations.run(() => this.ctx.agentPresets.register(presetDefinition(role)));
            const resolved = await this.ctx.agentPresets.resolve(presetId);
            if (resolved.broken !== undefined) {
                await dispose();
                const message = `preset ${presetId} is unusable: ${resolved.broken}`;
                state.errors.set(next.file, message);
                this.log.warn(message);
                return undefined;
            }
        }
        catch (error) {
            if (dispose !== undefined)
                await dispose();
            const message = error.message;
            state.errors.set(next.file, message);
            this.log.warn(`register ${next.file}: ${message}`);
            return undefined;
        }
        return {
            ...role,
            key: roleKey(role.source.scope, role.source.dir, role.name),
            presetId,
            dispose,
        };
    }
    /** Dispose one record, reporting but not propagating teardown failures. */
    async disposeRecord(record) {
        try {
            await record.dispose();
        }
        catch (error) {
            this.log.warn(`dispose preset ${record.presetId}: ${error.message}`);
        }
    }
    /** Snapshot one source's usable roles and declared names for merging. */
    snapshot(state) {
        return {
            roles: new Map(state.records),
            declared: new Map(state.declared),
            opaque: [...state.opaque.values()],
        };
    }
    /** Get or create the state for a source. */
    stateFor(source) {
        const id = sourceId(source);
        let state = this.states.get(id);
        if (state === undefined) {
            state = {
                source,
                records: new Map(),
                declared: new Map(),
                opaque: new Map(),
                trustedNames: new Map(),
                errors: new Map(),
                pending: false,
                disposed: false,
                tail: Promise.resolve(),
            };
            this.states.set(id, state);
        }
        else {
            state.source = source;
        }
        return state;
    }
    /** Serialize work for one role identity without blocking other roles. */
    async withRoleLock(key, fn) {
        const previous = this.locks.get(key) ?? Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        this.locks.set(key, previous.then(() => gate));
        await previous;
        try {
            return await fn();
        }
        finally {
            release();
        }
    }
    /** Mark one delegation in flight; the returned callback marks it settled. */
    beginCall() {
        this.activeCalls++;
        let done = false;
        return () => {
            if (done)
                return;
            done = true;
            this.activeCalls--;
            if (this.activeCalls === 0) {
                for (const resolve of this.idleWaiters.splice(0))
                    resolve();
            }
        };
    }
    /** Wait until no delegation is inside its setup or activation handoff. */
    whenIdle() {
        if (this.activeCalls === 0)
            return Promise.resolve();
        return new Promise(resolve => { this.idleWaiters.push(resolve); });
    }
}
/** Create a manager for one top-level plugin instance. */
export function createManager(ctx) {
    return new RoleManager(ctx);
}
/** SHA-256 of role file text. */
function hashText(text) {
    return createHash('sha256').update(text).digest('hex');
}
