/**
 * Directory watches for role sources. Every existing level of the role path is
 * watched at once (workspace root or user home, `.codex`, `agents`), so a
 * deleted and recreated subdirectory is noticed through its parent instead of
 * relying on one binding that may still point at the old directory node.
 * @module dsh-codex-agents/watch
 */
import type { RoleSource } from './roster.js';
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
    /** Watch every existing level of one source, rebinding replaced directories. */
    private rebind;
    /** Keep one level watched when it is a current directory; otherwise drop it. */
    private ensureLevel;
    /** Debounce one refresh, then rebuild the chain from the current directories. */
    private schedule;
    /** Close only the watch for one level, retaining the entry for rebinding. */
    private closeLevel;
    /** Close every watch, pending debounce, and the entry. */
    private disposeEntry;
}
