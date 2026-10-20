import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireAuth } from '../../middleware/auth.js'
import { AppError } from '../../middleware/error.js'
import { validate } from '../../middleware/validate.js'
import { loginSchema, signupSchema } from './schemas.js'
import { getUserById, login, signup } from './service.js'
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
export function createAuthRouter() {
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

  return router
}
