import cookieParser from 'cookie-parser'
import express from 'express'
import { prisma } from './db/prisma.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  app.use(express.json())
  app.use(cookieParser())

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok', db: 'ok' })
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' })
    }
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
