import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import * as persistence from './persistence.js'

export interface DocEntry {
  documentId: string
  ydoc: Y.Doc
  // Cursors and presence. Never persisted; the server stamps identity on everything in here.
  awareness: Awareness
  // Awareness client id -> the socket allowed to speak for it.
  awarenessOwners: Map<number, string>
  sockets: Set<string>
  // Rows stored since the last snapshot; compaction fires when it reaches the threshold.
  pendingUpdates: number
}

interface Slot {
  loading: Promise<DocEntry>
  entry?: DocEntry
}

export interface RegistryDeps {
  loadDoc: typeof persistence.loadDoc
  compact: typeof persistence.compact
  threshold: number
}

// Called for every awareness change, except for the socket that caused it (if any).
export type AwarenessSink = (documentId: string, update: Uint8Array, exceptSocketId?: string) => void

const defaults: RegistryDeps = {
  loadDoc: persistence.loadDoc,
  compact: persistence.compact,
  threshold: persistence.COMPACT_THRESHOLD,
}

// In-memory home of every document that has at least one connected socket.
export function createRegistry(overrides: Partial<RegistryDeps> = {}) {
  const deps = { ...defaults, ...overrides }
  const slots = new Map<string, Slot>()
  let awarenessSink: AwarenessSink | undefined

  function createEntry(documentId: string, ydoc: Y.Doc, updateCount: number): DocEntry {
    const awareness = new Awareness(ydoc)
    awareness.setLocalState(null) // the server itself is not a participant
    const awarenessOwners = new Map<number, string>()
    awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        for (const id of removed) awarenessOwners.delete(id)
        const changed = [...added, ...updated, ...removed]
        if (changed.length === 0) return
        awarenessSink?.(documentId, encodeAwarenessUpdate(awareness, changed), typeof origin === 'string' ? origin : undefined)
      },
    )
    return { documentId, ydoc, awareness, awarenessOwners, sockets: new Set(), pendingUpdates: updateCount }
  }

  // Concurrent first joins share one in-flight load.
  async function join(documentId: string, socketId: string): Promise<DocEntry> {
    let slot = slots.get(documentId)
    if (!slot) {
      const created: Slot = {
        loading: deps.loadDoc(documentId).then(({ ydoc, updateCount }) => {
          created.entry = createEntry(documentId, ydoc, updateCount)
          return created.entry
        }),
      }
      // A failed load must not poison later joins.
      created.loading.catch(() => {
        if (slots.get(documentId) === created) slots.delete(documentId)
      })
      slots.set(documentId, created)
      slot = created
    }
    const entry = await slot.loading
    // Evicted (e.g. a failed insert) while we were waiting: start over with a fresh load.
    if (slots.get(documentId) !== slot) return join(documentId, socketId)
    entry.sockets.add(socketId)
    return entry
  }

  // The loaded entry, or undefined if nobody has joined (or it is still loading).
  function get(documentId: string): DocEntry | undefined {
    return slots.get(documentId)?.entry
  }

  // Call after a stored update; compacts in the background once the threshold is reached.
  function recordUpdate(documentId: string): void {
    const entry = get(documentId)
    if (!entry) return
    entry.pendingUpdates += 1
    if (entry.pendingUpdates < deps.threshold) return
    entry.pendingUpdates = 0
    void deps.compact(documentId, entry.ydoc).catch(() => {
      entry.pendingUpdates = deps.threshold // retry on the next update
    })
  }

  // Removes the socket; the last one out compacts the document and evicts it.
  async function leave(documentId: string, socketId: string): Promise<void> {
    const entry = get(documentId)
    if (!entry) return
    entry.sockets.delete(socketId)
    // Take this socket's cursors away so they do not linger for everyone else.
    const cursors = [...entry.awarenessOwners].filter(([, owner]) => owner === socketId).map(([id]) => id)
    if (cursors.length > 0) removeAwarenessStates(entry.awareness, cursors, socketId)
    if (entry.sockets.size > 0) return
    try {
      if (entry.pendingUpdates > 0) await deps.compact(documentId, entry.ydoc)
    } catch {
      // Rows are still stored, so a failed compaction loses nothing; it just runs later.
    }
    // Someone may have joined while we compacted.
    if (entry.sockets.size === 0 && slots.get(documentId)?.entry === entry) {
      slots.delete(documentId)
      entry.ydoc.destroy()
    }
  }

  // Drops the in-memory copy without compacting (failed insert, deleted document).
  // Returns the socket ids that were attached so the caller can notify them.
  function evict(documentId: string): string[] {
    const slot = slots.get(documentId)
    slots.delete(documentId)
    const entry = slot?.entry
    if (!entry) return []
    const ids = [...entry.sockets]
    entry.sockets.clear()
    entry.ydoc.destroy()
    return ids
  }

  function setAwarenessSink(sink: AwarenessSink) {
    awarenessSink = sink
  }

  return { join, get, leave, evict, recordUpdate, setAwarenessSink, size: () => slots.size }
}

export type Registry = ReturnType<typeof createRegistry>
export const registry = createRegistry()
