import { parse } from 'cookie'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'socket.io'
import { env } from '../config/env.js'
import { prisma } from '../db/prisma.js'
import { SESSION_COOKIE, verifySession } from '../modules/auth/session.js'

export interface SocketData {
  userId: string
  // Epoch ms when the session JWT expires; checked again on every update.
  expiresAt: number
}

// Same rule as the REST CSRF check: the handshake must come from an allowed Origin.
// Browsers always send it on WebSocket upgrades, so a missing one is rejected too.
export function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return typeof origin === 'string' && env.CLIENT_ORIGINS.includes(origin)
}

// Socket.IO middleware: reads the session cookie from the handshake.
export async function authenticate(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = parse(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE]
    const session = token ? verifySession(token) : null
    if (!session) return next(new Error('UNAUTHENTICATED'))

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } })
    if (!user) return next(new Error('UNAUTHENTICATED'))

    const data: SocketData = { userId: user.id, expiresAt: session.expiresAt }
    Object.assign(socket.data, data)
    next()
  } catch {
    next(new Error('INTERNAL_ERROR'))
  }
}
