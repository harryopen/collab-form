import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { createMembersRouter } from '../members/routes.js'
import { createDocumentSchema, idParamsSchema, updateDocumentSchema } from './schemas.js'
import { createDocument, deleteDocument, getDocument, listDocuments, updateDocument } from './service.js'

export function createDocumentsRouter() {
  const router = Router()
  router.use(requireAuth)

  router.use('/:id/members', createMembersRouter())

  router.get('/', async (req, res) => {
    res.json({ documents: await listDocuments(req.userId!) })
  })

  router.post('/', validate({ body: createDocumentSchema }), async (req, res) => {
    res.status(201).json({ document: await createDocument(req.userId!, req.body.title) })
  })

  router.get('/:id', validate({ params: idParamsSchema }), requireRole('viewer'), async (req, res) => {
    res.json({ document: await getDocument(req.params.id as string, req.role!) })
  })

  router.patch(
    '/:id',
    validate({ params: idParamsSchema, body: updateDocumentSchema }),
    requireRole('editor'),
    async (req, res) => {
      res.json({ document: await updateDocument(req.params.id as string, req.role!, req.body) })
    },
  )

  router.delete('/:id', validate({ params: idParamsSchema }), requireRole('owner'), async (req, res) => {
    await deleteDocument(req.params.id as string)
    res.status(204).end()
  })

  return router
}
