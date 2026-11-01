import type { ShareMode } from '../generated/prisma/client.js'
import { prisma } from '../db/prisma.js'

export type DocumentRole = 'owner' | 'editor' | 'viewer'

export const ROLE_RANK: Record<DocumentRole, number> = { viewer: 1, editor: 2, owner: 3 }

export function hasRole(actual: DocumentRole | null, required: DocumentRole): actual is DocumentRole {
  return actual !== null && ROLE_RANK[actual] >= ROLE_RANK[required]
}

interface RoleInputs {
  ownerId: string
  shareMode: ShareMode
  memberRole: 'EDITOR' | 'VIEWER' | null
}

// Share-link access is switched on in task 6.4; until then shareMode counts as OFF.
const SHARE_LINKS_ENABLED = false

// Pure resolution rules, separate from the DB lookup so the whole matrix is testable:
// owner first, then an explicit membership (which beats the link mode), then the
// document's share-link mode for any other signed-in user.
export function resolveRole(
  userId: string,
  { ownerId, shareMode, memberRole }: RoleInputs,
  shareLinksEnabled = SHARE_LINKS_ENABLED,
): DocumentRole | null {
  if (ownerId === userId) return 'owner'
  if (memberRole) return memberRole === 'EDITOR' ? 'editor' : 'viewer'
  if (shareLinksEnabled && shareMode === 'EDITOR') return 'editor'
  if (shareLinksEnabled && shareMode === 'VIEWER') return 'viewer'
  return null
}

// The single permission check, used by REST middleware and every socket event.
// null means "no access", including a document that does not exist.
export async function getRole(userId: string, documentId: string): Promise<DocumentRole | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      ownerId: true,
      shareMode: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  })
  if (!doc) return null
  return resolveRole(userId, {
    ownerId: doc.ownerId,
    shareMode: doc.shareMode,
    memberRole: doc.members[0]?.role ?? null,
  })
}
