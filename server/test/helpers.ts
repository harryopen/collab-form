import { prisma } from '../src/db/prisma.js'
import { createApp } from '../src/app.js'

export function createTestApp(options: Parameters<typeof createApp>[0] = {}) {
  return createApp(options)
}

// Empties every table except Prisma's migration history.
export async function resetDb() {
  if (!process.env.DATABASE_URL?.endsWith('_test')) {
    throw new Error('Refusing to reset a database that is not a *_test database')
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

export async function closeDb() {
  await prisma.$disconnect()
}
