import { z } from 'zod'

const title = z.string().trim().min(1).max(200)

export const idParamsSchema = z.object({ id: z.string().min(1).max(64) })

export const createDocumentSchema = z.object({ title: title.optional() })

export const updateDocumentSchema = z
  .object({
    title: title.optional(),
    shareMode: z.enum(['OFF', 'VIEWER', 'EDITOR']).optional(),
  })
  .refine((body) => body.title !== undefined || body.shareMode !== undefined, {
    message: 'Provide a title or a shareMode',
  })

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
