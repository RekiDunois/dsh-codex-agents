/**
 * Directory watches for role sources. Every existing level of the role path is
 * watched at once (workspace root or user home, `.codex`, `agents`), so a
 * deleted and recreated subdirectory is noticed through its parent instead of
 * relying on one binding that may still point at the old directory node.
 * @module dsh-codex-agents/watch
 */
import { statSync, watch } from 'node:fs';
import { dirname } from 'node:path';
import { sameSource, sourceId } from './workspaces.js';
/** Coalesce bursts of filesystem events before asking for a refresh. */
const EVENT_DEBOUNCE_MS = 100;
/**
 * Watches the whole directory chain of each role source.
 *
 * The chain is `<root>`, `<root>/.codex`, `<root>/.codex/agents`, where `root`
 * is the registered workspace or the user home. Parent levels stay watched
 * while children exist, so removing or recreating `.codex/agents` is observed
 * by the parent and the child binding is rebuilt. A binding is considered
 * current only when the directory identity (device and inode) still matches;
 * path equality alone would accept a stale watcher after a replacement.
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
                entry = { source, levels: new Map(), disposed: false };
                this.entries.set(id, entry);
            }
            else if (!sameSource(entry.source, source)) {
                entry.source = source;
            }
            this.rebind(entry);
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
    /** Watch every existing level of one source, rebinding replaced directories. */
    rebind(entry) {
        if (this.closed || entry.disposed)
            return;
        const wanted = new Set(levelsOf(entry.source));
        for (const path of [...entry.levels.keys()]) {
            if (!wanted.has(path))
                this.closeLevel(entry, path);
        }
        for (const path of wanted)
            this.ensureLevel(entry, path);
    }
    /** Keep one level watched when it is a current directory; otherwise drop it. */
    ensureLevel(entry, path) {
        let stats;
        try {
            stats = statSync(path);
        }
        catch {
            this.closeLevel(entry, path);
            return;
        }
        if (!stats.isDirectory()) {
            this.closeLevel(entry, path);
            return;
        }
        const existing = entry.levels.get(path);
        if (existing !== undefined && existing.ino === stats.ino && existing.dev === stats.dev)
            return;
        this.closeLevel(entry, path);
        try {
            const watcher = watch(path, { persistent: false }, () => this.schedule(entry));
            watcher.on('error', (error) => {
                this.closeLevel(entry, path);
                this.onError(entry.source, error);
                this.schedule(entry);
            });
            watcher.unref();
            entry.levels.set(path, { watcher, ino: stats.ino, dev: stats.dev });
        }
        catch (error) {
            this.onError(entry.source, error);
        }
    }
    /** Debounce one refresh, then rebuild the chain from the current directories. */
    schedule(entry) {
        if (this.closed || entry.disposed || entry.timer !== undefined)
            return;
        entry.timer = setTimeout(() => {
            entry.timer = undefined;
            if (this.closed || entry.disposed)
                return;
            this.onChange(entry.source);
            this.rebind(entry);
        }, EVENT_DEBOUNCE_MS);
    }
    /** Close only the watch for one level, retaining the entry for rebinding. */
    closeLevel(entry, path) {
        const level = entry.levels.get(path);
        entry.levels.delete(path);
        if (level === undefined)
            return;
        level.watcher.removeAllListeners();
        try {
            level.watcher.close();
        }
        catch {
            // Already closed by the platform.
        }
    }
    /** Close every watch, pending debounce, and the entry. */
    disposeEntry(entry) {
        entry.disposed = true;
        if (entry.timer !== undefined) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        for (const path of [...entry.levels.keys()])
            this.closeLevel(entry, path);
    }
}
/**
 * Directory chain watched for one source: the workspace root or the user home,
 * `.codex`, and `agents`.
 * @param source - Role source being watched.
 * @returns Absolute paths from the outermost existing context to the role directory.
 */
function levelsOf(source) {
    const mid = dirname(source.dir);
    return [...new Set([source.root, mid, source.dir].filter(path => path.length > 0))];
}
