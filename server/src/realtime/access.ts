import type { Server } from 'socket.io'
import { getRole as defaultGetRole, type DocumentRole } from '../permissions/getRole.js'
import { roomOf } from './handlers.js'
import { registry as defaultRegistry, type Registry } from './registry.js'

export interface PermissionChange {
  documentId: string
  // null: access is gone and the socket has been removed from the document.
  role: DocumentRole | null
}

interface AccessDeps {
  registry: Registry
  getRole: typeof defaultGetRole
}

// Re-checks every connected socket of a document after membership or sharing changed.
// Updates are also re-checked one by one (D18); this is what makes the change visible
// to the person right away and stops a revoked socket receiving further broadcasts.
export function createAccess(io: Server, deps: AccessDeps = { registry: defaultRegistry, getRole: defaultGetRole }) {
  return {
    async reevaluate(documentId: string): Promise<void> {
      const room = roomOf(documentId)
      const sockets = await io.in(room).fetchSockets()
      await Promise.all(
        sockets.map(async (socket) => {
          const role = await deps.getRole(socket.data.userId as string, documentId)
          const change: PermissionChange = { documentId, role }
          socket.emit('doc:permission-changed', change)
          if (role === null) {
            socket.leave(room)
            await deps.registry.leave(documentId, socket.id)
          }
        }),
      )
    },

    // Called before the document row is deleted, so nothing can compact a deleted document.
    async dropDocument(documentId: string): Promise<void> {
      const room = roomOf(documentId)
      const change: PermissionChange = { documentId, role: null }
      io.to(room).emit('doc:permission-changed', change)
      io.in(room).socketsLeave(room)
      deps.registry.evict(documentId)
    },
  }
}

export type Access = ReturnType<typeof createAccess>

// The REST routes reach the running socket server through this; without one (plain REST
// tests) the calls do nothing.
let current: Access | null = null

export function setAccess(access: Access | null) {
  current = access
}

export const reevaluateAccess = (documentId: string) => current?.reevaluate(documentId) ?? Promise.resolve()
export const dropDocument = (documentId: string) => current?.dropDocument(documentId) ?? Promise.resolve()
