import { io, type Socket } from 'socket.io-client'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { DocumentRole } from '../api/documents.ts'

export type ConnectionStatus = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error'

// Someone else in the document, as stamped by the server.
export interface Peer {
  id: string
  name: string
  color: string
}

export interface ProviderState {
  status: ConnectionStatus
  // Known after the first sync; the server decides it.
  role: DocumentRole | null
  error: string | null
  // Set when the server removed our access; the page should leave the document.
  revoked: boolean
  // Other people here right now (one entry per person, however many tabs they have).
  peers: Peer[]
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
  // Cursors and presence for the caret extension; the server stamps everyone's identity.
  readonly awareness = new Awareness(this.doc)
  private readonly socket: Socket
  private state: ProviderState = { status: 'connecting', role: null, error: null, revoked: false, peers: [] }
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
    this.socket.on('doc:permission-changed', this.onPermissionChanged)
    this.socket.on('doc:awareness', this.onRemoteAwareness)
    this.awareness.on('update', this.onAwarenessUpdate)
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
    this.sendOwnAwareness() // the server forgets us whenever we disconnect
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
    this.dropRemoteAwareness()
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

  // Membership or sharing changed while we are connected. The server enforces it on every
  // update regardless; this just makes the UI follow immediately.
  private onPermissionChanged = (msg: { documentId: string; role: DocumentRole | null }) => {
    if (msg.documentId !== this.documentId) return
    if (msg.role === null) {
      this.synced = false
      this.dropRemoteAwareness()
      this.set({ status: 'error', role: null, revoked: true, error: 'You no longer have access to this document.' })
      this.socket.disconnect()
      return
    }
    this.set({ role: msg.role })
  }

  private sendOwnAwareness() {
    if (!this.synced || this.awareness.getLocalState() === null) return
    this.socket.emit('doc:awareness', {
      documentId: this.documentId,
      update: encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]),
    })
  }

  // Our own cursor and name changes (origin 'local') go to the server; it relays them.
  private onAwarenessUpdate = (_changes: unknown, origin: unknown) => {
    if (origin === 'local') this.sendOwnAwareness()
    this.refreshPeers()
  }

  private onRemoteAwareness = (msg: { documentId: string; update: Binary }) => {
    if (msg.documentId === this.documentId) applyAwarenessUpdate(this.awareness, toBytes(msg.update), this)
  }

  // Without a connection nobody can tell us they left, so forget everyone else's cursor.
  private dropRemoteAwareness() {
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.awareness.clientID)
    if (others.length > 0) removeAwarenessStates(this.awareness, others, this)
  }

  private refreshPeers() {
    const byPerson = new Map<string, Peer>()
    for (const [clientId, state] of this.awareness.getStates()) {
      const user = (state as { user?: Partial<Peer> }).user
      if (clientId === this.awareness.clientID || !user?.id || !user.name) continue
      byPerson.set(user.id, { id: user.id, name: user.name, color: user.color ?? '#888888' })
    }
    const peers = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))
    // Awareness renews every few seconds; only tell React when the people actually changed.
    if (JSON.stringify(peers) !== JSON.stringify(this.state.peers)) this.set({ peers })
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
