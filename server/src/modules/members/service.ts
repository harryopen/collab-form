import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../db/prisma.js'
import { AppError } from '../../middleware/error.js'

const memberSelect = {
  role: true,
  user: { select: { id: true, name: true, email: true } },
} as const

function present(member: { role: 'EDITOR' | 'VIEWER'; user: { id: string; name: string; email: string } }) {
  return { userId: member.user.id, name: member.user.name, email: member.user.email, role: member.role }
}

export async function listMembers(documentId: string) {
  const members = await prisma.documentMember.findMany({
    where: { documentId },
    orderBy: { user: { name: 'asc' } },
    select: memberSelect,
  })
  return members.map(present)
}

// The invitee must already have an account. The owner already has full access, so
// they cannot be added as a member.
export async function addMember(documentId: string, ownerId: string, email: string, role: 'EDITOR' | 'VIEWER') {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'No user with that email')
  if (user.id === ownerId) throw new AppError(400, 'VALIDATION_ERROR', 'The owner already has full access')
  try {
    const member = await prisma.documentMember.create({
      data: { documentId, userId: user.id, role },
      select: memberSelect,
    })
    return present(member)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'ALREADY_MEMBER', 'That user is already a member')
    }
    throw err
  }
}

export async function updateMemberRole(documentId: string, userId: string, role: 'EDITOR' | 'VIEWER') {
  try {
    const member = await prisma.documentMember.update({
      where: { documentId_userId: { documentId, userId } },
      data: { role },
      select: memberSelect,
    })
    return present(member)
  } catch (err) {
    throw notFoundIfMissing(err)
  }
}

export async function removeMember(documentId: string, userId: string) {
  try {
    await prisma.documentMember.delete({ where: { documentId_userId: { documentId, userId } } })
  } catch (err) {
    throw notFoundIfMissing(err)
  }
}

function notFoundIfMissing(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new AppError(404, 'NOT_FOUND', 'Member not found')
  }
  return err
}
