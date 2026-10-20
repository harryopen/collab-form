import type { CookieOptions, Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../../config/env.js'

export const SESSION_COOKIE = 'session'
const SESSION_DAYS = 7
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60

const payloadSchema = z.object({ sub: z.string().min(1), exp: z.number() })

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: SESSION_SECONDS })
}

// Returns the session, or null for anything invalid, expired or tampered.
// The algorithm is pinned so `alg: none` / key-confusion tokens are rejected.
export function verifySession(token: string): { userId: string; expiresAt: number } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    const payload = payloadSchema.parse(decoded)
    return { userId: payload.sub, expiresAt: payload.exp * 1000 }
  } catch {
    return null
  }
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
}

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions)
}
