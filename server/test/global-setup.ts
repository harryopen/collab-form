import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'

// Runs once before all test files: bring collabdocs_test up to the latest migration.
// Vitest's `test.env` is not visible here, so load .env.test explicitly.
export default function setup() {
  const testEnv = parse(readFileSync(new URL('../.env.test', import.meta.url)))
  execSync('npx prisma migrate deploy', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...testEnv },
    stdio: 'inherit',
  })
}
