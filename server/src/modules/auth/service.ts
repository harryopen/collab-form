import { prisma } from '../../db/prisma.js'
import { AppError } from '../../middleware/error.js'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js'
import type { LoginInput, SignupInput } from './schemas.js'

export interface PublicUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

const publicUserSelect = { id: true, email: true, name: true, avatarUrl: true } as const

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002'
}

export async function signup({ email, name, password }: SignupInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(password)
  try {
    return await prisma.user.create({
      data: { email, name, passwordHash },
      select: publicUserSelect,
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    throw err
  }
}

export async function login({ email, password }: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email } })
  // Google-only accounts have no password hash; treat them like unknown emails.
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password)
  if (!user || !user.passwordHash || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
  }
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
}

export function getUserById(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect })
}
