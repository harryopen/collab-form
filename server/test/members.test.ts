import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/prisma.js'
import { getRole } from '../src/permissions/getRole.js'
import { closeDb, createTestApp, resetDb } from './helpers.js'

const ORIGIN = 'http://localhost:5173'
let app = createTestApp()

type Agent = ReturnType<typeof request.agent>

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
  app = createTestApp()
})
afterAll(closeDb)

describe('members routes', () => {
  it('requires a session', async () => {
    const res = await request(app).get('/api/documents/some-id/members')
    expect(res.status).toBe(401)
  })

  it('lets the owner list members', async () => {
    const { owner, docId } = await scenario()
    const res = await owner.agent.get(`/api/documents/${docId}/members`)
    expect(res.status).toBe(200)
    expect(res.body.members.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([
      ['editor@example.com', 'EDITOR'],
      ['viewer@example.com', 'VIEWER'],
    ])
  })

  it('forbids non-owner members and hides the document from strangers', async () => {
    const { editor, viewer, stranger, docId } = await scenario()
    const path = `/api/documents/${docId}/members`
    for (const who of [editor, viewer]) {
      expect((await who.agent.get(path)).status).toBe(403)
      expect((await send(who.agent, 'post', path, { email: 'stranger@example.com', role: 'VIEWER' })).status).toBe(403)
      expect((await send(who.agent, 'patch', `${path}/${viewer.id}`, { role: 'EDITOR' })).status).toBe(403)
      expect((await send(who.agent, 'delete', `${path}/${editor.id}`)).status).toBe(403)
    }
    expect((await stranger.agent.get(path)).status).toBe(404)
    expect((await send(stranger.agent, 'post', path, { email: 'stranger@example.com', role: 'VIEWER' })).status).toBe(404)
  })

  it('adds a member by email (case-insensitive) who then gets that role', async () => {
    const { owner, stranger, docId } = await scenario()
    const res = await send(owner.agent, 'post', `/api/documents/${docId}/members`, {
      email: ' Stranger@Example.com ',
      role: 'EDITOR',
    })
    expect(res.status).toBe(201)
    expect(res.body.member).toMatchObject({ userId: stranger.id, email: 'stranger@example.com', role: 'EDITOR' })
    expect(await getRole(stranger.id, docId)).toBe('editor')
  })

  it('rejects an unknown email with USER_NOT_FOUND', async () => {
    const { owner, docId } = await scenario()
    const res = await send(owner.agent, 'post', `/api/documents/${docId}/members`, { email: 'nobody@example.com', role: 'VIEWER' })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('USER_NOT_FOUND')
  })

  it('rejects adding the owner', async () => {
    const { owner, docId } = await scenario()
    const res = await send(owner.agent, 'post', `/api/documents/${docId}/members`, { email: 'owner@example.com', role: 'VIEWER' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(await prisma.documentMember.count({ where: { userId: owner.id } })).toBe(0)
  })

  it('rejects a duplicate member with ALREADY_MEMBER', async () => {
    const { owner, docId } = await scenario()
    const res = await send(owner.agent, 'post', `/api/documents/${docId}/members`, { email: 'viewer@example.com', role: 'EDITOR' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('validates the body', async () => {
    const { owner, docId } = await scenario()
    const path = `/api/documents/${docId}/members`
    expect((await send(owner.agent, 'post', path, { email: 'not-an-email', role: 'VIEWER' })).status).toBe(400)
    expect((await send(owner.agent, 'post', path, { email: 'stranger@example.com', role: 'OWNER' })).status).toBe(400)
    expect((await send(owner.agent, 'patch', `${path}/x`, { role: 'OWNER' })).status).toBe(400)
  })

  it('changes a member role', async () => {
    const { owner, viewer, docId } = await scenario()
    const res = await send(owner.agent, 'patch', `/api/documents/${docId}/members/${viewer.id}`, { role: 'EDITOR' })
    expect(res.status).toBe(200)
    expect(res.body.member.role).toBe('EDITOR')
    expect(await getRole(viewer.id, docId)).toBe('editor')
  })

  it('returns 404 when changing or removing a non-member', async () => {
    const { owner, stranger, docId } = await scenario()
    const path = `/api/documents/${docId}/members/${stranger.id}`
    expect((await send(owner.agent, 'patch', path, { role: 'EDITOR' })).status).toBe(404)
    expect((await send(owner.agent, 'delete', path)).status).toBe(404)
  })

  it('removes a member and revokes access', async () => {
    const { owner, editor, docId } = await scenario()
    const res = await send(owner.agent, 'delete', `/api/documents/${docId}/members/${editor.id}`)
    expect(res.status).toBe(204)
    expect(await getRole(editor.id, docId)).toBeNull()
    expect((await editor.agent.get(`/api/documents/${docId}`)).status).toBe(404)
  })
})
