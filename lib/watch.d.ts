/**
 * Directory watches for role sources, with rebinding when `.codex/agents`
 * appears, disappears, or is atomically replaced.
 * @module dsh-codex-agents/watch
 */
import type { RoleSource } from './roster.js';
/**
 * Watches each role directory as a whole. A missing target is tracked through
 * its nearest existing ancestor until the target exists, then the watch moves
 * down; a vanished target is traced back up the same way. Events only mark a
 * directory dirty — content comparison still happens in the manager.
 */
export declare class RoleDirectoryWatcher {
    private readonly onChange;
    private readonly onError;
    private readonly entries;
    private closed;
    /**
     * @param onChange - Called after events settle for one source.
     * @param onError - Receives watch failures; scanning remains available.
     */
    constructor(onChange: (source: RoleSource) => void, onError: (source: RoleSource, error: Error) => void);
    /**
     * Reconcile the watched set with the current sources.
     * @param sources - Currently registered workspace and global role sources.
     */
    sync(sources: readonly RoleSource[]): void;
    /** Stop every watch and pending debounce. */
    close(): void;
    /** Ensure the entry watches its target directory, or its nearest existing ancestor. */
    private ensure;
    /** Nearest existing directory from the target up to the source's boundary. */
    private nearestExisting;
    /** Debounce one refresh and rebind after the directory layout may have changed. */
    private schedule;
    /** Close only the current watcher, retaining the entry for rebinding. */
    private stopWatcher;
    /** Close the watcher, pending debounce, and entry. */
    private disposeEntry;
}
