import argon2 from 'argon2'

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false)
}

// Verified against when the email is unknown, so "no such user" and "wrong
// password" take about the same time and cannot be told apart by timing.
export const DUMMY_HASH = await hashPassword('dummy-password-for-timing')
