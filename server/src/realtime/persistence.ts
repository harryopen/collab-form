import * as Y from 'yjs'
import { prisma } from '../db/prisma.js'

// Updates accumulated since the last snapshot before the registry compacts (task 5.2).
export const COMPACT_THRESHOLD = 200

export interface LoadedDoc {
  ydoc: Y.Doc
  // DocumentUpdate rows applied on top of the snapshot; drives the compaction threshold.
  updateCount: number
}

// Callers must apply the update to their in-memory Y.Doc first, then call this (D17).
export async function appendUpdate(documentId: string, data: Uint8Array): Promise<number> {
  const row = await prisma.documentUpdate.create({
    data: { documentId, data: Buffer.from(data) },
    select: { id: true },
  })
  return row.id
}

// Current content = snapshot state + every update row in id order, applied to a fresh Y.Doc.
export async function loadDoc(documentId: string): Promise<LoadedDoc> {
  const [snapshot, updates] = await Promise.all([
    prisma.documentSnapshot.findUnique({ where: { documentId }, select: { state: true } }),
    prisma.documentUpdate.findMany({
      where: { documentId },
      orderBy: { id: 'asc' },
      select: { data: true },
    }),
  ])
  const ydoc = new Y.Doc()
  ydoc.transact(() => {
    if (snapshot) Y.applyUpdate(ydoc, snapshot.state)
    for (const update of updates) Y.applyUpdate(ydoc, update.data)
  })
  return { ydoc, updateCount: updates.length }
}

// One compaction at a time per document.
const locks = new Map<string, Promise<unknown>>()

function withLock<T>(documentId: string, task: () => Promise<T>): Promise<T> {
  const run = (locks.get(documentId) ?? Promise.resolve()).then(task, task)
  const tail = run.catch(() => undefined)
  locks.set(documentId, tail)
  void tail.then(() => {
    if (locks.get(documentId) === tail) locks.delete(documentId)
  })
  return run
}

// Folds every update up to the current max id into the snapshot. `ydoc` must be the live
// in-memory doc, which already contains every row that exists (updates are applied before
// they are inserted), so a row inserted mid-compaction has an id above `maxId` and survives.
// Returns false, writing nothing, if the document no longer exists.
export function compact(documentId: string, ydoc: Y.Doc): Promise<boolean> {
  return withLock(documentId, async () => {
    const newest = await prisma.documentUpdate.aggregate({
      where: { documentId },
      _max: { id: true },
    })
    const maxId = newest._max.id
    if (maxId === null) return true // nothing to fold

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc))
    try {
      return await prisma.$transaction(async (tx) => {
        const exists = await tx.document.findUnique({ where: { id: documentId }, select: { id: true } })
        if (!exists) return false
        await tx.documentSnapshot.upsert({
          where: { documentId },
          create: { documentId, state },
          update: { state },
        })
        await tx.documentUpdate.deleteMany({ where: { documentId, id: { lte: maxId } } })
        return true
      })
    } catch (err) {
      // Document deleted between the check and the write (foreign-key violation).
      if ((err as { code?: string }).code === 'P2003') return false
      throw err
    }
  })
}
