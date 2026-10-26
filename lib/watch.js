/**
 * Directory watches for role sources, with rebinding when `.codex/agents`
 * appears, disappears, or is atomically replaced.
 * @module dsh-codex-agents/watch
 */
import { statSync, watch } from 'node:fs';
import { dirname } from 'node:path';
import { isWithin, sameSource, sourceId } from './workspaces.js';
/** Coalesce bursts of filesystem events before asking for a refresh. */
const EVENT_DEBOUNCE_MS = 100;
/**
 * Watches each role directory as a whole. A missing target is tracked through
 * its nearest existing ancestor until the target exists, then the watch moves
 * down; a vanished target is traced back up the same way. Events only mark a
 * directory dirty — content comparison still happens in the manager.
 */
export class RoleDirectoryWatcher {
    onChange;
    onError;
    entries = new Map();
    closed = false;
    /**
     * @param onChange - Called after events settle for one source.
     * @param onError - Receives watch failures; scanning remains available.
     */
    constructor(onChange, onError) {
        this.onChange = onChange;
        this.onError = onError;
    }
    /**
     * Reconcile the watched set with the current sources.
     * @param sources - Currently registered workspace and global role sources.
     */
    sync(sources) {
        if (this.closed)
            return;
        const wanted = new Set(sources.map(sourceId));
        for (const [id, entry] of this.entries) {
            if (wanted.has(id))
                continue;
            this.disposeEntry(entry);
            this.entries.delete(id);
        }
        for (const source of sources) {
            const id = sourceId(source);
            let entry = this.entries.get(id);
            if (entry === undefined) {
                entry = { source, disposed: false };
                this.entries.set(id, entry);
            }
            else if (!sameSource(entry.source, source)) {
                entry.source = source;
            }
            this.ensure(entry);
        }
    }
    /** Stop every watch and pending debounce. */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const entry of this.entries.values())
            this.disposeEntry(entry);
        this.entries.clear();
    }
    /** Ensure the entry watches its target directory, or its nearest existing ancestor. */
    ensure(entry) {
        if (this.closed || entry.disposed)
            return;
        const desired = this.nearestExisting(entry.source);
        if (desired === undefined) {
            this.stopWatcher(entry);
            return;
        }
        if (entry.watcher !== undefined && entry.watchedPath === desired)
            return;
        this.stopWatcher(entry);
        try {
            const watcher = watch(desired, { persistent: false }, () => this.schedule(entry));
            watcher.on('error', (error) => {
                this.stopWatcher(entry);
                this.onError(entry.source, error);
                this.schedule(entry);
            });
            watcher.unref();
            entry.watcher = watcher;
            entry.watchedPath = desired;
        }
        catch (error) {
            this.onError(entry.source, error);
        }
    }
    /** Nearest existing directory from the target up to the source's boundary. */
    nearestExisting(source) {
        let current = source.dir;
        while (true) {
            try {
                if (statSync(current).isDirectory())
                    return current;
            }
            catch {
                // Missing or unreadable path: climb to the nearest ancestor.
            }
            if (current === source.root)
                return undefined;
            const parent = dirname(current);
            if (parent === current || !isWithin(source.root, parent))
                return undefined;
            current = parent;
        }
    }
    /** Debounce one refresh and rebind after the directory layout may have changed. */
    schedule(entry) {
        if (this.closed || entry.disposed || entry.timer !== undefined)
            return;
        entry.timer = setTimeout(() => {
            entry.timer = undefined;
            if (this.closed || entry.disposed)
                return;
            this.onChange(entry.source);
            this.ensure(entry);
        }, EVENT_DEBOUNCE_MS);
    }
    /** Close only the current watcher, retaining the entry for rebinding. */
    stopWatcher(entry) {
        const watcher = entry.watcher;
        entry.watcher = undefined;
        entry.watchedPath = undefined;
        if (watcher === undefined)
            return;
        watcher.removeAllListeners();
        try {
            watcher.close();
        }
        catch {
            // Already closed by the platform.
        }
    }
    /** Close the watcher, pending debounce, and entry. */
    disposeEntry(entry) {
        entry.disposed = true;
        if (entry.timer !== undefined) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        this.stopWatcher(entry);
    }
}
