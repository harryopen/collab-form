import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'

interface Schemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

// Parses the request against Zod schemas. Parsed values replace the raw ones,
// so handlers only ever see validated (and stripped) data.
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params
      if (schemas.query) {
        Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
