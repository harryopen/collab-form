import express from 'express'
import { prisma } from './db/prisma.js'

export function createApp() {
  const app = express()

  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok', db: 'ok' })
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' })
    }
  })

  return app
}
