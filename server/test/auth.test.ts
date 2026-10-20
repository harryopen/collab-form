import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/prisma.js'
import { SESSION_COOKIE } from '../src/modules/auth/session.js'
import { closeDb, createTestApp, resetDb } from './helpers.js'

const ORIGIN = 'http://localhost:5173'
const credentials = { email: 'ann@example.com', name: 'Ann', password: 'password123' }

let app = createTestApp()

// Supertest helpers that behave like the browser client (JSON + allowed Origin).
const post = (agent: ReturnType<typeof request.agent> | ReturnType<typeof request>, path: string) =>
  agent.post(path).set('Origin', ORIGIN).set('Content-Type', 'application/json')

beforeEach(async () => {
  await resetDb()
  app = createTestApp() // fresh rate-limit counters
})
afterAll(closeDb)

describe('POST /api/auth/signup', () => {
  it('creates a user and sets a hardened session cookie', async () => {
    const res = await post(request(app), '/api/auth/signup').send(credentials)
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ email: 'ann@example.com', name: 'Ann', avatarUrl: null })
    expect(res.body.user.passwordHash).toBeUndefined()

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//)
  })

  it('stores an argon2 hash, never the password', async () => {
    await post(request(app), '/api/auth/signup').send(credentials)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ann@example.com' } })
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain('password123')
  })

  it('rejects a duplicate email, ignoring case', async () => {
    await post(request(app), '/api/auth/signup').send(credentials)
    const res = await post(request(app), '/api/auth/signup').send({ ...credentials, email: 'ANN@Example.com' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })

  it.each([
    ['short password', { ...credentials, password: 'short' }],
    ['bad email', { ...credentials, email: 'not-an-email' }],
    ['empty name', { ...credentials, name: '  ' }],
    ['missing fields', {}],
  ])('rejects invalid input: %s', async (_label, body) => {
    const res = await post(request(app), '/api/auth/signup').send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await post(request(app), '/api/auth/signup').send(credentials)
  })

  it('logs in with correct credentials', async () => {
    const res = await post(request(app), '/api/auth/login').send({ email: 'Ann@Example.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('ann@example.com')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('rejects a wrong password', async () => {
    const res = await post(request(app), '/api/auth/login').send({ email: credentials.email, password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('gives the same error for an unknown email', async () => {
    const res = await post(request(app), '/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects password login for an account without a password', async () => {
    await prisma.user.create({ data: { email: 'g@example.com', name: 'Google User' } })
    const res = await post(request(app), '/api/auth/login').send({ email: 'g@example.com', password: 'password123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rate-limits repeated failed logins', async () => {
    const attempt = () =>
      post(request(app), '/api/auth/login').send({ email: credentials.email, password: 'wrong-password' })
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401)
    const res = await attempt()
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
  })
})

describe('GET /api/auth/me and logout', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('returns the user after signup, then 401 after logout', async () => {
    const agent = request.agent(app)
    await post(agent, '/api/auth/signup').send(credentials)

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe('ann@example.com')

    const out = await post(agent, '/api/auth/logout').send({})
    expect(out.status).toBe(204)
    expect(String(out.headers['set-cookie'])).toMatch(new RegExp(`${SESSION_COOKIE}=;`))

    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('returns 401 when the user no longer exists', async () => {
    const agent = request.agent(app)
    await post(agent, '/api/auth/signup').send(credentials)
    await prisma.user.deleteMany()
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })
})

describe('CSRF protection', () => {
  it('rejects a disallowed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', 'http://evil.example')
      .set('Content-Type', 'application/json')
      .send(credentials)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(await prisma.user.count()).toBe(0)
  })

  it('rejects a missing Origin', async () => {
    const res = await request(app).post('/api/auth/signup').set('Content-Type', 'application/json').send(credentials)
    expect(res.status).toBe(403)
  })

  it('rejects form content types', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', ORIGIN)
      .type('form')
      .send(credentials)
    expect(res.status).toBe(415)
    expect(await prisma.user.count()).toBe(0)
  })

  it('does not apply to GET requests', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200)
  })
})

describe('helmet', () => {
  it('sets security headers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
