import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const signupSchema = z.object({
  email,
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
