import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/prisma.js'
import { closeDb, createTestApp, resetDb } from './helpers.js'

const ORIGIN = 'http://localhost:5173'
let app = createTestApp()

type Agent = ReturnType<typeof request.agent>

// A signed-in browser: signs up and keeps the session cookie.
async function signedIn(name: string): Promise<{ agent: Agent; id: string }> {
  const agent = request.agent(app)
  const res = await agent
    .post('/api/auth/signup')
    .set('Origin', ORIGIN)
    .send({ email: `${name}@example.com`, name, password: 'password123' })
  return { agent, id: res.body.user.id }
}

const send = (agent: Agent, method: 'post' | 'patch' | 'delete', path: string, body: object = {}) =>
  agent[method](path).set('Origin', ORIGIN).set('Content-Type', 'application/json').send(body)

// owner + editor + viewer + stranger, with one document shared with the first three.
async function scenario() {
  const [owner, editor, viewer, stranger] = await Promise.all(['owner', 'editor', 'viewer', 'stranger'].map(signedIn))
  const created = await send(owner!.agent, 'post', '/api/documents', { title: 'Plan' })
  const docId: string = created.body.document.id
  await prisma.documentMember.createMany({
    data: [
      { documentId: docId, userId: editor!.id, role: 'EDITOR' },
      { documentId: docId, userId: viewer!.id, role: 'VIEWER' },
    ],
  })
  return { owner: owner!, editor: editor!, viewer: viewer!, stranger: stranger!, docId }
}

beforeEach(async () => {
  await resetDb()
  app = createTestApp() // fresh rate-limit counters: the suite signs up many users
})
afterAll(closeDb)

describe('authentication', () => {
  it.each([
    ['get', '/api/documents'],
    ['post', '/api/documents'],
    ['get', '/api/documents/some-id'],
    ['patch', '/api/documents/some-id'],
    ['delete', '/api/documents/some-id'],
  ] as const)('%s %s requires a session', async (method, path) => {
    const res = await request(app)[method](path).set('Origin', ORIGIN).set('Content-Type', 'application/json').send({})
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('POST /api/documents', () => {
  it('creates a document owned by the caller, with a default title', async () => {
    const { agent, id } = await signedIn('ann')
    const res = await send(agent, 'post', '/api/documents')
    expect(res.status).toBe(201)
    expect(res.body.document).toMatchObject({ title: 'Untitled document', shareMode: 'OFF', role: 'owner' })
    expect(res.body.document.owner.id).toBe(id)
    expect(res.body.document.ownerId).toBeUndefined()
  })

  it('accepts a trimmed custom title and ignores client-supplied owner fields', async () => {
    const { agent, id } = await signedIn('ann')
    const other = await signedIn('bob')
    const res = await send(agent, 'post', '/api/documents', { title: '  Roadmap  ', ownerId: other.id })
    expect(res.status).toBe(201)
    expect(res.body.document.title).toBe('Roadmap')
    expect((await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } })).ownerId).toBe(id)
  })

  it.each([['empty', ''], ['blank', '   '], ['too long', 'x'.repeat(201)]])('rejects a %s title', async (_l, title) => {
    const { agent } = await signedIn('ann')
    const res = await send(agent, 'post', '/api/documents', { title })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/documents', () => {
  it('lists owned and shared documents with the caller role, not other people’s', async () => {
    const { owner, editor, stranger, docId } = await scenario()
    const own = await send(editor.agent, 'post', '/api/documents', { title: 'Mine' })

    const list = await editor.agent.get('/api/documents')
    expect(list.status).toBe(200)
    const byId = Object.fromEntries(list.body.documents.map((d: { id: string; role: string }) => [d.id, d.role]))
    expect(byId).toEqual({ [docId]: 'editor', [own.body.document.id]: 'owner' })

    expect((await owner.agent.get('/api/documents')).body.documents.map((d: { role: string }) => d.role)).toEqual(['owner'])
    expect((await stranger.agent.get('/api/documents')).body.documents).toEqual([])
  })

  it('lists the most recently updated first', async () => {
    const { agent } = await signedIn('ann')
    const a = await send(agent, 'post', '/api/documents', { title: 'A' })
    const b = await send(agent, 'post', '/api/documents', { title: 'B' })
    await send(agent, 'patch', `/api/documents/${a.body.document.id}`, { title: 'A2' })
    const titles = (await agent.get('/api/documents')).body.documents.map((d: { title: string }) => d.title)
    expect(titles).toEqual(['A2', 'B'])
    expect(b.status).toBe(201)
  })
})

describe('GET /api/documents/:id', () => {
  it('returns metadata and the caller role for owner, editor and viewer', async () => {
    const { owner, editor, viewer, docId } = await scenario()
    for (const [who, role] of [[owner, 'owner'], [editor, 'editor'], [viewer, 'viewer']] as const) {
      const res = await who.agent.get(`/api/documents/${docId}`)
      expect(res.status).toBe(200)
      expect(res.body.document).toMatchObject({ id: docId, title: 'Plan', role })
    }
  })

  it('returns 404 (not 403) to a stranger and for a missing document', async () => {
    const { stranger, docId } = await scenario()
    const hidden = await stranger.agent.get(`/api/documents/${docId}`)
    const missing = await stranger.agent.get('/api/documents/does-not-exist')
    expect(hidden.status).toBe(404)
    expect(hidden.body).toEqual(missing.body) // indistinguishable
    expect(missing.status).toBe(404)
  })
})

describe('PATCH /api/documents/:id', () => {
  it('lets the owner and an editor rename', async () => {
    const { owner, editor, docId } = await scenario()
    const a = await send(owner.agent, 'patch', `/api/documents/${docId}`, { title: 'By owner' })
    expect(a.status).toBe(200)
    expect(a.body.document.title).toBe('By owner')
    const b = await send(editor.agent, 'patch', `/api/documents/${docId}`, { title: 'By editor' })
    expect(b.status).toBe(200)
    expect(b.body.document).toMatchObject({ title: 'By editor', role: 'editor' })
  })

  it('forbids a viewer (403) and hides the document from a stranger (404)', async () => {
    const { viewer, stranger, docId } = await scenario()
    const v = await send(viewer.agent, 'patch', `/api/documents/${docId}`, { title: 'Nope' })
    expect(v.status).toBe(403)
    expect(v.body.error.code).toBe('FORBIDDEN')
    expect((await send(stranger.agent, 'patch', `/api/documents/${docId}`, { title: 'Nope' })).status).toBe(404)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docId } })).title).toBe('Plan')
  })

  it('lets only the owner change shareMode, and applies nothing for a forbidden attempt', async () => {
    const { owner, editor, docId } = await scenario()
    const denied = await send(editor.agent, 'patch', `/api/documents/${docId}`, { title: 'Sneaky', shareMode: 'EDITOR' })
    expect(denied.status).toBe(403)
    const unchanged = await prisma.document.findUniqueOrThrow({ where: { id: docId } })
    expect(unchanged).toMatchObject({ title: 'Plan', shareMode: 'OFF' })

    const ok = await send(owner.agent, 'patch', `/api/documents/${docId}`, { shareMode: 'VIEWER' })
    expect(ok.status).toBe(200)
    expect(ok.body.document.shareMode).toBe('VIEWER')
  })

  it('rejects invalid bodies and ignores fields that are not editable', async () => {
    const { owner, stranger, docId } = await scenario()
    const url = `/api/documents/${docId}`
    expect((await send(owner.agent, 'patch', url, {})).status).toBe(400)
    expect((await send(owner.agent, 'patch', url, { title: '' })).status).toBe(400)
    expect((await send(owner.agent, 'patch', url, { shareMode: 'EVERYONE' })).status).toBe(400)

    await send(owner.agent, 'patch', url, { title: 'Kept', ownerId: stranger.id })
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } })
    expect(doc.title).toBe('Kept')
    expect(doc.ownerId).not.toBe(stranger.id)
  })

  it('bumps updatedAt', async () => {
    const { owner, docId } = await scenario()
    const before = await prisma.document.findUniqueOrThrow({ where: { id: docId } })
    await new Promise((r) => setTimeout(r, 10))
    await send(owner.agent, 'patch', `/api/documents/${docId}`, { title: 'Later' })
    const after = await prisma.document.findUniqueOrThrow({ where: { id: docId } })
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })
})

describe('DELETE /api/documents/:id', () => {
  it('lets only the owner delete, and removes the members with it', async () => {
    const { owner, editor, viewer, stranger, docId } = await scenario()
    const url = `/api/documents/${docId}`
    expect((await send(editor.agent, 'delete', url)).status).toBe(403)
    expect((await send(viewer.agent, 'delete', url)).status).toBe(403)
    expect((await send(stranger.agent, 'delete', url)).status).toBe(404)
    expect(await prisma.document.count()).toBe(1)

    expect((await send(owner.agent, 'delete', url)).status).toBe(204)
    expect(await prisma.document.count()).toBe(0)
    expect(await prisma.documentMember.count()).toBe(0)
    expect((await owner.agent.get(url)).status).toBe(404)
  })
})
