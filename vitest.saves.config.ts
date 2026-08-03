import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: {
    '@pricecatcher': fileURLToPath(new URL('./src/pricecatcher', import.meta.url)),
    '@saves': fileURLToPath(new URL('./src/saves', import.meta.url))
  } },
  test: {
    include: ['src/pricecatcher/**/*.test.ts', 'scripts/pricecatcher/**/*.test.ts', 'src/saves/**/*.test.{ts,tsx}', 'data/pricecatcher/**/*.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [['src/saves/**/*.test.tsx', 'jsdom']],
    setupFiles: ['src/saves/test/setup.ts']
  }
})
