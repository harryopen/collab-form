import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { CookieOptions, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { env, googleEnabled } from '../../config/env.js'

export interface GoogleProfile {
  sub: string
  email: string
  emailVerified: boolean
  name: string
  picture: string | null
}

// Turns an authorization code into a verified Google profile. Injectable so tests
// do not call Google.
export type ExchangeCode = (code: string) => Promise<GoogleProfile>

export const GOOGLE_PATH = '/api/auth/google'
export const STATE_COOKIE = 'oauth_state'
const STATE_MAX_AGE_MS = 10 * 60 * 1000

function client() {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  })
}

export function googleAuthUrl(state: string): string {
  return client().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  })
}

export const exchangeGoogleCode: ExchangeCode = async (code) => {
  const oauth = client()
  const { tokens } = await oauth.getToken(code)
  if (!tokens.id_token) throw new Error('Google returned no ID token')
  // verifyIdToken checks signature, expiry, issuer and that `aud` is our client ID.
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID })
  const payload = ticket.getPayload()
  if (!payload?.sub || !payload.email) throw new Error('ID token is missing sub or email')
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name || payload.email,
    picture: payload.picture ?? null,
  }
}

export { googleEnabled }

// The state cookie is scoped to the OAuth path so it is never sent to other routes.
const stateCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: GOOGLE_PATH,
}

export function startOAuthState(res: Response): string {
  const state = randomBytes(32).toString('base64url')
  res.cookie(STATE_COOKIE, state, { ...stateCookieOptions, maxAge: STATE_MAX_AGE_MS })
  return state
}

export function clearOAuthState(res: Response) {
  res.clearCookie(STATE_COOKIE, stateCookieOptions)
}

export function stateMatches(cookieValue: unknown, queryValue: unknown): boolean {
  if (typeof cookieValue !== 'string' || typeof queryValue !== 'string' || !cookieValue) return false
  const a = Buffer.from(cookieValue)
  const b = Buffer.from(queryValue)
  return a.length === b.length && timingSafeEqual(a, b)
}
