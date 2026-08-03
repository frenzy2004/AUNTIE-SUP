import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('Saves Node 20 workflow', () => {
  it('provides a clean Node 20 compatibility gate', async () => {
    const workflow = JSON.parse(await readFile(new URL('../../.github/workflows/saves-node20.yml', import.meta.url), 'utf8'))

    const steps = workflow.jobs['saves-node20'].steps
    expect(workflow.on.push).toEqual({ branches: ['UPGRADES'] })
    expect(workflow.on.pull_request).toEqual({ paths: [
      'package.json', 'package-lock.json', 'src/saves/**', 'src/pricecatcher/**', 'scripts/pricecatcher/**',
      'tsconfig.saves.json', 'tsconfig.pricecatcher.json', 'tsconfig.pricecatcher-node.json', 'tsconfig.saves-e2e.json',
      'vitest.config.ts', 'vitest.saves.config.ts', '.github/workflows/saves-node20.yml'
    ] })
    expect(new Set(workflow.on.pull_request.paths).size).toBe(workflow.on.pull_request.paths.length)
    const setupNodeSteps = steps.filter((step: { uses?: unknown }) =>
      typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@'))
    expect(setupNodeSteps).toHaveLength(1)
    expect(setupNodeSteps[0]).toEqual({ uses: 'actions/setup-node@v4', with: { 'node-version': '20' } })
    expect(steps.filter((step: Record<string, string>) => 'run' in step).map((step: { run: string }) => step.run)).toEqual([
      'npm ci',
      'npm run typecheck:saves',
      'npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts'
    ])
  })

  it('runs a Node PriceCatcher entrypoint through its package command', async () => {
    // Break caught: a Node entrypoint relies on a TypeScript path alias that tsx cannot resolve at runtime.
    const child = spawn('npm', ['run', 'data:saves:smoke'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += String(chunk) })
    child.stderr.on('data', chunk => { output += String(chunk) })
    const exitCode = await new Promise<number | null>(resolve => child.on('close', resolve))

    expect(exitCode).toBe(0)
    expect(output).toContain('pricecatcher-runtime-smoke')
  })
})
