import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/prisma.js'
import type { ShareMode } from '../src/generated/prisma/client.js'
import { getRole, hasRole, resolveRole, type DocumentRole } from '../src/permissions/getRole.js'
import { closeDb, resetDb } from './helpers.js'

beforeEach(resetDb)
afterAll(closeDb)

describe('resolveRole matrix', () => {
  const OWNER = 'owner-id'
  const roles = ['owner', 'editor', 'viewer', 'stranger'] as const
  const modes: ShareMode[] = ['OFF', 'VIEWER', 'EDITOR']

  // [user, shareMode] -> expected role, with share links enabled (task 6.4).
  const expected: Record<(typeof roles)[number], Record<ShareMode, DocumentRole | null>> = {
    owner: { OFF: 'owner', VIEWER: 'owner', EDITOR: 'owner' },
    editor: { OFF: 'editor', VIEWER: 'editor', EDITOR: 'editor' }, // explicit member wins over the link
    viewer: { OFF: 'viewer', VIEWER: 'viewer', EDITOR: 'viewer' }, // ...even when the link is more generous
    stranger: { OFF: null, VIEWER: 'viewer', EDITOR: 'editor' },
  }

  const inputs = (who: (typeof roles)[number], shareMode: ShareMode) => ({
    userId: who === 'owner' ? OWNER : 'user-id',
    data: {
      ownerId: OWNER,
      shareMode,
      memberRole: who === 'editor' ? ('EDITOR' as const) : who === 'viewer' ? ('VIEWER' as const) : null,
    },
  })

  for (const who of roles) {
    for (const mode of modes) {
      it(`${who} with shareMode ${mode}`, () => {
        const { userId, data } = inputs(who, mode)
        expect(resolveRole(userId, data, true)).toBe(expected[who][mode])
      })
    }
  }

  it('treats shareMode as OFF while share links are disabled (default until 6.4)', () => {
    const { userId, data } = inputs('stranger', 'EDITOR')
    expect(resolveRole(userId, data)).toBeNull()
  })
})

describe('hasRole', () => {
  it('orders viewer < editor < owner and rejects null', () => {
    expect(hasRole('owner', 'editor')).toBe(true)
    expect(hasRole('editor', 'editor')).toBe(true)
    expect(hasRole('viewer', 'editor')).toBe(false)
    expect(hasRole('editor', 'owner')).toBe(false)
    expect(hasRole(null, 'viewer')).toBe(false)
  })
})

describe('getRole (database)', () => {
  async function setup() {
    const [owner, editor, viewer, stranger] = await Promise.all(
      ['owner', 'editor', 'viewer', 'stranger'].map((name) =>
        prisma.user.create({ data: { email: `${name}@example.com`, name } }),
      ),
    )
    const doc = await prisma.document.create({
      data: {
        ownerId: owner!.id,
        shareMode: 'EDITOR',
        members: {
          create: [
            { userId: editor!.id, role: 'EDITOR' },
            { userId: viewer!.id, role: 'VIEWER' },
          ],
        },
      },
    })
    return { owner: owner!, editor: editor!, viewer: viewer!, stranger: stranger!, doc }
  }

  it('resolves owner, editor, viewer and stranger', async () => {
    const { owner, editor, viewer, stranger, doc } = await setup()
    expect(await getRole(owner.id, doc.id)).toBe('owner')
    expect(await getRole(editor.id, doc.id)).toBe('editor')
    expect(await getRole(viewer.id, doc.id)).toBe('viewer')
    // shareMode is EDITOR, but link access is not enabled yet
    expect(await getRole(stranger.id, doc.id)).toBeNull()
  })

  it('returns null for a missing document or a malformed id', async () => {
    const { owner } = await setup()
    expect(await getRole(owner.id, 'does-not-exist')).toBeNull()
    expect(await getRole(owner.id, '')).toBeNull()
  })

  it('reflects a role change immediately', async () => {
    const { editor, doc } = await setup()
    await prisma.documentMember.update({
      where: { documentId_userId: { documentId: doc.id, userId: editor.id } },
      data: { role: 'VIEWER' },
    })
    expect(await getRole(editor.id, doc.id)).toBe('viewer')
    await prisma.documentMember.delete({
      where: { documentId_userId: { documentId: doc.id, userId: editor.id } },
    })
    expect(await getRole(editor.id, doc.id)).toBeNull()
  })
})

describe('cascades', () => {
  it('deleting a document removes its members; deleting a user removes owned documents', async () => {
    const owner = await prisma.user.create({ data: { email: 'o@example.com', name: 'O' } })
    const member = await prisma.user.create({ data: { email: 'm@example.com', name: 'M' } })
    const doc = await prisma.document.create({
      data: { ownerId: owner.id, members: { create: { userId: member.id, role: 'VIEWER' } } },
    })

    await prisma.document.delete({ where: { id: doc.id } })
    expect(await prisma.documentMember.count()).toBe(0)
    expect(await prisma.user.count()).toBe(2)

    await prisma.document.create({ data: { ownerId: owner.id } })
    await prisma.user.delete({ where: { id: owner.id } })
    expect(await prisma.document.count()).toBe(0)
  })
})
