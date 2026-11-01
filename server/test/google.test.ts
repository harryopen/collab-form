import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/prisma.js'
import { GOOGLE_PATH, STATE_COOKIE, type GoogleProfile } from '../src/modules/auth/google.js'
import { findOrCreateGoogleUser } from '../src/modules/auth/service.js'
import { SESSION_COOKIE } from '../src/modules/auth/session.js'
import { closeDb, createTestApp, resetDb } from './helpers.js'

const profile: GoogleProfile = {
  sub: 'google-sub-1',
  email: 'Gina@Example.com',
  emailVerified: true,
  name: 'Gina',
  picture: 'https://example.com/g.png',
}

let nextProfile: GoogleProfile | Error = profile
const app = createTestApp({
  exchangeCode: async () => {
    if (nextProfile instanceof Error) throw nextProfile
    return nextProfile
  },
})

beforeEach(async () => {
  await resetDb()
  nextProfile = profile
})
afterAll(closeDb)

const cookieHeader = (res: request.Response, name: string) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${name}=`))

// Runs GET /google and returns the state Google would echo back, plus the cookie to send.
async function startFlow() {
  const res = await request(app).get(`${GOOGLE_PATH}`)
  const stateCookie = cookieHeader(res, STATE_COOKIE)!
  const state = new URL(res.headers.location!).searchParams.get('state')!
  return { res, state, cookie: stateCookie.split(';')[0]! }
}

describe('GET /api/auth/google', () => {
  it('redirects to Google with a state that is also stored in a scoped httpOnly cookie', async () => {
    const { res, state } = await startFlow()
    expect(res.status).toBe(302)
    const url = new URL(res.headers.location!)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe(process.env.GOOGLE_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.GOOGLE_REDIRECT_URI)
    expect(url.searchParams.get('scope')).toContain('email')
    expect(state.length).toBeGreaterThanOrEqual(32)

    const cookie = cookieHeader(res, STATE_COOKIE)!
    expect(cookie).toContain(`${STATE_COOKIE}=${state}`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toContain(`Path=${GOOGLE_PATH}`)
  })
})

describe('GET /api/auth/google/callback', () => {
  const callback = (query: string, cookie?: string) => {
    const req = request(app).get(`${GOOGLE_PATH}/callback?${query}`)
    return cookie ? req.set('Cookie', cookie) : req
  }

  it('creates a new user, sets the session and redirects home', async () => {
    const { state, cookie } = await startFlow()
    const res = await callback(`code=abc&state=${state}`, cookie)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(cookieHeader(res, SESSION_COOKIE)).toMatch(/HttpOnly/i)

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'gina@example.com' },
      include: { authAccounts: true },
    })
    expect(user.passwordHash).toBeNull()
    expect(user.authAccounts).toMatchObject([{ provider: 'google', providerAccountId: 'google-sub-1' }])
  })

  it('logs a returning Google user in without creating a duplicate', async () => {
    for (let i = 0; i < 2; i++) {
      const { state, cookie } = await startFlow()
      const res = await callback(`code=abc&state=${state}`, cookie)
      expect(res.headers.location).toBe('/')
    }
    expect(await prisma.user.count()).toBe(1)
  })

  it('clears the state cookie after use, so a replayed callback is rejected', async () => {
    const { state, cookie } = await startFlow()
    const first = await callback(`code=abc&state=${state}`, cookie)
    expect(cookieHeader(first, STATE_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/)
    // A browser would have dropped the cookie; sending no cookie models the replay.
    const replay = await callback(`code=abc&state=${state}`)
    expect(replay.headers.location).toBe('/login?error=invalid_state')
  })

  it('rejects a tampered state', async () => {
    const { cookie } = await startFlow()
    const res = await callback('code=abc&state=tampered', cookie)
    expect(res.headers.location).toBe('/login?error=invalid_state')
    expect(cookieHeader(res, SESSION_COOKIE)).toBeUndefined()
    expect(await prisma.user.count()).toBe(0)
  })

  it('rejects a missing state cookie or missing state param', async () => {
    const { state, cookie } = await startFlow()
    expect((await callback(`code=abc&state=${state}`)).headers.location).toBe('/login?error=invalid_state')
    expect((await callback('code=abc', cookie)).headers.location).toBe('/login?error=invalid_state')
  })

  it('handles the user denying access', async () => {
    const { state, cookie } = await startFlow()
    const res = await callback(`error=access_denied&state=${state}`, cookie)
    expect(res.headers.location).toBe('/login?error=access_denied')
  })

  it('handles a failed code exchange (bad/replayed code, wrong audience)', async () => {
    nextProfile = new Error('invalid_grant')
    const { state, cookie } = await startFlow()
    const res = await callback(`code=used&state=${state}`, cookie)
    expect(res.headers.location).toBe('/login?error=google_failed')
    expect(cookieHeader(res, SESSION_COOKIE)).toBeUndefined()
  })

  it('refuses to link to an existing password account', async () => {
    await prisma.user.create({ data: { email: 'gina@example.com', name: 'Gina', passwordHash: 'x' } })
    const { state, cookie } = await startFlow()
    const res = await callback(`code=abc&state=${state}`, cookie)
    expect(res.headers.location).toBe('/login?error=account_exists')
    expect(cookieHeader(res, SESSION_COOKIE)).toBeUndefined()
    expect(await prisma.authAccount.count()).toBe(0)
  })

  it('rejects an unverified Google email', async () => {
    nextProfile = { ...profile, emailVerified: false }
    const { state, cookie } = await startFlow()
    const res = await callback(`code=abc&state=${state}`, cookie)
    expect(res.headers.location).toBe('/login?error=email_unverified')
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('findOrCreateGoogleUser', () => {
  it('creates, then finds, the same user', async () => {
    const created = await findOrCreateGoogleUser(profile)
    const found = await findOrCreateGoogleUser(profile)
    expect(found.id).toBe(created.id)
    expect(created).toMatchObject({ email: 'gina@example.com', name: 'Gina', avatarUrl: profile.picture })
  })

  it('handles concurrent first sign-ins for the same account', async () => {
    const results = await Promise.allSettled([findOrCreateGoogleUser(profile), findOrCreateGoogleUser(profile)])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await prisma.user.count()).toBe(1)
  })

  it('looks up by Google id, even if the email differs now', async () => {
    const created = await findOrCreateGoogleUser(profile)
    const found = await findOrCreateGoogleUser({ ...profile, email: 'new-address@example.com' })
    expect(found.id).toBe(created.id)
  })
})
