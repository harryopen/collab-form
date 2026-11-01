import type { DocumentRole } from '../permissions/getRole.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      // Set by requireRole on document routes.
      role?: DocumentRole
    }
  }
}
