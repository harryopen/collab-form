import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  // Google login is optional; all three must be set together to enable it.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  console.error(`Invalid environment configuration (see server/.env.example):\n${problems}`)
  process.exit(1)
}

export const env = parsed.data

const googleSettings = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI]
if (googleSettings.some(Boolean) && !googleSettings.every(Boolean)) {
  console.error('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI together, or none of them.')
  process.exit(1)
}

export const googleEnabled = googleSettings.every(Boolean)
