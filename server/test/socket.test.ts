import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { io as connect, type Socket } from 'socket.io-client'
import type { Server } from 'socket.io'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { env } from '../src/config/env.js'
import { prisma } from '../src/db/prisma.js'
import { signSession } from '../src/modules/auth/session.js'
import type { HandlerDeps } from '../src/realtime/handlers.js'
import { loadDoc } from '../src/realtime/persistence.js'
import { createRegistry } from '../src/realtime/registry.js'
import { createSocketServer } from '../src/realtime/socket.js'
import { closeDb, resetDb } from './helpers.js'

const ORIGIN = env.CLIENT_ORIGINS[0]

let httpServer: HttpServer
let io: Server
let url: string
let registry: ReturnType<typeof createRegistry>
const clients: TestClient[] = []

async function startServer(overrides: Partial<HandlerDeps> = {}) {
  registry = createRegistry()
  httpServer = createServer()
  io = createSocketServer(httpServer, { registry, ...overrides })
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`
}

beforeEach(async () => {
  await resetDb()
  await startServer()
})

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect()
  // Disconnects trigger compaction; let it finish so it cannot collide with the next resetDb().
  await until(() => registry.size() === 0).catch(() => undefined)
  await io.close()
})

afterAll(closeDb)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const until = async (condition: () => boolean, ms = 3000) => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 5))
  }
}

interface DocError {
  documentId?: string
  code: string
}

// A socket plus a Y.Doc wired up the way the real provider will be (task 5.4).
class TestClient {
  ydoc = new Y.Doc()
  errors: DocError[] = []
  received: Uint8Array[] = []
  role: string | null = null
  synced = false

  constructor(readonly socket: Socket, readonly documentId: string) {
    socket.on('doc:error', (e: DocError) => this.errors.push(e))
    socket.on('doc:sync', (msg: { update: Uint8Array; stateVector: Uint8Array; role: string }) => {
      Y.applyUpdate(this.ydoc, msg.update, 'remote')
      this.role = msg.role
      this.socket.emit('doc:update', {
        documentId,
        update: Y.encodeStateAsUpdate(this.ydoc, msg.stateVector),
      })
      this.synced = true
    })
    socket.on('doc:update', (msg: { update: Uint8Array }) => {
      this.received.push(msg.update)
      Y.applyUpdate(this.ydoc, msg.update, 'remote')
    })
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote' && this.synced) socket.emit('doc:update', { documentId, update })
    })
  }

  get text() {
    return this.ydoc.getText('t')
  }

  join() {
    this.socket.emit('doc:join', { documentId: this.documentId, stateVector: Y.encodeStateVector(this.ydoc) })
    return until(() => this.synced)
  }
}

function open(userId: string | null, opts: { origin?: string | null; token?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN
  const token = opts.token ?? (userId ? signSession(userId) : null)
  if (token) headers.cookie = `session=${token}`
  return connect(url, { transports: ['websocket'], extraHeaders: headers, reconnection: false })
}

async function client(userId: string, documentId: string) {
  const c = new TestClient(open(userId), documentId)
  clients.push(c)
  await new Promise<void>((resolve, reject) => {
    c.socket.once('connect', resolve)
    c.socket.once('connect_error', reject)
  })
  return c
}

async function seed() {
  const [owner, editor, viewer, stranger] = await Promise.all(
    ['owner', 'editor', 'viewer', 'stranger'].map((name) =>
      prisma.user.create({ data: { email: `${name}@example.com`, name } }),
    ),
  )
  const doc = await prisma.document.create({
    data: {
      ownerId: owner.id,
      members: {
        create: [
          { userId: editor.id, role: 'EDITOR' },
          { userId: viewer.id, role: 'VIEWER' },
        ],
      },
    },
  })
  return { owner, editor, viewer, stranger, doc }
}

const storedRows = () => prisma.documentUpdate.count()

describe('handshake', () => {
  it('rejects a socket without a session cookie', async () => {
    const socket = open(null)
    const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve))
    expect(err.message).toBe('UNAUTHENTICATED')
    socket.disconnect()
  })

  it('rejects a tampered session token', async () => {
    const socket = open(null, { token: 'not-a-jwt' })
    const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve))
    expect(err.message).toBe('UNAUTHENTICATED')
    socket.disconnect()
  })

  it('rejects a handshake from a wrong Origin', async () => {
    const { owner } = await seed()
    const socket = open(owner.id, { origin: 'http://evil.example' })
    await new Promise((resolve) => socket.once('connect_error', resolve))
    expect(socket.connected).toBe(false)
    socket.disconnect()
  })

  it('rejects a handshake with no Origin', async () => {
    const { owner } = await seed()
    const socket = open(owner.id, { origin: null })
    await new Promise((resolve) => socket.once('connect_error', resolve))
    expect(socket.connected).toBe(false)
    socket.disconnect()
  })
})

describe('doc:join', () => {
  it('syncs the stored state to a member and reports their role', async () => {
    const { owner, editor, doc } = await seed()
    const a = await client(owner.id, doc.id)
    await a.join()
    a.text.insert(0, 'hello')
    await until(() => registry.get(doc.id)?.ydoc.getText('t').toString() === 'hello')

    const b = await client(editor.id, doc.id)
    await b.join()
    expect(b.text.toString()).toBe('hello')
    expect(b.role).toBe('editor')
    expect(a.role).toBe('owner')
  })

  it('answers a stranger with NOT_FOUND and gives them nothing', async () => {
    const { stranger, doc } = await seed()
    const c = await client(stranger.id, doc.id)
    c.socket.emit('doc:join', { documentId: doc.id, stateVector: Y.encodeStateVector(c.ydoc) })
    await until(() => c.errors.length > 0)
    expect(c.errors[0].code).toBe('NOT_FOUND')
    expect(c.synced).toBe(false)
    expect(registry.size()).toBe(0)
  })

  it('answers an unknown document with NOT_FOUND', async () => {
    const { owner } = await seed()
    const c = await client(owner.id, 'no-such-document')
    c.socket.emit('doc:join', { documentId: 'no-such-document', stateVector: new Uint8Array() })
    await until(() => c.errors.length > 0)
    expect(c.errors[0].code).toBe('NOT_FOUND')
  })
})

describe('doc:update', () => {
  it('stores an editor update and delivers it to the other client', async () => {
    const { owner, editor, doc } = await seed()
    const a = await client(editor.id, doc.id)
    const b = await client(owner.id, doc.id)
    await Promise.all([a.join(), b.join()])

    a.text.insert(0, 'from A')
    await until(() => b.text.toString() === 'from A')
    await sleep(100)
    expect(await storedRows()).toBeGreaterThanOrEqual(1)
    expect((await loadDoc(doc.id)).ydoc.getText('t').toString()).toBe('from A')
  })

  it('does not echo an update back to its sender', async () => {
    const { owner, editor, doc } = await seed()
    const a = await client(editor.id, doc.id)
    const b = await client(owner.id, doc.id)
    await Promise.all([a.join(), b.join()])
    a.text.insert(0, 'x')
    await until(() => b.received.length > 0)
    expect(a.received).toHaveLength(0)
  })

  it('rejects a viewer update: not stored, not broadcast', async () => {
    const { owner, viewer, doc } = await seed()
    const v = await client(viewer.id, doc.id)
    const o = await client(owner.id, doc.id)
    await Promise.all([v.join(), o.join()])
    expect(v.role).toBe('viewer')

    v.text.insert(0, 'sneaky')
    await until(() => v.errors.some((e) => e.code === 'FORBIDDEN'))
    await new Promise((r) => setTimeout(r, 100))
    expect(o.text.toString()).toBe('')
    expect(await storedRows()).toBe(0)
  })

  it('rejects an update for a document the socket has not joined', async () => {
    const { owner, doc } = await seed()
    const c = await client(owner.id, doc.id)
    const source = new Y.Doc()
    source.getText('t').insert(0, 'x')
    c.socket.emit('doc:update', { documentId: doc.id, update: Y.encodeStateAsUpdate(source) })
    await until(() => c.errors.length > 0)
    expect(c.errors[0].code).toBe('NOT_JOINED')
    expect(await storedRows()).toBe(0)
  })

  it('does not let a joined socket write to a different document', async () => {
    const { owner, doc } = await seed()
    const other = await prisma.document.create({ data: { ownerId: owner.id } })
    const c = await client(owner.id, doc.id)
    await c.join()
    const source = new Y.Doc()
    source.getText('t').insert(0, 'x')
    c.socket.emit('doc:update', { documentId: other.id, update: Y.encodeStateAsUpdate(source) })
    await until(() => c.errors.some((e) => e.code === 'NOT_JOINED'))
    expect(await storedRows()).toBe(0)
  })

  it('rejects doc:awareness for a document the socket has not joined', async () => {
    const { owner, doc } = await seed()
    const a = await client(owner.id, doc.id)
    const b = await client(owner.id, doc.id)
    await b.join()
    a.socket.emit('doc:awareness', { documentId: doc.id, update: new Uint8Array([1]) })
    await until(() => a.errors.length > 0)
    expect(a.errors[0].code).toBe('NOT_JOINED')
  })

  it('survives malformed and oversized payloads', async () => {
    const { owner, doc } = await seed()
    const c = await client(owner.id, doc.id)
    await c.join()
    const bad: unknown[] = [
      null,
      'text',
      42,
      {},
      { documentId: doc.id },
      { documentId: doc.id, update: 'not bytes' },
      { documentId: 7, update: new Uint8Array() },
      { documentId: doc.id, update: new Uint8Array([255, 255, 255, 255]) }, // not a valid Yjs update
      { documentId: doc.id, update: new Uint8Array(1_500_000) }, // over MAX_UPDATE_BYTES, under the socket limit
    ]
    for (const payload of bad) c.socket.emit('doc:update', payload)
    await until(() => c.errors.length === bad.length)
    expect(c.errors.every((e) => e.code === 'VALIDATION_ERROR')).toBe(true)
    expect(await storedRows()).toBe(0)

    // Still healthy afterwards.
    c.text.insert(0, 'ok')
    await until(() => registry.get(doc.id)?.ydoc.getText('t').toString() === 'ok')
  })

  it('rejects an invalid state vector on join without crashing', async () => {
    const { owner, doc } = await seed()
    const c = await client(owner.id, doc.id)
    c.socket.emit('doc:join', { documentId: doc.id, stateVector: new Uint8Array([255, 255, 255]) })
    await until(() => c.errors.length > 0)
    expect(c.errors[0].code).toBe('VALIDATION_ERROR')
  })

  it('drops a socket whose session expired', async () => {
    const { owner, doc } = await seed()
    const token = jwt.sign({ sub: owner.id }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 1 })
    const c = new TestClient(open(owner.id, { token }), doc.id)
    clients.push(c)
    await new Promise((resolve) => c.socket.once('connect', resolve))
    await c.join()
    await new Promise((r) => setTimeout(r, 1200))
    c.text.insert(0, 'late')
    await until(() => c.errors.some((e) => e.code === 'UNAUTHENTICATED'))
    await until(() => !c.socket.connected)
    expect(await storedRows()).toBe(0)
  })
})

describe('persistence failure (D17)', () => {
  it('does not broadcast a failed insert, evicts the doc and lets clients re-join', async () => {
    await io.close()
    let fail = true
    const { appendUpdate } = await import('../src/realtime/persistence.js')
    await startServer({
      appendUpdate: (documentId, data) =>
        fail ? Promise.reject(new Error('db down')) : appendUpdate(documentId, data),
    })
    const { owner, editor, doc } = await seed()
    const a = await client(editor.id, doc.id)
    const b = await client(owner.id, doc.id)
    await Promise.all([a.join(), b.join()])

    a.text.insert(0, 'lost')
    await until(() => a.errors.some((e) => e.code === 'PERSISTENCE_FAILED'))
    await until(() => b.errors.some((e) => e.code === 'PERSISTENCE_FAILED'))
    expect(b.received).toHaveLength(0)
    expect(b.text.toString()).toBe('')
    expect(registry.get(doc.id)).toBeUndefined()
    expect(await storedRows()).toBe(0)

    // After the failure clears, a fresh client joins to the true (empty) stored state.
    fail = false
    const c = await client(owner.id, doc.id)
    await c.join()
    expect(c.text.toString()).toBe('')
  })
})

describe('lifecycle', () => {
  it('compacts and evicts the document when the last client disconnects', async () => {
    const { owner, doc } = await seed()
    const a = await client(owner.id, doc.id)
    await a.join()
    a.text.insert(0, 'bye')
    await until(() => registry.get(doc.id)?.ydoc.getText('t').toString() === 'bye')
    await sleep(100) // let the insert land
    a.socket.disconnect()
    await until(() => registry.size() === 0)
    expect((await loadDoc(doc.id)).ydoc.getText('t').toString()).toBe('bye')
    expect(await prisma.documentSnapshot.count()).toBe(1)
    expect(await storedRows()).toBe(0)
  })

  it('stops sending to a client after doc:leave', async () => {
    const { owner, editor, doc } = await seed()
    const a = await client(owner.id, doc.id)
    const b = await client(editor.id, doc.id)
    await Promise.all([a.join(), b.join()])
    b.socket.emit('doc:leave', { documentId: doc.id })
    await new Promise((r) => setTimeout(r, 100))
    a.text.insert(0, 'after leave')
    await new Promise((r) => setTimeout(r, 200))
    expect(b.received).toHaveLength(0)
  })
})

describe('convergence', () => {
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('three clients making random concurrent edits converge to the stored state', async () => {
    const { owner, editor, doc } = await seed()
    const third = await prisma.user.create({ data: { email: 'third@example.com', name: 'third' } })
    await prisma.documentMember.create({ data: { documentId: doc.id, userId: third.id, role: 'EDITOR' } })
    const all = await Promise.all([client(owner.id, doc.id), client(editor.id, doc.id), client(third.id, doc.id)])
    await Promise.all(all.map((c) => c.join()))

    const random = rng(1234)
    await Promise.all(
      all.map(async (c) => {
        for (let i = 0; i < 40; i++) {
          const len = c.text.length
          if (len > 5 && random() < 0.3) c.text.delete(Math.floor(random() * (len - 1)), 1)
          else c.text.insert(Math.floor(random() * (len + 1)), String.fromCharCode(97 + Math.floor(random() * 26)))
          await new Promise((r) => setTimeout(r, Math.floor(random() * 10)))
        }
      }),
    )

    const server = () => registry.get(doc.id)!.ydoc.getText('t').toString()
    await until(() => all.every((c) => c.text.toString() === server()), 5000)
    await new Promise((r) => setTimeout(r, 200))
    expect(all.every((c) => c.text.toString() === server())).toBe(true)
    expect(server().length).toBeGreaterThan(0)
    expect((await loadDoc(doc.id)).ydoc.getText('t').toString()).toBe(server())
  }, 20_000)

  it('delivers updates with p95 latency under 300 ms', async () => {
    const { owner, editor, doc } = await seed()
    const a = await client(owner.id, doc.id)
    const b = await client(editor.id, doc.id)
    await Promise.all([a.join(), b.join()])

    const samples: number[] = []
    for (let i = 0; i < 50; i++) {
      const before = b.text.length
      const start = performance.now()
      a.text.insert(a.text.length, 'x')
      await until(() => b.text.length > before)
      samples.push(performance.now() - start)
    }
    samples.sort((x, y) => x - y)
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(300)
  })
})
