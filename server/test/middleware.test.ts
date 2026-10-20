import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { requireAuth } from '../src/middleware/auth.js'
import { AppError, errorHandler, notFoundHandler } from '../src/middleware/error.js'
import { validate } from '../src/middleware/validate.js'
import { SESSION_COOKIE, signSession } from '../src/modules/auth/session.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.post('/echo', validate({ body: z.object({ name: z.string().min(1) }) }), (req, res) => {
    res.json(req.body)
  })
  app.get('/me', requireAuth, (req, res) => {
    res.json({ userId: req.userId })
  })
  app.get('/boom', () => {
    throw new Error('secret internals')
  })
  app.get('/forbidden', () => {
    throw new AppError(403, 'FORBIDDEN', 'Nope')
  })
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = buildApp()

describe('validate', () => {
  it('passes valid bodies and strips unknown keys', async () => {
    const res = await request(app).post('/echo').send({ name: 'Ann', extra: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'Ann' })
  })

  it('returns VALIDATION_ERROR for an invalid body', async () => {
    const res = await request(app).post('/echo').send({ name: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns VALIDATION_ERROR for malformed JSON', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{bad')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('requireAuth', () => {
  it('rejects requests without a cookie', async () => {
    const res = await request(app).get('/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/me').set('Cookie', `${SESSION_COOKIE}=garbage`)
    expect(res.status).toBe(401)
  })

  it('accepts a valid session cookie', async () => {
    const res = await request(app).get('/me').set('Cookie', `${SESSION_COOKIE}=${signSession('user-1')}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-1' })
  })
})

describe('error handling', () => {
  it('uses the { error: { code, message } } shape for AppError', async () => {
    const res = await request(app).get('/forbidden')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Nope' } })
  })

  it('hides internals on unexpected errors', async () => {
    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(res.body)).not.toContain('secret internals')
  })

  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
