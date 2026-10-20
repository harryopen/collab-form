import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { prisma } from './db/prisma.js'
import { csrfProtection } from './middleware/csrf.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { createAuthRouter } from './modules/auth/routes.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api', csrfProtection)

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok', db: 'ok' })
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' })
    }
  })

  app.use('/api/auth', createAuthRouter())

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
