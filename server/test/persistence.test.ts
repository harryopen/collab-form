import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { prisma } from '../src/db/prisma.js'
import { appendUpdate, compact, loadDoc } from '../src/realtime/persistence.js'
import { closeDb, resetDb } from './helpers.js'

beforeEach(resetDb)
afterAll(closeDb)

async function createDocument() {
  const user = await prisma.user.create({ data: { email: 'o@example.com', name: 'Owner' } })
  return prisma.document.create({ data: { ownerId: user.id } })
}

// Edits `ydoc` and stores the resulting update, the same order the socket handler uses.
async function type(documentId: string, ydoc: Y.Doc, text: string) {
  let update!: Uint8Array
  ydoc.once('update', (u: Uint8Array) => (update = u))
  ydoc.getText('t').insert(ydoc.getText('t').length, text)
  await appendUpdate(documentId, update)
}

const rowCount = (documentId: string) => prisma.documentUpdate.count({ where: { documentId } })

describe('loadDoc', () => {
  it('returns an empty doc for a document with no history', async () => {
    const doc = await createDocument()
    const { ydoc, updateCount } = await loadDoc(doc.id)
    expect(ydoc.getText('t').toString()).toBe('')
    expect(updateCount).toBe(0)
  })

  it('rebuilds a doc from its updates in order', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    for (const word of ['one ', 'two ', 'three']) await type(doc.id, live, word)

    const { ydoc, updateCount } = await loadDoc(doc.id)
    expect(ydoc.getText('t').toString()).toBe('one two three')
    expect(updateCount).toBe(3)
  })
})

describe('compact', () => {
  it('keeps the decoded state identical with fewer rows', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    for (let i = 0; i < 10; i++) await type(doc.id, live, `${i},`)
    const before = (await loadDoc(doc.id)).ydoc.getText('t').toString()

    expect(await compact(doc.id, live)).toBe(true)

    expect(await rowCount(doc.id)).toBe(0)
    const after = await loadDoc(doc.id)
    expect(after.ydoc.getText('t').toString()).toBe(before)
    expect(after.updateCount).toBe(0)
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(1)
  })

  it('layers new updates on top of an existing snapshot', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    await type(doc.id, live, 'a')
    await compact(doc.id, live)
    await type(doc.id, live, 'b')
    await compact(doc.id, live)
    await type(doc.id, live, 'c')

    const { ydoc, updateCount } = await loadDoc(doc.id)
    expect(ydoc.getText('t').toString()).toBe('abc')
    expect(updateCount).toBe(1)
    expect(await prisma.documentSnapshot.count()).toBe(1)
  })

  it('leaves data intact if the transaction fails part-way', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    for (const word of ['x', 'y', 'z']) await type(doc.id, live, word)

    const real = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>) =>
      real((tx) =>
        fn({
          document: (tx as typeof prisma).document,
          documentSnapshot: (tx as typeof prisma).documentSnapshot,
          documentUpdate: {
            deleteMany: () => Promise.reject(new Error('boom')),
          },
        }),
      )) as never)

    await expect(compact(doc.id, live)).rejects.toThrow('boom')

    expect(await prisma.documentSnapshot.count()).toBe(0) // snapshot write rolled back too
    expect(await rowCount(doc.id)).toBe(3)
    expect((await loadDoc(doc.id)).ydoc.getText('t').toString()).toBe('xyz')
  })

  it('does not lose an update appended while compaction runs', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    for (let i = 0; i < 5; i++) await type(doc.id, live, `${i}`)

    // Start compaction and keep typing without waiting for it.
    const compaction = compact(doc.id, live)
    await type(doc.id, live, 'A')
    await type(doc.id, live, 'B')
    await compaction

    const { ydoc } = await loadDoc(doc.id)
    expect(ydoc.getText('t').toString()).toBe(live.getText('t').toString())
    expect(ydoc.getText('t').toString()).toContain('AB')
  })

  it('runs compactions for one document one at a time', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    for (let i = 0; i < 5; i++) await type(doc.id, live, `${i}`)

    const results = await Promise.all([compact(doc.id, live), compact(doc.id, live), compact(doc.id, live)])
    expect(results).toEqual([true, true, true])
    expect((await loadDoc(doc.id)).ydoc.getText('t').toString()).toBe('01234')
  })

  it('never compacts a deleted document', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    await type(doc.id, live, 'gone')
    await prisma.document.delete({ where: { id: doc.id } })

    expect(await compact(doc.id, live)).toBe(true) // no rows left, nothing to fold
    expect(await prisma.documentSnapshot.count()).toBe(0)
  })

  it('writes nothing when the document is deleted after the rows were read', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    await type(doc.id, live, 'racing')

    const real = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>) =>
      prisma.document.delete({ where: { id: doc.id } }).then(() => real(fn))) as never)

    expect(await compact(doc.id, live)).toBe(false)
    expect(await prisma.documentSnapshot.count()).toBe(0)
  })

  it('removes snapshot and updates when the document is deleted', async () => {
    const doc = await createDocument()
    const live = new Y.Doc()
    await type(doc.id, live, 'x')
    await compact(doc.id, live)
    await type(doc.id, live, 'y')
    await prisma.document.delete({ where: { id: doc.id } })

    expect(await prisma.documentSnapshot.count()).toBe(0)
    expect(await prisma.documentUpdate.count()).toBe(0)
  })
})
