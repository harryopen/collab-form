import { z } from 'zod'
import { idParamsSchema } from '../documents/schemas.js'

const role = z.enum(['EDITOR', 'VIEWER'])

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role,
})

export const updateMemberSchema = z.object({ role })

export const memberParamsSchema = idParamsSchema.extend({ userId: z.string().min(1).max(64) })

export type AddMemberInput = z.infer<typeof addMemberSchema>
