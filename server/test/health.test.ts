import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createTestApp, resetDb } from './helpers.js'

const app = createTestApp()

beforeEach(resetDb)
afterAll(closeDb)

describe('GET /api/health', () => {
  it('reports ok with a working database', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', db: 'ok' })
  })
})
