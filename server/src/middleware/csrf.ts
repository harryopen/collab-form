import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { AppError } from './error.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// CSRF defence without tokens: state-changing requests must come from an allowed
// Origin and be JSON (a cross-site form cannot send application/json without a
// preflight, which the API does not allow). The API has no state-changing GETs.
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const origin = req.get('origin')
  if (!origin || !env.CLIENT_ORIGINS.includes(origin)) {
    next(new AppError(403, 'FORBIDDEN', 'Origin not allowed'))
    return
  }
  if (!req.is('application/json')) {
    next(new AppError(415, 'VALIDATION_ERROR', 'Content-Type must be application/json'))
    return
  }
  next()
}
