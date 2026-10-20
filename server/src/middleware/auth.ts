import type { RequestHandler } from 'express'
import { SESSION_COOKIE, verifySession } from '../modules/auth/session.js'
import { AppError } from './error.js'

// Sets req.userId from the session cookie, or fails with 401.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE]
  const session = typeof token === 'string' ? verifySession(token) : null
  if (!session) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'))
    return
  }
  req.userId = session.userId
  next()
}
