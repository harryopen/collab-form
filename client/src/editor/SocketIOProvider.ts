import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import type { DocumentRole } from '../api/documents.ts'

export type ConnectionStatus = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error'

export interface ProviderState {
  status: ConnectionStatus
  // Known after the first sync; the server decides it.
  role: DocumentRole | null
  error: string | null
}

// Socket.IO delivers binary payloads to the browser as ArrayBuffer (Node gets Buffer).
type Binary = ArrayBuffer | Uint8Array

interface SyncMessage {
  documentId: string
  update: Binary
  stateVector: Binary
  role: DocumentRole
}

interface DocError {
  documentId?: string
  code: string
  message: string
}

// Delay before re-joining after the server dropped us from the room, so a persistent
// database failure cannot turn into a tight loop.
const REJOIN_DELAY_MS = 1000

// Keeps one Y.Doc in step with the server over Socket.IO.
//
// Nothing is buffered while disconnected. Local edits just land in the Y.Doc; after every
// (re)connect the join handshake sends the server whatever it is missing, so offline edits,
// a server restart and a dropped-from-room recovery all go through the same path.
export class SocketIOProvider {
  readonly doc = new Y.Doc()
  private readonly socket: Socket
  private state: ProviderState = { status: 'connecting', role: null, error: null }
  private readonly listeners = new Set<() => void>()
  private synced = false
  private rejoinTimer: ReturnType<typeof setTimeout> | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined

  readonly documentId: string

  constructor(documentId: string) {
    this.documentId = documentId
    // Same origin: Vite proxies /socket.io in dev, and the session cookie rides along.
    this.socket = io({ autoConnect: false, transports: ['websocket'] })

    this.socket.on('connect', this.join)
    this.socket.on('disconnect', this.onDisconnect)
    this.socket.on('connect_error', this.onConnectError)
    this.socket.on('doc:sync', this.onSync)
    this.socket.on('doc:update', this.onRemoteUpdate)
    this.socket.on('doc:error', this.onDocError)
    this.doc.on('update', this.onLocalUpdate)
  }

  // Safe to call again after disconnect(), which React strict mode does in development.
  connect() {
    if (this.socket.active || this.connectTimer) return
    this.set({ status: 'connecting', error: null })
    // Deferred one tick: if React unmounts straight away (strict mode's throwaway mount),
    // disconnect() cancels this before a socket is ever opened.
    this.connectTimer = setTimeout(() => {
      this.connectTimer = undefined
      this.socket.connect()
    }, 0)
  }

  disconnect() {
    clearTimeout(this.connectTimer)
    this.connectTimer = undefined
    clearTimeout(this.rejoinTimer)
    if (this.socket.connected) this.socket.emit('doc:leave', { documentId: this.documentId })
    this.synced = false
    this.socket.disconnect()
  }

  // useSyncExternalStore plumbing.
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(patch: Partial<ProviderState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  private join = () => {
    clearTimeout(this.rejoinTimer)
    this.synced = false
    this.set({ status: 'syncing', error: null })
    this.socket.emit('doc:join', {
      documentId: this.documentId,
      stateVector: Y.encodeStateVector(this.doc),
    })
  }

  private onSync = (msg: SyncMessage) => {
    if (msg.documentId !== this.documentId) return
    Y.applyUpdate(this.doc, toBytes(msg.update), this)
    this.synced = true
    this.set({ status: 'synced', role: msg.role })
    if (msg.role === 'viewer') return
    // Whatever the server lacks: edits made offline or while this join was in flight.
    const missing = Y.encodeStateAsUpdate(this.doc, toBytes(msg.stateVector))
    if (!isEmptyUpdate(missing)) this.socket.emit('doc:update', { documentId: this.documentId, update: missing })
  }

  private onRemoteUpdate = (msg: { documentId: string; update: Binary }) => {
    if (msg.documentId === this.documentId) Y.applyUpdate(this.doc, toBytes(msg.update), this)
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return // came from the server
    if (!this.synced || this.state.role === 'viewer') return // picked up by the next join
    this.socket.emit('doc:update', { documentId: this.documentId, update })
  }

  private onDisconnect = (reason: string) => {
    this.synced = false
    // 'io server disconnect' means the server hung up on purpose (e.g. the session expired),
    // and Socket.IO will not reconnect by itself.
    if (reason === 'io server disconnect') this.set({ status: 'error', error: 'Your session has ended. Sign in again.' })
    else this.set({ status: 'offline' })
  }

  private onConnectError = (err: Error) => {
    this.synced = false
    if (err.message === 'UNAUTHENTICATED') this.set({ status: 'error', error: 'Your session has ended. Sign in again.' })
    else this.set({ status: 'offline' })
  }

  private onDocError = (err: DocError) => {
    if (err.documentId !== this.documentId) return
    switch (err.code) {
      case 'NOT_FOUND':
        this.synced = false
        this.set({ status: 'error', error: 'This document is no longer available.' })
        break
      case 'PERSISTENCE_FAILED':
      case 'NOT_JOINED':
        // The server dropped us from the room; join again and resend whatever it is missing.
        this.synced = false
        this.set({ status: 'syncing' })
        clearTimeout(this.rejoinTimer)
        this.rejoinTimer = setTimeout(this.join, REJOIN_DELAY_MS)
        break
      case 'UNAUTHENTICATED':
        this.set({ status: 'error', error: 'Your session has ended. Sign in again.' })
        break
      default:
        console.warn('doc:error', err)
    }
  }
}

// An update with no structs and an empty delete set encodes to two zero bytes.
function isEmptyUpdate(update: Uint8Array) {
  return update.byteLength <= 2
}

function toBytes(data: Binary): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}
