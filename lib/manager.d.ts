/**
 * Sole role-directory manager: background pre-registration, directory event
 * refreshes, per-call content verification, preset replacement, and teardown.
 * @module dsh-codex-agents/manager
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RosterRole } from './roster.js';
/** One successfully registered role. */
interface RoleRecord extends RosterRole {
    readonly key: string;
    readonly presetId: string;
    readonly dispose: () => Promise<void>;
}
/** A role record selected for one caller. */
export interface SelectedRole {
    readonly role: RoleRecord;
}
/** Resolve one caller's role and run a short exclusive action with it. */
export type DelegationAction<T> = (role: SelectedRole) => Promise<T>;
/**
 * One manager per top-level plugin instance. It owns every read, watch,
 * registration, replacement, and disposal of role presets.
 */
export declare class RoleManager {
    private readonly ctx;
    private readonly log;
    private readonly watcher;
    private readonly states;
    private readonly deadSources;
    private readonly locks;
    private readonly registrations;
    private readonly offDomain;
    private closed;
    private workspaceTimer;
    private syncTail;
    private activeCalls;
    private readonly idleWaiters;
    /**
     * @param ctx - Host context whose services own the registries.
     */
    constructor(ctx: Context);
    /** Start the deferred initial scan. Must run after the plugin's apply returns. */
    start(): void;
    /** Stop accepting new delegations and stop all watchers/timers. */
    close(): void;
    /**
     * Stop background work, wait for in-flight delegations and registrations,
     * then dispose every preset this instance registered.
     */
    shutdown(): Promise<void>;
    /**
     * Refresh the caller's role directories from actual file content, then run
     * `action` under the selected role's short lock so the preset cannot be
     * replaced between selection and activation acceptance.
     * @param agentType - Requested role name.
     * @param cwd - Caller session working directory.
     * @param action - Start-activation callback receiving the selected role.
     * @returns The action's result.
     */
    delegate<T>(agentType: string, cwd: string, action: DelegationAction<T>): Promise<T>;
    /** Schedule one debounced workspace-registry reconciliation. */
    private scheduleWorkspaceSync;
    /** Queue one full workspace reconciliation behind previous ones. */
    private enqueueWorkspaceSync;
    /** Reconcile watches and role presets with the current workspace registry. */
    private syncWorkspaces;
    /** Queue a refresh for one source and let it coalesce with pending ones. */
    private queueSourceRefresh;
    /** Run one refresh of the current directory and the manager's own bookkeeping. */
    private drain;
    /** Refresh one source and await the queued work, including any coalesced pass. */
    private refreshSource;
    /** Read the directory, parse role files, and reconcile records. */
    private refreshSourceNow;
    /** Record one file that could not be read or parsed, keeping its trusted name owned. */
    private noteBrokenFile;
    /** Register a role file that currently has no record. */
    private installRecord;
    /** Replace a changed role file while keeping its preset id. */
    private replaceRecord;
    /** Remove a role whose file disappeared, became invalid, or entered a conflict. */
    private removeRecord;
    /** Drop one source's records after its workspace registration disappears. */
    private removeState;
    /** Mount one preset and verify the host can resolve it. */
    private createRecord;
    /** Dispose one record, reporting but not propagating teardown failures. */
    private disposeRecord;
    /** Snapshot one source's usable roles and declared names for merging. */
    private snapshot;
    /** Get or create the state for a source. */
    private stateFor;
    /** Serialize work for one role identity without blocking other roles. */
    private withRoleLock;
    /** Mark one delegation in flight; the returned callback marks it settled. */
    private beginCall;
    /** Wait until no delegation is inside its setup or activation handoff. */
    private whenIdle;
}
/** Create a manager for one top-level plugin instance. */
export declare function createManager(ctx: Context): RoleManager;
export {};
