import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const workflowSteps = (yaml: string): Array<Record<string, string>> => yaml.split('\n').flatMap(line => {
  const match = /^      - (uses|run): (.+)$/.exec(line)
  return match ? [{ [match[1]]: match[2] }] : []
})

const workflowPaths = (yaml: string): string[] => yaml.split('\n').flatMap(line => {
  const match = /^      - '([^']+)'$/.exec(line)
  return match ? [match[1]] : []
})

describe('Saves Node 20 workflow', () => {
  it('provides a clean Node 20 compatibility gate', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/saves-node20.yml', import.meta.url), 'utf8')

    const steps = workflowSteps(workflow)
    expect(steps).toContainEqual({ uses: 'actions/setup-node@v4' })
    expect(workflow.match(/^          node-version: '20'$/m)).toHaveLength(1)
    expect(steps.filter(step => 'run' in step).map(step => step.run)).toEqual([
      'npm ci',
      'npm run typecheck:saves',
      'npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts'
    ])
    expect(workflowPaths(workflow)).toEqual(expect.arrayContaining([
      'package.json', 'package-lock.json', 'src/saves/**', 'src/pricecatcher/**', 'scripts/pricecatcher/**',
      'tsconfig.saves.json', 'tsconfig.pricecatcher.json', 'tsconfig.pricecatcher-node.json', 'tsconfig.saves-e2e.json',
      'vitest.config.ts', 'vitest.saves.config.ts', '.github/workflows/saves-node20.yml'
    ]))
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
