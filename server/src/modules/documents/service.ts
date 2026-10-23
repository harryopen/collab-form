import { prisma } from '../../db/prisma.js'
import { AppError } from '../../middleware/error.js'
import { resolveRole, type DocumentRole } from '../../permissions/getRole.js'
import type { UpdateDocumentInput } from './schemas.js'

const documentSelect = {
  id: true,
  title: true,
  shareMode: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
} as const

function present<T extends { ownerId: string }>(doc: T, role: DocumentRole) {
  const { ownerId: _ownerId, ...rest } = doc
  return { ...rest, role }
}

// Documents the user owns or was invited to, newest activity first. Documents that
// are only reachable through a share link are not listed (they have no membership row).
export async function listDocuments(userId: string) {
  const docs = await prisma.document.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { updatedAt: 'desc' },
    select: { ...documentSelect, members: { where: { userId }, select: { role: true }, take: 1 } },
  })
  return docs.map(({ members, ...doc }) => {
    const role = resolveRole(userId, { ownerId: doc.ownerId, shareMode: doc.shareMode, memberRole: members[0]?.role ?? null })
    return present(doc, role!)
  })
}

export async function createDocument(userId: string, title?: string) {
  const doc = await prisma.document.create({
    data: { ownerId: userId, ...(title ? { title } : {}) },
    select: documentSelect,
  })
  return present(doc, 'owner')
}

// The role has already been resolved (and checked) by requireRole.
export async function getDocument(id: string, role: DocumentRole) {
  const doc = await prisma.document.findUnique({ where: { id }, select: documentSelect })
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found')
  return present(doc, role)
}

export async function updateDocument(id: string, role: DocumentRole, patch: UpdateDocumentInput) {
  // Only the owner controls sharing; editors may rename. Checked before writing anything.
  if (patch.shareMode !== undefined && role !== 'owner') {
    throw new AppError(403, 'FORBIDDEN', 'Only the owner can change sharing')
  }
  const doc = await prisma.document.update({ where: { id }, data: patch, select: documentSelect })
  return present(doc, role)
}

export async function deleteDocument(id: string) {
  await prisma.document.delete({ where: { id } })
}
