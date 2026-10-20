import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: parse(readFileSync(new URL('./.env.test', import.meta.url))),
    globalSetup: ['./test/global-setup.ts'],
    // All test files share one database, so they must run one at a time.
    fileParallelism: false,
  },
})
