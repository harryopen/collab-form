import type { Server, Socket } from 'socket.io'
import * as Y from 'yjs'
import { z } from 'zod'
import { getRole, hasRole } from '../permissions/getRole.js'
import type { SocketData } from './handshake.js'
import { appendUpdate } from './persistence.js'
import type { Registry } from './registry.js'

// Socket.IO closes a connection that sends more than this, before any handler runs.
export const MAX_HTTP_BUFFER_SIZE = 2_000_000
// Checked by the handlers, so an oversized update gets a doc:error instead of a dropped socket.
export const MAX_UPDATE_BYTES = 1_000_000

export type DocErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_JOINED'
  | 'PERSISTENCE_FAILED'
  | 'INTERNAL_ERROR'

export interface HandlerDeps {
  registry: Registry
  appendUpdate: typeof appendUpdate
  getRole: typeof getRole
}

const bytes = z.instanceof(Uint8Array).refine((b) => b.byteLength <= MAX_UPDATE_BYTES, 'payload too large')
const documentId = z.string().min(1).max(64)

const joinSchema = z.object({ documentId, stateVector: bytes })
const updateSchema = z.object({ documentId, update: bytes })
const awarenessSchema = z.object({ documentId, update: bytes })
const leaveSchema = z.object({ documentId })

export const roomOf = (id: string) => `doc:${id}`

export function registerHandlers(io: Server, socket: Socket, deps: HandlerDeps) {
  const { registry } = deps
  const data = () => socket.data as SocketData

  const fail = (docId: string | undefined, code: DocErrorCode, message: string) =>
    socket.emit('doc:error', { documentId: docId, code, message })

  // Rejects (and reports) the event unless its payload is valid and the socket joined the document.
  function parse<T extends { documentId: string }>(schema: z.ZodType<T>, payload: unknown): T | null {
    const result = schema.safeParse(payload)
    if (!result.success) {
      fail(undefined, 'VALIDATION_ERROR', 'Invalid payload')
      return null
    }
    return result.data
  }

  function requireJoined(docId: string): boolean {
    if (socket.rooms.has(roomOf(docId))) return true
    fail(docId, 'NOT_JOINED', 'Join the document first')
    return false
  }

  // A live socket must not outlive its session.
  function sessionValid(docId: string): boolean {
    if (Date.now() < data().expiresAt) return true
    fail(docId, 'UNAUTHENTICATED', 'Session expired')
    socket.disconnect(true)
    return false
  }

  // One socket's events are handled strictly in arrival order. Handlers await the database, and
  // concurrent ones could store and relay a client's updates out of order.
  let queue: Promise<void> = Promise.resolve()
  const inOrder = (handler: (payload: unknown) => Promise<unknown>) => (payload: unknown) => {
    queue = queue.then(() => handler(payload)).catch(() => undefined)
  }

  socket.on('doc:join', inOrder(async (payload) => {
    const msg = parse(joinSchema, payload)
    if (!msg || !sessionValid(msg.documentId)) return
    try {
      const role = await deps.getRole(data().userId, msg.documentId)
      if (!role) return fail(msg.documentId, 'NOT_FOUND', 'Document not found')

      const entry = await registry.join(msg.documentId, socket.id)
      if (socket.disconnected) {
        await registry.leave(msg.documentId, socket.id)
        return
      }
      await socket.join(roomOf(msg.documentId))

      let diff: Uint8Array
      try {
        diff = Y.encodeStateAsUpdate(entry.ydoc, msg.stateVector)
      } catch {
        return fail(msg.documentId, 'VALIDATION_ERROR', 'Invalid state vector')
      }
      socket.emit('doc:sync', {
        documentId: msg.documentId,
        update: diff,
        stateVector: Y.encodeStateVector(entry.ydoc),
        role,
      })
    } catch {
      fail(msg.documentId, 'INTERNAL_ERROR', 'Could not join document')
    }
  }))

  socket.on('doc:update', inOrder(async (payload) => {
    const msg = parse(updateSchema, payload)
    if (!msg || !requireJoined(msg.documentId) || !sessionValid(msg.documentId)) return
    const room = roomOf(msg.documentId)
    try {
      // Checked on every update so a demotion takes effect immediately (D18).
      const role = await deps.getRole(data().userId, msg.documentId)
      if (!hasRole(role, 'editor')) return fail(msg.documentId, 'FORBIDDEN', 'You cannot edit this document')

      const entry = registry.get(msg.documentId)
      if (!entry || !socket.rooms.has(room)) return fail(msg.documentId, 'NOT_JOINED', 'Join the document first')

      // Apply before storing so a malformed update is neither stored nor broadcast.
      let changed = false
      const markChanged = () => (changed = true)
      const pendingBefore = entry.ydoc.store.pendingStructs
      entry.ydoc.on('update', markChanged)
      try {
        Y.applyUpdate(entry.ydoc, msg.update)
      } catch {
        return fail(msg.documentId, 'VALIDATION_ERROR', 'Malformed update')
      } finally {
        entry.ydoc.off('update', markChanged)
      }
      // Updates waiting on a missing dependency fire no 'update' event but still have to be stored.
      const queued = entry.ydoc.store.pendingStructs !== pendingBefore
      // Nothing new (e.g. the empty diff a client sends right after syncing): don't store or relay it.
      if (!changed && !queued) return

      try {
        await deps.appendUpdate(msg.documentId, msg.update)
      } catch {
        // Memory now holds an edit the database does not (D17): drop it and make everyone re-join.
        registry.evict(msg.documentId)
        io.to(room).emit('doc:error', {
          documentId: msg.documentId,
          code: 'PERSISTENCE_FAILED',
          message: 'Could not save; rejoin the document',
        })
        io.in(room).socketsLeave(room)
        return
      }

      socket.to(room).emit('doc:update', { documentId: msg.documentId, update: msg.update })
      registry.recordUpdate(msg.documentId)
    } catch {
      fail(msg.documentId, 'INTERNAL_ERROR', 'Could not apply update')
    }
  }))

  // Placeholder until 6.1 adds server-side awareness: joined-only relay of the raw payload.
  socket.on('doc:awareness', (payload: unknown) => {
    const msg = parse(awarenessSchema, payload)
    if (!msg || !requireJoined(msg.documentId)) return
    socket.to(roomOf(msg.documentId)).emit('doc:awareness', msg)
  })

  socket.on('doc:leave', inOrder(async (payload) => {
    const msg = parse(leaveSchema, payload)
    if (!msg || !socket.rooms.has(roomOf(msg.documentId))) return
    await socket.leave(roomOf(msg.documentId))
    await registry.leave(msg.documentId, socket.id).catch(() => undefined)
  }))

  // `rooms` is still populated here, unlike in 'disconnect'.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('doc:')) void registry.leave(room.slice(4), socket.id).catch(() => undefined)
    }
  })
}
