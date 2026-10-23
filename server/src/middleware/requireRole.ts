import type { RequestHandler } from 'express'
import { getRole, hasRole, type DocumentRole } from '../permissions/getRole.js'
import { AppError } from './error.js'

// Guards routes with an :id document param. Must run after requireAuth.
// No access at all -> 404 (hides that the document exists); a role that is
// too low -> 403.
export function requireRole(minimum: DocumentRole): RequestHandler {
  return async (req, _res, next) => {
    try {
      const role = await getRole(req.userId!, req.params.id as string)
      if (!role) throw new AppError(404, 'NOT_FOUND', 'Document not found')
      if (!hasRole(role, minimum)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that')
      req.role = role
      next()
    } catch (err) {
      next(err)
    }
  }
}
