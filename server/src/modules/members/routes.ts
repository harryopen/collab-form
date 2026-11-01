import { Router } from 'express'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { idParamsSchema } from '../documents/schemas.js'
import { addMemberSchema, memberParamsSchema, updateMemberSchema } from './schemas.js'
import { addMember, listMembers, removeMember, updateMemberRole } from './service.js'

// Mounted at /api/documents/:id/members, after requireAuth. Owner only.
export function createMembersRouter() {
  const router = Router({ mergeParams: true })

  router.get('/', validate({ params: idParamsSchema }), requireRole('owner'), async (req, res) => {
    res.json({ members: await listMembers(req.params.id as string) })
  })

  router.post(
    '/',
    validate({ params: idParamsSchema, body: addMemberSchema }),
    requireRole('owner'),
    async (req, res) => {
      const member = await addMember(req.params.id as string, req.userId!, req.body.email, req.body.role)
      res.status(201).json({ member })
    },
  )

  router.patch(
    '/:userId',
    validate({ params: memberParamsSchema, body: updateMemberSchema }),
    requireRole('owner'),
    async (req, res) => {
      res.json({ member: await updateMemberRole(req.params.id as string, req.params.userId as string, req.body.role) })
    },
  )

  router.delete('/:userId', validate({ params: memberParamsSchema }), requireRole('owner'), async (req, res) => {
    await removeMember(req.params.id as string, req.params.userId as string)
    res.status(204).end()
  })

  return router
}
