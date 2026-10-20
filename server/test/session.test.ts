import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import { env } from '../src/config/env.js'
import { signSession, verifySession } from '../src/modules/auth/session.js'

describe('session tokens', () => {
  it('round-trips a user id', () => {
    const session = verifySession(signSession('user-1'))
    expect(session?.userId).toBe('user-1')
    expect(session!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-1' }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 })
    expect(verifySession(token)).toBeNull()
  })

  it('rejects a tampered token', () => {
    const [header, payload, sig] = signSession('user-1').split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'user-2', exp: 9999999999 })).toString('base64url')
    expect(verifySession(`${header}.${forged}.${sig}`)).toBeNull()
    expect(verifySession(`${header}.${payload}.x${sig}`)).toBeNull()
  })

  it('rejects a token signed with another secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'some-other-secret-some-other-secret', { algorithm: 'HS256' })
    expect(verifySession(token)).toBeNull()
  })

  it('rejects alg=none and other algorithms', () => {
    const none = jwt.sign({ sub: 'user-1' }, '', { algorithm: 'none' })
    const hs512 = jwt.sign({ sub: 'user-1' }, env.JWT_SECRET, { algorithm: 'HS512' })
    expect(verifySession(none)).toBeNull()
    expect(verifySession(hs512)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(verifySession('not-a-jwt')).toBeNull()
    expect(verifySession('')).toBeNull()
  })
})
