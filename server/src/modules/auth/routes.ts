import { Router, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireAuth } from '../../middleware/auth.js'
import { AppError } from '../../middleware/error.js'
import { validate } from '../../middleware/validate.js'
import {
  clearOAuthState,
  exchangeGoogleCode,
  googleAuthUrl,
  googleEnabled,
  startOAuthState,
  stateMatches,
  STATE_COOKIE,
  type ExchangeCode,
} from './google.js'
import { loginSchema, signupSchema } from './schemas.js'
import { findOrCreateGoogleUser, getUserById, login, signup } from './service.js'
import { clearSessionCookie, setSessionCookie } from './session.js'

function limiter(options: { windowMs: number; limit: number; skipSuccessfulRequests?: boolean }) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later')),
  })
}

// Limiters are created per router, so each app instance (and each test) has its own counters.
// The Google flow is a browser redirect, so failures send the user back to the login
// page with a short error code instead of returning JSON.
function loginError(res: Response, code: string) {
  res.redirect(`/login?error=${code}`)
}

export function createAuthRouter({ exchangeCode = exchangeGoogleCode }: { exchangeCode?: ExchangeCode } = {}) {
  const router = Router()

  const signupLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20 })
  const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true })

  router.post('/signup', signupLimiter, validate({ body: signupSchema }), async (req, res) => {
    const user = await signup(req.body)
    setSessionCookie(res, user.id)
    res.status(201).json({ user })
  })

  router.post('/login', loginLimiter, validate({ body: loginSchema }), async (req, res) => {
    const user = await login(req.body)
    setSessionCookie(res, user.id)
    res.json({ user })
  })

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res)
    res.status(204).end()
  })

  router.get('/me', requireAuth, async (req, res) => {
    const user = await getUserById(req.userId!)
    if (!user) {
      clearSessionCookie(res)
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required')
    }
    res.json({ user })
  })

  router.get('/google', (_req, res) => {
    if (!googleEnabled) return loginError(res, 'google_not_configured')
    res.redirect(googleAuthUrl(startOAuthState(res)))
  })

  router.get('/google/callback', async (req, res) => {
    if (!googleEnabled) return loginError(res, 'google_not_configured')

    const stateOk = stateMatches(req.cookies?.[STATE_COOKIE], req.query.state)
    clearOAuthState(res) // single use, whatever happens next
    if (!stateOk) return loginError(res, 'invalid_state')
    if (req.query.error === 'access_denied') return loginError(res, 'access_denied')
    if (typeof req.query.code !== 'string' || !req.query.code) return loginError(res, 'google_failed')

    try {
      const profile = await exchangeCode(req.query.code)
      const user = await findOrCreateGoogleUser(profile)
      setSessionCookie(res, user.id)
      res.redirect('/')
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === 'ACCOUNT_EXISTS') return loginError(res, 'account_exists')
        if (err.code === 'EMAIL_UNVERIFIED') return loginError(res, 'email_unverified')
      }
      console.error('Google sign-in failed:', err instanceof Error ? err.message : err)
      loginError(res, 'google_failed')
    }
  })

  return router
}
