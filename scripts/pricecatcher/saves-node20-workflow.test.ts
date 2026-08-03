import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Saves Node 20 workflow', () => {
  it('provides a clean Node 20 compatibility gate', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/saves-node20.yml', import.meta.url), 'utf8')

    expect(workflow).toContain("node-version: '20'")
    expect(workflow).toContain('- run: npm ci')
    expect(workflow).toContain('- run: npm run typecheck:saves')
    expect(workflow).toContain('npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts')
  })
})
