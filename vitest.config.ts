import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: {
    '@pricecatcher': fileURLToPath(new URL('./src/pricecatcher', import.meta.url)),
    '@saves': fileURLToPath(new URL('./src/saves', import.meta.url))
  } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/saves/**/*.test.tsx', 'jsdom']],
    setupFiles: ['src/saves/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
