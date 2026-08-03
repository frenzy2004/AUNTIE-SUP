# AUNTIE Saves PriceCatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a mobile-first AUNTIE Saves web application that turns recent PriceCatcher observations into fail-closed, trip-aware small-staples comparisons without exposing API keys or breaking the existing Electron app.

**Architecture:** Preserve the Electron product and add a separately built Vite/React web surface. Keep all PriceCatcher schemas, quality rules, money/date/distance arithmetic, compilation, and recommendation behavior in pure TypeScript under `src/pricecatcher`; keep network/filesystem adapters under `scripts/pricecatcher`; make the browser consume one versioned, same-origin static snapshot.

**Tech Stack:** TypeScript 5.7, React 19, Vite 5, Zod, csv-parse, Vitest 2, React Testing Library, jsdom, Playwright, axe-core, existing npm/Electron tooling.

## Global Constraints

- Work only on the existing `UPGRADES` branch. The user has explicitly requested that each verified focused commit be pushed to `origin/UPGRADES`; do not deploy or open a pull request unless the user separately requests it.
- Preserve the existing `dev`, `build`, `start`, and `test` commands and the current Electron behavior.
- `src/pricecatcher` must not import React, Electron, browser globals, filesystem, or network modules.
- The Saves build must not import existing Electron main/preload/renderer/judge code or `electron`, `openai`, `exa-js`, `electron-store`, or `apify-client`.
- No OpenAI, Exa, geocoder, routing, analytics, advertising, or other paid key may be required by any Saves command or shipped in `dist/saves`.
- “Private audit” means excluded from the browser build, not secret from repository readers. Committed review/audit files contain only pseudonymous reviewer IDs, enumerated reasons, licensed store-coordinate sources, and no personal identities, contact data, local paths, free-text notes, or embedded media.
- PriceCatcher codes are canonical string identifiers. Missing data remains unknown; it is never zero, out-of-stock, or permission to total a partial basket.
- Public freshness means the evaluation date or immediately preceding Malaysia calendar date, never a literal observation timestamp.
- Baseline and candidate evidence for one item must use their independently newest raw dates and those dates must match. Never fall back to an older common or eligible row.
- Compare only the same published PriceCatcher item code and official unit. Do not claim barcode, producer, quality, grade, freshness, stock, or checkout identity.
- Only allowed single-operator premise types may enter the pilot. Wet markets, markets, food courts, and restaurants are excluded.
- Public snapshots contain exactly two target dates. Selangor reference rows remain separate from published pilot rows.
- Money and thresholds use integer sen. Signed saving values remain safe integers. Quantity uses scaled integer hundredths of the official unit.
- A driving `switch` requires a complete-trip attestation, accurate coordinates, complete same-date eligible evidence, and confirmed fixed trip costs for every viable candidate.
- Walking, selected-items-only baskets, or any unknown viable-premise fixed cost returns price-only `comparison-only`, never a trip recommendation.
- Fixture and desk-demo snapshots add `publication-not-consumer-ready` and remain price-only. This branch must not publish a `consumer-pilot` artifact; synthetic consumer-mode snapshots exist only in non-shipped tests of trip-verdict arithmetic.
- The implementation must prove the software-complete gate with fixtures. Desk-demo and consumer-pilot content gates remain visibly distinct.
- Use test-driven development for every behavior: failing test, observed failure, minimal implementation, passing test, then a focused commit.
- Each completed task receives a fresh spec-compliance critic and a fresh code-quality critic before the next task begins.

## Scope Map (non-normative summary)

The task-level `Files:` lists below are authoritative. This summary names the major surfaces only; later tasks deliberately add focused configs, generators, review artifacts, and verification helpers as their contracts become available.

### Build and verification

- Modify `package.json` and `package-lock.json` for Saves-only commands and declared dependencies.
- Create `vite.saves.config.ts` for the isolated static web build.
- Create `tsconfig.saves.json` and `tsconfig.pricecatcher-node.json` for browser/domain and node/compiler type-checking.
- Create `vitest.saves.config.ts` and `playwright.saves.config.ts` for unit/component and production-preview tests.
- Create `scripts/pricecatcher/verify-saves-boundary.ts` for import, CSP, domain, and secret-pattern enforcement.
- Modify `.gitignore` only for PriceCatcher raw, staging, and temporary build paths.

### Pure PriceCatcher domain

- Create `src/pricecatcher/contracts/common.ts`, `snapshot.ts`, and `recommendation.ts` for Zod runtime contracts and inferred types.
- Create `src/pricecatcher/ids.ts`, `dates.ts`, `money.ts`, and `distance.ts` for deterministic primitives.
- Create `src/pricecatcher/quality.ts` for duplicate handling, reference distributions, and evidence classification.
- Create `src/pricecatcher/evidence.ts` for freshness, pair alignment, coverage, exclusions, and failure precedence.
- Create `src/pricecatcher/travel.ts` for estimated and conservative trip costs.
- Create `src/pricecatcher/recommend.ts` for price-only and trip-adjusted result selection.
- Create `src/pricecatcher/compile.ts` and `feasibility.ts` for the pure compiler and content-calibration report.
- Create `src/pricecatcher/index.ts` as the explicit public domain export surface.
- Keep tests beside the domain under `src/pricecatcher/__tests__/`.

### Node adapters and data

- Create `scripts/pricecatcher/csv.ts`, `source-lock.ts`, `fetch.ts`, `compile.ts`, `refresh.ts`, `feasibility.ts`, `select-content.ts`, `generate-fixture.ts`, and `publish.ts`.
- Create deterministic inputs under `data/pricecatcher/fixtures/`.
- Create reviewed pilot content under `data/pricecatcher/pilot/microzones.json`, `premises.json`, `items.json`, and `quality-reviews.json` only after the feasibility task passes.
- Keep content-addressed downloads and staging under ignored `data/pricecatcher/raw/` and `data/pricecatcher/staging/`.
- Publish public fixtures/current data under `src/saves/public/data/`; keep full audits under the corresponding `data/pricecatcher/fixtures/builds/` or `data/pricecatcher/pilot/builds/` root.

### Mobile web application

- Create `src/saves/index.html`, `main.tsx`, and `styles.css`.
- Create `src/saves/app/App.tsx` and `useSavesFlow.ts` for orchestration and in-memory state.
- Create `src/saves/data/loadSnapshot.ts` for pointer, hash, build-ID, and runtime-schema validation.
- Create `src/saves/location/geolocation.ts` for injected one-shot location access.
- Create focused components under `src/saves/components/`: `EvidenceBanner.tsx`, `LocationStep.tsx`, `UsualShopStep.tsx`, `BasketStep.tsx`, `TripAssumptionsStep.tsx`, `ResultCard.tsx`, `EvidenceDetails.tsx`, and `Attribution.tsx`.
- Keep component tests beside the relevant Saves files and end-to-end tests under `e2e/saves.e2e.ts`; the nonstandard suffix deliberately prevents the existing Vitest command from collecting Playwright tests.

---

### Task 1: Install the isolated test/build foundation and runtime contracts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.saves.json`
- Create: `tsconfig.pricecatcher.json`
- Create: `tsconfig.pricecatcher-node.json`
- Create: `tsconfig.saves-e2e.json`
- Create: `e2e/typecheck-sentinel.ts`
- Create: `vitest.config.ts`
- Create: `vitest.saves.config.ts`
- Create: `.github/workflows/saves-node20.yml`
- Create: `src/saves/test/setup.ts`
- Create: `src/pricecatcher/contracts/common.ts`
- Create: `src/pricecatcher/version.ts`
- Create: `src/pricecatcher/contracts/source-lock.ts`
- Create: `src/pricecatcher/contracts/feasibility.ts`
- Create: `src/pricecatcher/contracts/snapshot.ts`
- Create: `src/pricecatcher/contracts/recommendation.ts`
- Create: `src/pricecatcher/contracts/index.ts`
- Test: `src/pricecatcher/__tests__/contracts.test.ts`
- Test: `scripts/pricecatcher/saves-node20-workflow.test.ts`

**Interfaces:**
- Consumes: the normative Version 1 schemas and numeric bounds in the approved design.
- Produces: `PilotSnapshotV1Schema`, `CurrentSnapshotPointerV1Schema`, the loose-shell `RecommendationRequestSchema`, strict calculation-ready `RecommendationInputSchema`, `RecommendationResultSchema`, their inferred TypeScript types, `QualityReasonSchema`, `ReasonCodeSchema`, `ComparisonOnlyReasonSchema`, and runtime-validated `BuildIdSchema`, `LocalDateSchema`, `ISOInstantSchema`, and `SenSchema`.

- [ ] **Step 1: Install only the declared dependencies**

Run:

```bash
npm install zod@^4 csv-parse
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom@^6 jsdom@^26 @playwright/test @axe-core/playwright
```

Expected: `package.json` and `package-lock.json` change; no source file changes. Keep the repository's documented Node 20+ floor: do not upgrade to jsdom 30 or jest-dom 7, whose current engines require newer Node. Set `package.json.engines.node` to `>=20` and add `.github/workflows/saves-node20.yml`, triggered for pushes to `UPGRADES` and pull requests touching Saves/PriceCatcher dependency files. It must use `actions/setup-node` with exact major `20`, run `npm ci`, `npm run typecheck:saves`, and `npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts`. The Node-side workflow test reads/asserts the YAML's exact major/commands; do not import filesystem APIs into the pure-domain contract test. This executable clean install is the compatibility guard without referencing Task 2's not-yet-created primitive test.

- [ ] **Step 2: Add the Saves scripts and TypeScript/Vitest configs**

Add these exact scripts while leaving all existing scripts unchanged:

```json
{
  "dev:saves": "vite --config vite.saves.config.ts",
  "typecheck:saves": "tsc -p tsconfig.pricecatcher.json --noEmit && tsc -p tsconfig.saves.json --noEmit && tsc -p tsconfig.pricecatcher-node.json --noEmit && tsc -p tsconfig.saves-e2e.json --noEmit",
  "test:saves": "vitest run --config vitest.saves.config.ts",
  "test:saves:watch": "vitest --config vitest.saves.config.ts",
  "build:saves": "npm run typecheck:saves && vite build --config vite.saves.config.ts",
  "build:saves:e2e": "npm run typecheck:saves && vite build --config vite.saves.config.ts --mode saves-e2e",
  "preview:saves": "vite preview --config vite.saves.config.ts",
  "preview:saves:e2e": "vite preview --config vite.saves.config.ts --mode saves-e2e",
  "setup:saves:e2e": "playwright install chromium",
  "data:saves:fetch": "tsx scripts/pricecatcher/fetch.ts",
  "data:saves:compile": "tsx scripts/pricecatcher/compile.ts",
  "data:saves:publish": "tsx scripts/pricecatcher/publish.ts",
  "data:saves:refresh": "tsx scripts/pricecatcher/refresh.ts",
  "data:saves:feasibility": "tsx scripts/pricecatcher/feasibility.ts",
  "data:saves:fixture": "tsx scripts/pricecatcher/generate-fixture.ts",
  "data:saves:e2e-fixtures": "tsx scripts/pricecatcher/generate-e2e-fixtures.ts",
  "verify:saves:clean-reproduction": "tsx scripts/pricecatcher/verify-clean-reproduction.ts",
  "verify:saves": "npm run typecheck:saves && npm run test:saves && npm run data:saves:e2e-fixtures -- --check && npm run build:saves && npm run build:saves:e2e && tsx scripts/pricecatcher/verify-saves-boundary.ts && playwright test --config playwright.saves.config.ts"
}
```

Create `tsconfig.saves.json`:

```json
{
  "extends": "./tsconfig.web.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@pricecatcher": ["src/pricecatcher/index.ts"], "@pricecatcher/*": ["src/pricecatcher/*"],
      "@saves": ["src/saves/main.tsx"], "@saves/*": ["src/saves/*"]
    },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/saves/**/*", "src/pricecatcher/**/*"]
}
```

Create `tsconfig.pricecatcher-node.json`:

```json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@pricecatcher": ["src/pricecatcher/index.ts"], "@pricecatcher/*": ["src/pricecatcher/*"] }
  },
  "include": ["src/pricecatcher/**/*", "scripts/pricecatcher/**/*", "data/pricecatcher/**/*.test.ts", "playwright.saves.config.ts", "vite.saves.config.ts", "vitest.config.ts", "vitest.saves.config.ts"]
}
```

Create `tsconfig.pricecatcher.json` as a second structural boundary with no DOM or Node ambient types:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022"], "strict": true, "skipLibCheck": true,
    "isolatedModules": true, "noEmit": true, "types": []
  },
  "include": ["src/pricecatcher/**/*.ts"],
  "exclude": ["src/pricecatcher/**/*.test.ts", "src/pricecatcher/**/__tests__/**"]
}
```

Create `tsconfig.saves-e2e.json` so Playwright callbacks are DOM-typed without contaminating Node adapters or the pure domain:

```json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "@playwright/test"]
  },
  "include": ["e2e/**/*.ts"]
}
```

Create `e2e/typecheck-sentinel.ts` with `export type SavesE2eDomSentinel = Pick<Navigator, 'geolocation'>`; it gives Tasks 1–11 a real DOM-typed input so TypeScript never raises TS18003 before Playwright tests arrive. It contains no runtime code and Playwright's `testMatch` never collects it.

The pure config deliberately excludes Vitest files because importing Vitest can pull Node ambient declarations despite `types: []`. The boundary verifier also rejects bare `process`, `Buffer`, `require`, `__dirname`, `window`, `document`, and `fetch` identifiers in production `src/pricecatcher` files; add a negative fixture proving a bare `process`/`Buffer` use fails even when some ambient package is installed.

Create `vitest.saves.config.ts`:

```ts
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
```

Use relative imports in every `scripts/pricecatcher/**/*.ts` entrypoint and its Node-only helpers; do not rely on tsx selecting a paths-aware tsconfig at runtime. Browser/test code may use the configured aliases. Add a Node smoke test that launches one script through its package command so type-check success cannot hide runtime alias resolution failure.

Create the root `vitest.config.ts` so the unchanged existing `npm test` command can collect new component tests without collecting Playwright:

```ts
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
```

Create `src/saves/test/setup.ts` with only:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Write contract tests that fail because the schemas do not exist**

Create `src/pricecatcher/__tests__/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CurrentSnapshotPointerV1Schema,
  PilotSnapshotV1Schema,
  RecommendationInputSchema
} from '../contracts'

const source = {
  url: 'https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv',
  retrievedAt: '2026-08-03T04:00:00.000Z',
  sha256: 'a'.repeat(64),
  byteLength: 100,
  rowCount: 2,
  minObservedDate: '2026-08-02',
  maxObservedDate: '2026-08-02'
}

const snapshot = {
  schemaVersion: 1,
  buildId: 'fixture-2026-08-02',
  transformVersion: '1.0.0',
  compiledAt: '2026-08-03T04:00:00.000Z',
  dataAsOfDate: '2026-08-02',
  publicationMode: 'fixture',
  timeZone: 'Asia/Kuala_Lumpur',
  sources: [source],
  attribution: {
    text: 'PriceCatcher data transformed by AUNTIE Saves.',
    transactionalRecordsUrl: 'https://data.gov.my/data-catalogue/pricecatcher',
    premiseLookupUrl: 'https://data.gov.my/data-catalogue/lookup_premise',
    itemLookupUrl: 'https://data.gov.my/data-catalogue/lookup_item',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  },
  premises: [],
  items: [],
  evidence: []
}

describe('runtime contracts', () => {
  it('accepts a complete Version 1 snapshot and pointer', () => {
    expect(PilotSnapshotV1Schema.parse(snapshot).schemaVersion).toBe(1)
    expect(CurrentSnapshotPointerV1Schema.parse({
      schemaVersion: 1,
      buildId: snapshot.buildId,
      snapshotUrl: './data/builds/fixture-2026-08-02/snapshot.json',
      snapshotSha256: 'b'.repeat(64)
    }).buildId).toBe(snapshot.buildId)
  })

  it('rejects imprecise location and non-integral money', () => {
    const input = {
      evaluatedAt: '2026-08-03T04:00:00.000Z',
      location: { latitude: 3.1073, longitude: 101.6067, accuracyMetres: 101 },
      usualPremiseCode: '1',
      basketScope: 'complete-trip',
      lines: [{ itemCode: '2', quantityHundredths: 100 }],
      mode: 'drive',
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedTripCostByPremiseCode: { '1': { status: 'confirmed', amountSen: 0 } },
      worthwhileThresholdSen: 500
    }
    expect(() => RecommendationInputSchema.parse(input)).toThrow()
    expect(() => RecommendationInputSchema.parse({
      ...input,
      location: { ...input.location, accuracyMetres: 50 },
      worthwhileThresholdSen: 500.5
    })).toThrow()
  })

  it('rejects impossible local dates rather than checking shape only', () => {
    expect(() => PilotSnapshotV1Schema.parse({ ...snapshot, dataAsOfDate: '2026-02-30' })).toThrow()
  })

  it.each(['.', '..', '-leading', 'trailing.', 'a'.repeat(81)])('rejects unsafe build ID %s', buildId => {
    expect(() => CurrentSnapshotPointerV1Schema.parse({
      schemaVersion: 1, buildId,
      snapshotUrl: `./data/builds/${buildId}/snapshot.json`, snapshotSha256: 'b'.repeat(64)
    })).toThrow()
  })
})
```

- [ ] **Step 4: Run the contract test and observe the expected failure**

Run:

```bash
npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts
```

Expected: FAIL because `../contracts` cannot be resolved.

- [ ] **Step 5: Implement the Version 1 Zod contracts**

Create `common.ts` with these exact primitives and enums:

```ts
import { z } from 'zod'

const isValidLocalDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const LocalDateSchema = z.string().refine(isValidLocalDate, 'invalid local date')
export const ISOInstantSchema = z.string().datetime({ offset: true })
  .refine(value => value.endsWith('Z'), 'UTC instant must end in Z')
export const SenSchema = z.number().int().safe().nonnegative()
export const SignedSenSchema = z.number().int().safe()
export const CanonicalCodeSchema = z.string().regex(/^(0|[1-9]\d*)$/)
  .refine(value => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER), 'code exceeds the supported safe-integer range')
export const BuildIdSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/)
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const QualityReasonSchema = z.enum([
  'invalid-price',
  'conflicting-duplicate',
  'outside-ratio-bound',
  'robust-scale-outlier'
])

export const ReasonCodeSchema = z.enum([
  'snapshot-load-failed', 'snapshot-schema-unsupported', 'snapshot-integrity-failed',
  'snapshot-stale', 'clock-invalid', 'location-missing', 'location-imprecise',
  'input-invalid', 'basket-empty', 'item-not-in-pilot', 'usual-premise-not-in-pilot',
  'baseline-missing', 'baseline-stale', 'baseline-anomalous',
  'baseline-insufficient-reference', 'no-candidate-in-radius', 'candidate-missing',
  'candidate-stale', 'candidate-anomalous', 'candidate-insufficient-reference',
  'candidate-date-mismatch', 'no-complete-candidate'
])

export const ComparisonOnlyReasonSchema = z.enum([
  'selected-items-only',
  'walking-route-unverified',
  'fixed-trip-cost-unknown',
  'publication-not-consumer-ready'
])

export type LocalDate = z.infer<typeof LocalDateSchema>
export type ISOInstant = z.infer<typeof ISOInstantSchema>
export type Sen = z.infer<typeof SenSchema>
export type BuildId = z.infer<typeof BuildIdSchema>
export type QualityReason = z.infer<typeof QualityReasonSchema>
export type ReasonCode = z.infer<typeof ReasonCodeSchema>
```

Create the single production transform version source and re-export it:

```ts
// src/pricecatcher/version.ts
export const PRICECATCHER_TRANSFORM_VERSION = '1.0.0' as const
```

In `common.ts`, import it and define `export const TransformVersionSchema = z.literal(PRICECATCHER_TRANSFORM_VERSION)`. Every snapshot/compiler/basis/manifest schema below uses `TransformVersionSchema`; adapters, fixture/E2E generators, identity hashing, and reproduction import the constant and expose no `--transform-version` override. Add mismatch tests for source lock reproduction and manifests.

Implement `snapshot.ts` and `recommendation.ts` by translating every serialized interface in Section 7.5 of the design into a strict Zod object. Use `.strict()` for all fixed-shape objects, `.safe()` for every integer, `z.literal(1)` for schema versions, discriminated unions for observation/result status, and these additional refinements:

```ts
export const RecommendationInputSchema = z.object({
  evaluatedAt: ISOInstantSchema,
  location: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMetres: z.number().finite().min(0).max(100)
  }).strict(),
  usualPremiseCode: CanonicalCodeSchema,
  basketScope: z.enum(['complete-trip', 'selected-items-only']),
  lines: z.array(z.object({
    itemCode: CanonicalCodeSchema,
    quantityHundredths: z.number().int().safe().min(1).max(9900)
  }).strict()).min(1),
  mode: z.enum(['walk', 'drive']),
  fuelEfficiencyDeciKmPerL: z.number().int().min(10).max(500).optional(),
  fuelPriceSenPerL: SenSchema.min(1).max(1000).optional(),
  fixedTripCostByPremiseCode: z.record(CanonicalCodeSchema, z.discriminatedUnion('status', [
    z.object({ status: z.literal('confirmed'), amountSen: SenSchema.max(10000) }).strict(),
    z.object({ status: z.literal('unknown') }).strict()
  ])).optional(),
  worthwhileThresholdSen: SenSchema.max(10000).optional()
}).strict()
```

Trip-only fields are contextually required by `recommend`, not by this snapshot-independent base schema. After reliable basket evidence exists, first derive structural comparison-only reasons from basket scope, walking mode, and publication readiness. If any such reason exists, fuel/fixed-cost/threshold fields may be absent and are not requested or used. Only a `consumer-pilot + complete-trip + drive` attempt requires fuel price, threshold, and a fixed-cost entry for the usual premise plus every complete candidate; missing/malformed is `input-invalid`, while a present `unknown` fixed cost adds `fixed-trip-cost-unknown` and returns comparison-only. Add schema/domain/UI tests proving fixture, desk, walking, and selected-items-only requests succeed price-only with all trip-only fields omitted, while the consumer trip attempt fails closed when each required field is absent.

The public domain boundary must not make documented refusal reasons unreachable by parsing everything through this strict calculation schema first. Add a separate strict-shell schema whose known fields are optional `z.unknown()` values and whose object rejects unknown keys:

```ts
export const RecommendationRequestSchema = z.object({
  evaluatedAt: z.unknown().optional(), location: z.unknown().optional(),
  usualPremiseCode: z.unknown().optional(), basketScope: z.unknown().optional(),
  lines: z.unknown().optional(), mode: z.unknown().optional(),
  fuelEfficiencyDeciKmPerL: z.unknown().optional(), fuelPriceSenPerL: z.unknown().optional(),
  fixedTripCostByPremiseCode: z.unknown().optional(), worthwhileThresholdSen: z.unknown().optional()
}).strict()
```

`recommend(snapshot: PilotSnapshotV1, request: unknown)` and `evaluateEvidence(snapshot: PilotSnapshotV1, request: unknown)` parse this request shell, then normalize in the locked failure order. The snapshot loader is the sole `unknown` snapshot boundary and must parse `PilotSnapshotV1Schema` before either domain function can be called. Absent location maps to `location-missing`; a finite otherwise-valid location with accuracy above 100 maps to `location-imprecise`; an absent or empty array of lines maps to `basket-empty`; malformed fields map to `input-invalid`. Only after those semantic states are handled does `RecommendationInputSchema` produce the calculation-ready value. Add direct domain tests for all four outcomes plus an extra-key request and a compile-time negative for an unknown snapshot; do not collapse them into one schema exception.

Implement snapshot schemas with these exact fields:

```ts
export const SourceManifestV1Schema = z.object({
  url: z.string().url(), retrievedAt: ISOInstantSchema, sha256: Sha256Schema,
  byteLength: SenSchema, rowCount: SenSchema,
  minObservedDate: LocalDateSchema.optional(), maxObservedDate: LocalDateSchema.optional(),
  etag: z.string().max(128).regex(/^(?:W\/)?"[\x21\x23-\x7E]{1,124}"$/).optional(),
  lastModified: z.string().length(29).regex(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/).optional()
}).strict()

const TransactionSourceV1Schema = z.object({
  role: z.literal('transactions'), yearMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  manifest: SourceManifestV1Schema
}).strict()
const PremiseLookupSourceV1Schema = z.object({
  role: z.literal('premise-lookup'), manifest: SourceManifestV1Schema
}).strict()
const ItemLookupSourceV1Schema = z.object({
  role: z.literal('item-lookup'), manifest: SourceManifestV1Schema
}).strict()

export const SourceLockV1Schema = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.enum(['official', 'synthetic-fixture']),
  throughDate: LocalDateSchema,
  analysisStartDate: LocalDateSchema,
  window: z.enum(['public', 'feasibility']),
  sources: z.array(z.discriminatedUnion('role', [
    TransactionSourceV1Schema, PremiseLookupSourceV1Schema, ItemLookupSourceV1Schema
  ])).min(3)
}).strict()

export const PremiseV1Schema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), displayName: z.string().min(1),
  address: z.string().min(1), premiseType: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  coordinateAccuracyMetres: z.number().finite().positive().max(30),
  verificationStatus: z.enum(['desk-verified', 'field-verified']),
  verifiedOn: LocalDateSchema, verificationExpiresOn: LocalDateSchema,
  coordinateAttribution: z.string().min(1)
}).strict()

export const ItemDefinitionV1Schema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), officialUnit: z.string().min(1),
  qualifiers: z.array(z.string()), quantityMode: z.enum(['whole-units', 'hundredths'])
}).strict()

export const ObservationEvidenceV1Schema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('eligible'), observedDate: LocalDateSchema, priceSen: SenSchema.min(1) }).strict(),
  z.object({ status: z.literal('missing'), observedDate: LocalDateSchema }).strict(),
  z.object({ status: z.literal('anomalous'), observedDate: LocalDateSchema, reason: QualityReasonSchema }).strict(),
  z.object({ status: z.literal('insufficient-reference'), observedDate: LocalDateSchema }).strict()
])

export const EvidenceCellV1Schema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema, officialUnit: z.string().min(1),
  observations: z.array(ObservationEvidenceV1Schema).length(2)
}).strict()

export const PilotSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, dataAsOfDate: LocalDateSchema,
  publicationMode: z.enum(['fixture', 'desk-demo', 'consumer-pilot']),
  timeZone: z.literal('Asia/Kuala_Lumpur'),
  sources: z.array(SourceManifestV1Schema).min(1),
  attribution: z.object({
    text: z.string().min(1),
    transactionalRecordsUrl: z.literal('https://data.gov.my/data-catalogue/pricecatcher'),
    premiseLookupUrl: z.literal('https://data.gov.my/data-catalogue/lookup_premise'),
    itemLookupUrl: z.literal('https://data.gov.my/data-catalogue/lookup_item'),
    licenseUrl: z.literal('https://creativecommons.org/licenses/by/4.0/')
  }).strict(),
  premises: z.array(PremiseV1Schema), items: z.array(ItemDefinitionV1Schema),
  evidence: z.array(EvidenceCellV1Schema)
}).strict()

export const CurrentSnapshotPointerV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema,
  snapshotUrl: z.string().regex(/^\.\/data\/builds\/[a-zA-Z0-9._-]+\/snapshot\.json$/),
  snapshotSha256: Sha256Schema
}).strict().superRefine((value, context) => {
  const encodedBuildId = value.snapshotUrl.split('/').at(-2)
  if (encodedBuildId !== value.buildId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshotUrl'], message: 'path build ID must match pointer build ID' })
  }
})
```

Add a `SourceLockV1Schema` cross-field refinement and tested canonicalizer. There must be exactly one premise lookup and one item lookup; transaction months must be unique and must exactly cover every calendar month touched by `analysisStartDate…throughDate`. For `public`, `analysisStartDate` is exactly `throughDate − 31`; for `feasibility`, the bootstrap lock is exactly `throughDate − 59` and an extended lock may begin earlier after the selected-content horizon is known. Canonical order is transactions by `yearMonth`, then premise lookup, then item lookup. Validate `lastModified` calendar/time ranges by parsing the IMF-fixdate and requiring an exact canonical UTC round-trip, not regex alone. For `sourceKind: official`, role/year-month and URL must match the three official URL templates exactly; `synthetic-fixture` is accepted only by the fixture adapter and uses HTTPS `.test` URLs. Export the inferred type and require every Node CLI to parse this contract before deriving a local path or reading a blob. Every emitted coverage report requires its bound lock to start no later than `dataAsOfDate − 13`; a committed/final feasibility-window selected-coverage report, Phase B, and `desk-demo` final compile require the stronger `analysisStartDate <= dataAsOfDate − 59`. The internal horizon probe described in Task 8 emits no report and is exempt solely so the lock can be extended. A public-window fixture compile instead requires `analysisStartDate <= dataAsOfDate − 31`. No report or compile may interpret an absent day outside the pinned lock as a missing observation.

Define the feasibility report contracts in `contracts/feasibility.ts` now so the Task 6 compiler can enforce desk evidence without importing a Task 8 implementation module:

```ts
const BasisPointsSchema = SenSchema.max(10_000)
const ReportTransformVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const CoverageFailureReasonV1Schema = z.enum([
  'insufficient-near-daily-premises', 'insufficient-high-coverage-items'
])
const DistanceFailureReasonV1Schema = z.enum([
  'selected-coverage-gate-failed', 'invalid-final-premise-count', 'invalid-final-item-count',
  'invalid-microzone-count', 'microzone-premise-count-below-three',
  'baseline-alternative-rate-below-7000'
])
export const CoverageCandidateReportV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: ReportTransformVersionSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema,
  scope: z.enum(['candidate-universe', 'selected-content']),
  selectedContentDigests: z.object({ premises: Sha256Schema, items: Sha256Schema }).strict().optional(),
  dataAsOfDate: LocalDateSchema, calibrationDates: z.array(LocalDateSchema).length(14),
  premises: z.array(z.object({ premiseCode: CanonicalCodeSchema,
    officialName: z.string().min(1), address: z.string().min(1), premiseType: z.string().min(1),
    state: z.string().min(1), district: z.string().min(1), distinctPresenceDates: SenSchema.max(14),
    dateCoverageBasisPoints: BasisPointsSchema, completeItemCellCoverageBasisPoints: BasisPointsSchema,
    nearDaily: z.boolean() }).strict()),
  items: z.array(z.object({ itemCode: CanonicalCodeSchema, officialName: z.string().min(1),
    officialUnit: z.string().min(1), itemGroup: z.string().min(1), itemCategory: z.string().min(1),
    coveredDates: SenSchema.max(14),
    qualifyingPremiseCoverageDates: SenSchema.max(14), qualifyingDateRateBasisPoints: BasisPointsSchema,
    meanPremiseCoverageBasisPoints: BasisPointsSchema, highCoverage: z.boolean() }).strict()),
  passesCoverageCandidateGate: z.boolean(), failureReasons: z.array(CoverageFailureReasonV1Schema)
}).strict()

export const DistanceFeasibilityReportV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: ReportTransformVersionSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema,
  dataAsOfDate: LocalDateSchema, coverageReportSha256: Sha256Schema,
  microzonesSha256: Sha256Schema, premisesSha256: Sha256Schema, itemsSha256: Sha256Schema,
  referenceAndTargetDates: z.array(LocalDateSchema).length(60), targetDates: z.array(LocalDateSchema).length(30),
  finalPremiseCodes: z.array(CanonicalCodeSchema),
  finalItemCodes: z.array(CanonicalCodeSchema),
  microzones: z.array(z.object({
    microzoneId: z.string().regex(/^[a-z0-9-]+$/), premiseCount: SenSchema,
    baselines: z.array(z.object({ premiseCode: CanonicalCodeSchema,
      completeAlternativeDates: SenSchema.max(30), completeAlternativeDateBasisPoints: BasisPointsSchema }).strict()),
    minimumBaselineAlternativeDateBasisPoints: BasisPointsSchema, passes: z.boolean()
  }).strict()).max(2),
  passesDeskDemoGate: z.boolean(), failureReasons: z.array(DistanceFailureReasonV1Schema)
}).strict()
```

Add cross-field refinements for sorted/unique codes, exact equality between each distance final-code array and the corresponding premise/item code rows in its bound `selected-content` coverage report, exact baseline coverage of each microzone, internally recomputed basis points/minimums/pass booleans, and stable failure-reason consistency. The selected report preserves the approved 14-day definitions: final premises require `distinctPresenceDates >= 10`/`nearDaily: true`, and final items require `coveredDates >= 10`, qualifying-date rate `>=7000`, and `highCoverage: true`. Phase B must validate those final-set rows; its 30 target dates are used only for per-baseline complete-alternative success. For a microzone with zero baselines, define the minimum as `0` and `passes: false`; otherwise its baseline codes exactly equal its final assigned premise codes, its premise count equals that array length, its minimum is recomputed, and `passes` requires at least three baselines plus minimum `>=7000`. A passing desk gate requires one or two microzones, all bound final premise/item 14-day gates, and the cardinality/microzone conditions below. Its `failureReasons` is the exact duplicate-free subset of `DistanceFailureReasonV1Schema.options` in schema order for false predicates and is empty iff the gate passes; a row-level low baseline rolls up once to the global baseline-rate reason. A `candidate-universe` coverage report forbids selected digests and derives its horizon from all cutoff-retained, valid-price, lookup-joined allowed-type Petaling Jaya rows; it is only for ranking/review. After reconciliation, a `selected-content` rerun requires exact premise/item file digests and derives the horizon exactly like the compiler from those selected pilot codes. Only selected-scope coverage may feed Phase B or desk compilation. Date binding is exact, not merely contiguous: coverage `calibrationDates` equals `[dataAsOfDate − 13…dataAsOfDate]`; distance `targetDates` equals `[dataAsOfDate − 29…dataAsOfDate]`; `referenceAndTargetDates` equals `[dataAsOfDate − 59…dataAsOfDate]`; and `targetDates` is its final 30 entries. Require `dataAsOfDate <= throughDate`, require every candidate or selected coverage report's bound lock to start no later than `dataAsOfDate − 13`, and require the selected report's lock to start no later than `dataAsOfDate − 59` before Phase B is constructed. During desk stage/reproduction, re-parse the historical candidate lock/report and enforce its 14-date bound too. Add candidate-H-at-bootstrap-start and one-day-short lock regressions that fail before a report is emitted. A failing distance report may honestly contain empty or sparse final sets/microzones and must still parse with `passesDeskDemoGate: false`; only a passing report enforces 10–15 final premises, 5–10 final items, and all other gates.

`transformVersion` is contextual evidence, not a decorative string. A newly generated `selected-content` coverage report and every distance report must equal `PRICECATCHER_TRANSFORM_VERSION`; the distance report must equal its bound selected report as well. The compiler rejects an older selected or distance transform even when all digests are otherwise valid. A historical candidate-universe report may retain an older valid semantic version only because it is immutable review provenance: its candidate selection and reconciliation report must bind that exact version and report digest. Add old-selected, old-distance, mismatched-pair, and historical-candidate tests; the last passes only when every candidate-era provenance binding is intact.

Every official lookup display field in a coverage report is normalized with the shared exact rule—Unicode NFC, trim, collapse Unicode whitespace to one ASCII space, preserve case—and must equal the current pinned lookup row. At final compile, cross-check every accepted code across the current lookup, the selected-content report, the original candidate selection, and the final reviewed content: premises bind official name, address, premise type, state, and district; items bind official name, unit, group, and category. Final content's subset of those fields must agree as well. Any same-code name/address/type/unit/group/category drift fails and requires a new two-pass review; it is never silently projected into the public snapshot. Add primary and reproduction mutation tests for every field. Add empty/sparse report, shifted-window, invalid-price-newer-row, newest-row-on-rejected-candidate, selected-report metric tampering, failure-reason mutation, lookup-drift, and boundary-date tests. Export inferred types. Task 8 implements report construction against these already-tested contracts; it does not redefine them.

Add a `PilotSnapshotV1Schema.superRefine` cross-field pass. It must reject duplicate premise or item codes, duplicate/missing evidence keys, unknown evidence codes, official-unit mismatches, and any evidence matrix whose size is not `premises.length × items.length`. Every cell must contain exactly the sorted dates `[dataAsOfDate − 1 date, dataAsOfDate]`; source min/max dates must be ordered; premise verification expiry must not precede verification; a declared `consumer-pilot` snapshot must contain only field-verified premises; and `compiledAt` must not have a Malaysia date before `dataAsOfDate`. Use a tiny contract-local UTC-component calendar helper for the previous date rather than importing the later `dates.ts` module and creating a cycle. These checks belong in the browser runtime boundary as well as the compiler.

Implement result schemas explicitly rather than using `z.any()`:

```ts
export const ComparedLineV1Schema = z.object({
  itemCode: CanonicalCodeSchema, officialUnit: z.string().min(1), quantityHundredths: z.number().int().min(1).max(9900),
  observedDate: LocalDateSchema,
  usualUnitAllowanceSen: SenSchema, candidateUnitAllowanceSen: SenSchema,
  usualLineAllowanceSen: SenSchema, candidateLineAllowanceSen: SenSchema,
  usual: z.object({ priceSen: SenSchema, lineTotalSen: SenSchema, conservativeLineSen: SenSchema }).strict(),
  candidate: z.object({ priceSen: SenSchema, lineTotalSen: SenSchema, conservativeLineSen: SenSchema }).strict()
}).strict()

export const DrivingTripCostV1Schema = z.object({
  straightLineMetres: SenSchema, routeFactorBasisPoints: SenSchema.min(5000).max(30000),
  estimatedRoundTripRoadMetres: SenSchema, fuelCostSen: SenSchema,
  fixedCostSen: SenSchema.max(10000), totalTripCostSen: SenSchema
}).strict()

export const PriceComparisonV1Schema = z.object({
  usualPremiseCode: CanonicalCodeSchema, candidatePremiseCode: CanonicalCodeSchema,
  lines: z.array(ComparedLineV1Schema).min(1), usualBasketTotalSen: SenSchema,
  candidateBasketTotalSen: SenSchema, grossBasketSavingSen: SignedSenSchema,
  usualStraightLineMetres: SenSchema, candidateStraightLineMetres: SenSchema.max(5000),
  oldestObservationDate: LocalDateSchema
}).strict()

export const TripComparisonV1Schema = z.object({
  mode: z.literal('drive'), priceComparison: PriceComparisonV1Schema,
  usualEstimatedTrip: DrivingTripCostV1Schema, candidateEstimatedTrip: DrivingTripCostV1Schema,
  estimatedNetSavingSen: SignedSenSchema,
  usualConservativeBasketTotalSen: SenSchema, candidateConservativeBasketTotalSen: SenSchema,
  usualConservativeTrip: DrivingTripCostV1Schema, candidateConservativeTrip: DrivingTripCostV1Schema,
  usualConservativeNetCostSen: SenSchema, candidateConservativeNetCostSen: SenSchema,
  conservativeNetSavingSen: SignedSenSchema, worthwhileThresholdSen: SenSchema.max(10000)
}).strict()

export const CandidateExclusionReasonSchema = z.enum([
  'outside-radius', 'missing', 'stale', 'anomalous', 'insufficient-reference', 'date-mismatch'
])
export const ExclusionCountsSchema = z.object({
  pilotPremiseCount: SenSchema, inRadiusCandidateCount: SenSchema,
  completeCandidateCount: SenSchema,
  excludedByReason: z.partialRecord(CandidateExclusionReasonSchema, SenSchema)
}).strict().superRefine((value, context) => {
  const excluded = Object.values(value.excludedByReason).reduce((sum, count) => sum + (count ?? 0), 0)
  const outside = value.excludedByReason['outside-radius'] ?? 0
  const inRadiusExcluded = excluded - outside
  if (excluded + value.completeCandidateCount !== value.pilotPremiseCount ||
      inRadiusExcluded + value.completeCandidateCount !== value.inRadiusCandidateCount ||
      outside + value.inRadiusCandidateCount !== value.pilotPremiseCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['excludedByReason'], message: 'candidate partition counts are inconsistent' })
  }
})
export const ReasonDetailSchema = z.object({
  reason: ReasonCodeSchema, premiseCode: CanonicalCodeSchema.optional(),
  itemCode: CanonicalCodeSchema.optional(), observedDate: LocalDateSchema.optional()
}).strict()
const CandidateStageReasonSchema = z.enum([
  'no-candidate-in-radius', 'candidate-missing', 'candidate-stale', 'candidate-anomalous',
  'candidate-insufficient-reference', 'candidate-date-mismatch', 'no-complete-candidate'
])
const InsufficientEvidenceResultSchema = z.object({
  kind: z.literal('insufficient-evidence'), primaryReason: ReasonCodeSchema,
  details: z.array(ReasonDetailSchema), exclusions: ExclusionCountsSchema.optional()
}).strict()

export const RecommendationResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('switch'), comparison: TripComparisonV1Schema, exclusions: ExclusionCountsSchema }).strict(),
  z.object({ kind: z.literal('no-clear-advantage'), comparison: TripComparisonV1Schema, exclusions: ExclusionCountsSchema }).strict(),
  z.object({ kind: z.literal('comparison-only'), comparison: PriceComparisonV1Schema,
    reasons: z.array(ComparisonOnlyReasonSchema).min(1), exclusions: ExclusionCountsSchema }).strict(),
  InsufficientEvidenceResultSchema
]).superRefine((value, context) => {
  if (value.kind === 'insufficient-evidence' &&
      CandidateStageReasonSchema.safeParse(value.primaryReason).success &&
      value.exclusions === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['exclusions'], message: 'required after candidate enumeration' })
  }
  if (value.kind === 'insufficient-evidence' &&
      !CandidateStageReasonSchema.safeParse(value.primaryReason).success &&
      value.exclusions !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['exclusions'], message: 'forbidden before candidate enumeration' })
  }
})
```

Export all schemas and inferred types from `contracts/index.ts`. Do not add defaults inside schemas.

- [ ] **Step 6: Run contracts and type-check**

Run:

```bash
npm run test:saves -- src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts
npm run typecheck:saves
```

Expected: contract/workflow tests PASS; all configured TypeScript projects PASS.

- [ ] **Step 7: Commit the contract foundation**

```bash
git add package.json package-lock.json .github/workflows/saves-node20.yml tsconfig.saves.json tsconfig.pricecatcher.json tsconfig.pricecatcher-node.json tsconfig.saves-e2e.json e2e/typecheck-sentinel.ts vitest.config.ts vitest.saves.config.ts src/pricecatcher/version.ts src/pricecatcher/contracts src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/saves-node20-workflow.test.ts src/saves/test/setup.ts
git commit -m "feat: add PriceCatcher runtime contracts"
git push origin UPGRADES
```

---

### Task 2: Implement canonical identifiers, Malaysia dates, integer-sen math, and distance

**Files:**
- Create: `src/pricecatcher/ids.ts`
- Create: `src/pricecatcher/dates.ts`
- Create: `src/pricecatcher/money.ts`
- Create: `src/pricecatcher/distance.ts`
- Test: `src/pricecatcher/__tests__/primitives.test.ts`

**Interfaces:**
- Consumes: `LocalDate`, `ISOInstant`, and `Sen` from Task 1.
- Produces: `canonicalizeCode`, `compareCanonicalCodes`, `malaysiaDateAt`, `addLocalDates`, `differenceInLocalDates`, `parsePriceSen`, `bigIntToSafeNumber`, `checkedAdd`, `checkedSubtract`, `checkedSum`, `roundHalfUp`, `multiplyDivideHalfUp`, `lineTotalSen`, `unitAllowanceSen`, `lineAllowanceSen`, `haversineMetres`, and the constant `MEAN_EARTH_RADIUS_METRES = 6_371_008.8`.

- [ ] **Step 1: Write failing primitive tests**

Create `src/pricecatcher/__tests__/primitives.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canonicalizeCode, compareCanonicalCodes } from '../ids'
import { addLocalDates, differenceInLocalDates, malaysiaDateAt } from '../dates'
import { lineAllowanceSen, lineTotalSen, parsePriceSen } from '../money'
import { haversineMetres } from '../distance'

describe('canonical identifiers', () => {
  it.each([[2, '2'], ['2', '2'], ['2.0', '2'], ['0002', '2']])('canonicalizes %p', (raw, expected) => {
    expect(canonicalizeCode(raw)).toBe(expected)
  })
  it.each(['', '-2', '2.5', 'abc', Number.POSITIVE_INFINITY])('rejects %p', raw => {
    expect(canonicalizeCode(raw)).toBeNull()
  })
  it('uses one numeric comparator and rejects unsupported magnitudes', () => {
    expect(['10', '2'].sort(compareCanonicalCodes)).toEqual(['2', '10'])
    expect(canonicalizeCode('9007199254740992')).toBeNull()
  })
})

describe('Malaysia dates', () => {
  it('crosses UTC midnight in Asia/Kuala_Lumpur', () => {
    expect(malaysiaDateAt('2026-08-02T16:30:00.000Z')).toBe('2026-08-03')
    expect(addLocalDates('2026-03-01', -1)).toBe('2026-02-28')
    expect(differenceInLocalDates('2026-08-03', '2026-08-01')).toBe(2)
  })
})

describe('integer-sen arithmetic', () => {
  it('parses at most two decimals and rounds extended lines half-up', () => {
    expect(parsePriceSen('10.25')).toBe(1025)
    expect(parsePriceSen('10.251')).toBeNull()
    expect(lineTotalSen(199, 50)).toBe(100)
  })
  it('scales uncertainty by quantity', () => {
    expect(lineAllowanceSen(1000, 100)).toBe(20)
    expect(lineAllowanceSen(1000, 1000)).toBe(200)
  })
})

describe('distance', () => {
  it('uses the locked Earth radius and half-up metre rounding', () => {
    expect(haversineMetres({ latitude: 3.1073, longitude: 101.6067 }, { latitude: 3.1073, longitude: 101.6067 })).toBe(0)
    expect(haversineMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBe(111195)
  })
})
```

- [ ] **Step 2: Run the primitive test and observe missing-module failures**

Run:

```bash
npm run test:saves -- src/pricecatcher/__tests__/primitives.test.ts
```

Expected: FAIL because `ids`, `dates`, `money`, and `distance` do not exist.

- [ ] **Step 3: Implement identifier and date primitives**

Use numeric-string validation rather than `parseInt` truncation:

```ts
export function canonicalizeCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^\d+(?:\.0+)?$/.test(text)) return null
  const integerText = text.replace(/\.0+$/, '').replace(/^0+(?=\d)/, '')
  const numeric = Number(integerText)
  return Number.isSafeInteger(numeric) && numeric >= 0 ? String(numeric) : null
}

export function compareCanonicalCodes(left: string, right: string): number {
  const leftParsed = CanonicalCodeSchema.parse(left)
  const rightParsed = CanonicalCodeSchema.parse(right)
  const a = BigInt(leftParsed); const b = BigInt(rightParsed)
  return a < b ? -1 : a > b ? 1 : 0
}
```

Import `CanonicalCodeSchema` from `contracts/common.ts`. Every code sort and code tie-break in domain, compiler, reports, candidate selection, reconciliation, manifests, and tests must call this one comparator; do not use lexical ordering or reimplement numeric comparison. Add contract/primitive tests for `2` versus `10`, maximum-safe acceptance, one-past-maximum rejection, and schema/canonicalizer agreement.

Implement local-date arithmetic by parsing validated date components into UTC midday and formatting with `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })`. Export exactly:

```ts
export function malaysiaDateAt(instant: string): LocalDate
export function addLocalDates(date: LocalDate, delta: number): LocalDate
export function differenceInLocalDates(later: LocalDate, earlier: LocalDate): number
```

Reject invalid instants and impossible dates with `RangeError`.

- [ ] **Step 4: Implement money and distance primitives**

Use these formulas:

```ts
export function bigIntToSafeNumber(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new RangeError('result exceeds safe integer range')
  return number
}

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator <= 0) {
    throw new RangeError('non-negative safe integer numerator and positive denominator required')
  }
  return bigIntToSafeNumber(
    (BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)
  )
}

export function multiplyDivideHalfUp(left: number, right: number, denominator: number): number {
  if (![left, right, denominator].every(Number.isSafeInteger) || left < 0 || right < 0 || denominator <= 0) {
    throw new RangeError('non-negative safe integers and a positive denominator required')
  }
  const product = BigInt(left) * BigInt(right)
  return bigIntToSafeNumber((product + BigInt(Math.floor(denominator / 2))) / BigInt(denominator))
}

export function checkedAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new RangeError('safe integers required')
  return bigIntToSafeNumber(BigInt(left) + BigInt(right))
}

export function checkedSubtract(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new RangeError('safe integers required')
  return bigIntToSafeNumber(BigInt(left) - BigInt(right))
}

export function checkedSum(values: readonly number[]): number {
  return bigIntToSafeNumber(values.reduce((total, value) => {
    if (!Number.isSafeInteger(value)) throw new RangeError('safe integers required')
    return total + BigInt(value)
  }, 0n))
}

export function lineTotalSen(priceSen: number, quantityHundredths: number): number {
  return multiplyDivideHalfUp(priceSen, quantityHundredths, 100)
}

export function unitAllowanceSen(priceSen: number): number {
  return Math.max(20, bigIntToSafeNumber((BigInt(priceSen) * 2n + 99n) / 100n))
}

export function lineAllowanceSen(priceSen: number, quantityHundredths: number): number {
  return bigIntToSafeNumber((BigInt(unitAllowanceSen(priceSen)) * BigInt(quantityHundredths) + 99n) / 100n)
}
```

`parsePriceSen` must accept only a positive decimal string/number with zero, one, or two fractional digits and return `null` for zero, negatives, non-finite numbers, scientific notation, or more precision.

Add boundary tests proving checked add/subtract/sum accept signed safe results and throw before any result outside `Number.MIN_SAFE_INTEGER…Number.MAX_SAFE_INTEGER` can be represented.

Implement Haversine with `MEAN_EARTH_RADIUS_METRES = 6_371_008.8`, reject non-finite/out-of-range latitude or longitude, convert degrees to radians, clamp the intermediate `a` to `[0, 1]`, and use `Math.floor(distance + 0.5)` for positive half-up metre rounding.

- [ ] **Step 5: Run primitives and contract regression tests**

```bash
npm run test:saves -- src/pricecatcher/__tests__/primitives.test.ts src/pricecatcher/__tests__/contracts.test.ts
npm run typecheck:saves
```

Expected: all selected tests PASS and type-check PASS.

- [ ] **Step 6: Commit the deterministic primitives**

```bash
git add src/pricecatcher/ids.ts src/pricecatcher/dates.ts src/pricecatcher/money.ts src/pricecatcher/distance.ts src/pricecatcher/__tests__/primitives.test.ts
git commit -m "feat: add deterministic PriceCatcher primitives"
git push origin UPGRADES
```

---

### Task 3: Implement duplicate handling and Selangor quality screening

**Files:**
- Create: `src/pricecatcher/quality.ts`
- Test: `src/pricecatcher/__tests__/quality.test.ts`

**Interfaces:**
- Consumes: canonical codes, `LocalDate`, integer-sen helpers, and `QualityReason`.
- Produces: `NormalizedObservation`, `ConsolidatedCell`, `ReferenceStats`, `collapseObservationRows(rows)`, `buildReferenceStats(rows, itemCode, targetDate)`, and `classifyTargetCell(cell, stats)`.

- [ ] **Step 1: Write failing duplicate and reference tests**

Create `src/pricecatcher/__tests__/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildReferenceStats, classifyTargetCell, collapseObservationRows } from '../quality'

const row = (premiseCode: string, priceSen: number, observedDate = '2026-08-01') => ({
  observedDate,
  premiseCode,
  itemCode: '10',
  officialUnit: '1kg',
  priceSen
})

describe('duplicate consolidation', () => {
  it('collapses exact duplicates but rejects conflicting prices', () => {
    const exact = collapseObservationRows([row('1', 500), row('1', 500)])
    expect(exact.cells).toEqual([expect.objectContaining({ status: 'value', priceSen: 500 })])

    const conflict = collapseObservationRows([row('1', 500), row('1', 1500)])
    expect(conflict.cells).toEqual([expect.objectContaining({
      status: 'conflicting-duplicate',
      pricesSen: [500, 1500]
    })])
  })

  it('makes malformed evidence poison the keyed cell even beside a valid price', () => {
    const malformed = { ...row('1', 500), status: 'invalid-price' as const, rawPriceValue: '5.0.0' }
    const result = collapseObservationRows([row('1', 500), malformed])
    expect(result.cells).toEqual([expect.objectContaining({
      status: 'invalid-price', rawPriceValues: ['5.0.0'], validPricesSen: [500]
    })])
  })
})

describe('equal-premise references', () => {
  it('uses one median per premise and excludes the target date', () => {
    const rows = Array.from({ length: 20 }, (_, index) => [
      row(String(index + 1), 1000 + index, '2026-07-01'),
      row(String(index + 1), 1000 + index, '2026-07-31'),
      row(String(index + 1), 99999, '2026-08-01')
    ]).flat()
    const stats = buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')
    expect(stats.status).toBe('ready')
    if (stats.status === 'ready') {
      expect(stats.distinctPremises).toBe(20)
      expect(stats.medianSen).toBeLessThan(1100)
    }
  })

  it('is finite at zero MAD and rejects hard-ratio errors', () => {
    const references = collapseObservationRows(
      Array.from({ length: 20 }, (_, index) => row(String(index + 1), 1000, '2026-07-31'))
    ).cells
    const stats = buildReferenceStats(references, '10', '2026-08-01')
    expect(classifyTargetCell(collapseObservationRows([row('99', 1000)]).cells[0]!, stats)).toMatchObject({ status: 'eligible' })
    expect(classifyTargetCell(collapseObservationRows([row('99', 100)]).cells[0]!, stats)).toMatchObject({
      status: 'anomalous', reason: 'outside-ratio-bound'
    })
  })

  it('requires twenty distinct reference premises', () => {
    const references = collapseObservationRows(
      Array.from({ length: 19 }, (_, index) => row(String(index + 1), 1000, '2026-07-31'))
    ).cells
    expect(buildReferenceStats(references, '10', '2026-08-01')).toEqual({
      status: 'insufficient-reference',
      distinctPremises: 19
    })
  })
})
```

- [ ] **Step 2: Run the quality test and observe the missing-module failure**

```bash
npm run test:saves -- src/pricecatcher/__tests__/quality.test.ts
```

Expected: FAIL because `quality.ts` does not exist.

- [ ] **Step 3: Implement deterministic consolidation**

Define the inputs and output union exactly:

```ts
export interface NormalizedObservation {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
  priceSen: number
}

export interface InvalidPriceObservation {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
  status: 'invalid-price'
  rawPriceValue: string
}

export type ParsedObservation = NormalizedObservation | InvalidPriceObservation

export type ConsolidatedCell =
  | (Omit<NormalizedObservation, 'priceSen'> & { status: 'value'; priceSen: number })
  | (Omit<NormalizedObservation, 'priceSen'> & {
      status: 'conflicting-duplicate'
      pricesSen: number[]
    })
  | (Omit<InvalidPriceObservation, 'status' | 'rawPriceValue'> & {
      status: 'invalid-price'
      rawPriceValues: string[]
      validPricesSen: number[]
    })

export function collapseObservationRows(rows: readonly ParsedObservation[]): {
  cells: ConsolidatedCell[]
  exactDuplicateCount: number
  conflictingCellCount: number
}
```

Group by `observedDate + premiseCode + itemCode + officialUnit`. If any keyed row has an invalid raw price, emit one `invalid-price` cell containing bounded/sorted raw values and all otherwise valid prices; a valid neighbour must never rescue it. Otherwise sort distinct prices numerically: one distinct price produces one `value`, while more than one produces `conflicting-duplicate`. Reference building ignores invalid/conflicting cells; target classification maps them to the corresponding anomaly. Sort returned cells by date, premise code, item code, then unit so artifact generation is stable.

- [ ] **Step 4: Implement the equal-premise reference and gates**

For the 30 local dates immediately before `targetDate`, collect only `value` cells for the same item. Compute a half-up median per premise, then a cross-premise half-up median. Require 20 premises. Compute MAD over the per-premise values. Preserve the exact `1.4826 × MAD` rational scale; only the explicit two-percent floor is ceiled to a whole sen:

```ts
const twoPercentMedianSen = bigIntToSafeNumber((BigInt(medianSen) * 2n + 99n) / 100n)
const robustScaleTimes10k = [
  BigInt(madSen) * 14_826n,
  20n * 10_000n,
  BigInt(twoPercentMedianSen) * 10_000n
].reduce((largest, value) => value > largest ? value : largest)

const price = BigInt(priceSen)
const median = BigInt(medianSen)
const outsideRatio = price * 4n <= median || price >= median * 4n
const robustOutlier = BigInt(Math.abs(priceSen - medianSen)) * 10_000n > 6n * robustScaleTimes10k
```

All operands begin as validated safe non-negative integers and the scale/outlier comparison remains `bigint` end-to-end, so this path has no integer overflow or lossy BigInt-to-number conversion.

Return these exact unions:

```ts
export type ReferenceStats =
  | { status: 'insufficient-reference'; distinctPremises: number }
  | {
      status: 'ready'
      distinctPremises: number
      medianSen: number
      madSen: number
      robustScaleTimes10k: bigint
    }

export type ClassifiedEvidence =
  | { status: 'eligible'; observedDate: LocalDate; priceSen: number }
  | { status: 'anomalous'; observedDate: LocalDate; reason: QualityReason }
  | { status: 'insufficient-reference'; observedDate: LocalDate }
```

An `invalid-price` target becomes `anomalous/invalid-price`; a `conflicting-duplicate` target becomes `anomalous/conflicting-duplicate`. Do not inspect any newer or older target cell inside `classifyTargetCell`; date choice belongs to the evidence task.

- [ ] **Step 5: Add hard-boundary, near-zero-MAD, and target-date leakage tests**

Add cases asserting:

```ts
expect(classifyTargetCell(targetAtQuarterMedian, stats)).toMatchObject({ status: 'anomalous' })
expect(classifyTargetCell(targetAtFourTimesMedian, stats)).toMatchObject({ status: 'anomalous' })
expect(buildReferenceStats(rowsIncludingHugeTargetDate, '10', '2026-08-01')).toEqual(
  buildReferenceStats(rowsWithoutTargetDate, '10', '2026-08-01')
)
expect(statsWithOneSenMad.status === 'ready' && statsWithOneSenMad.robustScaleTimes10k).toBeGreaterThanOrEqual(200_000n)
expect(classifyTargetCell(price899AboveMedianWithMad101, exactRationalStats)).toMatchObject({ status: 'anomalous' })
```

The `MAD=101, |difference|=899` regression is load-bearing: exact `1.4826 × MAD` rejects it, whereas first ceiling the scaled MAD to 150 sen would incorrectly admit it.

- [ ] **Step 6: Run quality and primitive regression tests**

```bash
npm run test:saves -- src/pricecatcher/__tests__/quality.test.ts src/pricecatcher/__tests__/primitives.test.ts
npm run typecheck:saves
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit quality screening**

```bash
git add src/pricecatcher/quality.ts src/pricecatcher/__tests__/quality.test.ts
git commit -m "feat: screen PriceCatcher evidence deterministically"
git push origin UPGRADES
```

---

### Task 4: Implement freshness, same-date matching, coverage, and failure precedence

**Files:**
- Create: `src/pricecatcher/evidence.ts`
- Create: `src/pricecatcher/__tests__/snapshotFixture.ts`
- Test: `src/pricecatcher/__tests__/evidence.test.ts`

**Interfaces:**
- Consumes: `PilotSnapshotV1`, loose `RecommendationRequest`, strict `RecommendationInput`, date primitives, Haversine distance, and classified snapshot evidence.
- Produces: `EvidencePreflightInput`, `normalizeRecommendationRequest(request)`, `preflightUsualAndGeometry(snapshot, input)`, pre-mode `preflightBasketDiscovery(snapshot, input)`, `evaluateEvidence(snapshot, request): EvidenceEvaluation`, `mergeBasketLines(snapshot, lines)`, and mode-aware `preflightEvidence(snapshot, request): PreflightEvidence`.

- [ ] **Step 1: Create a reusable valid snapshot factory**

Create `snapshotFixture.ts` exporting:

```ts
export function makeSnapshot(overrides: Partial<PilotSnapshotV1> = {}): PilotSnapshotV1
export function eligibleCell(
  premiseCode: string,
  itemCode: string,
  observedDate: LocalDate,
  priceSen: number
): EvidenceCellV1
export function validInput(overrides?: Partial<RecommendationInput>): RecommendationInput
export function snapshotWithCandidateObservations(observations: ObservationEvidenceV1[]): PilotSnapshotV1
export function snapshotWithPairDates(usualDate: LocalDate, candidateDate: LocalDate): PilotSnapshotV1
export function snapshotWithThreePremisesAndOneBadCandidate(): PilotSnapshotV1
export function snapshotWithOldData(): PilotSnapshotV1
export function inputWithOldClock(): RecommendationInput
export function snapshotWithBadBaselineAndNoCandidate(): PilotSnapshotV1
export function snapshotWithOnlyFarCandidates(): PilotSnapshotV1
export function snapshotWithMixedCandidateFailures(): PilotSnapshotV1
```

The default fixture uses `compiledAt = 2026-08-03T03:00:00.000Z`, `dataAsOfDate = 2026-08-02`, two field-safe premises `1` and `2`, item `10` in `whole-units`, and eligible evidence dated `2026-08-02`.

- [ ] **Step 2: Write failing fail-closed evidence tests**

Create `evidence.test.ts` with these cases:

```ts
it('rejects an evaluation clock before compilation', () => {
  const result = evaluateEvidence(makeSnapshot(), validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }))
  expect(result).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'clock-invalid' })
})

it('accepts today or yesterday but rejects older observations', () => {
  expect(evaluateEvidence(makeSnapshot(), validInput()).kind).toBe('ready')
  expect(evaluateEvidence(snapshotWithOldData(), validInput())).toMatchObject({
    kind: 'insufficient-evidence', primaryReason: 'snapshot-stale'
  })
})

it('never falls back from a newer anomalous row', () => {
  const snapshot = snapshotWithCandidateObservations([
    { status: 'eligible', observedDate: '2026-08-01', priceSen: 500 },
    { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }
  ])
  expect(evaluateEvidence(snapshot, validInput())).toMatchObject({
    kind: 'insufficient-evidence', primaryReason: 'candidate-anomalous'
  })
})

it('treats materialized missing as no raw row rather than masking yesterday', () => {
  const snapshot = snapshotWithCandidateObservations([
    { status: 'eligible', observedDate: '2026-08-01', priceSen: 500 },
    { status: 'missing', observedDate: '2026-08-02' }
  ])
  expect(evaluateEvidence(snapshot, validInput()).kind).toBe('ready')
})

it('requires independently newest baseline and candidate dates to match', () => {
  const snapshot = snapshotWithPairDates('2026-08-01', '2026-08-02')
  expect(evaluateEvidence(snapshot, validInput())).toMatchObject({
    kind: 'insufficient-evidence', primaryReason: 'candidate-date-mismatch'
  })
})

it('excludes one bad candidate while retaining a complete independent candidate', () => {
  const result = evaluateEvidence(snapshotWithThreePremisesAndOneBadCandidate(), validInput())
  expect(result).toMatchObject({ kind: 'ready', candidates: [{ premiseCode: '3' }] })
  if (result.kind === 'ready') expect(result.exclusions.excludedByReason.anomalous).toBe(1)
})
```

- [ ] **Step 3: Run the evidence test and observe the missing-module failure**

```bash
npm run test:saves -- src/pricecatcher/__tests__/evidence.test.ts
```

Expected: FAIL because `evidence.ts` does not exist.

- [ ] **Step 4: Implement input normalization and failure precedence**

`mergeBasketLines` must validate item membership, sum duplicate quantities with safe-integer checks, cap at 9,900, and require quantities divisible by 100 for `whole-units` items.

Define `EvidenceEvaluation` as:

```ts
export interface EvidencePreflightInput {
  evaluatedAt: ISOInstant
  location: RecommendationInput['location']
  usualPremiseCode: string
  lines: RecommendationInput['lines']
  mode: RecommendationInput['mode']
}

export type BasketDiscoveryInput = Omit<EvidencePreflightInput, 'mode'>

export interface CompletePremiseEvidence {
  premiseCode: string
  straightLineMetres: number
  lines: Array<{
    itemCode: string
    officialUnit: string
    quantityHundredths: number
    observedDate: LocalDate
    priceSen: Sen
  }>
}

export interface PreflightEvidence {
  baselineReady: boolean
  completeCandidatePremiseCodes: string[]
  excludedByReason: ExclusionCounts['excludedByReason']
}

export type EvidenceEvaluation =
  | {
      kind: 'ready'
      evaluatedDate: LocalDate
      usual: CompletePremiseEvidence
      candidates: CompletePremiseEvidence[]
      exclusions: ExclusionCounts
      comparisonOnlyReasons: ComparisonOnlyReason[]
    }
  | {
      kind: 'insufficient-evidence'
      primaryReason: ReasonCode
      details: ReasonDetail[]
      exclusions?: ExclusionCounts
    }
```

Implement precedence in this exact order: snapshot schema/integrity is handled by the loader; then clock validity, snapshot freshness, parsed input/location, usual premise and basket, baseline evidence, in-radius candidate existence, candidate completeness. Within evidence: anomalous, insufficient-reference, stale, missing, date-mismatch.

The request shell from Task 1 is normalized field-by-field before calculation. A non-object/extra-field/malformed clock or coordinate is `input-invalid`; absent location is `location-missing`; valid coordinates with accuracy `>100` are `location-imprecise`; absent or empty `lines` is `basket-empty`; then item/usual membership and strict calculation parsing apply. Parameterized tests call the public boundary directly and prove all named reasons are reachable before arithmetic.

`ExclusionCounts` is a premise partition, never a failed-line counter. Its candidate universe is every published premise except the selected usual premise, so `pilotPremiseCount = snapshot.premises.length - 1`. Assign each universe premise exactly once: `outside-radius` first; otherwise `complete` if every requested line is aligned/eligible; otherwise the first present failure bucket in the fixed premise-level precedence `anomalous`, `insufficient-reference`, `stale`, `missing`, `date-mismatch`. Set `inRadiusCandidateCount` to complete plus all non-outside buckets and `completeCandidateCount` to the complete partition. The three schema invariants must hold: `outside + inRadius = pilot`, `complete + nonOutsideExcluded = inRadius`, and `complete + allExcluded = pilot`. `details` may retain multiple sorted line-level facts, but never increment counts more than once for a premise. Sort details by reason precedence, `compareCanonicalCodes(premiseCode)`, `compareCanonicalCodes(itemCode)`, then date. Add a candidate with three bad lines and prove it contributes exactly one premise to the highest-priority bucket while all line details remain visible.

Omit `exclusions` for failures before candidate enumeration because counts would be fabricated. Once enumeration begins, every `no-candidate-in-radius|candidate-*|no-complete-candidate` failure carries the fully computed `ExclusionCounts`; the result-schema refinement rejects a missing count object for those reasons. Add contract/evidence/UI tests for both early omission and candidate-stage required counts.

The clock is invalid when `evaluatedAt < compiledAt - 5 minutes` or the Malaysia evaluation date is before `dataAsOfDate`. Snapshot stale means `dataAsOfDate` is neither evaluation date nor its immediately preceding local date.

`makeSnapshot({ dataAsOfDate })` does not rewrite evidence implicitly. `snapshotWithOldData()` explicitly sets both `dataAsOfDate` and every fixture observation to `2026-08-01`, so the stale test exercises freshness rather than an internally inconsistent fixture.

- [ ] **Step 5: Implement newest-cell selection and pair alignment**

For each `(premise, item)`, sort its two published observations descending by `observedDate` and select the newest non-`missing` observation. A materialized `missing` means no raw row existed on that date, so it does not mask an older fresh raw row; return missing only if both target dates are missing. Never filter past a newer `anomalous` or `insufficient-reference` raw observation to rescue an older eligible one. For one baseline/candidate line:

```ts
if (usual.observedDate !== candidate.observedDate) {
  return { status: 'excluded', reason: 'date-mismatch', itemCode }
}
```

Do not search for an older common date. Require every basket line. Candidates are included when their Haversine distance is `<= 5_000` metres for drive or `<= 2_000` for walk. Exclude the usual premise before counting candidates.

`preflightEvidence` uses `EvidencePreflightInput` and never requires fuel, basket scope, threshold, or fixed-cost fields. `preflightBasketDiscovery` uses `BasketDiscoveryInput` after at least one valid line but before mode selection; it applies the same complete-basket/date/evidence rules under a fixed inclusive 5,000-metre discovery radius and labels its result “complete for these items within 5 km discovery—choose a travel mode to apply its radius.” It does not synthesize `mode: 'drive'`, make a route/trip claim, or become a recommendation input. Once the user explicitly chooses walk/drive, the UI replaces it with `preflightEvidence` at the exact 2,000/5,000-metre mode radius. Add a fixture with one candidate at 3 km: it appears in discovery, disappears after walk is chosen, and remains after drive is chosen.

In final evaluation, `comparisonOnlyReasons` is deduplicated in this order: selected-items-only, walking-route-unverified, fixed-trip-cost-unknown, publication-not-consumer-ready. Add the publication reason when the snapshot is not `consumer-pilot` or any compared premise is not field-verified and unexpired on `evaluatedDate`. Determine basket-scope/walking/publication reasons before trip-assumption validation. If any is present, absent trip-only fields are valid and ignored. Only an otherwise trip-eligible consumer drive requires a fixed-cost map entry for the usual premise and every complete viable premise: a missing entry is `input-invalid`; a present `unknown` entry adds `fixed-trip-cost-unknown`; malformed values remain `input-invalid`.

The earlier usual-shop step uses a separate non-vacuous `preflightUsualAndGeometry` input containing only evaluated clock, location, and usual premise. Before any basket exists it intentionally uses the pilot's fixed inclusive 5,000-metre discovery radius and labels the result “within 5 km”; it does not imply a route or trip recommendation. It applies clock/freshness/location/usual validation, sets `usualHasRecentPilotData` only when that premise has at least one newest selected cell with `eligible` evidence on an allowed fresh target date, and counts `coordinateViablePremiseCount` from other unexpired verified premises inside that radius without pretending any basket is complete. It never calls `mergeBasketLines`, never returns `basket-empty`, and never treats an empty item set as complete. Add direct tests for no recent usual data, zero/one/exactly-5,000-metre geometry candidates, fixed-radius basket discovery after a line exists, and mode-aware preflight taking over only after an explicit mode choice.

- [ ] **Step 6: Add the full reason-precedence table as parameterized tests**

Add `it.each` cases where two failures coexist and assert the higher-priority reason wins, including:

```ts
[
  ['clock-invalid beats stale', snapshotWithOldData(), inputWithOldClock(), 'clock-invalid'],
  ['baseline anomaly beats candidate absence', snapshotWithBadBaselineAndNoCandidate(), validInput(), 'baseline-anomalous'],
  ['no radius candidate beats candidate evidence', snapshotWithOnlyFarCandidates(), validInput(), 'no-candidate-in-radius'],
  ['candidate anomaly beats candidate missing', snapshotWithMixedCandidateFailures(), validInput(), 'candidate-anomalous']
]
```

- [ ] **Step 7: Run evidence, quality, and contract tests**

```bash
npm run test:saves -- src/pricecatcher/__tests__/evidence.test.ts src/pricecatcher/__tests__/quality.test.ts src/pricecatcher/__tests__/contracts.test.ts
npm run typecheck:saves
```

Expected: all selected tests PASS.

- [ ] **Step 8: Commit fail-closed evidence evaluation**

```bash
git add src/pricecatcher/evidence.ts src/pricecatcher/__tests__/evidence.test.ts src/pricecatcher/__tests__/snapshotFixture.ts
git commit -m "feat: enforce complete same-date basket evidence"
git push origin UPGRADES
```

---

### Task 5: Implement travel costs and recommendation selection

**Files:**
- Create: `src/pricecatcher/travel.ts`
- Create: `src/pricecatcher/recommend.ts`
- Create: `src/pricecatcher/index.ts`
- Modify: `src/pricecatcher/__tests__/snapshotFixture.ts`
- Test: `src/pricecatcher/__tests__/travel.test.ts`
- Test: `src/pricecatcher/__tests__/recommend.test.ts`

**Interfaces:**
- Consumes: `EvidenceEvaluation`, normalized `RecommendationInput`, loose public request input, integer-sen helpers, and Version 1 result contracts.
- Produces: `drivingTripCost(distanceMetres, assumptions, routeFactorBasisPoints): DrivingTripCostV1`, `recommend(snapshot: PilotSnapshotV1, request: unknown): RecommendationResult`, and the supported public exports from `src/pricecatcher/index.ts`. The loader is the sole `unknown` snapshot boundary; domain functions accept only a schema-validated snapshot and tests/type-check prohibit direct malformed-snapshot calls.

- [ ] **Step 1: Write failing travel-cost tests**

Create `travel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { drivingTripCost } from '../travel'

describe('driving trip costs', () => {
  it('uses a dedicated round trip and rounds fuel once to sen', () => {
    expect(drivingTripCost(1000, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 50
    }, 12500)).toEqual({
      straightLineMetres: 1000,
      routeFactorBasisPoints: 12500,
      estimatedRoundTripRoadMetres: 2500,
      fuelCostSen: 43,
      fixedCostSen: 50,
      totalTripCostSen: 93
    })
  })
})
```

- [ ] **Step 2: Write failing recommendation result tests**

First add these deterministic builders to `snapshotFixture.ts`:

```ts
export function goldenSnapshot(): PilotSnapshotV1
export function goldenSnapshotWithMode(mode: 'fixture' | 'desk-demo'): PilotSnapshotV1
export function goldenInput(overrides?: Partial<RecommendationInput>): RecommendationInput
export function inputWithoutTripFields(overrides?: Partial<RecommendationInput>): RecommendationInput
export function snapshotWherePriceAndTripWinnersDiffer(): PilotSnapshotV1
export function priceOnlyDrivingInput(): RecommendationInput
export function drivingInput(): RecommendationInput
```

`goldenSnapshot` is a non-shipped synthetic `consumer-pilot` snapshot whose premises are unexpired `field-verified`. It uses origin/usual coordinates `(0, 0)`, candidate coordinates `(0, 0.0089932)`, a 1,000-sen usual item and 700-sen candidate item, the same observation date, and confirmed zero fixed costs. `snapshotWherePriceAndTripWinnersDiffer` uses the same synthetic consumer mode, premise `2` at `(0, 0.0359728)` with a 600-sen basket, and premise `3` at `(0, 0.0044966)` with a 700-sen basket. At the fixed origin, premise `2` is the observed-price winner, while conservative candidate travel makes premise `3` the driving winner. All three fixed-cost entries are confirmed zero. Generated/public fixture content remains `publicationMode: 'fixture'` and never uses these consumer-test builders.

Create `recommend.test.ts` covering:

```ts
it('switches only when conservative saving clears the threshold', () => {
  const result = recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 200 }))
  expect(result).toMatchObject({ kind: 'switch' })
  if (result.kind === 'switch') {
    expect(result.comparison.conservativeNetSavingSen).toBeGreaterThanOrEqual(200)
    expect(result.comparison.priceComparison.lines.every(line =>
      line.usualLineAllowanceSen >= 20 && line.candidateLineAllowanceSen >= 20)).toBe(true)
  }
})

it('returns no clear advantage when only the point estimate clears', () => {
  expect(recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 250 }))).toMatchObject({
    kind: 'no-clear-advantage'
  })
})

it('returns price-only comparison for walking, partial scope, or unknown fixed cost', () => {
  const walking = recommend(goldenSnapshot(), inputWithoutTripFields({ mode: 'walk' }))
  expect(walking).toMatchObject({
    kind: 'comparison-only', reasons: ['walking-route-unverified']
  })
  const partial = recommend(goldenSnapshot(), inputWithoutTripFields({ basketScope: 'selected-items-only', mode: 'walk' }))
  expect(partial).toMatchObject({
    kind: 'comparison-only', reasons: ['selected-items-only', 'walking-route-unverified']
  })
  const unknown = recommend(goldenSnapshot(), goldenInput({
    fixedTripCostByPremiseCode: {
      '1': { status: 'confirmed', amountSen: 0 },
      '2': { status: 'unknown' }
    }
  }))
  expect(unknown).toMatchObject({
    kind: 'comparison-only', reasons: ['fixed-trip-cost-unknown']
  })
})

it('never emits a trip verdict from fixture or desk-demo publication', () => {
  for (const publicationMode of ['fixture', 'desk-demo'] as const) {
    expect(recommend(goldenSnapshotWithMode(publicationMode), inputWithoutTripFields({ mode: 'drive' }))).toMatchObject({
      kind: 'comparison-only', reasons: ['publication-not-consumer-ready']
    })
  }
})

it('selects price-only by basket total and trip results by conservative saving', () => {
  expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), priceOnlyDrivingInput())).toMatchObject({
    kind: 'comparison-only', comparison: { candidatePremiseCode: '2' }
  })
  expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), drivingInput())).toMatchObject({
    kind: 'switch', comparison: { priceComparison: { candidatePremiseCode: '3' } }
  })
})
```

`priceOnlyDrivingInput` uses `mode: 'drive'` plus `basketScope: 'selected-items-only'`, so the 5 km driving radius includes premise `2` at roughly 4 km while still forcing price-only output. Do not use walking for this fixture: its 2 km radius would correctly exclude premise `2`.

- [ ] **Step 3: Run the tests and observe missing-module failures**

```bash
npm run test:saves -- src/pricecatcher/__tests__/travel.test.ts src/pricecatcher/__tests__/recommend.test.ts
```

Expected: FAIL because `travel.ts` and `recommend.ts` do not exist.

- [ ] **Step 4: Implement exact driving arithmetic**

Only after the result is otherwise trip-eligible, call `requireTripAssumptions(input, usualCode, completeCandidateCodes)`. It returns a typed object with non-optional `fuelEfficiencyDeciKmPerL`, `fuelPriceSenPerL`, `worthwhileThresholdSen`, and complete fixed-cost map; efficiency alone defaults to 120. There is no hidden fuel-price or threshold default in the domain. A consumer complete-trip drive without any required value returns `input-invalid` before arithmetic. Structurally price-only fixture/desk/walk/selected-items requests may omit all of them. Add both branches to tests and use only the returned narrowed object in trip arithmetic.

Use only safe integers:

```ts
const oneWayRoadMetres = multiplyDivideHalfUp(distanceMetres, routeFactorBasisPoints, 10_000)
const estimatedRoundTripRoadMetres = oneWayRoadMetres * 2
const fuelCostSen = multiplyDivideHalfUp(
  estimatedRoundTripRoadMetres,
  fuelPriceSenPerL,
  100 * fuelEfficiencyDeciKmPerL
)
```

Validate route factors as safe integers from 5,000 through 30,000 basis points; current recommendation calls use exactly `10_000`, `12_500`, or `15_000`. This keeps Version 1 capable of later field-calibrated widening without authorizing it in this branch. Require a non-negative safe-integer distance; use checked BigInt helpers for products; and reject when doubling one-way road metres would exceed the safe-integer range. Candidate radius enforcement remains in evidence evaluation; the usual-shop distance is not silently capped. Return the exact `DrivingTripCostV1` fields from Task 1.

- [ ] **Step 5: Implement price and conservative basket comparisons**

For each line:

```ts
const usualTotal = lineTotalSen(usual.priceSen, quantityHundredths)
const candidateTotal = lineTotalSen(candidate.priceSen, quantityHundredths)
const candidateUnitAllowance = unitAllowanceSen(candidate.priceSen)
const usualUnitAllowance = unitAllowanceSen(usual.priceSen)
const candidateAllowance = lineAllowanceSen(candidate.priceSen, quantityHundredths)
const usualAllowance = lineAllowanceSen(usual.priceSen, quantityHundredths)
const usualConservative = Math.max(0, checkedSubtract(usualTotal, usualAllowance))
const candidateConservative = checkedAdd(candidateTotal, candidateAllowance)
```

Serialize all four side-specific allowance fields from the exact values above. Never reuse the candidate allowance for the usual side. Add an unequal-price regression where the two-percent term dominates and assert every serialized total/allowance recomputes exactly from its own side.

Implement every displayed `+`/`-` in that sketch with `checkedAdd`/`checkedSubtract`; use `checkedSum` for basket totals. Use the same helpers for trip totals, net costs, estimated/conservative savings, and candidate ranking. If arithmetic still raises `RangeError` after runtime input validation, `recommend` must fail closed as `insufficient-evidence/input-invalid` without returning a partial comparison. Add maximal-safe-price and multi-line aggregation tests.

Observed price-only winner: lowest candidate basket total, then most recent oldest observation date, then shortest distance, then numeric canonical premise code.

Driving winner: highest `usualConservativeNetCostSen - candidateConservativeNetCostSen`, with the same tie-break order. Estimated trips use factor 12,500; conservative usual uses 10,000; conservative candidate uses 15,000. Use the confirmed premise-specific fixed cost in every trip variant.

- [ ] **Step 6: Implement result selection and serialization**

Call `evaluateEvidence` first. Pass through `insufficient-evidence`. When comparison-only reasons are non-empty, return `PriceComparisonV1` and no trip fields. Otherwise return:

```ts
return conservativeNetSavingSen > 0 && conservativeNetSavingSen >= tripAssumptions.worthwhileThresholdSen
  ? { kind: 'switch', comparison: tripComparison, exclusions }
  : { kind: 'no-clear-advantage', comparison: tripComparison, exclusions }
```

At threshold RM0, exactly zero or negative conservative saving is still `no-clear-advantage`; a `switch` always represents a positive saving. Add `-1/0/+1` saving tests at zero threshold in addition to the equality-at-positive-threshold boundary.

Validate the final object with `RecommendationResultSchema.parse(result)` before returning it in development/tests. Export only contracts, `malaysiaDateAt`, `preflightUsualAndGeometry`, `preflightBasketDiscovery`, `preflightEvidence`, and `recommend` from `src/pricecatcher/index.ts`.

- [ ] **Step 7: Add threshold, quantity, fixed-cost, and tie boundary tests**

Add cases proving a positive conservative saving exactly equal to the threshold is `switch`, one sen below is `no-clear-advantage`, 10-unit uncertainty scaling, RM0 confirmed versus unknown, whole-unit rejection, duplicate basket-line merging, candidate exactly 5,000 metres away, and canonical premise-code tie-breaking.

- [ ] **Step 8: Run the complete domain suite and type-check**

```bash
npm run test:saves -- src/pricecatcher
npm run typecheck:saves
```

Expected: every domain test PASS and type-check PASS.

- [ ] **Step 9: Commit the recommendation engine**

```bash
git add src/pricecatcher/travel.ts src/pricecatcher/recommend.ts src/pricecatcher/index.ts src/pricecatcher/__tests__/snapshotFixture.ts src/pricecatcher/__tests__/travel.test.ts src/pricecatcher/__tests__/recommend.test.ts
git commit -m "feat: recommend conservative PriceCatcher trips"
git push origin UPGRADES
```

---

### Task 6: Implement the pure two-universe compiler and private audit

**Files:**
- Create: `src/pricecatcher/contracts/compiler.ts`
- Modify: `src/pricecatcher/contracts/index.ts`
- Create: `src/pricecatcher/compile.ts`
- Create: `src/pricecatcher/review-source-policy.ts`
- Create: `src/pricecatcher/__tests__/compilerFixture.ts`
- Test: `src/pricecatcher/__tests__/compile.test.ts`

**Interfaces:**
- Consumes: parsed raw transaction/premise/item rows, curated content, a strict source lock, an injected `compiledAt`, the lock cutoff, and precomputed digests for every effective input.
- Produces: `compilePilot(input): { snapshot: PilotSnapshotV1; audit: CompilerAuditV1; normalizedSlice: NormalizedSourceSliceV1 }`, `compilePilotFromNormalizedSlice({ slice, parsedContent, parsedCoverageReport, parsedFeasibilityReport, verifiedDigests })` with canonical-byte-equivalent outputs after adapter verification, `collectQualityReviewBasis(input)`, and strict schemas for compiler input, curated private content, review collection, audit, and normalized source slice.

- [ ] **Step 1: Define failing compiler tests for the two universes and two target dates**

Create `compilerFixture.ts` exporting:

```ts
export function makeCompilerInput(overrides?: CompilerFixtureOverrides): CompilePilotInput
export function referenceOnlyRow(observedDate: LocalDate): RawTransactionRow
export function pilotRow(observedDate: LocalDate): RawTransactionRow
```

The builder supplies 20 allowed single-operator Selangor reference premises using the real lookup spelling `Selangor`, 3 reviewed pilot premises in one fixture microzone, item `10`, 32 dates from `2026-07-02` through `2026-08-02`, a strict public-window synthetic source lock with `throughDate = 2026-08-02`, `compiledAt = 2026-08-03T04:00:00.000Z`, `publicationMode = fixture`, and fixed verified source-lock/effective-input SHA-256 values. The compiler derives the deterministic build ID. `CompilerFixtureOverrides` has `extraRows?: RawTransactionRow[]` and `omitPilotCell?: [premiseCode: string, itemCode: string, observedDate: LocalDate]`.

Create `compile.test.ts` and assert:

```ts
it('uses all Selangor reference premises but publishes only pilot premises', () => {
  const { snapshot, normalizedSlice } = compilePilot(makeCompilerInput())
  expect(snapshot.premises.map(premise => premise.code)).toEqual(['1', '2', '3'])
  expect(new Set(normalizedSlice.referenceRows.map(row => row.premiseCode)).size).toBe(20)
  expect(snapshot.evidence.every(cell => ['1', '2', '3'].includes(cell.premiseCode))).toBe(true)
})

it('publishes exactly dataAsOfDate and the previous date', () => {
  const { snapshot } = compilePilot(makeCompilerInput())
  expect(snapshot.dataAsOfDate).toBe('2026-08-02')
  expect([...new Set(snapshot.evidence.flatMap(cell => cell.observations.map(row => row.observedDate)))]).toEqual([
    '2026-08-01',
    '2026-08-02'
  ])
})

it('enforces the through cutoff separately from the compiled-date future cutoff', () => {
  const { snapshot, audit } = compilePilot(makeCompilerInput({
    extraRows: [pilotRow('2026-08-03'), pilotRow('2026-08-04')]
  }))
  expect(snapshot.dataAsOfDate).toBe('2026-08-02')
  expect(audit.afterThroughRowCount).toBe(1)
  expect(audit.futureRowCount).toBe(1)
})

it('materializes missing cells and audits unknown codes', () => {
  const { snapshot, audit } = compilePilot(makeCompilerInput({ omitPilotCell: ['2', '10', '2026-08-01'] }))
  expect(snapshot.evidence.find(cell => cell.premiseCode === '2')?.observations).toContainEqual({
    status: 'missing', observedDate: '2026-08-01'
  })
  expect(audit.unknownItemCodes).toEqual(expect.objectContaining({ '999': 1 }))
})
```

- [ ] **Step 2: Run the compiler test and observe the missing-module failure**

```bash
npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts
```

Expected: FAIL because `compile.ts` and compiler contracts do not exist.

- [ ] **Step 3: Add strict compiler/private-content contracts**

Create `contracts/compiler.ts` with these shapes:

```ts
export const RawTransactionRowSchema = z.object({
  date: z.unknown(), premise_code: z.unknown(), item_code: z.unknown(), price: z.unknown()
}).passthrough()

export const RawPremiseRowSchema = z.object({
  premise_code: z.unknown(), premise: z.unknown(), address: z.unknown(),
  premise_type: z.unknown(), state: z.unknown(), district: z.unknown()
}).passthrough()

export const RawItemRowSchema = z.object({
  item_code: z.unknown(), item: z.unknown(), unit: z.unknown(),
  item_group: z.unknown().optional(), item_category: z.unknown().optional()
}).passthrough()

export type RawTransactionRow = z.infer<typeof RawTransactionRowSchema>
export type RawPremiseRow = z.infer<typeof RawPremiseRowSchema>
export type RawItemRow = z.infer<typeof RawItemRowSchema>

export const ReviewerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/)
export const ReviewReasonCodeSchema = z.enum([
  'name-match', 'address-match', 'entrance-match', 'no-closure-signal',
  'definition-specific', 'qualifier-agreement', 'quantity-mode-agreement',
  'quality-exclusion-confirmed', 'low-price-eligibility-confirmed',
  'name-mismatch', 'address-mismatch', 'coordinate-conflict', 'closure-signal',
  'restricted-source', 'insufficient-sources', 'insufficient-evidence',
  'definition-too-broad', 'qualifier-disagreement', 'quantity-mode-disagreement',
  'microzone-conflict'
])
export const APPROVED_PREMISE_REASON_CODES = [
  'name-match', 'address-match', 'entrance-match', 'no-closure-signal'
] as const
export const APPROVED_ITEM_REASON_CODES = [
  'definition-specific', 'qualifier-agreement', 'quantity-mode-agreement'
] as const
export const PREMISE_QUARANTINE_REASON_CODES = [
  'name-mismatch', 'address-mismatch', 'coordinate-conflict', 'closure-signal',
  'restricted-source', 'insufficient-sources', 'insufficient-evidence', 'microzone-conflict'
] as const
export const ITEM_QUARANTINE_REASON_CODES = [
  'insufficient-evidence', 'definition-too-broad', 'qualifier-disagreement', 'quantity-mode-disagreement'
] as const
export const RedistributionCodeSchema = z.enum(['cc-by-4.0', 'odbl-1.0', 'official-use-permitted', 'synthetic-cc0'])
export const AttributionCodeSchema = z.enum([
  'kpdn-official-record', 'official-retailer-locator', 'openstreetmap-contributors', 'synthetic-fixture'
])
const decodeReviewQueryKey = (rawKey: string): string | undefined => {
  let key = rawKey.replace(/\+/g, ' ')
  try {
    for (let pass = 0; pass < 5; pass += 1) {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    }
  } catch { return undefined }
  if (/%[0-9a-f]{2}/i.test(key) || !/^[A-Za-z0-9._~-]{1,64}$/.test(key)) return undefined
  return key.toLowerCase()
}
export const ReviewHttpsUrlSchema = z.string().url().regex(
  /^https:\/\/(?![^/?#]*@)[^/?#\s]+(?:[/?#][^\s]*)?$/i,
  'review sources must be credential-free HTTPS URLs'
).refine(value => !/\s/u.test(value), 'review source must contain no whitespace')
  .refine(value => !value.includes('#'), 'review source fragments are forbidden')
  .refine(value => {
    const query = value.split('?', 2)[1]
    if (!query) return true
    return query.split('&').every(part => {
      const rawKey = part.split('=', 1)[0] ?? ''
      const key = decodeReviewQueryKey(rawKey)
      if (key === undefined) return false
      return !/(?:^|[_-])(api[_-]?)?key$|token$|secret$|signature$|sig$|credential$|password$|auth$/i.test(key)
    })
  }, 'review source query contains a sensitive credential key')
export const ReviewSourceSchema = z.object({
  url: ReviewHttpsUrlSchema, accessedOn: LocalDateSchema,
  redistribution: RedistributionCodeSchema, attributionCode: AttributionCodeSchema
}).strict().superRefine((value, context) => {
  const allowedRedistribution = {
    'kpdn-official-record': 'cc-by-4.0',
    'official-retailer-locator': 'official-use-permitted',
    'openstreetmap-contributors': 'odbl-1.0',
    'synthetic-fixture': 'synthetic-cc0'
  } as const
  if (value.redistribution !== allowedRedistribution[value.attributionCode]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['redistribution'], message: 'must match attribution code' })
  }
})

export const PrivatePremiseReviewSchema = z.object({
  code: CanonicalCodeSchema,
  officialName: z.string().min(1),
  displayName: z.string().min(1),
  address: z.string().min(1),
  premiseType: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  coordinateAccuracyMetres: z.number().positive().max(30),
  verificationStatus: z.enum(['desk-verified', 'field-verified']),
  verifiedOn: LocalDateSchema,
  verificationExpiresOn: LocalDateSchema,
  reviews: z.array(z.object({
    reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema, observedName: z.string().min(1),
    entranceLatitude: z.number().min(-90).max(90), entranceLongitude: z.number().min(-180).max(180),
    coordinateAccuracyMetres: z.number().positive().max(30),
    closureSignal: z.enum(['none', 'open', 'closed']),
    sources: z.array(ReviewSourceSchema).min(2)
  }).strict()).min(2),
  coordinateAttribution: z.string().min(1)
}).strict()

export const PrivateItemReviewSchema = z.object({
  code: CanonicalCodeSchema,
  officialName: z.string().min(1),
  officialUnit: z.string().min(1),
  qualifiers: z.array(z.string()),
  quantityMode: z.enum(['whole-units', 'hundredths']),
  reviews: z.array(z.object({
    reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema, status: z.literal('approved'),
    qualifiers: z.array(z.string()), quantityMode: z.enum(['whole-units', 'hundredths']),
    reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
  }).strict()).min(2),
  semanticStatus: z.literal('approved')
}).strict()

export const PrivateMicrozoneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1),
  bounds: z.object({
    north: z.number().min(-90).max(90), south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180), west: z.number().min(-180).max(180)
  }).strict(),
  premiseCodes: z.array(CanonicalCodeSchema).min(3)
}).strict()

```

`ReviewHttpsUrlSchema` must reject `data:`, `file:`, non-HTTPS, userinfo, fragments, sensitive query-key names (including nested percent-encoded forms), path-like, and whitespace-bearing values. Query keys are decoded to a fixed point within five passes, must become a 1–64-character ASCII URL-key token, and are rejected if any `%HH` escape remains. Add negative schema tests for plain, single-, double-, and five-plus-layer encoded `api_key`, plus `token`, `signature`, malformed escapes, fragment, userinfo, and each rejected protocol/value so repository-safety claims are executable rather than comments; entropy/secret scans remain a second gate.

Create an executable source-host policy, not an unspecified allowlist. Export `REVIEW_HOST_POLICY_VERSION = '2026-08-03-v1'`, a strict `ReviewHostPolicyV1Schema` containing that literal plus sorted unique exact lowercase ASCII `retailerHosts`, and a pure authority extractor that permits only default-port HTTPS DNS hosts (no IP literal, userinfo, trailing dot, Unicode lookalike, or explicit port). Bind attribution codes as follows: KPDN accepts exact `data.gov.my` or exact/suffix-boundary `kpdn.gov.my`; OSM accepts only `openstreetmap.org`, `www.openstreetmap.org`, or `nominatim.openstreetmap.org`; official retailer accepts only an exact hostname in the committed policy; synthetic accepts only `.test` in fixture mode. Suffix matching must require a dot boundary. Hash exact policy bytes, put `hostPolicySha256` in both premise passes/reconciliation provenance, and include the policy in the staged provenance/effective identity. Tests cover `data.gov.my.evil.test`, `kpdn.gov.my.evil.test`, `openstreetmap.org.evil.test`, userinfo tricks, ports, uppercase normalization, retailer not listed, and policy version/digest mismatch.

Re-export `ReviewerIdSchema`, `ReviewReasonCodeSchema`, `RedistributionCodeSchema`, `AttributionCodeSchema`, `ReviewHttpsUrlSchema`, `ReviewSourceSchema`, `AuditCellSchema`, `EligibleLowCellSchema`, and `QualityReviewBasisV1Schema` from `contracts/index.ts`. Task 8 imports these shared contracts; it must not duplicate them.

Add these exact audit/review-basis schemas, then define the file wrappers so no declaration is referenced before initialization:

```ts
const CountMapSchema = z.record(CanonicalCodeSchema, SenSchema)
const AuditCellBaseSchema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  observedDate: LocalDateSchema,
  sourceRows: z.array(z.object({ sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1) }).strict()).min(1)
})
export const AuditCellSchema = z.discriminatedUnion('reason', [
  AuditCellBaseSchema.extend({
    reason: z.literal('invalid-price'), rawPriceValues: z.array(z.string().max(64)).min(1),
    validPricesSen: z.array(SenSchema)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('conflicting-duplicate'), pricesSen: z.array(SenSchema.min(1)).min(2)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('outside-ratio-bound'), priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('robust-scale-outlier'), priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('insufficient-reference'), priceSen: SenSchema.min(1), distinctReferencePremises: SenSchema
  }).strict(),
])
export const EligibleLowCellSchema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  observedDate: LocalDateSchema, priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1),
  sourceRows: z.array(z.object({ sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1) }).strict()).min(1)
}).strict()
export const QualityReviewBasisV1Schema = z.discriminatedUnion('flag', [
  z.object({ flag: z.literal('rejected-cell'), cell: AuditCellSchema }).strict(),
  z.object({ flag: z.literal('eligible-below-half-median'), cell: EligibleLowCellSchema }).strict()
])

export const QualityReviewDispositionSchema = z.object({
  reviewBasis: QualityReviewBasisV1Schema,
  disposition: z.enum(['confirmed-exclusion', 'confirmed-eligible']),
  reviewedOn: LocalDateSchema,
  reviews: z.array(z.object({
    reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema,
    disposition: z.enum(['confirmed-exclusion', 'confirmed-eligible']),
    reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
  }).strict()).min(2)
}).strict()

export const QualityReviewBasisFileV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema,
  reviewInputSha256: Sha256Schema,
  publicationMode: z.enum(['fixture', 'desk-demo']),
  inputDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict(),
  qualityFlags: z.array(QualityReviewBasisV1Schema)
}).strict()

export const PrivateMicrozonesFileV1Schema = z.object({
  schemaVersion: z.literal(1), microzones: z.array(PrivateMicrozoneSchema).min(1).max(2)
}).strict()
export const PrivatePremisesFileV1Schema = z.object({
  schemaVersion: z.literal(1), premises: z.array(PrivatePremiseReviewSchema).min(1)
}).strict()
export const PrivateItemsFileV1Schema = z.object({
  schemaVersion: z.literal(1), items: z.array(PrivateItemReviewSchema).min(1)
}).strict()
export const PrivateQualityReviewsFileV1Schema = z.object({
  schemaVersion: z.literal(1), qualityReviewBasisSha256: Sha256Schema,
  qualityReviews: z.array(QualityReviewDispositionSchema)
}).strict()

export const CompilerAuditV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, throughDate: LocalDateSchema,
  sourceWindow: z.enum(['public', 'feasibility']), sourceLockSha256: Sha256Schema,
  publicationMode: z.enum(['fixture', 'desk-demo']),
  targetDates: z.array(LocalDateSchema).length(2),
  inputRowCount: SenSchema, parsedRowCount: SenSchema, referenceRowCount: SenSchema,
  pilotRowCount: SenSchema, publicEligibleRowCount: SenSchema,
  unknownItemCodes: CountMapSchema, unknownPremiseCodes: CountMapSchema,
  invalidRowCount: SenSchema, afterThroughRowCount: SenSchema, futureRowCount: SenSchema,
  exactDuplicateCount: SenSchema,
  conflictingCellCount: SenSchema,
  evidenceStatusCounts: z.object({ eligible: SenSchema, missing: SenSchema,
    anomalous: SenSchema, insufficientReference: SenSchema }).strict(),
  eligibleLineRateBasisPoints: SenSchema.max(10000),
  completeBasketRateBasisPoints: SenSchema.max(10000),
  degenerateReferenceItemCodes: z.array(CanonicalCodeSchema),
  rejectedCells: z.array(AuditCellSchema),
  eligibleLowCellsBelowHalfMedian: z.array(EligibleLowCellSchema),
  qualityReviewDispositionCount: SenSchema,
  qualityFlags: z.array(QualityReviewBasisV1Schema),
  unreviewedQualityFlags: z.array(QualityReviewBasisV1Schema)
}).strict()

const NormalizedObservationSchema = z.object({
  observedDate: LocalDateSchema, premiseCode: CanonicalCodeSchema,
  itemCode: CanonicalCodeSchema, officialUnit: z.string().min(1), priceSen: SenSchema.min(1),
  sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1)
}).strict()

const RejectedSourceRowSchema = z.object({
  observedDate: LocalDateSchema, premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  officialUnit: z.string().min(1), rawPriceValue: z.string().max(64),
  reason: z.literal('invalid-price'), sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1)
}).strict()

export const NormalizedSourceSliceV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, sourceLock: SourceLockV1Schema,
  sourceLockSha256: Sha256Schema, transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, sourceWindow: z.enum(['public', 'feasibility']),
  publicationMode: z.enum(['fixture', 'desk-demo']),
  effectiveInputSha256: Sha256Schema,
  contentDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema,
    items: Sha256Schema, qualityReviews: Sha256Schema,
    qualityReviewBasis: Sha256Schema,
    reviewProvenance: Sha256Schema,
    coverageReport: Sha256Schema.optional(),
    feasibilityReport: Sha256Schema.optional()
  }).strict(),
  ingestionSummary: z.object({
    inputRowCount: SenSchema, parsedRowCount: SenSchema, invalidRowCount: SenSchema,
    afterThroughRowCount: SenSchema, futureRowCount: SenSchema,
    unknownItemCodes: CountMapSchema, unknownPremiseCodes: CountMapSchema
  }).strict(),
  premiseLookups: z.array(z.object({ code: CanonicalCodeSchema, name: z.string(), address: z.string(),
    premiseType: z.string(), state: z.string(), district: z.string() }).strict()),
  itemLookups: z.array(z.object({ code: CanonicalCodeSchema, name: z.string(), unit: z.string(),
    itemGroup: z.string(), itemCategory: z.string() }).strict()),
  referenceRows: z.array(NormalizedObservationSchema),
  pilotRows: z.array(NormalizedObservationSchema),
  rejectedReferenceRows: z.array(RejectedSourceRowSchema),
  rejectedPilotRows: z.array(RejectedSourceRowSchema)
}).strict()
```

Schema shape alone is not sufficient provenance validation. Export one contextual `validateSourceRowProvenance({ sourceLock, normalizedSlice, audit, qualityBasis? })` used by primary compilation, audit-only collection, final staging, and normalized-slice reproduction. Every `sourceManifestIndex` must address an existing entry in the canonical `sourceLock.sources` array whose role is `transactions`; that source's `yearMonth` must equal the referenced row's `observedDate.slice(0, 7)`; and `1 <= rowNumber <= manifest.rowCount`. Reject lookup-source indices, out-of-range indices/rows, duplicate source-row references within one cell, and references whose premise/item/date do not match the referenced normalized or rejected source row. Every audit/basis `sourceRows` entry must resolve to an exact row identity retained in `referenceRows|pilotRows|rejectedReferenceRows|rejectedPilotRows`; conflicting-duplicate evidence may bind multiple distinct row numbers, but never a fabricated row. Apply the same checks when parsing a committed normalized slice before regeneration. Add mutations for negative/too-large indices, lookup indices, wrong month, row `0`, row `rowCount + 1`, duplicate refs, mismatched cell identity, and nonexistent source rows in primary, collection, and reproduction paths.

Lookup joins are deterministic and fail closed. Canonicalize each raw premise/item code before joining; collapse duplicate lookup rows only when every normalized official field agrees, and reject a canonical-code collision with any conflicting field. The normalized slice stores one sorted lookup row per canonical code and its schema/refinement rechecks uniqueness. Add `2` versus `2.0` collision tests for both exact duplicate collapse and conflicts in premise state/address/type and item unit/group/category; primary and reproduction paths must agree.

`publicEligibleRowCount` is historical naming for the exact number of materialized public matrix cells whose final status is `eligible`; it must equal `evidenceStatusCounts.eligible`. The four evidence-status counts must sum to `premises.length × items.length × 2`. `eligibleLineRateBasisPoints = floor(publicEligibleRowCount × 10_000 / matrixCellCount)`. `completeBasketRateBasisPoints` is the number of `(premise, targetDate)` pairs for which every curated item is eligible divided by `premises × 2`, floored to basis points. Zero denominators produce zero and a failing compiler/content gate, never `NaN`. Add schema/compiler refinements and mutation tests for every count/denominator equality. Export inferred `CompilePilotInput`, `CompilerAuditV1`, and `NormalizedSourceSliceV1` types.

Audit count scope is explicit: `inputRowCount`, `parsedRowCount`, `invalidRowCount`, `afterThroughRowCount`, `futureRowCount`, and unknown-code maps describe the pinned full transaction inputs and are persisted in `ingestionSummary`. The two cutoff counters are disjoint: `futureRowCount` counts structurally valid rows dated after the Malaysia date of `compiledAt`; `afterThroughRowCount` counts structurally valid rows dated after `throughDate` but not after that compiled date. Before exclusion, basic identifier parsing may perform a read-only membership check against lookup code sets solely to populate full-input unknown maps; these rows never enter a joined transaction object. Both cutoff classes are excluded before authoritative lookup joins, reference construction, or `dataAsOfDate` selection. Add a future unknown-code row and prove it increments both the future counter and unknown map while changing no retained output. `referenceRowCount`, `pilotRowCount`, `exactDuplicateCount`, and `conflictingCellCount` describe only rows retained in the normalized reference/target windows and are recomputed from the slice. Add extra duplicate/conflicting rows outside the retained windows and prove they do not alter those four retained-window counts or reproduction bytes.

Define the pure compiler input without filesystem paths:

```ts
export const CompilePilotInputSchema = z.object({
  transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema,
  publicationMode: z.enum(['fixture', 'desk-demo']),
  effectiveInputSha256: Sha256Schema,
  contentDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema,
    items: Sha256Schema, qualityReviews: Sha256Schema,
    qualityReviewBasis: Sha256Schema,
    reviewProvenance: Sha256Schema,
    coverageReport: Sha256Schema.optional(),
    feasibilityReport: Sha256Schema.optional()
  }).strict(),
  sourceLock: SourceLockV1Schema,
  sourceLockSha256: Sha256Schema,
  transactions: z.array(z.unknown()),
  premiseLookups: z.array(z.unknown()),
  itemLookups: z.array(z.unknown()),
  content: z.object({
    microzones: z.array(z.unknown()),
    premises: z.array(z.unknown()),
    items: z.array(z.unknown()),
    qualityReviews: z.unknown(),
    qualityReviewBasis: z.unknown(),
    coverageReport: z.unknown().optional(),
    feasibilityReport: z.unknown().optional()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.throughDate !== value.sourceLock.throughDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['throughDate'], message: 'must match source lock' })
  }
  const coveragePair = [value.content.coverageReport !== undefined, value.contentDigests.coverageReport !== undefined]
  const feasibilityPair = [value.content.feasibilityReport !== undefined, value.contentDigests.feasibilityReport !== undefined]
  if (coveragePair[0] !== coveragePair[1]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'coverageReport'], message: 'report and digest must appear together' })
  }
  if (feasibilityPair[0] !== feasibilityPair[1]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'feasibilityReport'], message: 'report and digest must appear together' })
  }
  const hasAllGateFields = coveragePair.every(Boolean) && feasibilityPair.every(Boolean)
  const hasAnyGateField = coveragePair.some(Boolean) || feasibilityPair.some(Boolean)
  if (value.publicationMode === 'desk-demo' && !hasAllGateFields) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'feasibilityReport'], message: 'required for desk demo' })
  }
  if (value.publicationMode === 'fixture' && hasAnyGateField) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'feasibilityReport'], message: 'not accepted for fixture mode' })
  }
})

export type CompilePilotInput = z.infer<typeof CompilePilotInputSchema>

export const CollectQualityReviewInputSchema = z.object({
  transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, publicationMode: z.enum(['fixture', 'desk-demo']),
  reviewInputSha256: Sha256Schema, sourceLock: SourceLockV1Schema, sourceLockSha256: Sha256Schema,
  inputDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict(),
  transactions: z.array(z.unknown()), premiseLookups: z.array(z.unknown()), itemLookups: z.array(z.unknown()),
  content: z.object({
    microzones: z.array(z.unknown()), premises: z.array(z.unknown()), items: z.array(z.unknown()),
    coverageReport: z.unknown().optional(), feasibilityReport: z.unknown().optional()
  }).strict()
}).strict()

export const QualityReviewCollectionAuditV1Schema = CompilerAuditV1Schema.omit({ buildId: true }).extend({
  reviewInputSha256: Sha256Schema
}).strict()

export function collectQualityReviewBasis(input: CollectQualityReviewInput): {
  audit: QualityReviewCollectionAuditV1
  basis: QualityReviewBasisFileV1
}

export type CollectQualityReviewInput = z.infer<typeof CollectQualityReviewInputSchema>
export type QualityReviewCollectionAuditV1 = z.infer<typeof QualityReviewCollectionAuditV1Schema>
export type QualityReviewBasisFileV1 = z.infer<typeof QualityReviewBasisFileV1Schema>
```

Give the collection input the same source-lock/cutoff/report cross-field refinements as final compilation, but no effective-input hash, build ID, quality basis, disposition file, snapshot, normalized slice, or staged artifact. It runs the same parse/join/reference/classification path, sets `qualityReviewDispositionCount = 0`, and requires `unreviewedQualityFlags` to equal the complete `qualityFlags`. Its Node adapter computes the tagged `reviewInputSha256`, canonicalizes both strict outputs, and cannot call stage/publish. Final `compilePilot` always requires the exact basis and dispositions. Add an equivalence test proving collection flags equal the final compiler's reconstructed flags for the same non-review inputs.

The function parses every `unknown` array through the strict/raw schemas; no adapter may pass pre-trusted objects around the runtime validation boundary. Scope uniqueness exactly: entity codes are unique within each content file; reviewer IDs are distinct within one entity's two reviews; the two top-level pass reviewer IDs are distinct across a pass pair; reusing Reviewer A/B pseudonyms across many entity decisions is expected. Validate microzone bounds, premise review expiry no more than 90 dates after verification, exactly-one microzone assignment, and at least three approved premises per microzone. In `desk-demo`, each accepted premise review must cite distinct URLs containing one or more `kpdn-official-record` sources plus at least one coordinate-bearing `official-retailer-locator|openstreetmap-contributors` source; synthetic attribution is forbidden. In `fixture`, each review instead requires at least two distinct HTTPS `.test` sources and every source must use `synthetic-fixture`/`synthetic-cc0`; official attribution codes are forbidden. All attribution/redistribution pairs obey `ReviewSourceSchema`. Accepted reviews contain no `closed` signal, place their entrance points within 30 metres of the other accepted review and reconciled public point, and agree on the exact `normalizeReviewTextKey` defined in Task 8. Approved item reviews must unanimously agree on `approved`, quantity mode, and normalized qualifiers. Add negative tests for both mode branches, per-entity duplicate reviewers, same pseudonym reused validly across entities, two KPDN-only sources, missing official record, OSM with non-ODbL code, mixed fixture/official attribution, duplicate URLs, and Unicode/case/whitespace name variants.

When `qualityReviewBasis` is present, parse it and require its context/digests and complete canonical `qualityFlags` set to equal what compilation just reconstructed. Parse `content.qualityReviews` as the complete `PrivateQualityReviewsFileV1` wrapper—not its inner array—and require `qualityReviewBasisSha256` to match the adapter-verified exact basis bytes. Canonical review-basis objects are unique, their two distinct reviewers agree with the top-level disposition, a rejected-cell accepts only `confirmed-exclusion`, and an eligible-low cell accepts only `confirmed-eligible`. Stage operation requires the basis to be present and deep canonical set equality between current flags and disposition bases—no missing, stale, changed-evidence, or extra row. Audit-only collection may omit the basis; the adapter then writes the compiler-produced canonical `QualityReviewBasisFileV1` without consulting old dispositions. Add wrong-wrapper-basis-hash tests for both primary compilation and normalized-slice reproduction.

For `desk-demo`, parse `content.coverageReport` and `content.feasibilityReport` with the Task 1 schemas before any output is produced. Require both report byte digests to match `contentDigests`; both `transformVersion` values to equal `PRICECATCHER_TRANSFORM_VERSION` and one another; `passesCoverageCandidateGate: true`; `passesDeskDemoGate: true`; exact equality between the distance report's sorted final premise/item codes and the approved curated content; and matching `throughDate`, source-lock SHA-256, coverage-report SHA-256, and named microzone/premise/item content digests. Require the feasibility source lock to begin no later than the derived horizon minus 59 dates. After transaction cutoff/join processing derives `dataAsOfDate`, require `coverageReport.dataAsOfDate === feasibilityReport.dataAsOfDate === snapshot.dataAsOfDate`; report-provided dates never select the compiler horizon. The Node stage/reproduction adapter additionally parses the candidate-era lock/report/selection/reconciliation provenance and compares normalized current lookup fields across all four layers before invoking this pure function. Add tests for a rehashed shifted report pair, old/mismatched transforms, Phase-A false plus Phase-B true, compiler/report as-of mismatch, insufficient lock start, and lookup drift in stage/reproduction. A fixture input must not smuggle in either report and uses the separate 31-date public-lock rule. The source-lock digest, every serialized source-lock field, all five content digests (including review basis and dispositions), and both desk report digests are inputs to the effective identity and staged manifest.

- [ ] **Step 4: Implement parsing, joins, row universes, and target horizon**

`compilePilot` must execute the locked order:

```ts
const parsed = parseAndCanonicalize(input)
const joined = joinAuthoritativeLookups(parsed)
const cutoffRows = joined.transactions.filter(row =>
  row.observedDate <= input.throughDate && row.observedDate <= malaysiaDateAt(input.compiledAt)
)
const referenceRows = cutoffRows.filter(row =>
  row.stateKey === 'selangor' && parsed.content.itemCodes.has(row.itemCode) && isAllowedSingleOperator(row.premiseTypeKey)
)
const pilotRows = referenceRows.filter(row => parsed.content.premiseCodes.has(row.premiseCode))
const dataAsOfDate = maxNonFuturePilotDate(pilotRows, malaysiaDateAt(input.compiledAt))
const targetDates = [addLocalDates(dataAsOfDate, -1), dataAsOfDate]
const buildId = `${input.publicationMode}-${dataAsOfDate}-${input.effectiveInputSha256.slice(0, 16)}`
```

Here `referenceRows`/`pilotRows` used for horizon selection contain only rows with valid basic identifiers and positive safely parsed prices; malformed keyed rows remain in the rejected-row audit path but cannot advance the horizon. Reject `throughDate` after the Malaysia date of `compiledAt`. Assert `dataAsOfDate <= throughDate` as well as `dataAsOfDate <= malaysiaDateAt(compiledAt)`. Add a cutoff regression containing a valid pilot row on `2026-08-03` with `throughDate: 2026-08-02` and `compiledAt` on 3 August: the row increments `afterThroughRowCount`, never enters a reference/target cell, and the resulting `dataAsOfDate` remains 2 August. Keep a separate 4 August row to prove the disjoint future counter, plus a malformed-price pilot row on 3 August under a 3 August cutoff to prove it cannot advance `dataAsOfDate`.

Create one `normalizeLookupToken` that trims, Unicode-normalizes, collapses whitespace, and locale-independently lowercases state, district, and premise-type values. Preserve the original official strings for display/audit. `isAllowedSingleOperator` compares the normalized official type and accepts only `Hypermarket`, `Kedai Runcit`, `Kedai Serbaneka`, `Pasar Mini`, and `Pasar Raya / Supermarket`. It rejects `Borong`, `Foodcourt`, `Medan Selera`, `Pasar Basah`, and all restaurant types. Do not infer from names. Add real-schema tests with state `Selangor`, district `Petaling Jaya`, whitespace/case variants, and an excluded `Pasar Basah`.

Chronology is contextual and fail-closed. Require every source-manifest `retrievedAt <= compiledAt`; every retained row date `<=` both `throughDate` and the Malaysia compile date; every premise/item source access date `<=` its copied review date; every review/disposition/verified date `<= malaysiaDateAt(compiledAt)`; `verifiedOn` equal to the later premise review date; `verificationExpiresOn` exactly `verifiedOn + 90` local dates; and `verificationExpiresOn >= malaysiaDateAt(compiledAt)` with equality accepted. Reject unapproved, future-dated, or expired private content before compilation. Apply the same checks during normalized-slice reproduction and add one-field time-travel mutations for each ordering.

- [ ] **Step 5: Apply references and materialize public evidence**

For each curated item and target date, build reference stats from the 30 immediately preceding dates of `referenceRows`. For every pilot premise/item/target date, output one observation status. Use `classifyTargetCell`; preserve `conflicting-duplicate`, anomaly, insufficient-reference, and missing distinctions. Project private premise reviews to public `PremiseV1` fields and omit reviewer IDs/source notes from the snapshot.

Audit every rejected target cell and every eligible target cell whose price is strictly below half its reference median. Emit the complete strict `QualityReviewBasisV1` objects—including discriminator, reason, prices/reference values, and source provenance—in `qualityFlags` on every compile. Canonical-sort object arrays and compare the complete parsed objects, not a tuple or environment-specific hash; a same-key flag whose evidence changed must be reviewed again. Emit non-matching bases in `unreviewedQualityFlags`. This complete evidence-bound review set is deliberately stronger than trying to predict a winning basket before the user supplies one and prevents a refresh from silently reusing or dropping stale dispositions while keeping pure compilation crypto-free.

Trim `normalizedSlice.referenceRows`/`rejectedReferenceRows` to the union of the two 30-date reference windows (`dataAsOfDate − 31` through `dataAsOfDate − 1`) and `normalizedSlice.pilotRows`/`rejectedPilotRows` to the two target dates only. Preserve every exact/conflicting valid row with source provenance, every invalid reference row that can change a premise contribution, and every rejected target price needed to reconstruct the audit. Store full-file ingestion counters/maps in `ingestionSummary`; the source manifests bind those summaries to pinned upstream bytes. `compilePilotFromNormalizedSlice` re-runs duplicate/reference/classification/materialization and uses only this slice plus strict parsed curated content, parsed coverage/distance reports when desk mode requires them, and a digest record already verified by the Node adapter; it must not decode bytes, hash bytes, copy the previous snapshot, or copy the previous audit. It rechecks both report gates/bindings/date equality exactly like primary compilation, compares the digest record to the slice, re-derives all non-cryptographic identity fields, and fails on disagreement. Sort premises/items/cells/dates/codes before serialization. Use canonical JSON serialization with two-space indentation and a terminal newline for snapshot, audit, and normalized-slice fixtures.

- [ ] **Step 6: Build complete audit and normalized slice tests**

Add assertions that:

```ts
expect(audit.inputRowCount).toBeGreaterThan(audit.publicEligibleRowCount)
expect(audit.rejectedCells).toEqual(expect.arrayContaining([
  expect.objectContaining({ premiseCode: '2', itemCode: '10', reason: 'conflicting-duplicate' })
]))
expect(normalizedSlice.referenceRows.every(row => row.observedDate >= '2026-07-02')).toBe(true)
expect(normalizedSlice.referenceRows.every(row => row.observedDate <= '2026-08-01')).toBe(true)
expect([...new Set(normalizedSlice.pilotRows.map(row => row.observedDate))]).toEqual(['2026-08-01', '2026-08-02'])
expect(() => PilotSnapshotV1Schema.parse(snapshot)).not.toThrow()
expect(() => CompilerAuditV1Schema.parse(audit)).not.toThrow()
expect(() => CompilerAuditV1Schema.parse(auditWithRatioCellMissingReferenceMedian())).toThrow()
expect(() => CompilerAuditV1Schema.parse(auditWithConflictMissingPrices())).toThrow()
expect(() => CompilerAuditV1Schema.parse(auditWithInsufficientReferenceMissingPrice())).toThrow()
```

Canonical-serialize the first outputs, then call `compilePilotFromNormalizedSlice({ slice: normalizedSlice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests() })` and assert byte equality for snapshot and audit. Add a desk case with both parsed reports and prove a changed coverage pass/date/hash fails. Change one supplied digest and assert pure regeneration rejects the slice/effective-input mismatch. Task 7 separately mutates a real content byte and proves the Node reproduction adapter rejects it before invoking the pure function. This proves that the committed slice is a real regeneration input rather than a decorative export without introducing Node/DOM crypto or decoding into the pure domain.

- [ ] **Step 7: Run compiler and domain regression tests**

```bash
npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts src/pricecatcher
npm run typecheck:saves
```

Expected: all tests PASS and type-check PASS.

- [ ] **Step 8: Commit the pure compiler**

```bash
git add src/pricecatcher/contracts/compiler.ts src/pricecatcher/contracts/index.ts src/pricecatcher/compile.ts src/pricecatcher/review-source-policy.ts src/pricecatcher/__tests__/compilerFixture.ts src/pricecatcher/__tests__/compile.test.ts
git commit -m "feat: compile versioned PriceCatcher snapshots"
git push origin UPGRADES
```

---

### Task 7: Implement pinned downloads, streaming CSV, source locks, and atomic publication

**Files:**
- Modify: `.gitignore`
- Create: `scripts/pricecatcher/csv.ts`
- Create: `scripts/pricecatcher/source-lock.ts`
- Create: `scripts/pricecatcher/manifest.ts`
- Create: `scripts/pricecatcher/fetch.ts`
- Create: `scripts/pricecatcher/publish.ts`
- Create: `scripts/pricecatcher/compile.ts`
- Create: `scripts/pricecatcher/generate-fixture.ts`
- Test: `scripts/pricecatcher/io.test.ts`
- Create: `data/pricecatcher/fixtures/sources/pricecatcher_2026-07.csv`
- Create: `data/pricecatcher/fixtures/sources/pricecatcher_2026-08.csv`
- Create: `data/pricecatcher/fixtures/sources/lookup_premise.csv`
- Create: `data/pricecatcher/fixtures/sources/lookup_item.csv`
- Create: `data/pricecatcher/fixtures/source-lock.json`
- Create: `data/pricecatcher/fixtures/content/microzones.json`
- Create: `data/pricecatcher/fixtures/content/premises.json`
- Create: `data/pricecatcher/fixtures/content/items.json`
- Create: `data/pricecatcher/fixtures/content/quality-review-basis.json`
- Create: `data/pricecatcher/fixtures/content/quality-reviews.json`

**Interfaces:**
- Consumes: official URLs or pinned local paths, injected `fetch`, injected clock, `compilePilot`, and private content JSON.
- Produces: streamed row iterators, content-addressed source blobs, `source-lock.json`, an inert staged-build manifest, versioned public snapshot/private audit directories, and a separate atomic `current.json` activation command.

- [ ] **Step 1: Ignore only raw and transient PriceCatcher paths**

Append:

```gitignore
data/pricecatcher/raw/
data/pricecatcher/staging/
data/pricecatcher/**/*.tmp
src/saves/public/data/current.json.*.tmp
```

Do not ignore normalized slices, source locks, audits, or public snapshots.

- [ ] **Step 2: Write failing streaming, hash, and atomic-publish tests**

Create `io.test.ts` using `mkdtemp` under `os.tmpdir()` and injected fake fetch. Assert:

```ts
it('streams quoted CSV fields without loading a split-line parser', async () => {
  const rows = await collect(parseCsvFile(fixtureSourcePath('lookup_premise.csv')))
  expect(rows[0]?.address).toBe('NO. 2, JALAN SS 2/1')
})

it('stores source bytes at their sha256 and records validators', async () => {
  const result = await fetchToContentAddressedStore({
    url: 'https://example.test/prices.csv',
    root: tempRoot,
    fetchImpl: fakeFetch('date,premise_code,item_code,price\n2026-08-02,1,10,5.00\n', {
      etag: '"fixture"'
    }),
    retrievedAt: '2026-08-03T04:00:00.000Z'
  })
  expect(result.manifest.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(await readFile(result.path, 'utf8')).toContain('2026-08-02')
})

it('re-hashes every pinned blob before parsing and rejects tampering without output', async () => {
  const lock = await writeValidSourceLock(tempRoot)
  await writeFile(blobPathFor(lock.sources[0]!), 'tampered after fetch')
  await expect(loadVerifiedSourceLock(lock.path, adapters)).rejects.toThrow(/sha256|byte length/)
  await expect(pathExists(auditOutputPath)).resolves.toBe(false)
  await expect(pathExists(stageManifestPath)).resolves.toBe(false)
})

it('never replaces current pointer during compilation or failed activation', async () => {
  const staged = await stageBuild(validBuild, adapters)
  expect(await readFile(currentPointerPath, 'utf8')).toBe(originalPointer)
  await writeFile(staged.snapshotPath, 'tampered after staging')
  await expect(activateBuild(staged.manifestPath, adapters)).rejects.toThrow()
  expect(await readFile(currentPointerPath, 'utf8')).toBe(originalPointer)
})

it.each(['.', '..'])('rejects path-segment build ID %s before resolving a destination', async buildId => {
  await expect(activateBuild(manifestWithBuildId(buildId), adapters)).rejects.toThrow()
  expect(await readFile(currentPointerPath, 'utf8')).toBe(originalPointer)
})
```

- [ ] **Step 3: Run IO tests and observe missing-module failures**

```bash
npm run test:saves -- scripts/pricecatcher/io.test.ts
```

Expected: FAIL because IO modules do not exist.

- [ ] **Step 4: Implement streaming CSV and source locks**

Use `csv-parse` as a stream:

```ts
export async function* parseCsvFile(path: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(path).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: false }))
  for await (const row of parser) yield row as Record<string, string>
}
```

Download response bytes to a unique file in `data/pricecatcher/staging`, update SHA-256 and byte length while streaming, fsync/close, then rename to `data/pricecatcher/raw/sha256/<digest>`. Record URL, retrieval instant, digest, byte length, ETag, Last-Modified, row count, and min/max observation dates. Never put response bodies or credentials in logs.

`source-lock.ts` parses `SourceLockV1Schema`, validates exact month coverage/roles, and selects one of two closed resolvers. An `official` lock resolves each blob only as `data/pricecatcher/raw/sha256/<manifest.sha256>` under the approved raw root. A `synthetic-fixture` lock is accepted only with the built-in fixture adapter and resolves roles deterministically under the committed root as `sources/pricecatcher_<yearMonth>.csv`, `sources/lookup_premise.csv`, or `sources/lookup_item.csv`; it accepts no path from JSON or CLI. Before **every** compile or feasibility parse, stream each resolved file again, recompute SHA-256 and byte length, compare both to the lock, and then verify parsed row count/min/max dates against the manifest. A filename or prior hash is not evidence that its bytes stayed intact. Any mismatch fails before an audit, feasibility report, normalized slice, stage directory, or manifest is created. Test modified bytes, swapped roles, a missing month, reordered source entries, declared-length mismatch, row-count/date-metadata mismatch, and clean-clone fixture resolution with an empty official raw store.

Canonicalize the full typed active source lock in its contract order and remap every source-row provenance index to that order before hashing or compilation. In the Node adapter, derive `sourceLockSha256` from canonical source-lock bytes. Task 7 implements the complete fixture branch: immutable stage/reproduction reopens and re-hashes the exact five content files, forbids reports, and requires the empty provenance digest. It defines the strict optional report fields, 13-role enum/path map, and identity contracts needed later, but every `desk-demo` compile/reproduce/publish attempt fails with `desk-provenance-not-enabled` before any output because Task 8 has not yet created the candidate selection/reconciliation schemas. Add this fail-before-output regression.

Task 8 explicitly modifies the compile/manifest/publish adapters to enable the desk branch. That extension reopens and re-hashes selected-content coverage and distance reports plus every manifest-declared review-provenance file—including the separately preserved candidate-era source lock and candidate-universe coverage report. It parses those candidate-era objects and validates their lock→report→selection→reconciliation bindings before compilation; it does not merely hash opaque bytes. Both branches map provenance to the exact path-free ordered `{role, sha256, byteLength}` identity array before hashing it as `contentDigests.reviewProvenance`; paths never enter that digest. Derive `effectiveInputSha256` from canonical JSON containing an algorithm/version tag, publication mode, transform version, compiled instant, `throughDate`, source window, every serialized active source-lock field (including `analysisStartDate`, roles, year-months, retrieval instants, ETags, and Last-Modified values when present), all named content/report digests, and the provenance digest. Audit-only collection instead derives a tagged provisional `reviewInputSha256` from source lock, clock, microzone/premise/item, and selected/distance report digests; it excludes the not-yet-created basis/dispositions/provenance and can never become a build ID. Exclude local paths from both identities. Pass verified digests/hashes into the pure compiler and store final-stage values in the normalized slice. On either reproduction form, the enabled adapter reopens/re-hashes every applicable content, report, and provenance ref, runs the lookup/provenance contextual validators, and only then calls `compilePilotFromNormalizedSlice`; the pure function validates supplied values against the slice without importing crypto or decoders. The pure compiler derives `<publicationMode>-<dataAsOfDate>-<first-16-hex>` from the verified final effective hash; no CLI accepts a caller-selected final build ID.

Make the two hash payloads strict contracts, not prose conventions:

```ts
export const EffectiveInputIdentityV1Schema = z.object({
  identityKind: z.literal('auntie-saves-effective-input-v1'),
  publicationMode: z.enum(['fixture', 'desk-demo']), transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, throughDate: LocalDateSchema, sourceWindow: z.enum(['public', 'feasibility']),
  sourceLockSha256: Sha256Schema, sourceLock: SourceLockV1Schema,
  contentDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    qualityReviewBasis: Sha256Schema, qualityReviews: Sha256Schema,
    reviewProvenance: Sha256Schema, coverageReport: Sha256Schema.optional(),
    feasibilityReport: Sha256Schema.optional()
  }).strict()
}).strict()
export const ReviewInputIdentityV1Schema = z.object({
  identityKind: z.literal('auntie-saves-review-input-v1'),
  publicationMode: z.enum(['fixture', 'desk-demo']), transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, throughDate: LocalDateSchema, sourceWindow: z.enum(['public', 'feasibility']),
  sourceLockSha256: Sha256Schema, sourceLock: SourceLockV1Schema,
  inputDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict()
}).strict()
```

Cross-refine lock cutoff/window/hash and mode-specific report presence. Serialize only parsed schema output with one shared canonical JSON function: recursively lexicographically sort object keys by Unicode code point, preserve array order, use JSON number grammar for already-safe integers, UTF-8 encode, two-space/terminal-newline only for artifact files but **no whitespace** for identity bytes, then SHA-256. Reject non-finite/unsafe numbers before serialization. Add fixed object-order perturbation tests and hard-coded golden SHA-256 fixtures for both identity kinds; fixture generation, stage, manifest validation, and reproduction must all produce those same digests.

- [ ] **Step 5: Implement month selection and CLI validation**

Given `--through YYYY-MM-DD`, require an explicit window. `--window public` forbids `--analysis-start` and fetches every month touched by `[through − 31 dates, through]`, which supports the two published targets. `--window feasibility` defaults `analysisStartDate` to `through − 59` and accepts an explicit `--analysis-start YYYY-MM-DD` only when it is no later than that default; it fetches every month touched by `[analysisStartDate, through]`. This is the only supported way to extend a bootstrap feasibility lock when selected content derives an earlier horizon. Then fetch both lookup files. Reject a through date after the injected current Malaysia date, an analysis start after the permitted boundary, or a start after through. The emitted lock records the exact start and exact month set. Add May/June boundary tests proving a bootstrap lock can be insufficient for an earlier selected horizon, an extended lock fetches the missing month, and no absent out-of-lock day is materialized as `missing`. The CLI supports:

```ts
const transactionUrl = (yearMonth: string) =>
  `https://storage.data.gov.my/pricecatcher/pricecatcher_${yearMonth}.csv`
const premiseLookupUrl = 'https://storage.data.gov.my/pricecatcher/lookup_premise.csv'
const itemLookupUrl = 'https://storage.data.gov.my/pricecatcher/lookup_item.csv'
```

These are the direct CSV URLs declared by the official data.gov.my catalogue. Do not infer alternate hosts or fall back to the catalogue OpenAPI.

```text
data:saves:fetch -- --through 2026-08-02 --window public --retrieved-at 2026-08-03T04:00:00.000Z --output data/pricecatcher/fixtures/source-lock.json
data:saves:fetch -- --through 2026-08-02 --analysis-start 2026-06-01 --window feasibility --retrieved-at 2026-08-03T04:00:00.000Z --output data/pricecatcher/pilot/source-lock.json
data:saves:compile -- --source-lock data/pricecatcher/fixtures/source-lock.json --compiled-at 2026-08-03T04:00:00.000Z --content data/pricecatcher/fixtures/content --publication-mode fixture --manifest-output data/pricecatcher/staging/fixture-build.json
data:saves:compile -- --reproduce-manifest data/pricecatcher/staging/fixture-build.json --reproduction-output data/pricecatcher/staging/reproductions/fixture-stage
data:saves:compile -- --reproduce-from-pointer src/saves/public/data/current.json --private-root-kind fixtures --reproduction-output data/pricecatcher/staging/reproductions/fixture-final
```

Network fetch and local compile remain separate commands.

The reproduction form reads the normalized-slice path and expected hashes from a strict staged/final manifest, verifies the five exact content digests, calls `compilePilotFromNormalizedSlice`, and writes to a separate output directory. In Task 7 it accepts fixture manifests only; Task 8 enables the desk path and then also verifies selected coverage/distance digests and every role-tagged provenance byte (including candidate source lock and coverage). The ordinary CLI accepts `--reproduction-output` only as a canonical repository-relative child of ignored `data/pricecatcher/staging/reproductions/`; it rejects absolute paths, symlinks, other roots, and traversal. `--reproduce-from-pointer` is a safe shorthand: parse the strict public pointer, map its validated build ID to `data/pricecatcher/<privateRootKind>/builds/<buildId>/manifest.json`, and require that manifest mode/root/hash to match. It accepts no interpolated shell path. Reproduction rejects any changed content byte and never stages, publishes, fetches, or changes `current.json`.

The adapter also exposes a non-CLI `reproduceBuild(inputs, { outputCapability, openAudit })` seam for the clean tracked-files verifier. Only `verify-clean-reproduction.ts` may construct `outputCapability` from its own already-created OS `mkdtemp` child; the capability carries the lstat/realpath-validated exact directory and is passed as an object, never a CLI argument, environment variable, root override, string from a manifest, or network input. The adapter requires every output realpath to remain inside that capability and forbids reads from it. Normal CLI code cannot select this external-output branch. Unit tests prove a forged/plain object, symlink, prefix-lookalike, or path outside the capability is rejected.

- [ ] **Step 6: Implement inert staging and separate atomic activation**

`data:saves:compile` never changes `current.json`. Its public mode is always explicit as `--publication-mode fixture|desk-demo`; `--audit-only --audit-output <path>` selects provisional audit operation without changing that public mode. The Task 7 adapter accepts `fixture` and fail-closes any `desk-demo` operation before output; Task 8 removes that guard only after installing and testing strict desk provenance validation. In stage operation it must:

Define the manifest rather than relying on prose-only paths:

```ts
const RepoRelativePathSchema = z.string().min(1).max(240).regex(
  /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+$/,
  'canonical repository-relative path required'
)
const InputFileRefV1Schema = z.object({
  path: RepoRelativePathSchema, sha256: Sha256Schema, byteLength: SenSchema
}).strict()
const StagedArtifactRefV1Schema = z.object({
  stagePath: RepoRelativePathSchema, finalPath: RepoRelativePathSchema,
  sha256: Sha256Schema, byteLength: SenSchema
}).strict()
const FinalArtifactRefV1Schema = z.object({
  path: RepoRelativePathSchema, sha256: Sha256Schema, byteLength: SenSchema
}).strict()
const ReviewProvenanceRoleV1Schema = z.enum([
  'candidate-source-lock', 'candidate-coverage-report', 'candidate-selection', 'review-host-policy', 'microzone-review',
  'premise-review-a', 'premise-review-b', 'item-review-a', 'item-review-b',
  'content-reconciliation', 'quality-review-a', 'quality-review-b', 'quality-reconciliation'
])
const ReviewProvenanceRefV1Schema = z.object({
  role: ReviewProvenanceRoleV1Schema, file: InputFileRefV1Schema
}).strict()
const ProvenanceIdentityEntryV1Schema = z.object({
  role: ReviewProvenanceRoleV1Schema, sha256: Sha256Schema, byteLength: SenSchema
}).strict()
const BuildInputsV1Schema = z.object({
  sourceLock: InputFileRefV1Schema,
  content: z.object({
    microzones: InputFileRefV1Schema, premises: InputFileRefV1Schema,
    items: InputFileRefV1Schema, qualityReviewBasis: InputFileRefV1Schema,
    qualityReviews: InputFileRefV1Schema
  }).strict(),
  reviewProvenance: z.array(ReviewProvenanceRefV1Schema),
  coverageReport: InputFileRefV1Schema.optional(),
  feasibilityReport: InputFileRefV1Schema.optional()
}).strict()
const ManifestIdentityV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema,
  publicationMode: z.enum(['fixture', 'desk-demo']), privateRootKind: z.enum(['fixtures', 'pilot']),
  transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, sourceWindow: z.enum(['public', 'feasibility']),
  sourceLockSha256: Sha256Schema, effectiveInputSha256: Sha256Schema,
  contentDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    qualityReviewBasis: Sha256Schema, qualityReviews: Sha256Schema,
    reviewProvenance: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict(),
  inputs: BuildInputsV1Schema,
  pointerPath: z.literal('src/saves/public/data/current.json'),
  pointer: CurrentSnapshotPointerV1Schema, pointerSha256: Sha256Schema
})
export const StagedBuildManifestV1Schema = ManifestIdentityV1Schema.extend({
  state: z.literal('staged'), stageRoot: RepoRelativePathSchema,
  artifacts: z.object({
    snapshot: StagedArtifactRefV1Schema, audit: StagedArtifactRefV1Schema,
    normalizedSource: StagedArtifactRefV1Schema
  }).strict()
}).strict()
export const FinalBuildManifestV1Schema = ManifestIdentityV1Schema.extend({
  state: z.literal('final'),
  artifacts: z.object({
    snapshot: FinalArtifactRefV1Schema, audit: FinalArtifactRefV1Schema,
    normalizedSource: FinalArtifactRefV1Schema
  }).strict()
}).strict()
export const BuildManifestV1Schema = z.discriminatedUnion('state', [
  StagedBuildManifestV1Schema, FinalBuildManifestV1Schema
])
```

Cross-field validation fixes every destination: snapshot is `src/saves/public/data/builds/<buildId>/snapshot.json`; audit/normalized source/final manifest live under `data/pricecatcher/<privateRootKind>/builds/<buildId>/`; pointer path is always `src/saves/public/data/current.json`; pointer build ID/URL/hash match the snapshot. Immutable inputs use this exact role-to-destination mapping:

```text
source lock                       inputs/source/source-lock.json
microzones                        inputs/content/microzones.json
premises                          inputs/content/premises.json
items                             inputs/content/items.json
quality review basis              inputs/content/quality-review-basis.json
quality dispositions              inputs/content/quality-reviews.json
selected-content coverage report  inputs/reports/coverage-final.json
distance feasibility report       inputs/reports/feasibility.json
candidate-source-lock             inputs/provenance/00-candidate-source-lock.json
candidate-coverage-report         inputs/provenance/01-coverage-candidates.json
candidate-selection               inputs/provenance/02-selection.json
review-host-policy                inputs/provenance/03-host-policy.json
microzone-review                  inputs/provenance/04-microzones-review.json
premise-review-a                  inputs/provenance/05-premise-review-a.json
premise-review-b                  inputs/provenance/06-premise-review-b.json
item-review-a                     inputs/provenance/07-item-review-a.json
item-review-b                     inputs/provenance/08-item-review-b.json
content-reconciliation            inputs/provenance/09-content-reconciliation.json
quality-review-a                  inputs/provenance/10-quality-review-a.json
quality-review-b                  inputs/provenance/11-quality-review-b.json
quality-reconciliation            inputs/provenance/12-quality-reconciliation.json
```

The source paths may differ in a staged manifest, but every final path must equal the destination above beneath the manifest's immutable build directory. Sort A/B premise, item, and quality pass files by top-level reviewer ID before assigning their roles, never by caller order or filename. `fixture` pairs only with `fixtures`, uses a synthetic source lock, forbids both report refs, and requires the canonical SHA-256 of an empty provenance-identity array. The Task 7 manifest schema reserves the desk shape: `desk-demo` pairs only with `pilot`, uses an official feasibility-window lock, requires selected coverage and distance report refs, and requires exactly the 13 roles above in that order; its adapters still reject desk operations until Task 8. Task 8's enabling adapter parses/canonicalizes the candidate-era source lock independently of the current extended lock, requires its digest to equal the candidate report's `sourceLockSha256`, and enforces the candidate lock start no later than candidate `dataAsOfDate − 13`; it treats the lock as immutable review provenance, not a source resolver for the current compile. For identity, map each ref to path-free `{ role, sha256, byteLength }`, parse with `ProvenanceIdentityEntryV1Schema`, and hash the canonical ordered array into required `contentDigests.reviewProvenance`; never hash mutable/staged/final paths. This makes stage and final identity identical even though publish rewrites paths. Every staged input path is under the matching committed fixture/pilot root and every final input path matches the immutable map. `sourceLockSha256`, content/report/provenance refs, and effective hash must agree with recomputation; artifact hashes/build IDs/modes agree across all three files. Add pure manifest-shape negatives for a missing/swapped/extra role and wrong path-free digest in Task 7; add candidate-lock/report, candidate-window, host-policy, nonempty-fixture-provenance, and incomplete-desk-provenance adapter tests when Task 8 enables desk operations.

Resolve paths from the repository root only after schema validation. For every input, stage artifact, destination, and ancestor: reject symlinks with `lstat`, require `realpath` containment in its exact allowlisted root, and use no-follow opens where supported. Tests cover absolute paths, `.`/`..`, backslashes, percent-encoded traversal, prefix-lookalike roots, symlink files/ancestors, cross-mode roots, swapped artifact roles, and pointer/hash mismatch. `publish --manifest` takes no path/root overrides; the validated manifest is its complete authority.

1. derive the effective-input hash and build ID;
2. write canonical snapshot, private audit, and normalized-slice bytes under the deterministic ignored root `data/pricecatcher/staging/builds/<effectiveInputSha256>/`;
3. parse all three exact byte sequences, require one build ID/mode, hash each file, and enforce zero unreviewed flags;
4. write a strict staged-build manifest containing only repository-relative source/destination paths, artifact hashes, publication mode, build ID, through date/window, source-lock hash, named content digests, and the required desk feasibility-report digest;
5. print the manifest path and exit, leaving the active public pointer untouched.

If that content-addressed stage root already exists, compile succeeds only when every expected artifact and manifest byte is identical; otherwise it fails closed and never deletes or overwrites the collision. Thus two identical compiles produce the same stage paths and byte-identical manifest without random-path leakage, while concurrent or corrupt stages are diagnosable.

`--audit-only` calls only `collectQualityReviewBasis`. It requires explicit `--audit-output` under ignored `data/pricecatcher/staging/` and `--quality-basis-output` at the matching mutable fixture/pilot review-workspace path, writes the strict collection audit, and updates the canonical basis via parse/hash/fsync/temp/atomic rename. Before replacing a differing workspace basis, copy its exact bytes to ignored `staging/review-basis-backups/<oldSha256>.json`; the active build remains protected by its immutable input copy. Repeating the same `reviewInputSha256` is byte-identical. It never creates a build ID, normalized slice, immutable build directory, staged public artifact, or pointer. This permits day-N→day-N+1 refresh while an incomplete new review workflow cannot alter the active public build. Test replacement, failure before rename, backup recovery, and old-build reproduction after workspace advancement.

Only `data:saves:publish -- --manifest <staged-build-manifest>` activates a verified stage. Task 7 implements this procedure for fixture manifests and rejects desk manifests before materialization; Task 8 extends the same procedure to revalidate all desk report/provenance bindings. The enabled branch reopens and re-hashes every artifact and every still-pinned input named by the manifest, re-parses every schema, rejects paths that escape the declared fixture/pilot/public roots, and then:

1. keeps the deterministic stage intact and copies each exact staged artifact **and every manifest-declared input/provenance byte** into unique same-parent temporary destinations under the fixed final public/private roots, fsyncs files/directories, then atomically renames temps into place; immutable input copies live under `data/pricecatcher/<privateRootKind>/builds/<buildId>/inputs/`;
2. if a target artifact/version path exists, succeeds only when its exact bytes/hash match—never overwrite a differing immutable build;
3. writes a strict canonical final `manifest.json` via a sibling temp inside the private build directory, replacing every staging/workspace input path with its immutable final artifact/input path while preserving hashes, roles, mode, and build ID;
4. parses/re-hashes the final manifest, all named final artifacts, and every named final source/content/report/provenance input from its immutable destination; schema-parse every structured input and revalidate the role/path map before activation;
5. copies the exact validated prior pointer bytes to `data/pricecatcher/staging/pointer-backups/<priorBuildId>-before-<buildId>.json`, fsyncs them, and prints that backup path;
6. writes and fsyncs a uniquely named sibling `current.json.<nonce>.tmp` with the validated relative snapshot URL/hash;
7. atomically renames that pointer temp to `current.json` and fsyncs the containing directory.

The pointer rename is the activation boundary. Any verification failure before it leaves the prior pointer untouched. Failure removes only known temp paths; exact immutable final artifacts/inputs may remain unreachable for diagnosis, while the untouched stage makes retry idempotent. On retry, each byte may be present in the stage/workspace and/or its fixed final path; both must hash to the manifest, and a correct final byte is accepted without recopying. Support a separate conditional rollback form, `data:saves:publish -- --rollback-pointer <printed-backup> --expected-current-build <newBuildId>`: parse/hash both pointers and their immutable snapshots, require current still equals the expected newly activated build, then atomically restore the exact prior pointer. It cannot remove immutable builds or roll back over a later activation. Inject failure after each materialization/final-manifest/pointer-backup/pointer-temp step and prove retry completes. Inject a truncation/bit flip independently into a final artifact, source lock, each content/report class, and a provenance file before step 4; every case must fail closed with the prior pointer byte-identical. Also prove a differing pre-existing final byte fails closed and a simulated postpublish smoke failure can conditionally restore the pointer. A workflow integration test then rebuilds Saves after rollback and requires source/dist pointer bytes plus the unmocked rendered banner to match the restored build. The committed final manifest is the clean-clone reproduction entrypoint: it loads its immutable input copies and normalized slice without ignored raw blobs or mutable workspace content. The branch accepts publication modes `fixture|desk-demo` plus the separate audit-only operation; production adapters reject `consumer-pilot`. The pure compiler remains filesystem-free.

Step 5 has one explicit initial-activation branch: only a `fixture` publish may treat exact `ENOENT` for `current.json` as no prior pointer, create no backup/rollback token, and continue with the sibling-temp atomic creation. Any existing unreadable, malformed, schema-invalid, or hash-invalid pointer fails; `desk-demo` always requires a valid prior pointer. Test initial fixture activation separately from fixture→desk upgrade and prove no other I/O error is mistaken for absence.

- [ ] **Step 7: Add deterministic fixture generation and compile adapter test**

Create `generate-fixture.ts` with no random input. It writes CSV through a small RFC 4180 escaper, splits transaction rows into the exact year-month role files under `data/pricecatcher/fixtures/sources/`, and generates:

```ts
const dates = Array.from({ length: 32 }, (_, index) => addLocalDates('2026-07-02', index))
const referencePremiseCodes = Array.from({ length: 20 }, (_, index) => String(index + 1))
for (const observedDate of dates) {
  for (const premiseCode of referencePremiseCodes) {
    if (observedDate === '2026-08-02' && premiseCode === '3') continue
    rows.push({ date: observedDate, premise_code: premiseCode, item_code: '10', price: '10.00' })
  }
}
rows.push({ date: '2026-08-02', premise_code: '1', item_code: '10', price: '10.00' }) // exact duplicate
rows.push({ date: '2026-08-02', premise_code: '2', item_code: '10', price: '15.00' }) // conflict
rows.push({ date: '2026-08-02', premise_code: '3', item_code: '10', price: '0.10' })  // hard outlier
rows.push({ date: '2026-08-02', premise_code: '1', item_code: '999', price: '5.00' }) // unknown item
rows.push({ date: '2026-08-03', premise_code: '4', item_code: '10', price: '1.00' })  // after through, not future
rows.push({ date: '2026-08-04', premise_code: '1', item_code: '10', price: '10.00' }) // future
```

Premise fixture includes all 20 lookups, uses allowed type `Pasar Raya / Supermarket`, and gives premise `1` the quoted-comma address `NO. 2, JALAN SS 2/1`. Item fixture includes whole-unit item `10` and hundredths item `11` using actual official header `item_category`. Run:

```bash
npx tsx scripts/pricecatcher/generate-fixture.ts
```

The skipped base cell makes premise `3` a true hard outlier rather than a conflicting duplicate. Fixture pilot content includes premises `1`–`4`, so premise `4` remains a complete eligible alternative when premise `2` conflicts and premise `3` is anomalous. The fixture lock uses `throughDate: 2026-08-02`; the 3 August row proves the hard cutoff and the 4 August row proves the separate future counter. The generator hashes the four exact fixture source byte sequences and writes strict typed `data/pricecatcher/fixtures/source-lock.json`; no digest or local path is hand-authored. It writes synthetic `microzones.json`, `premises.json`, `items.json`, a canonical `quality-review-basis.json`, and `quality-reviews.json` whose disposition bases exactly cover every generated flag. Re-running it must be byte-identical, and fixture compilation must pass in a clean temporary checkout with no `data/pricecatcher/raw` directory.

Test that running the local compile adapter twice with the same pinned inputs and clock produces byte-identical snapshot, audit, normalized slice, staged manifest, and the canonical pointer bytes/hash embedded in that manifest. Compile itself never writes a pointer; activation tests separately prove identical pointer bytes and atomic replacement.

- [ ] **Step 8: Run IO/compiler tests and type-check**

```bash
npm run test:saves -- scripts/pricecatcher/io.test.ts src/pricecatcher/__tests__/compile.test.ts
npm run typecheck:saves
```

Expected: all tests PASS.

- [ ] **Step 9: Commit deterministic IO adapters**

```bash
git add .gitignore scripts/pricecatcher data/pricecatcher/fixtures src/pricecatcher
git commit -m "feat: add reproducible PriceCatcher ingestion"
git push origin UPGRADES
```

---

### Task 8: Implement feasibility reporting and publish the fixture snapshot

**Files:**
- Create: `src/pricecatcher/feasibility.ts`
- Create: `scripts/pricecatcher/feasibility.ts`
- Create: `scripts/pricecatcher/refresh.ts`
- Create: `scripts/pricecatcher/select-content.ts`
- Create: `scripts/pricecatcher/reconcile-content.ts`
- Modify: `scripts/pricecatcher/compile.ts`
- Modify: `scripts/pricecatcher/manifest.ts`
- Modify: `scripts/pricecatcher/publish.ts`
- Modify: `scripts/pricecatcher/io.test.ts`
- Test: `scripts/pricecatcher/reconcile-content.test.ts`
- Test: `scripts/pricecatcher/refresh.test.ts`
- Test: `src/pricecatcher/__tests__/feasibility.test.ts`
- Consume (created in Task 7): `data/pricecatcher/fixtures/source-lock.json`
- Consume (created in Task 7): `data/pricecatcher/fixtures/content/{microzones,premises,items,quality-review-basis,quality-reviews}.json`
- Create: `src/saves/public/data/current.json`
- Create: `src/saves/public/data/builds/<fixture-build-id>/snapshot.json`
- Create: `data/pricecatcher/fixtures/builds/<fixture-build-id>/audit.json`
- Create: `data/pricecatcher/fixtures/builds/<fixture-build-id>/normalized-source.json`
- Create: `data/pricecatcher/fixtures/builds/<fixture-build-id>/manifest.json`
- Create: `data/pricecatcher/fixtures/builds/<fixture-build-id>/inputs/**`

**Interfaces:**
- Consumes: normalized joined transactions/lookups, an explicit Petaling Jaya coverage-candidate input, then separately reviewed coordinates/microzones/items for distance-aware validation.
- Produces: `buildCoverageCandidateReport(input): CoverageCandidateReportV1`, `buildDistanceFeasibilityReport(input): DistanceFeasibilityReportV1`, deterministic ranked candidate codes, fixture private content, and a fixture-labelled public build.

- [ ] **Step 1: Write failing feasibility tests for the locked denominators**

Create `feasibility.test.ts`:

```ts
it('restricts coverage candidates to allowed Petaling Jaya premises on ten of fourteen dates', () => {
  const report = buildCoverageCandidateReport(coverageFeasibilityFixture())
  expect(report.premises.find(row => row.premiseCode === '1')?.nearDaily).toBe(true)
  expect(report.premises.find(row => row.premiseCode === '2')?.nearDaily).toBe(false)
  expect(report.premises.some(row => row.premiseCode === '90')).toBe(false) // outside PJ
  expect(report.premises.some(row => row.premiseCode === '91')).toBe(false) // wet market
})

it('requires item coverage at seventy percent of near-daily premises on ten dates', () => {
  const report = buildCoverageCandidateReport(coverageFeasibilityFixture())
  expect(report.items.find(row => row.itemCode === '10')).toMatchObject({ highCoverage: true })
  expect(report.items.find(row => row.itemCode === '11')).toMatchObject({ highCoverage: false })
})

it('uses the worst approved baseline over thirty targets and sixty retained dates', () => {
  const report = buildDistanceFeasibilityReport(distanceFeasibilityFixture())
  expect(report.referenceAndTargetDates).toHaveLength(60)
  expect(report.microzones[0]?.minimumBaselineAlternativeDateBasisPoints).toBe(7000)
})
```

- [ ] **Step 2: Run the feasibility test and observe the missing-module failure**

```bash
npm run test:saves -- src/pricecatcher/__tests__/feasibility.test.ts
```

Expected: FAIL because `feasibility.ts` does not exist.

- [ ] **Step 3: Implement the calibration metrics**

Consume the already-tested strict report contracts from Task 1. Their inferred interfaces are shown here as an implementation checklist, not redefined in this task:

```ts
export interface CoverageCandidateReportV1 {
  schemaVersion: 1
  transformVersion: string
  throughDate: LocalDate
  sourceLockSha256: string
  scope: 'candidate-universe' | 'selected-content'
  selectedContentDigests?: { premises: string; items: string }
  dataAsOfDate: LocalDate
  calibrationDates: LocalDate[]
  premises: Array<{
    premiseCode: string
    officialName: string
    address: string
    premiseType: string
    state: string
    district: string
    distinctPresenceDates: number
    dateCoverageBasisPoints: number
    completeItemCellCoverageBasisPoints: number
    nearDaily: boolean
  }>
  items: Array<{
    itemCode: string
    officialName: string
    officialUnit: string
    itemGroup: string
    itemCategory: string
    coveredDates: number
    qualifyingPremiseCoverageDates: number
    qualifyingDateRateBasisPoints: number
    meanPremiseCoverageBasisPoints: number
    highCoverage: boolean
  }>
  passesCoverageCandidateGate: boolean
  failureReasons: string[]
}

export interface DistanceFeasibilityReportV1 {
  schemaVersion: 1
  transformVersion: string
  throughDate: LocalDate
  sourceLockSha256: string
  dataAsOfDate: LocalDate
  coverageReportSha256: string
  microzonesSha256: string
  premisesSha256: string
  itemsSha256: string
  referenceAndTargetDates: LocalDate[]
  targetDates: LocalDate[]
  finalPremiseCodes: string[]
  finalItemCodes: string[]
  microzones: Array<{
    microzoneId: string
    premiseCount: number
    baselines: Array<{
      premiseCode: string
      completeAlternativeDates: number
      completeAlternativeDateBasisPoints: number
    }>
    minimumBaselineAlternativeDateBasisPoints: number
    passes: boolean
  }>
  passesDeskDemoGate: boolean
  failureReasons: string[]
}
```

Parse both constructed reports through those strict runtime schemas before writing them.

Hash the canonical coverage report bytes and exact reviewed microzone/premise/item file bytes before Phase B. The distance report binds those digests, the source-lock digest, and `throughDate`, and lists sorted unique final premise/item codes. Phase B rejects a coverage report from another source lock or cutoff. Desk compilation re-verifies all of these bindings against its own lock and curated bytes; `passesDeskDemoGate` is evidence, not a caller-controlled bypass.

Phase A first trims/case-folds official lookup fields and filters strictly to `state = Selangor`, `district = Petaling Jaya`, and the Task 6 allowed single-operator premise types. Its initial candidate-universe run uses all such premises and makes no coordinate/distance claim. Its mandatory post-reconciliation selected-content rerun uses only exact final premise/item codes and binds their bytes. For the 14 dates ending at the scope-specific `dataAsOfDate`:

```ts
nearDaily = distinctPresenceDates >= 10
dateCoverageBasisPoints = Math.floor(coveredDates * 10_000 / 14)
premiseCoverageBasisPoints = Math.floor(observedNearDailyPremises * 10_000 / totalNearDailyPremises)
qualifyingDateRateBasisPoints = Math.floor(qualifyingDatesWithAtLeast70PercentPremises * 10_000 / coveredDates)
meanPremiseCoverageBasisPoints = Math.floor(sumOfPerCoveredDatePremiseCoverageBasisPoints / coveredDates)
completeItemCellCoverageBasisPoints = Math.floor(validHighCoverageItemDateCells * 10_000 / (highCoverageItemCount * 14))
highCoverage = coveredDates >= 10 && qualifyingDateRateBasisPoints >= 7000
```

The Phase-A gate is exact: count distinct near-daily premises and high-coverage items from those metrics; require `nearDailyPremiseCount >= 10` and `highCoverageItemCount >= 5`. `passesCoverageCandidateGate` is the conjunction. `failureReasons` is the exact duplicate-free subset of `['insufficient-near-daily-premises', 'insufficient-high-coverage-items']` in that order for the failed predicates, and is empty iff the gate passes. Selected-content scope applies the same thresholds to exactly the final content code sets; it may not borrow candidate-universe rows. Schema refinements recompute all booleans/counts/reasons and mutation tests cover 9/10 premises, 4/5 items, both failures, empty reasons on failure, and a forged true gate.

Derive high-coverage items first from all near-daily PJ premises, then compute each premise's complete-item-cell tie-break over exactly those items × 14 calibration dates; this metric never feeds back into near-daily/high-coverage membership. Every ratio uses an explicit zero guard: a zero denominator yields `0` basis points and therefore the applicable exact insufficient-count failure above, never `NaN`, an exception, a per-item ad hoc reason, or a relaxed gate. Test all empty-denominator reports and require them to parse under the strict schema with `passesCoverageCandidateGate: false`.

Phase B accepts only a passing selected-content coverage report after final reviewed content exists. Retain exactly the 60 dates `[dataAsOfDate − 59, dataAsOfDate]`. It preserves the compiler's two universes: each target's 30-date quality reference uses all lookup-joined allowed single-operator Selangor premises for the final item codes, while baselines/alternatives use only final reviewed Petaling Jaya premises. Never build the 20-premise reference from the 10–15 pilot premises. For each of the 30 target dates `[dataAsOfDate − 29, dataAsOfDate]`, build that target's quality reference from its immediately preceding 30 dates. For every approved baseline in each microzone, count a date only when the baseline and at least one different approved premise at inclusive Haversine distance `<= 5_000` metres have every final approved item eligible on that same date. The microzone metric is the minimum per-baseline rate, not an average or representative origin. The final report passes only with 10–15 near-daily eligible final premises, 5–10 items that still satisfy Phase A coverage when recomputed on the final premise set, at least three premises per microzone, and every microzone minimum at least 7,000 basis points. Add a regression with a newest observation on a rejected candidate: initial selection horizon may be D, but selected coverage/Phase B/compiler all deterministically use D−1. Add a fixture with 20 reference premises but only 10 pilot premises and prove the phase does not return insufficient-reference.

Now that both feasibility phases exist, implement `data:saves:refresh` as a post-curation review orchestrator, never a stager or activator. It is fixed to official `desk-demo` review flow and requires explicit `--through`, `--retrieved-at`, `--compiled-at`, `--content`, `--source-lock-output`, `--candidate-source-lock`, `--candidate-coverage-report`, `--selection`, `--host-policy`, `--selected-coverage-output`, `--feasibility-output`, `--audit-output`, and `--quality-basis-output`. The candidate lock/report, selection, and host policy are existing immutable curation provenance and are parsed/hash-checked but never regenerated by daily refresh.

The refresh order is exact. First fetch a bootstrap feasibility lock for `[through − 59, through]`. Call a separate internal `deriveSelectedHorizon(verifiedRows, selectedCodes, cutoff): LocalDate` that performs only the compiler's valid-price/join/cutoff horizon selection and emits no coverage report, missing cells, gate, or artifact. If no selected row exists in that pinned bootstrap window, stop with an explicit no-horizon failure rather than searching unpinned history. Compute `requiredStart = H − 59`. When `requiredStart` precedes the bootstrap start, rerun fetch with `--analysis-start requiredStart` to replace the active lock atomically and fetch every newly required month. Then run selected-content coverage from the final lock and require its `dataAsOfDate` equals `H`; this is the only selected report emitted or committed and the only one that may feed Phase B. Build Phase B from that report/reviewed microzones, then invoke compile with selected coverage plus distance report in `--audit-only` mode to write the detailed audit and canonical review basis. It stops for a fresh complete two-person quality review and deliberately has no manifest/publish flag, no wall-clock fallback, no candidate-selection rewrite, and no fixture/consumer mode. First-time curation follows the same bootstrap→horizon probe→lock extension→final selected coverage sequence after explicit Task 13 candidate review.

Add an injected-adapter test asserting exact scope/argument propagation (including both instants, all four provenance paths, policy, and basis path), bootstrap fetch→pure horizon probe→optional extended fetch→final selected coverage→distance→audit/basis order, no-extension and previous-month-extension branches, early stop on each failure, no report emitted by the probe, and byte-identical candidate lock/report/selection/host policy/current pointer with no stage manifest on success or failure.

- [ ] **Step 4: Implement deterministic candidate ranking**

`select-content.ts` writes review candidates, never final curated-content objects or auto-approvals. It consumes the validated passing coverage report plus explicit `--source-lock`; it parses/canonicalizes the lock, requires its digest to equal the report's `sourceLockSha256`, and atomically writes those exact canonical bytes to `review-candidates/source-lock.json`. This candidate-era copy remains immutable even when the active pilot source lock is later extended or refreshed. Add strict `PremiseReviewCandidateV1Schema` (`code`, official name/address/type/state/district, coverage metrics, `nearDaily: true`, `status: 'needs-review'`) and `ItemReviewCandidateV1Schema` (`code`, official name/unit/group/category, coverage metrics, `highCoverage: true`, `status: 'needs-review'`). Construct the premise pool only from report rows with `nearDaily === true` and the item pool only from rows with `highCoverage === true`; a passing gate guarantees at least 10 and 5 respectively. Rank qualifying premises by presence-date count descending, complete-item-cell coverage descending, then canonical code. Rank qualifying items by qualifying-date count descending, mean premise coverage descending, then canonical code. Emit up to the top 15 premises and top 10 items with all official lookup fields; never pad with a nonqualifying row and do not fabricate coordinates, reviewers, qualifiers, quantity modes, or source licenses. Write one strict canonical `CandidateSelectionV1` with schema version, candidate source-lock SHA-256, coverage-report SHA-256, report transform version, and those ordered arrays to `review-candidates/selection.json`; rerunning against the same pair is byte-identical. Add a passing report with nonqualifying tail rows and assert every emitted candidate has the literal true eligibility flag and none of the tail codes appears. Human/agent review promotes only accepted candidates into the separately validated final private schemas from Task 6.

Add strict repository-safe review-pass schemas. `select-content.ts` writes one canonical `selection.json` containing the coverage-report hash plus the exact ranked premise/item candidate objects and codes; passes bind both the coverage and selection byte hashes. Evidence is separate from disposition so a reviewer can honestly record closure, coordinate/semantic conflict, or missing evidence. Free-text notes, contact fields, local paths, data URLs, and media are schema-invalid.

```ts
const CompletePremiseEvidenceSchema = z.object({
  kind: z.literal('complete'), observedName: z.string().min(1),
  entranceLatitude: z.number().min(-90).max(90), entranceLongitude: z.number().min(-180).max(180),
  coordinateAccuracyMetres: z.number().positive().max(30),
  closureSignal: z.enum(['none', 'open', 'closed']), sources: z.array(ReviewSourceSchema).min(2)
}).strict()
const InsufficientPremiseEvidenceSchema = z.object({
  kind: z.literal('insufficient'), attemptedSources: z.array(ReviewSourceSchema).min(1),
  missingFields: z.array(z.enum(['current-name', 'entrance-coordinate', 'accuracy', 'closure-status', 'redistribution-proof'])).min(1)
}).strict()
const PremiseEvidenceSchema = z.discriminatedUnion('kind', [
  CompletePremiseEvidenceSchema, InsufficientPremiseEvidenceSchema
])
const ApprovedPremiseDecisionSchema = z.object({
  status: z.literal('approved'), code: CanonicalCodeSchema,
  microzoneId: z.string().regex(/^[a-z0-9-]+$/), evidence: CompletePremiseEvidenceSchema,
  reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
}).strict()
const NeedsReviewDecisionSchema = z.object({
  status: z.literal('needs-review'), code: CanonicalCodeSchema,
  proposedMicrozoneId: z.string().regex(/^[a-z0-9-]+$/).optional(), evidence: PremiseEvidenceSchema,
  reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
}).strict()
const RejectedDecisionSchema = z.object({
  status: z.literal('rejected'), code: CanonicalCodeSchema,
  proposedMicrozoneId: z.string().regex(/^[a-z0-9-]+$/).optional(), evidence: PremiseEvidenceSchema,
  reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
}).strict()
export const PremiseReviewPassV1Schema = z.object({
  schemaVersion: z.literal(1), reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema,
  coverageReportSha256: Sha256Schema, candidateSelectionSha256: Sha256Schema,
  hostPolicySha256: Sha256Schema,
  decisions: z.array(z.discriminatedUnion('status', [
    ApprovedPremiseDecisionSchema, NeedsReviewDecisionSchema, RejectedDecisionSchema
  ]))
}).strict()

const CompleteItemEvidenceSchema = z.object({
  kind: z.literal('complete'), normalizedQualifiers: z.array(z.string()),
  quantityMode: z.enum(['whole-units', 'hundredths'])
}).strict()
const InsufficientItemEvidenceSchema = z.object({
  kind: z.literal('insufficient'),
  missingFields: z.array(z.enum(['official-label', 'package-basis', 'qualifiers', 'quantity-mode'])).min(1)
}).strict()
const ItemEvidenceSchema = z.discriminatedUnion('kind', [CompleteItemEvidenceSchema, InsufficientItemEvidenceSchema])
export const ItemReviewPassV1Schema = z.object({
  schemaVersion: z.literal(1), reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema,
  coverageReportSha256: Sha256Schema, candidateSelectionSha256: Sha256Schema,
  decisions: z.array(z.discriminatedUnion('status', [
    z.object({ status: z.literal('approved'), code: CanonicalCodeSchema,
      evidence: CompleteItemEvidenceSchema, reasonCodes: z.array(ReviewReasonCodeSchema).min(1) }).strict(),
    z.object({ status: z.literal('needs-review'), code: CanonicalCodeSchema,
      evidence: ItemEvidenceSchema, reasonCodes: z.array(ReviewReasonCodeSchema).min(1) }).strict(),
    z.object({ status: z.literal('rejected'), code: CanonicalCodeSchema,
      evidence: ItemEvidenceSchema, reasonCodes: z.array(ReviewReasonCodeSchema).min(1) }).strict()
  ]))
}).strict()
export const ReviewedMicrozonesV1Schema = z.object({
  schemaVersion: z.literal(1), microzones: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1),
    bounds: z.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() }).strict(),
    candidatePremiseCodes: z.array(CanonicalCodeSchema).min(3)
  }).strict()).min(1).max(2)
}).strict()
export const QualityReviewPassV1Schema = z.object({
  schemaVersion: z.literal(1), reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema,
  qualityReviewBasisSha256: Sha256Schema,
  decisions: z.array(z.object({
    reviewBasis: QualityReviewBasisV1Schema,
    disposition: z.enum(['confirmed-exclusion', 'confirmed-eligible']),
    reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
  }).strict())
}).strict()
```

Reason-code validation is exact, sorted, and duplicate-free. An approved premise decision must have exactly `APPROVED_PREMISE_REASON_CODES`; an approved item decision must have exactly `APPROVED_ITEM_REASON_CODES`. Premise `needs-review|rejected` must contain one or more codes exclusively from `PREMISE_QUARANTINE_REASON_CODES`; item `needs-review|rejected` must contain one or more exclusively from `ITEM_QUARANTINE_REASON_CODES`. No positive code is permitted on a quarantined decision and no negative code is permitted on an approval. A quality decision for a `rejected-cell` must have exactly `['quality-exclusion-confirmed']` and disposition `confirmed-exclusion`; an `eligible-below-half-median` decision must have exactly `['low-price-eligibility-confirmed']` and disposition `confirmed-eligible`. Refine approved premise decisions further to complete non-closed evidence and required KPDN + coordinate source kinds; refine approved items to complete evidence. Add one negative test for each missing mandatory approval code, mixed positive/negative lists, wrong-entity quarantine codes, duplicate/out-of-order codes, and each wrong quality-code/basis combination. This makes closure/source/coordinate/semantic failures serializable without falsely asserting agreement.

Pass-level cross-field validation requires each source `accessedOn <= pass.reviewedOn`, and reconciliation copies each pass date into the private review row. The final compiler's contextual validator then requires every copied pass/disposition date to be on or before the Malaysia date of its injected compile instant, every source access date `<=` its copied review date, `verifiedOn` equal to the later premise review date, `verificationExpiresOn` exactly 90 local dates after `verifiedOn`, and `verificationExpiresOn >= malaysiaDateAt(compiledAt)` (equality is valid). It rejects future `retrievedAt`, source access, review, disposition, or verification dates. Add equality-boundary and one-day-expired tests plus source-access-after-review, review-after-compile, and retrieval-after-compile negatives in primary and reproduction paths.

Import `ReviewSourceSchema` from Task 6 with its exact HTTPS URL/access-date/redistribution/attribution-code shape. Add negative parse tests for extra fields, duplicate codes, reused reviewer IDs, bad report/audit hashes, contact-shaped fields, and non-ordered/invalid microzone bounds.

`reconcile-content.ts` requires exactly two premise-pass files, exactly two item-pass files, reviewed microzone bounds, host policy, candidate source lock, candidate selection, and candidate-universe report. It re-hashes all canonical inputs; requires lock→report→selection transform/digest bindings; rejects reused reviewer IDs/hashes; and requires each pass to contain exactly one decision per selected code with no missing/extra/duplicate. Every microzone candidate code must be in the selected premise universe. It accepts a premise only when both passes approve, normalized names/microzones agree, neither has a closure signal, source requirements/terms pass, and entrance points are within 30 metres; accepts an item only when both approve and quantity mode/normalized qualifiers agree. It deterministically emits final schema-valid `microzones.json`, `premises.json`, and `items.json`, plus a strict reconciliation report containing fixed role-tagged repository-relative input refs/digests for candidate source lock, candidate coverage, selection, host policy, microzone review, sorted A/B premise and item passes, and every accepted/quarantined code. The `quality` subcommand's strict reconciliation report similarly records role-tagged refs for sorted A/B quality passes and the basis digest. Final compile finds only the two fixed reconciliation-report paths under `content/reviews`, parses their typed refs, containment-checks and re-hashes them, and constructs the exact 13-role manifest list; it never glob-guesses a dated candidate report or trusts caller order. Before invoking the pure compiler, both stage and reproduction adapters parse the candidate lock, report, selection, and reconciliation objects and run the current-lookup drift cross-check specified in Task 1; those provenance objects need not enter the browser/pure compiler API. Tests cover missing/extra/duplicate decisions, out-of-selection microzone codes, agreement, coordinate/closure conflict, semantic conflict, source restriction, wrong role/path/digest, lookup drift during stage and reproduction, PII-shaped fields, and deterministic bytes. No manual copy/paste creates final content.

Only after these schemas/validators and tests exist, modify `scripts/pricecatcher/{compile,manifest,publish}.ts` to remove Task 7's `desk-provenance-not-enabled` guard. Thread the parsed candidate-era objects through stage, reproduction, and publish revalidation; keep fixture behavior byte-identical. Extend `io.test.ts` with synthetic valid/invalid 13-role desk manifests, historical-candidate-window and transform bindings, and a regression proving a premature or partially wired desk branch still fails before output.

Projection is exact and independent of pass argument order. Export `normalizeReviewTextDisplay`: Unicode NFC, trim, collapse every Unicode-whitespace run to one ASCII space, and reject empty/control-character output; `normalizeReviewTextKey` applies locale-independent `toLowerCase()` to that display. Sort passes/reviews by `reviewerId`; copy `reviewedOn` into each final private review; canonicalize each source list by URL/date/codes. Require both observed-name keys equal, then choose the code-point-lexicographically smallest normalized display spelling as `displayName`. Use the entrance latitude/longitude from the lexicographically smaller reviewer ID as the reproducible public point. Set `coordinateAccuracyMetres = min(30, max(reviewAAccuracy, reviewBAccuracy, ceil(haversineMetres(pointA, pointB))))`; `verifiedOn` is the later copied pass date; `verificationExpiresOn` is exactly 90 local dates later; and production reconciliation always emits `verificationStatus: desk-verified` (only a future field workflow may emit field-verified). Add NFC-equivalent, casing, whitespace, control/empty, and reversed-pass name tests.

Qualifier agreement has one exported algorithm. `normalizeQualifierDisplay` applies Unicode NFC, trims, replaces every nonempty Unicode-whitespace run with one ASCII space, and rejects empty/control-character results. `normalizeQualifierKey` then applies locale-independent `toLowerCase()`. Within each review, keys must be unique and stored in key-sorted order; the two approved reviews must have exactly the same key set regardless of incoming order/case. For each agreed key, choose the code-point-lexicographically smallest normalized display spelling across both reviews, and emit final qualifiers sorted by key. Item projection preserves each reviewer ID/date and its canonical approved qualifiers. Add reversed pass/order, casing, Unicode-equivalent, whitespace, duplicate-key, empty/control, and different-key-set tests requiring byte-identical output or fail-closed disagreement as appropriate.

Build `coordinateAttribution` by sorting/uniquing `attributionCode` values and mapping them to fixed phrases: KPDN official record, official retailer locator, © OpenStreetMap contributors (ODbL 1.0), or synthetic fixture source. Reject synthetic attribution in production. Tests use unequal points, dates, accuracies, name casing, source order, and reversed pass arguments and require byte-identical output plus a public point within 30 metres of both reviews.

The same script has an explicit `quality` subcommand. It reads and hashes the committed canonical `QualityReviewBasisFileV1`, then requires exactly two `QualityReviewPassV1` files with distinct reviewer IDs and `qualityReviewBasisSha256` equal to those exact bytes. Each pass must contain exactly one unique decision whose complete parsed `reviewBasis` is deeply equal to every basis-file `qualityFlags` entry, with no extra or duplicate—even if an older disposition happened to match the same premise/item/date. The two decisions must be unanimous; `rejected-cell` accepts only `confirmed-exclusion`, while `eligible-below-half-median` accepts only `confirmed-eligible`. Output reviews preserve the exact strict basis and basis digest, copy each pass's `reviewedOn` into its nested review, sort reviews by reviewer ID and rows by canonicalized basis, sort/unique reason codes, and use the later nested date as top-level `reviewedOn`. The command atomically replaces the complete current `PrivateQualityReviewsFileV1` only after parsing its own canonical bytes; it never merges by the four-field key. Final compile reconstructs every basis/context from current evidence and requires exact complete coverage. Tests cover wrong basis hash/context, reused reviewer, missing/extra/duplicate/changed-evidence basis, disagreement, flag-incompatible disposition, overlapping refresh dates, unequal review dates/pass order producing identical bytes, future nested/top dates, top-date mismatch, and a fully reconciled audit yielding zero compiler flags without dropping prior-key/current-evidence rows.

- [ ] **Step 5: Create valid fixture-only reviewed content**

The fixture content is explicitly synthetic and uses `.test` source URLs, reviewer IDs `fixture-reviewer-a` and `fixture-reviewer-b`, coordinates within 1 km, verification dates `2026-08-01`, expiry `2026-10-30`, redistribution code `synthetic-cc0`, and attribution code `synthetic-fixture`. Its microzone label is `Fixture Petaling Jaya`, `publicationMode` is `fixture`, and the public attribution begins `Synthetic fixture data — not current nearby PriceCatcher observations.`

Generate all fixture CSVs, their source lock, the normalized fixture content, and synthetic quality-review dispositions rather than hand-editing them:

```bash
npm run data:saves:fixture
```

- [ ] **Step 6: Generate and verify the committed fixture build**

Run:

```bash
npm run data:saves:compile -- --source-lock data/pricecatcher/fixtures/source-lock.json --compiled-at 2026-08-03T04:00:00.000Z --content data/pricecatcher/fixtures/content --publication-mode fixture --manifest-output data/pricecatcher/staging/fixture-build.json
```

Run the same command again and assert the staged manifest/build ID and all artifact hashes are identical. At this task boundary only the compiler/IO/schema checks exist; run them while `current.json` still points to the prior artifact, then explicitly activate so later UI tasks have fixture data:

```bash
npm run test:saves -- scripts/pricecatcher/io.test.ts src/pricecatcher
npm run typecheck:saves
npm run data:saves:publish -- --manifest data/pricecatcher/staging/fixture-build.json
npm run data:saves:compile -- --reproduce-from-pointer src/saves/public/data/current.json --private-root-kind fixtures --reproduction-output data/pricecatcher/staging/reproductions/fixture
```

Expected: the second stage is byte-identical, all verification available through Task 8 passes before activation, and only the publish command changes `current.json` to the content-derived fixture build ID. Pointer-derived reproduction from the committed final manifest must pass with no official raw directory. The complete browser/boundary `verify:saves` command first becomes available in Task 12.

- [ ] **Step 7: Run feasibility, compiler, and schema tests**

```bash
npm run test:saves -- src/pricecatcher/__tests__/feasibility.test.ts src/pricecatcher/__tests__/compile.test.ts src/pricecatcher/__tests__/contracts.test.ts scripts/pricecatcher/reconcile-content.test.ts scripts/pricecatcher/refresh.test.ts
npm run typecheck:saves
```

Expected: all tests PASS.

- [ ] **Step 8: Commit the feasibility and fixture gate**

```bash
git add src/pricecatcher/feasibility.ts src/pricecatcher/__tests__/feasibility.test.ts scripts/pricecatcher/feasibility.ts scripts/pricecatcher/refresh.ts scripts/pricecatcher/refresh.test.ts scripts/pricecatcher/select-content.ts scripts/pricecatcher/reconcile-content.ts scripts/pricecatcher/reconcile-content.test.ts scripts/pricecatcher/compile.ts scripts/pricecatcher/manifest.ts scripts/pricecatcher/publish.ts scripts/pricecatcher/io.test.ts data/pricecatcher/fixtures src/saves/public/data
git commit -m "feat: add PriceCatcher feasibility and fixture data"
git push origin UPGRADES
```

---

### Task 9: Add the isolated Saves build, secure snapshot loader, and loading/error shell

**Files:**
- Create: `vite.saves.config.ts`
- Create: `config/saves-env/.gitkeep`
- Create: `src/saves/index.html`
- Create: `src/saves/e2e.html`
- Create: `src/saves/main.tsx`
- Create: `src/saves/bootstrap.tsx`
- Create: `src/saves/styles.css`
- Create: `src/saves/app/App.tsx`
- Create: `src/saves/data/loadSnapshot.ts`
- Test: `src/saves/data/loadSnapshot.test.ts`
- Test: `src/saves/app/App.test.tsx`

**Interfaces:**
- Consumes: committed `current.json`, Version 1 snapshot schemas, same-origin `fetch`, and an injected SHA-256 function.
- Produces: `loadSnapshot(deps): Promise<PilotSnapshotV1>`, typed `SnapshotLoadError`, the isolated Vite build, and an application shell that renders loading, fixture/current banner, or a reason-specific load failure.

- [ ] **Step 1: Write failing pointer/hash/schema loader tests**

Create `loadSnapshot.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { loadSnapshot } from './loadSnapshot'
import { makeSnapshot } from '../../pricecatcher/__tests__/snapshotFixture'

const bytes = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`)

it('loads pointer then same-build snapshot and verifies exact bytes', async () => {
  const snapshot = makeSnapshot()
  const snapshotBytes = bytes(snapshot)
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      schemaVersion: 1,
      buildId: snapshot.buildId,
      snapshotUrl: './data/builds/fixture-2026-08-02/snapshot.json',
      snapshotSha256: 'a'.repeat(64)
    })))
    .mockResolvedValueOnce(new Response(snapshotBytes))
  await expect(loadSnapshot({ fetchImpl, sha256: async () => 'a'.repeat(64) })).resolves.toEqual(snapshot)
})

it.each([
  ['snapshot-load-failed', () => Promise.resolve(new Response('', { status: 404 }))],
  ['snapshot-integrity-failed', () => Promise.resolve(new Response(bytes(makeSnapshot())))]
])('throws %s without returning partial data', async (reason, secondResponse) => {
  const pointer = {
    schemaVersion: 1,
    buildId: 'fixture-2026-08-02',
    snapshotUrl: './data/builds/fixture-2026-08-02/snapshot.json',
    snapshotSha256: 'b'.repeat(64)
  }
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(pointer)))
    .mockImplementationOnce(secondResponse)
  await expect(loadSnapshot({ fetchImpl, sha256: async () => 'a'.repeat(64) })).rejects.toMatchObject({ reason })
})
```

- [ ] **Step 2: Run the loader test and observe the missing-module failure**

```bash
npm run test:saves -- src/saves/data/loadSnapshot.test.ts
```

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement byte-first loading and integrity checks**

Define:

```ts
export class SnapshotLoadError extends Error {
  constructor(public readonly reason: Extract<ReasonCode,
    'snapshot-load-failed' | 'snapshot-schema-unsupported' | 'snapshot-integrity-failed'>,
  message: string) {
    super(message)
  }
}

export async function browserSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
```

Fetch `./data/current.json` with `{ cache: 'no-store', credentials: 'same-origin' }`, parse pointer from `unknown`, require a relative same-origin `snapshotUrl` under `./data/builds/`, fetch snapshot bytes, verify SHA before JSON parsing, parse Version 1 schema, and require pointer/snapshot `buildId` equality. Convert network/JSON/schema failures to the exact load reason without including response contents in messages.

- [ ] **Step 4: Create the isolated Vite config and security metadata**

Create `vite.saves.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url))
const savesEnvDir = resolve(repositoryRoot, 'config/saves-env')

export default defineConfig(({ mode }) => {
  const isE2e = mode === 'saves-e2e'
  if (mode !== 'production' && mode !== 'development' && !isE2e) throw new Error(`unsupported Saves mode: ${mode}`)
  return {
  root: 'src/saves',
  base: './',
  envDir: savesEnvDir,
  envPrefix: 'AUNTIE_SAVES_PUBLIC_',
  plugins: [react()],
  resolve: { alias: { '@pricecatcher': resolve(repositoryRoot, 'src/pricecatcher'), '@saves': resolve(repositoryRoot, 'src/saves') } },
  build: {
    outDir: isE2e ? '../../dist/saves-e2e' : '../../dist/saves',
    emptyOutDir: true,
    rollupOptions: isE2e ? { input: resolve(repositoryRoot, 'src/saves/e2e.html') } : undefined
  }
  }
})
```

Vite 5 requires `envDir` to be a string. Keep `config/saves-env` committed and empty except `.gitkeep`; never place an env file there. Source/boundary checks reject any `import.meta.env` or `process.env` read under `src/saves` and any call to `loadEnv` in the Saves config. Add a config typecheck and build test with sentinel process variables that confirms no sentinel appears in `dist/saves`. The explicit prefix is defense in depth, not an authorization to add public environment configuration.

Create `index.html` with CSP meta content exactly `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'`, `Referrer-Policy: no-referrer`, viewport, description, theme color, one `#root`, and `/main.tsx`. Do not add remote fonts, icons, analytics, inline scripts, or a router. `frame-ancestors` is intentionally reserved for a later HTTPS response header because browsers ignore it in a meta policy. Root-level `src/saves/e2e.html` duplicates only this security metadata/root shell and loads `/test/e2e-main.tsx`; mode-specific Rollup emits exact `dist/saves-e2e/e2e.html`. Keeping it root-level preserves production loader resolution of `./data/current.json` as `/data/current.json`. Assert that exact E2E file exists. Normal `dist/saves` must contain `index.html`, the hashed JS/CSS assets discovered from it, and copied public data, while containing no `e2e.html`, `e2e-main`, E2E fixture manifest, test-control symbol, or fixed test instant.

- [ ] **Step 5: Write and then implement App shell tests**

Test four states with an injected `snapshotLoader`: loading text; fixture banner (`Synthetic fixture data — not current nearby PriceCatcher observations.`); desk banner (`Desk-verified demonstration — coordinates are not field-verified; trip recommendations are disabled.`); and a human-readable integrity failure that never renders basket controls. While loading, render one app-load `role="status" aria-live="polite" aria-atomic="true"`; on a blocking load/schema/integrity failure replace it with one `role="alert" aria-live="assertive"` and focus its heading; on ready, remove the app-load region before workflow live regions mount. Add an async deferred-loader test for loading→integrity failure and loading→ready, asserting announcement/focus and no simultaneous load/workflow regions. A consumer-pilot mode may be rendered only from synthetic test input in this branch and never from generated public content. Implement `mountSaves(root, { now, geolocation, loadSnapshot })` in `bootstrap.tsx`; it is the sole React assembly boundary used by both normal `main.tsx` and Task 12's test-only entry. Production `main.tsx` supplies `() => new Date().toISOString()` and browser geolocation without exposing globals beyond those injected values. `App.tsx` receives the dependencies through props/context and never constructs its own clock.

- [ ] **Step 6: Add the base mobile CSS and build**

Define local system font stacks, color tokens, `box-sizing`, 44px minimum interactive targets, visible `:focus-visible`, a centered 720px maximum content width, and `overflow-wrap: anywhere`. Avoid animations except a loading opacity pulse guarded by `prefers-reduced-motion`.

Run:

```bash
npm run test:saves -- src/saves/data/loadSnapshot.test.ts src/saves/app/App.test.tsx
npm run build:saves
```

Expected: tests PASS, type-check PASS, and `dist/saves/index.html` plus fixture data exist.

- [ ] **Step 7: Commit the secure Saves shell**

```bash
git add vite.saves.config.ts config/saves-env/.gitkeep src/saves
git commit -m "feat: add isolated AUNTIE Saves web shell"
git push origin UPGRADES
```

---

### Task 10: Implement location, usual-shop, basket, and preflight workflow

**Files:**
- Create: `src/saves/location/geolocation.ts`
- Create: `src/saves/app/useSavesFlow.ts`
- Create: `src/saves/input/decimal.ts`
- Create: `src/saves/components/EvidenceBanner.tsx`
- Create: `src/saves/components/LocationStep.tsx`
- Create: `src/saves/components/UsualShopStep.tsx`
- Create: `src/saves/components/BasketStep.tsx`
- Create: `src/saves/components/TripAssumptionsStep.tsx`
- Modify: `src/saves/app/App.tsx`
- Modify: `src/saves/styles.css`
- Test: `src/saves/location/geolocation.test.ts`
- Test: `src/saves/input/decimal.test.ts`
- Test: `src/saves/app/SavesFlow.test.tsx`

**Interfaces:**
- Consumes: `PilotSnapshotV1`, `malaysiaDateAt`, `preflightUsualAndGeometry`, `preflightBasketDiscovery`, `preflightEvidence`, `RecommendationInput`, injected browser geolocation, and an injected `now(): ISOInstant` clock.
- Produces: `requestOneShotLocation`, in-memory `SavesFlowState`, accessible step components, live viable-premise counts, and a complete input ready for `recommend`.

- [ ] **Step 1: Write failing one-shot geolocation tests**

```ts
const fakeGeolocation = (coords: { latitude: number; longitude: number; accuracy: number }): Geolocation => ({
  getCurrentPosition: success => success({ coords, timestamp: 0 } as GeolocationPosition),
  watchPosition: () => 0,
  clearWatch: () => undefined
})

const deniedGeolocation = (): Geolocation => ({
  getCurrentPosition: (_success, error) => error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError),
  watchPosition: () => 0,
  clearWatch: () => undefined
})

it('accepts accuracy at 100 metres and rejects 101 metres', async () => {
  await expect(requestOneShotLocation(fakeGeolocation({ latitude: 3.1, longitude: 101.6, accuracy: 100 }))).resolves.toMatchObject({
    kind: 'ready', location: { accuracyMetres: 100 }
  })
  await expect(requestOneShotLocation(fakeGeolocation({ latitude: 3.1, longitude: 101.6, accuracy: 101 }))).resolves.toEqual({
    kind: 'unavailable', reason: 'location-imprecise'
  })
})

it('maps denied and missing APIs without throwing', async () => {
  await expect(requestOneShotLocation(undefined)).resolves.toEqual({ kind: 'unavailable', reason: 'location-missing' })
  await expect(requestOneShotLocation(deniedGeolocation())).resolves.toEqual({ kind: 'unavailable', reason: 'location-missing' })
})
```

- [ ] **Step 2: Implement geolocation without persistence**

Call `getCurrentPosition` only from the user button handler with:

```ts
{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
```

Return only `{ latitude, longitude, accuracyMetres }`; do not access localStorage, IndexedDB, cookies, analytics, or a network endpoint.

- [ ] **Step 3: Write failing workflow tests**

Render the fixture snapshot and assert this sequence:

```ts
await user.click(screen.getByRole('button', { name: /use my location/i }))
expect(screen.getByLabelText(/usual shop/i)).toHaveValue('')
await user.selectOptions(screen.getByLabelText(/usual shop/i), '1')
expect(screen.getByText(/recent monitored prices found/i)).toBeVisible()
expect(screen.getByText(/1 nearby premise can be checked once you add items/i)).toBeVisible()
await user.click(screen.getByRole('button', { name: /add ayam bersih/i }))
await user.clear(screen.getByLabelText(/quantity/i))
await user.type(screen.getByLabelText(/quantity/i), '1')
expect(screen.getByText(/1 complete alternative.*within 5 km discovery/i)).toBeVisible()
await user.click(screen.getByLabelText(/everything for this top-up trip/i))
expect(screen.queryByLabelText(/driving/i)).not.toBeChecked()
await user.click(screen.getByLabelText(/driving/i))
expect(screen.queryByLabelText(/fuel price/i)).not.toBeInTheDocument()
expect(screen.getByText(/fixture data can only provide a monitored-price comparison/i)).toBeVisible()
expect(screen.getByText(/stock and checkout prices may have changed/i)).toBeVisible()
```

Then render a non-shipped synthetic consumer snapshot with complete-trip driving selected and assert fuel price is required, threshold defaults to RM5, and the usual/candidate fixed-cost controls are visible. Add a denial case proving the catalogue stays visible while the trip-result button remains disabled with a precise explanation.

The two assertions immediately after explicit usual-shop selection exercise `preflightUsualAndGeometry`; no basket line exists yet. Add a no-recent-usual-data case and prove it does not display a vacuous “complete alternative” count. After the first valid line but before mode selection, the UI uses `preflightBasketDiscovery` and labels the count as complete for the selected items within fixed 5 km discovery. Only after the user explicitly selects walk or drive does it switch to mode-aware `preflightEvidence`; add a 3 km candidate test proving walk reduces the displayed count and no hidden driving default exists.

- [ ] **Step 4: Implement the in-memory flow reducer/hook**

Use one reducer with explicit actions:

```ts
type SavesFlowAction =
  | { type: 'snapshot-replaced'; snapshot: PilotSnapshotV1 }
  | { type: 'location-ready'; location: RecommendationInput['location'] }
  | { type: 'location-unavailable'; reason: 'location-missing' | 'location-imprecise' }
  | { type: 'usual-selected'; premiseCode: string }
  | { type: 'raw-field-edited'; fieldId: string; rawValue: string }
  | { type: 'line-upserted'; itemCode: string; quantityHundredths: number }
  | { type: 'line-removed'; itemCode: string }
  | { type: 'scope-set'; scope: RecommendationInput['basketScope'] }
  | { type: 'mode-set'; mode: RecommendationInput['mode'] }
  | { type: 'fuel-set'; fuelPriceSenPerL: number; fuelEfficiencyDeciKmPerL: number }
  | { type: 'fixed-cost-set'; premiseCode: string; value: { status: 'confirmed'; amountSen: number } | { status: 'unknown' } }
  | { type: 'threshold-set'; amountSen: number }
  | { type: 'evaluation-clock-advanced'; evaluatedAt: ISOInstant }
  | { type: 'decision-created'; snapshotBuildId: string; submittedInput: RecommendationInput; result: RecommendationResult }
```

Keep all state in React memory. Initial state has no usual premise, no travel mode, and no fixed-cost disposition selected. Reset downstream fixed-cost entries to unselected when location, usual shop, basket, or mode changes and viable candidates change; never synthesize `{ status: 'confirmed', amountSen: 0 }`. Store a verdict only as one atomic `decision: { snapshotBuildId; submittedInput; result }` created from the exact normalized input and exact snapshot passed together to `recommend`. The submit handler captures that snapshot's build ID in `decision-created`; the reducer requires `action.snapshotBuildId === state.snapshot.buildId` before storing the action, otherwise it clears/rejects it. This carries the source build while refusing to trust a stale payload. `ResultCard` receives the atomic decision and never reads mutable form fields as evidence. It again compares the stored ID with the separately supplied snapshot before resolving any names/evidence and renders only `snapshot-integrity-failed` on mismatch. Every calculation-affecting action—snapshot replacement, location ready/unavailable, usual shop, every raw field edit (including empty/intermediate/invalid text), any line add/edit/remove, scope, mode, fuel/efficiency, any fixed cost, and threshold—clears the decision in the same reducer transition before rendering the changed form. Announce “Inputs changed — calculate again” in the result status region without retaining the old amounts/headline. Add submit→edit parameterized tests for every action family plus snapshot reload and raw edits `''`, `1.`, and invalid `1e2`, asserting the old result disappears immediately and cannot reappear without a matching `decision-created` action. Add queued `snapshot-replaced(new)` → `decision-created(oldBuild, oldResult)` and direct old-decision/new-snapshot mismatch tests proving the stale result is rejected and no old arithmetic or new-build attribution is rendered.

Keep raw form text separately from the reducer's scaled numeric actions. Implement exact non-rounding parsers in `src/saves/input/decimal.ts` with result union `{kind:'incomplete'} | {kind:'invalid'} | {kind:'valid'; value:number}`:

- `parseQuantity(text, 'whole-units')` accepts canonical unsigned integers `1…99` and returns units ×100; it rejects a decimal point.
- `parseQuantity(text, 'hundredths')` accepts canonical unsigned decimal text with zero to two fractional digits representing `0.01…99.00` and returns exact hundredths.
- `parseRmToSen(text, { allowZero, maxSen })` accepts at most two fractional digits; threshold/fixed cost allow zero through 10,000 sen, while fuel requires 1 through 1,000 sen.
- `parseKmPerLToDeci(text)` accepts at most one fractional digit and returns 10…500 deci-km/L.

Canonical text has no whitespace, sign, comma, exponent, hexadecimal, `Infinity`, `NaN`, or redundant leading zero. Empty text and a syntactically valid trailing decimal point such as `1.` are `incomplete`; other syntax/precision failures are `invalid`. Split digits and scale with string/BigInt arithmetic, compare against the field maximum before converting, and never call `Number(text)`, `parseFloat`, `toFixed`, or rounding. Every `onChange` first dispatches `raw-field-edited` with the opaque raw text so a prior decision is invalidated; only a `valid` parse then dispatches the scaled reducer action. Incomplete/invalid controls retain their raw text, set an accessible field error, and disable submission. Tests cover stale-decision invalidation plus empty/intermediate text, `0`, `.5`, `0.01`, exact maxima, one-step overflow, commas, exponents, signs, whitespace, redundant zero, excess decimals, a huge integer, whole-unit decimals, fuel zero, and allowed RM0 threshold/fixed cost.

`useSavesFlow` accepts dependencies `{ geolocation?: Geolocation; now: () => ISOInstant }`; unit/component tests use a fixed instant and production assembly supplies a small UTC-ISO `Date` adapter. Do not read the clock during reducer execution, and capture one `evaluatedAt` only when preflighting/submitting a result. While a decision exists, the hook schedules invalidation at the next `Asia/Kuala_Lumpur` local-date boundary and listens for `visibilitychange`/page resume. Each callback obtains one injected `now()` value and dispatches `evaluation-clock-advanced`; the reducer removes the result exactly when `malaysiaDateAt(action.evaluatedAt) !== malaysiaDateAt(decision.submittedInput.evaluatedAt)`, then announces recalculation. Re-arm after every decision or resume and clean up timer/listener on replacement/unmount. Fake-timer tests calculate just before midnight, advance across the boundary, and simulate a hidden-tab resume after the boundary; both remove the actionable verdict before it can be used, while a same-Malaysia-date resume retains it. Task 12's separate test-only assembly entry injects the fixture-manifest clock through this same dependency; it never patches `Date` or exposes a global.

- [ ] **Step 5: Implement accessible input components and live preflight**

Requirements:

- `LocationStep` puts this plain-language purpose/retention copy before its single permission-triggering button: “Used once to find nearby pilot shops. Your location stays in this tab and is not stored or sent.” Its permission result has its own polite live region. A component test proves the copy is visible before `getCurrentPosition` can be called.
- `UsualShopStep` lists only public verified premises sorted by distance then display name. It starts with an empty disabled `Choose your usual shop` placeholder; no premise is preselected, and preflight/submit remains blocked until the user changes it. Every option's visible/accessibility text includes display name, address, and rounded straight-line distance so same-name branches cannot be confused; a raw code may be secondary evidence but never the discriminator.
- `BasketStep` displays full official name, unit, qualifiers, quantity constraints, add/remove buttons, and the live complete-candidate count after every edit.
- Travel mode is an unselected radio group inside `<fieldset><legend>Travel mode</legend>`; neither driving nor walking is checked initially. Preflight/submit remains blocked until explicit selection, and RTL tests query the group plus both radios.
- `TripAssumptionsStep` first explains when the current state is structurally price-only. Fixture/desk publication, walking, or selected-items-only scope does not render or require fuel, threshold, toll, or parking controls because those values cannot change the result. Only an otherwise trip-eligible synthetic/authorized consumer complete-trip drive renders assumptions, defaults efficiency to 12 km/L and threshold to RM5, requires explicit fuel price, and renders one initially unselected confirmed/unknown fixed-cost choice for the usual premise plus every complete in-radius candidate. The user must affirmatively choose `confirmed` or `unknown` for every group before submit; choosing confirmed reveals the amount and RM0 is accepted only after that action. The usual premise is required even when it is more than 5 km from the user's origin; only candidates are radius-capped.
- The complete-trip checkbox uses explicit copy; it is never pre-checked.
- No control implies stock availability or a live price.

All repeated controls are unambiguous before Task 11 styling: each quantity label/description says it is a multiplier of that item's published official unit and has a unique code-derived ID; fuel price says “RM per litre,” efficiency says “km per litre,” and threshold/fixed amounts say “RM.” Every unit is part of the control's accessible name or `aria-describedby`, not visual-only text. Parse errors use unique IDs referenced by `aria-describedby` and set `aria-invalid`. Each rendered premise cost group is a `<fieldset>` whose legend includes display name, address, and rounded straight-line distance; its shared helper says “Total toll and parking for a dedicated round trip from your current location to this branch, excluding fuel.” Confirmed amount/unknown controls have unique branch-qualified labels, no initial selection, and tests prove untouched groups cannot submit or become confirmed RM0. Location and preflight counts use separate atomic polite status regions; candidate-count updates do not reuse the final-result region or move focus. Add a multi-item/three-premise component test with two identical display names but different addresses/distances, and assert unique selector options, accessible names/descriptions with units, travel group/legend, initial empty choices, helper semantics for usual and candidate groups, error association, group legends, and focus retention.

Add a consumer-mode workflow/domain integration case with the usual shop outside the candidate radius, proving its fixed-cost control remains present and the submitted map covers the usual code plus all complete candidates exactly. Add fixture/desk/walking/selected-items cases proving irrelevant trip controls are absent and a price-only result still submits successfully.

- [ ] **Step 6: Run workflow and domain regressions**

```bash
npm run test:saves -- src/saves/location/geolocation.test.ts src/saves/input/decimal.test.ts src/saves/app/SavesFlow.test.tsx src/pricecatcher/__tests__/evidence.test.ts
npm run typecheck:saves
```

Expected: tests PASS and type-check PASS.

- [ ] **Step 7: Commit the input workflow**

```bash
git add src/saves/location src/saves/input src/saves/app src/saves/components src/saves/styles.css
git commit -m "feat: add fail-closed grocery comparison flow"
git push origin UPGRADES
```

---

### Task 11: Render switch, no-advantage, comparison-only, and refusal evidence

**Files:**
- Create: `src/saves/components/ResultCard.tsx`
- Create: `src/saves/components/EvidenceDetails.tsx`
- Create: `src/saves/components/Attribution.tsx`
- Create: `src/saves/copy/reasons.ts`
- Modify: `src/saves/app/App.tsx`
- Modify: `src/saves/app/useSavesFlow.ts`
- Modify: `src/saves/styles.css`
- Test: `src/saves/components/ResultCard.test.tsx`
- Test: `src/saves/copy/reasons.test.ts`
- Test: `src/saves/app/SavesDecision.test.tsx`

**Interfaces:**
- Consumes: the atomic `{ snapshotBuildId, submittedInput, result }` decision snapshot, its exact validated snapshot build, snapshot attribution, and source dates.
- Produces: exact state-specific copy, expandable line arithmetic, assumptions, exclusion counts, observation dates, source/license links, and no imperative copy for non-switch results.

- [ ] **Step 1: Write failing result-copy tests for all four states**

```ts
it('uses conditional copy and shows conservative threshold evidence for switch', () => {
  render(<ResultCard decision={decisionFor(switchResult())} snapshot={snapshot} />)
  expect(screen.getByRole('heading', { name: /Auntie Mart SS2 appears worth checking — about RM 3 conservative net saving/i })).toBeVisible()
  expect(screen.getByText(/12 Jalan SS 2\/1/i)).toBeVisible()
  expect(screen.getByText(/confirm stock and shelf price/i)).toBeVisible()
  expect(screen.getByText(/conservative net saving/i)).toHaveTextContent('RM 2.69')
})

it('never commands a trip for no-clear-advantage or comparison-only', () => {
  const { rerender } = render(<ResultCard decision={decisionFor(noAdvantageResult())} snapshot={snapshot} />)
  expect(screen.getByRole('heading', { name: /no alternative clearly clears.*estimated net about RM/i })).toBeVisible()
  expect(screen.queryByText(/^go to/i)).not.toBeInTheDocument()
  rerender(<ResultCard decision={decisionFor(comparisonOnlyResult(['selected-items-only', 'fixed-trip-cost-unknown']))} snapshot={snapshot} />)
  expect(screen.getByText(/cannot judge the whole trip/i)).toBeVisible()
  expect(screen.getByText(/fixed trip cost is unknown/i)).toBeVisible()
})

it('explains the primary refusal reason without hiding candidate counts', () => {
  render(<ResultCard decision={decisionFor(insufficientResult('candidate-date-mismatch'))} snapshot={snapshot} />)
  expect(screen.getByText(/observed on different dates/i)).toBeVisible()
  expect(screen.getByText(/3 in-radius alternatives/i)).toBeVisible()
  expect(screen.getByText(/2 excluded for date mismatch/i)).toBeVisible()
})

it.each([
  [200, /alternative monitored basket is cheaper by RM 2.00/i],
  [0, /same monitored basket total/i],
  [-200, /usual shop remains cheaper by RM 2.00/i]
])('uses sign-aware price-only copy for gross saving %s', (grossBasketSavingSen, expected) => {
  render(<ResultCard decision={decisionFor(comparisonOnlyResultWithGrossSaving(grossBasketSavingSen))} snapshot={snapshot} />)
  expect(screen.getByText(expected)).toBeVisible()
  expect(screen.queryByText(/you will save|go to|switch to/i)).not.toBeInTheDocument()
})
```

Create `REASON_COPY` with `satisfies Record<ReasonCode, { heading: string; detail: string }>` and no fallback/default branch. Parameterize render tests over every `ReasonCodeSchema.options` entry. The app shell uses the same map for loader-only `snapshot-load-failed|snapshot-schema-unsupported|snapshot-integrity-failed`; result rendering covers every domain reason, including early failures with no exclusion object. For each candidate-stage reason, render every sorted `ReasonDetail` with its premise/item/date context plus the premise-partition counts. Resolve every detail's premise code through the snapshot to display name and address, and every item code to official name/unit; codes are optional secondary evidence and an unknown reference fails closed to a generic integrity refusal. Add a multi-detail insufficient-evidence fixture asserting all human identities and dates. Tests fail if any enum member lacks copy, any detail is dropped, an unknown code leaks, or an early failure fabricates counts.

`ResultCard` requires exactly `{ decision: { snapshotBuildId: string; submittedInput: RecommendationInput; result: RecommendationResult }, snapshot: PilotSnapshotV1 }`; it never accepts a bare result or optional submitted input. Test helpers construct a fully valid atomic decision for every result fixture. Before inspecting the result, require `decision.snapshotBuildId === snapshot.buildId`; a mismatch renders the integrity refusal and no amount, shop attribution, or imperative copy. Every result with a comparison resolves codes through the validated snapshot and uses the usual/candidate `displayName` as the primary label. The headline names the candidate; the summary names both shops, shows both addresses, and never makes a raw code the only human-facing identifier. Render exact usual and candidate straight-line distances in all result kinds. When trip fields exist, also render each estimated round-trip road distance and label it estimated. Add switch, no-clear, and comparison-only tests asserting names, both addresses, both straight-line distances, road distances only for trip results, same-name/different-address branches, build mismatch, and fail-closed handling if a supposedly validated decision references an unknown code.

- [ ] **Step 2: Run result tests and observe missing-component failures**

```bash
npm run test:saves -- src/saves/components/ResultCard.test.tsx
```

Expected: FAIL because result components do not exist.

- [ ] **Step 3: Implement state-specific headlines and formatting**

Create pure formatters:

```ts
const checkedSenBigInt = (sen: number): bigint => {
  if (!Number.isSafeInteger(sen)) throw new RangeError('sen must be a safe integer')
  return BigInt(sen)
}
export const formatSen = (sen: number): string => {
  const value = checkedSenBigInt(sen); const absolute = value < 0n ? -value : value
  const sign = value < 0n ? '-' : ''
  return `${sign}RM ${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}
export const formatApproxRinggit = (sen: number): string => {
  const value = checkedSenBigInt(sen); const absolute = value < 0n ? -value : value
  const rounded = (absolute + 50n) / 100n
  return `about ${rounded !== 0n && value < 0n ? '-' : ''}RM ${rounded}`
}
export const formatTripSen = (sen: number): string => {
  const value = checkedSenBigInt(sen); const absolute = value < 0n ? -value : value
  const roundedTenSen = ((absolute + 5n) / 10n) * 10n
  return `${roundedTenSen !== 0n && value < 0n ? '-' : ''}RM ${roundedTenSen / 100n}.${(roundedTenSen % 100n) / 10n}`
}
```

Use integer/BigInt quotient/remainder formatting throughout; floating division is allowed only for non-authoritative visual geometry. Add signed/zero/half-up tests, including symmetric `−49/−50` for approximate ringgit and `−4/−5` for ten-sen trip formatting; rounded zero never carries a minus sign. Require `formatSen(9_007_199_254_740_990)` to be exactly `RM 90071992547409.90`.

Use the exact product language from the design. A `switch` headline says “appears worth checking” and uses `formatApproxRinggit(conservativeNetSavingSen)`—the threshold-clearing value—to round half-up to the nearest ringgit. A `no-clear-advantage` headline says no alternative clearly clears the threshold and may show `formatApproxRinggit(estimatedNetSavingSen)` only when immediately labelled “estimated”; its body always exposes the exact conservative value/threshold explaining the refusal. Other states may not say “go,” “switch,” “save guaranteed,” “live,” or “in stock.” Price-only copy is sign-aware: positive `grossBasketSavingSen` says the alternative monitored basket is cheaper by the exact amount; zero says the monitored totals are the same; negative says the usual shop remains cheaper by the absolute amount. None is a trip/savings imperative. Add positive/zero/negative and 49/50-sen headline-rounding boundaries for both trip result kinds. Always render “Stock and checkout prices may have changed.”

- [ ] **Step 4: Implement evidence details**

The `<details>` body consumes both halves of the atomic decision and shows:

- each official item definition/unit/quantity;
- usual and candidate observed unit price, line total, and common observation date;
- usual/candidate display names, candidate address, and both straight-line distances;
- observed basket totals to sen;
- a named `Gross monitored basket saving` field using exact `grossBasketSavingSen`;
- estimated 1.25-factor trip cost to ten sen;
- usual/candidate estimated round-trip road distance in metres or kilometres with explicit “estimated” labelling;
- named exact-sen `Usual estimated trip cost`, `Alternative estimated trip cost`, `Estimated trip-cost difference` (`usual − alternative`), and `Estimated net saving` fields;
- conservative price allowances and 1.0/1.5 travel bounds to sen;
- exact `conservativeNetSavingSen` and threshold;
- excluded candidate counts grouped by reason;
- fuel efficiency, fuel price, every premise-specific fixed cost, and threshold from `decision.submittedInput`; route factors from the serialized result; and the statement that time/effort are excluded. Tests mount the complete decision and prove changing a separate mutable form fixture cannot change displayed assumptions.

For price-only comparison, omit trip fields entirely and list all sorted comparison-only reasons. Add component tests that recompute and assert the named gross, estimated trip difference, estimated net, conservative net, and threshold values from a deliberately asymmetric trip fixture; rounding/display tests must not substitute approximate ten-sen text for these exact-sen evidence fields.

- [ ] **Step 5: Implement attribution and source dates**

Render mode-aware visible linked copy. For official `desk-demo|consumer-pilot` snapshots:

```text
PriceCatcher Transactional Records, Premise Lookup, and Item Lookup — KPDN and DOSM via data.gov.my, CC BY 4.0; retrieved [date]; observations [min date]–[max date]; filtered and transformed by AUNTIE Saves. Prices and stock may have changed.
```

For `fixture`, lead with the snapshot's synthetic attribution text and say “Synthetic fixture sources — not an official KPDN retrieval”; never reuse the official-retrieval sentence. In every mode render `snapshot.compiledAt` visibly. If all source `retrievedAt` instants are identical, show that one exact instant; if they differ, render a deterministic list sorted by source URL with URL-derived source label and its own exact instant—never collapse to min/max or silently choose one. Compute the observation min/max only across manifests that declare them; explicitly say unavailable if none. Tests cover differing retrieval instants, visible compile instant, fixture copy, official desk copy, and fixture catalogue/license links without falsely labelling fixture observations official.

Links use `rel="noreferrer"`; no hidden tracking parameters. Render separate coordinate attribution from each compared premise.

Render Transactional Records, Premise Lookup, and Item Lookup as three distinct anchors from their typed snapshot fields, plus a distinct CC BY 4.0 license anchor. Component tests assert each exact `href` and `rel`, not merely visible text.

- [ ] **Step 6: Complete responsive and accessible presentation**

At 390px width: one column, no horizontal overflow, tables become labelled definition lists, and the primary result remains above assumptions. At desktop: keep maximum width 720px. Use semantic headings, visible focus, sufficient contrast, and no color-only status encoding. Once the app is ready, workflow updates use exactly three scoped `role="status" aria-live="polite" aria-atomic="true"` regions: location permission, preflight candidate count, and final result; they must not nest, duplicate the same message, or steal focus. The separate mutually exclusive app-load status/alert from Task 9 is removed when ready and is not one of these workflow regions. Static evidence/errors are not live. Quantity labels include the item display name and official unit, IDs are code-derived/unique, and each error is connected with `aria-describedby` plus `aria-invalid`. Travel mode and each premise's fixed-cost controls are separate `<fieldset>` groups with descriptive legends; confirmed amount and unknown choices have unique accessible names. Component tests render at least two items and three premise groups, assert unique label/control associations and legends, update each live region independently, and verify focus remains on the initiating control; axe is additional evidence, not a substitute for these name/association tests.

- [ ] **Step 7: Run component, flow, and build checks**

```bash
npm run test:saves -- src/saves src/saves/copy/reasons.test.ts src/pricecatcher/__tests__/recommend.test.ts
npm run build:saves
```

Expected: all component/domain tests PASS and production build succeeds.

- [ ] **Step 8: Commit the evidence-first result UI**

```bash
git add src/saves
git commit -m "feat: explain AUNTIE Saves recommendations"
git push origin UPGRADES
```

---

### Task 12: Enforce bundle boundaries and production-preview accessibility

**Files:**
- Create: `scripts/pricecatcher/verify-saves-boundary.ts`
- Create: `scripts/pricecatcher/generate-e2e-fixtures.ts`
- Create: `scripts/pricecatcher/verify-clean-reproduction.ts`
- Create: `scripts/pricecatcher/network-deny-hook.cjs`
- Consume (created in Task 9): `src/saves/e2e.html`
- Create: `src/saves/test/e2e-main.tsx`
- Create: `playwright.saves.config.ts`
- Create: `e2e/saves.e2e.ts`
- Create: `e2e/fixtures/fixture-snapshot.json`
- Create: `e2e/fixtures/desk-snapshot.json`
- Create: `e2e/fixtures/consumer-snapshot.json`
- Create: `e2e/fixtures/manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `scripts/pricecatcher/verify-saves-boundary.test.ts`

**Interfaces:**
- Consumes: Saves source graph, `dist/saves`, local preview server, and Playwright browser contexts.
- Produces: `verify:saves` as the software-complete command with non-printing secret detection, prohibited-import/domain enforcement, CSP checks, responsive/keyboard/axe checks, and outbound-network rejection.

- [ ] **Step 1: Write failing boundary-verifier tests**

Use temporary fixture directories and assert:

```ts
const prohibitedPackage = ['open', 'ai'].join('')
const prohibitedHost = ['api', 'openai', 'com'].join('.')
expect(scanImports(sourceTreeWith(`import OpenAI from '${prohibitedPackage}'`))).toContainEqual(expect.objectContaining({ rule: 'prohibited-import' }))
expect(scanBundle(bundleWith(prohibitedHost))).toContainEqual(expect.objectContaining({ rule: 'prohibited-domain' }))
expect(scanBundle(bundleWith('sk-' + 'x'.repeat(40)))).toContainEqual(expect.objectContaining({ rule: 'secret-pattern' }))
expect(redactFinding({ path: 'bundle.js', rule: 'secret-pattern', value: 'sensitive-value' })).toEqual({
  path: 'bundle.js', rule: 'secret-pattern'
})
```

- [ ] **Step 2: Implement source and bundle scans without printing values**

Use TypeScript `preProcessFile` to collect import specifiers under `src/saves` and recursively resolve relative/alias imports. Reject paths under `src/main`, `src/preload`, `src/renderer`, or `src/judge`, packages `electron`, `openai`, `exa-js`, `electron-store`, and `apify-client`, plus any `import.meta.env` or `process.env` access. Independently parse production `src/pricecatcher` ASTs and reject React packages, every `node:` import, filesystem/network/browser adapter package, imports from `src/saves`/Electron, and unbound uses of `process`, `Buffer`, `require`, `__dirname`, `window`, `document`, or `fetch`. Reject `loadEnv` in `vite.saves.config.ts`; require the dedicated empty env directory/prefix. The test-excluding DOM/Node-free `tsconfig.pricecatcher.json` is a second enforcement layer; a negative boundary fixture proves ambient Node types cannot mask a violation.

Run the non-printing secret/high-entropy scanner over every tracked or untracked nonignored regular text file returned by NUL-safe `git ls-files --cached --others --exclude-standard -z`, so staged, unstaged, and newly created intended files are all covered before `git add`. This includes `README*`, `docs/**`, `config/**`, `.github/**`, committed source locks, audits, normalized slices, immutable build inputs, and review files—not only browser-public JSON. Reject symlink candidates, detect/skip binary files by bytes rather than extensions, and scan explicit generated `dist/saves`, `dist/saves-e2e`, and `SAVES_STAGED_MANIFEST` artifacts even when ignored. Run prohibited executable import/domain checks over the applicable source and built-code subset. Add regressions with a secret-shaped value in an unstaged tracked document and an untracked `docs/new.md`; findings expose only relative path/rule. The test build gets only the explicit fixture/clock allowances described below; secret and prohibited-SDK rules remain identical. JavaScript/CSS/HTML prohibited domains include `openai.com`, `exa.ai`, `api.exa.ai`, analytics/ad hosts, and any absolute network endpoint outside this exact context-aware set:

- the three exact `https://data.gov.my/data-catalogue/{pricecatcher,lookup_premise,lookup_item}` links and exact `https://creativecommons.org/licenses/by/4.0/` only in typed attribution contracts/data/UI anchors;
- `https://storage.data.gov.my/pricecatcher/pricecatcher_YYYY-MM.csv`, `lookup_premise.csv`, and `lookup_item.csv` only as schema-valid source-manifest URLs or the fetch adapter's locked templates;
- review-source URLs only in schema-valid private review JSON and only when their authority passes the committed `REVIEW_HOST_POLICY_VERSION` rules/policy digest; arbitrary code literals do not inherit that allowance;
- HTTPS `.test` URLs only inside schema-valid `synthetic-fixture` source locks/snapshots/private fixture reviews or `*.test.*` negative fixtures, never desk content or normal executable production code;
- exact loopback `http://127.0.0.1:4173` and `:4174` only in Playwright/preview config and tests, never a built asset or public JSON.

Public JSON may contain those visible dataset/license/coordinate attribution URLs but cannot contain executable script markup. Add allowed-case tests for each context and near-match negatives such as catalogue query strings/fragments, `storage.data.gov.my.evil.test`, wrong PriceCatcher path/month, arbitrary `.test` in desk data, retailer host outside the hashed policy, and loopback in `dist/saves`. Secret rules detect OpenAI-style prefixes, bearer tokens, private-key headers, and high-entropy assignments. Exempt only (a) exactly 64 lowercase hexadecimal characters in schema-declared SHA-256 fields, (b) `SourceManifestV1.etag` values that first pass the source-lock schema, are at most 128 visible ASCII characters, and match a conservative HTTP ETag grammar with optional `W/` plus a quoted opaque tag, and (c) npm Subresource Integrity values only at parsed `package-lock.json` dependency/package `integrity` fields matching `sha512-<base64>`. No filename-wide entropy exemption exists. A real-shaped quoted 32-hex S3 ETag must pass at that exact typed path; the identical text assigned to any arbitrary field must still trigger the entropy rule. Validate `lastModified` as an RFC 7231 IMF-fixdate of at most 29 ASCII characters. Output only relative path and rule name.

Also schema-scan committed `data/pricecatcher/fixtures` and `data/pricecatcher/pilot` reviewer-bearing JSON for repository safety: reviewer IDs must match the pseudonymous schema; reject email/contact fields, email-shaped values, phone fields, absolute/local/file paths, `data:` URLs, embedded/base64 media, unrestricted note fields, and media extensions. Store addresses and licensed storefront coordinates are allowed. The high-entropy exceptions still apply only after parsing an exact typed SHA-256 field or exact schema-valid ETag path; placing the same bytes in an audit, normalized row, arbitrary metadata, or review field must fail. Report only file path/rule, never the matched value.

- [ ] **Step 3: Configure production-preview Playwright**

Create:

```ts
import { defineConfig, devices } from '@playwright/test'

const { defaultBrowserType: _ignoredDefaultBrowserType, ...iphone13 } = devices['iPhone 13']

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: { baseURL: 'http://127.0.0.1:4174/e2e.html', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run preview:saves -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173', reuseExistingServer: false
    },
    {
      command: 'npm run preview:saves:e2e -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/e2e.html', reuseExistingServer: false
    }
  ],
  projects: [
    { name: 'mobile-chromium', use: { ...iphone13, browserName: 'chromium' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }
  ]
})
```

Generate three deterministic E2E snapshots/pointers from the domain builders, canonicalize their bytes, record hashes plus an exact `evaluatedAt` per journey in `e2e/fixtures/manifest.json`, and assert regeneration is byte-identical. `fixture-snapshot.json` is visibly fixture mode; `desk-snapshot.json` is a test-only desk publication with the exact desk banner and price-only guard; `consumer-snapshot.json` is synthetic, field-verified, and test-only. The production compiler/publisher cannot emit consumer mode. The desk fixture is not current-data evidence and its visible attribution explicitly labels it deterministic test content.

`npm run data:saves:e2e-fixtures` rewrites only the three snapshots plus their pointer/hash/clock manifest. Its `--check` mode regenerates into a temporary directory, compares exact bytes and hashes with the committed files, reports only relative paths on mismatch, and never mutates the checkout. Add a focused test for normal generation, check success, and stale-byte failure. This command runs inside `verify:saves` so a clean checkout cannot silently use hand-edited E2E JSON.

Install the local browser runtime:

```bash
npm run setup:saves:e2e
```

- [ ] **Step 4: Write end-to-end network, viewport, keyboard, and axe checks**

Use Task 9's existing production assembly `mountSaves(root, { now, geolocation, loadSnapshot })`; normal `main.tsx` already calls it with the real UTC `Date` adapter. The ordinary production build has only `src/saves/index.html` as its entry. In Vite mode `saves-e2e` only, use the already committed root-level `src/saves/e2e.html` plus `test/e2e-main.tsx`; that test entry imports the checked fixture manifest, selects the declared `evaluatedAt`, and calls the same assembly with a fixed `now` dependency. `verify:saves` builds both outputs first. Playwright serves normal `dist/saves` on port 4173 and injected `dist/saves-e2e/e2e.html` on 4174; deterministic projects use the latter and route `/data/current.json` plus its root snapshot request to selected committed E2E bytes, so they exercise built UI with the fixture clock. The boundary verifier proves neither test entry, fixture manifest, nor fixed instant appears in normal `dist/saves`; no global or `Date` monkey-patch exists. A separate unmocked smoke test navigates explicitly to `http://127.0.0.1:4173/`, loads the real `current.json`, asserts its declared fixture/desk banner, and makes no item/date assumption. Assert a rendered evidence timestamp/date derived from the injected `evaluatedAt` in every deterministic journey.

When `SAVES_STAGED_MANIFEST` is absent, the boundary verifier scans the active public tree and Playwright runs the deterministic routed journeys plus the unmocked current smoke. When it is present, both tools first resolve the repository-relative path, parse the strict manifest, re-hash all named stage artifacts/inputs, and reject any path escape. The boundary verifier scans the exact staged public JSON in addition to normal sources/build output. Playwright defines a `staged publication smoke` that routes `current.json` and the snapshot URL to the exact staged pointer/snapshot bytes without publishing, then asserts the desk banner, all attribution links, no actionable verdict, and no extra network. The stage manifest itself is never browser-served. This conditional smoke is part of the same `verify:saves` command; deterministic fixture journeys remain unchanged.

Install a test-only init script—not production code—that counts `getCurrentPosition` calls. Assert zero calls before the explicit button. Test accurate location with a Chromium context granted geolocation at `accuracy: 50`, inaccurate location with `accuracy: 101`, denied location in a context without permission, and a missing-API context whose pre-load init script removes the `Navigator.prototype.geolocation` accessor so assembly receives `undefined`. The missing case must keep the catalogue visible and show the exact location-missing refusal without throwing. Record the exact initial static GETs; after location/basket interaction, assert there are no additional requests at all. Reject requests outside `/`, `/e2e.html`, the build's discovered hashed JS/CSS assets, `/data/current.json`, and the one routed snapshot path. Also inspect every allowed URL/query/header/body and assert it contains none of the known coordinate or basket values.

Run production-assembly journeys for missing, denied, and imprecise location, synthetic consumer `switch`, positive exact-threshold/`switch`, one-sen-below-threshold/`no-clear-advantage`, walking, selected-items-only, unknown fixed cost, fixture/desk publication downgrade, stale evaluation, integrity mismatch, and expanded evidence. In every comparison-only journey assert trip arithmetic and imperative trip language are absent. Traverse the complete form/disclosure with the keyboard and run axe in initial form, populated form, each result kind, open evidence, and error states in both projects. Do not expose a production test-control global.

Assertions:

```ts
expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
await page.keyboard.press('Tab')
await expect(page.locator(':focus-visible')).toBeVisible()
const results = await new AxeBuilder({ page }).analyze()
expect(results.violations).toEqual([])
await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'self'/)
```

Assert the rendered observation dates, assumptions, disclaimer, all three dataset `href` values, CC BY `href`, and compared-premise coordinate attribution.

Implement `verify-clean-reproduction.ts` as a hermetic tracked-files proof. It creates an OS temporary directory with separate `archive/` and `output/` children, exports exactly `git archive HEAD` into `archive/` using argument-array child processes (no shell interpolation), lstat/realpath-validates `output/`, and constructs the private external output capability described in Task 7. It asserts archived `data/pricecatcher/raw` and `data/pricecatcher/staging` do not exist and runs `npm ci --ignore-scripts`; these are the last permitted child processes. Then use `createRequire(import.meta.url)` to load the exact archived `network-deny-hook.cjs` and call its idempotent `installNetworkDeny()` in the current verifier process. Only after installation does it dynamically import the archived reproduction adapter, resolve the committed final manifest through archived `src/saves/public/data/current.json`, and call the adapter with that capability—never the normal CLI. The hook replaces `http`, `https`, `net`, `tls`, DNS, global fetch, `child_process` spawn/exec/fork variants, and Worker-thread/process escape entry points with throws for the remainder of the verifier process, then calls `syncBuiltinESMExports()` so later `node:` ESM named imports receive the patched functions too. Compare all regenerated hashes with the final manifest and assert via the injected open-audit seam that no raw/staging source path was opened and every write stayed under the exact external output capability. Always clean only its exact top-level `mkdtemp` directory in `finally` using already imported filesystem functions. Tests prove the hook is installed before adapter import, reject both CJS and ESM adapter attempts to use fetch/HTTP, `spawn('curl', ...)`, or `new Worker(...)`, and use a miniature temporary Git repository to prove an untracked-only required input is absent, a raw/staging access fails, an attempted normal-CLI external output fails, a forged capability fails, and a final-manifest-only fixture succeeds. This command intentionally tests committed `HEAD`, so run it again after the Task 13 data commit.

- [ ] **Step 5: Run the complete Saves verification command**

```bash
npm run verify:saves
```

Expected: type-check, all Saves tests, production build, boundary scan, and both Playwright projects PASS.

- [ ] **Step 6: Run existing Electron regressions**

```bash
npm test
npm run build
```

Expected: all existing tests PASS and existing Electron build succeeds.

- [ ] **Step 7: Commit verification gates**

```bash
git add scripts/pricecatcher/verify-saves-boundary.ts scripts/pricecatcher/verify-saves-boundary.test.ts scripts/pricecatcher/generate-e2e-fixtures.ts scripts/pricecatcher/verify-clean-reproduction.ts scripts/pricecatcher/network-deny-hook.cjs src/saves/test/e2e-main.tsx e2e/saves.e2e.ts e2e/fixtures playwright.saves.config.ts package.json package-lock.json
git commit -m "test: verify AUNTIE Saves production boundaries"
git push origin UPGRADES
```

---

### Task 13: Build the current Petaling Jaya desk-demo content gate

**Files:**
- Create: `data/pricecatcher/pilot/coverage-candidates-2026-08-02.json`
- Create: `data/pricecatcher/pilot/coverage-final-2026-08-02.json`
- Create: `data/pricecatcher/pilot/feasibility-2026-08-02.json`
- Create: `data/pricecatcher/pilot/microzones.json`
- Create: `data/pricecatcher/pilot/premises.json`
- Create: `data/pricecatcher/pilot/items.json`
- Create: `data/pricecatcher/pilot/quality-review-basis.json`
- Create: `data/pricecatcher/pilot/source-lock.json`
- Create: `data/pricecatcher/pilot/review-candidates/source-lock.json`
- Create: `data/pricecatcher/pilot/review-candidates/selection.json`
- Create: `data/pricecatcher/pilot/reviews/microzones.json`
- Create: `data/pricecatcher/pilot/reviews/host-policy.json`
- Create: `data/pricecatcher/pilot/reviews/premises-review-a.json`
- Create: `data/pricecatcher/pilot/reviews/premises-review-b.json`
- Create: `data/pricecatcher/pilot/reviews/items-review-a.json`
- Create: `data/pricecatcher/pilot/reviews/items-review-b.json`
- Create: `data/pricecatcher/pilot/reviews/quality-review-a.json`
- Create: `data/pricecatcher/pilot/reviews/quality-review-b.json`
- Create: `data/pricecatcher/pilot/reviews/reconciliation.json`
- Create: `data/pricecatcher/pilot/reviews/quality-reconciliation.json`
- Create: `data/pricecatcher/pilot/quality-reviews.json`
- Create: `data/pricecatcher/pilot/builds/<generated-build-id>/audit.json`
- Create: `data/pricecatcher/pilot/builds/<generated-build-id>/normalized-source.json`
- Create: `data/pricecatcher/pilot/builds/<generated-build-id>/manifest.json`
- Create: `data/pricecatcher/pilot/builds/<generated-build-id>/inputs/**`
- Create: `src/saves/public/data/builds/<generated-build-id>/snapshot.json`
- Modify: `src/saves/public/data/current.json`
- Test: `data/pricecatcher/pilot/content-verification.test.ts`

**Interfaces:**
- Consumes: official data through 2 August 2026, deterministic feasibility/selection tools, and two independent reviewers per premise/item.
- Produces: a passing desk-demo feasibility report, 10–15 unexpired desk-verified single-operator premises in one or two dense PJ microzones, 5–10 approved high-coverage item definitions, and a `desk-demo` current snapshot that visibly disables trip verdicts.

- [ ] **Step 1: Fetch and pin official inputs without using the supplied API keys**

```bash
npm run data:saves:fetch -- --through 2026-08-02 --window feasibility --retrieved-at 2026-08-03T04:00:00.000Z --output data/pricecatcher/pilot/source-lock.json
```

Expected: hash-addressed June/July/August transaction bytes and lookup bytes exist only in ignored raw storage; bootstrap `source-lock.json` contains URL, validators, counts, dates, SHA-256 values, and `analysisStartDate: 2026-06-04`. It is sufficient for candidate coverage but is not assumed sufficient for a selected horizon earlier than 2 August.

- [ ] **Step 2: Generate the feasibility report and review candidates**

```bash
npm run data:saves:feasibility -- --phase coverage --source-lock data/pricecatcher/pilot/source-lock.json --through 2026-08-02 --output data/pricecatcher/pilot/coverage-candidates-2026-08-02.json
npx tsx scripts/pricecatcher/select-content.ts --source-lock data/pricecatcher/pilot/source-lock.json --report data/pricecatcher/pilot/coverage-candidates-2026-08-02.json --output data/pricecatcher/pilot/review-candidates
```

Expected before review: at least 10 near-daily eligible allowed-type Petaling Jaya premises and at least 5 high-coverage item candidates. Phase A makes no distance claim. If it fails, commit the honest failing report, keep the UI on fixture data, and return this task to design; never relax freshness, coverage, same-date matching, or premise-type rules.

- [ ] **Step 3: Run two independent premise-review passes**

Reviewer A and Reviewer B independently verify each candidate against the KPDN record plus an official retailer locator or a reputable map/business source whose terms permit the recorded coordinate use. Each records source URL/access date, official/current name, entrance coordinate, accuracy, enumerated redistribution/attribution codes, and closure signal. A reconciliation script accepts only points within 30 metres and two distinct reviewer IDs; conflicts remain `needs-review` in the review-candidate workspace and are never copied into final `premises.json`.

Before either pass, create the strict versioned `reviews/host-policy.json` with exact retailer-locator hosts approved for this run, hash it, and give both reviewers that same digest. The policy contains hostnames only—no keys, query strings, accounts, or free-text notes—and is independently schema/secret scanned.

Use public Nominatim only for small manual checks under its policy: identify the application, at most one request per second, cache results, and preserve OSM attribution/ODbL terms. Do not call Google/Mapbox or persist restricted coordinates without an appropriate license.

Each independent pass writes its own strict review file under `data/pricecatcher/pilot/reviews/`; reviewers do not inspect or edit the other pass before both are complete. IDs are pseudonyms only, and source/evidence fields obey the repository-safety schema.

- [ ] **Step 4: Run two independent item-semantic review passes**

Each reviewer classifies official name/unit, available qualifiers, quantity mode, and whether the definition is narrow enough for a fair top-up comparison. Any disagreement, generic multi-vendor ambiguity, missing official label, or unclear package basis becomes `needs-review`/`rejected`. Retain only 5–10 approved high-coverage items.

After both premise and item passes exist, generate final content deterministically:

```bash
npx tsx scripts/pricecatcher/reconcile-content.ts \
  --candidate-source-lock data/pricecatcher/pilot/review-candidates/source-lock.json \
  --coverage-report data/pricecatcher/pilot/coverage-candidates-2026-08-02.json \
  --selection data/pricecatcher/pilot/review-candidates/selection.json \
  --host-policy data/pricecatcher/pilot/reviews/host-policy.json \
  --microzones data/pricecatcher/pilot/reviews/microzones.json \
  --premise-review data/pricecatcher/pilot/reviews/premises-review-a.json \
  --premise-review data/pricecatcher/pilot/reviews/premises-review-b.json \
  --item-review data/pricecatcher/pilot/reviews/items-review-a.json \
  --item-review data/pricecatcher/pilot/reviews/items-review-b.json \
  --output data/pricecatcher/pilot
```

Expected: final content plus `reviews/reconciliation.json`; unresolved candidates remain only in that report and never enter final content.

- [ ] **Step 5: Define private-content and provenance verification**

After Steps 3–4 create final reviewed microzones/premises/items, run the review orchestrator; no placeholder quality file is needed. This performs bootstrap selected-horizon discovery, extends/refetches the active source lock when `H − 59` is earlier than its current `analysisStartDate`, reruns final selected coverage, runs the coordinate-aware phase, and collects the review basis:

```bash
npm run data:saves:refresh -- \
  --through 2026-08-02 \
  --retrieved-at 2026-08-03T04:00:00.000Z \
  --compiled-at 2026-08-03T04:00:00.000Z \
  --content data/pricecatcher/pilot \
  --source-lock-output data/pricecatcher/pilot/source-lock.json \
  --candidate-source-lock data/pricecatcher/pilot/review-candidates/source-lock.json \
  --candidate-coverage-report data/pricecatcher/pilot/coverage-candidates-2026-08-02.json \
  --selection data/pricecatcher/pilot/review-candidates/selection.json \
  --host-policy data/pricecatcher/pilot/reviews/host-policy.json \
  --selected-coverage-output data/pricecatcher/pilot/coverage-final-2026-08-02.json \
  --feasibility-output data/pricecatcher/pilot/feasibility-2026-08-02.json \
  --audit-output data/pricecatcher/staging/pilot-review-audit.json \
  --quality-basis-output data/pricecatcher/pilot/quality-review-basis.json
```

The committed final selected report and Phase B use all 60 dates required by their own derived `H`; the candidate-era source lock remains unchanged under `review-candidates/`. If any baseline/microzone minimum is below 7,000 basis points, preserve the honest failing report, leave `current.json` on fixture mode, and do not continue to desk publication.

Create `content-verification.test.ts` now and run it after Step 6 has produced the basis/dispositions. It parses all five content files, the candidate-universe coverage report, selected-content coverage report, distance report, selection, host policy, all pass files, and both reconciliation reports with runtime schemas, then asserts:

```ts
expect(approvedPremises.length).toBeGreaterThanOrEqual(10)
expect(approvedPremises.length).toBeLessThanOrEqual(15)
expect(new Set(approvedPremises.flatMap(row => row.reviews.map(review => review.reviewerId))).size).toBeGreaterThanOrEqual(2)
expect(approvedPremises.every(row => differenceInLocalDates(row.verificationExpiresOn, row.verifiedOn) === 90)).toBe(true)
expect(approvedPremises.every(row => row.verificationExpiresOn >= malaysiaDateAt('2026-08-03T04:00:00.000Z'))).toBe(true)
expect(approvedItems.length).toBeGreaterThanOrEqual(5)
expect(approvedItems.length).toBeLessThanOrEqual(10)
expect(approvedItems.every(row => new Set(row.reviews.map(review => review.reviewerId)).size >= 2)).toBe(true)
expect(feasibilityReport.passesDeskDemoGate).toBe(true)
expect(new Set(qualityReviews.map(reviewKey)).size).toBe(qualityReviews.length)
```

The test must also invoke the same pure deterministic reconciliation functions into a temporary directory: regenerate microzones/premises/items and `reviews/reconciliation.json` from the committed candidate source lock, candidate-universe coverage report, selection, host policy, microzones, and four independent premise/item pass files; regenerate `quality-reviews.json` and `reviews/quality-reconciliation.json` from the committed basis and two quality passes. Compare exact canonical bytes with every committed final file. Re-hash every provenance input, require the reconciliation reports to list those exact digests, and require the manifest's 13-role path-free provenance digest (including candidate source lock, candidate coverage, and host policy) to match.

Manifest resolution is clean-clone safe: when `SAVES_STAGED_MANIFEST` is set, additionally validate that ignored staged manifest for the prepublication gate; otherwise parse committed `src/saves/public/data/current.json`, resolve its build ID to the committed final manifest, and validate only immutable final refs. The default test never assumes `data/pricecatcher/staging/pilot-build.json` exists. Add a one-byte hand-edit regression for each generated output and both stage/final resolution modes. This turns “no manual copy/paste” into an executable gate without needing ignored raw or provisional-audit files.

- [ ] **Step 6: Compile, independently review quality flags, and stage current data**

Step 5's refresh has already written both the detailed ignored audit and a repository-safe canonical review-basis file whose context excludes prior quality dispositions. Two reviewers independently inspect every complete basis entry—every rejected pilot target cell and every eligible line below half its reference median—and may consult the detailed audit, but their strict pass files bind the committed basis hash rather than the ignored audit. They do not see one another's pass. Reconcile only unanimous decisions:

```bash
npx tsx scripts/pricecatcher/reconcile-content.ts quality \
  --basis data/pricecatcher/pilot/quality-review-basis.json \
  --review data/pricecatcher/pilot/reviews/quality-review-a.json \
  --review data/pricecatcher/pilot/reviews/quality-review-b.json \
  --output data/pricecatcher/pilot/quality-reviews.json \
  --reconciliation-output data/pricecatcher/pilot/reviews/quality-reconciliation.json
npm run data:saves:compile -- --source-lock data/pricecatcher/pilot/source-lock.json --compiled-at 2026-08-03T04:00:00.000Z --content data/pricecatcher/pilot --coverage-report data/pricecatcher/pilot/coverage-final-2026-08-02.json --feasibility-report data/pricecatcher/pilot/feasibility-2026-08-02.json --publication-mode desk-demo --manifest-output data/pricecatcher/staging/pilot-build.json
```

The final stage must fail if any audit flag lacks a valid unanimous disposition. It writes no public pointer. Re-run staging only after review input changes are explicit; do not edit generated public JSON or audit output by hand.

- [ ] **Step 7: Prove byte reproducibility and non-fixture labeling**

Regenerate twice from the staged normalized slice, exact content bytes, and fixed clock:

```bash
npm run data:saves:compile -- --reproduce-manifest data/pricecatcher/staging/pilot-build.json --reproduction-output data/pricecatcher/staging/reproductions/pilot-a
npm run data:saves:compile -- --reproduce-manifest data/pricecatcher/staging/pilot-build.json --reproduction-output data/pricecatcher/staging/reproductions/pilot-b
```

Assert both reproductions and the stage have identical snapshot/audit/normalized-slice hashes, `publicationMode: desk-demo`, the three official attribution links, and the desk-warning banner input. A one-byte content mutation must fail digest verification.

- [ ] **Step 8: Run desk-demo gates and regressions**

```bash
SAVES_STAGED_MANIFEST=data/pricecatcher/staging/pilot-build.json npm run test:saves -- data/pricecatcher/pilot/content-verification.test.ts
SAVES_STAGED_MANIFEST=data/pricecatcher/staging/pilot-build.json npm run verify:saves
SAVES_STAGED_MANIFEST=data/pricecatcher/staging/pilot-build.json npm test
npm run build
npm run data:saves:publish -- --manifest data/pricecatcher/staging/pilot-build.json
npm run build:saves
npx playwright test --config playwright.saves.config.ts --grep "unmocked current pointer smoke"
npm run data:saves:compile -- --reproduce-from-pointer src/saves/public/data/current.json --private-root-kind pilot --reproduction-output data/pricecatcher/staging/reproductions/pilot-from-committed
npm run test:saves -- data/pricecatcher/pilot/content-verification.test.ts
```

Expected: desk content, deterministic fixture journeys, boundary/secret checks over the exact staged artifacts, existing tests/build, and staged desk rendering all PASS before activation. `SAVES_STAGED_MANIFEST` causes the verifier to hash/parse/scan the stage and route that exact staged snapshot through the production shell; it does not change the active pointer. Only then does the explicit publish command update the pointer. Rebuilding copies the newly activated immutable build/pointer into `dist/saves`; the final fresh Playwright web server and unmocked smoke then confirm the exact activated bytes/banner and no trip verdict. The last pointer-derived reproduction uses the committed final manifest and proves no ignored stage/raw path is required.

- [ ] **Step 9: Commit desk-demo content separately**

```bash
git add data/pricecatcher/pilot src/saves/public/data
git commit -m "data: add reviewed Petaling Jaya PriceCatcher pilot"
git push origin UPGRADES
```

---

### Task 14: Document operation and run the completion audit

**Files:**
- Modify: `README.md`
- Create: `docs/auntie-saves-data-runbook.md`
- Create: `docs/auntie-saves-desk-demo-report.md`

**Interfaces:**
- Consumes: every implemented command, test, build, public/private artifact, and desk-demo review result.
- Produces: reproducible developer instructions, daily manual refresh/failure procedure, explicit product limits, and a requirement-by-requirement completion evidence report.

- [ ] **Step 1: Add accurate README commands and product boundaries**

Document:

```bash
npm install
npm run setup:saves:e2e
npm run dev:saves
npm run test:saves
npm run build:saves
npm run preview:saves
npm run verify:saves
```

State prominently: Malaysia/Petaling Jaya small-staples top-up pilot; monitored date-only prices; same published item definitions, not exact SKUs; unknown stock; driving-only trip recommendations; walking/partial/unknown-cost price comparisons; no accounts/analytics/paid keys; existing Electron quickstart unchanged.

- [ ] **Step 2: Write the daily data runbook**

Document exact cutoff and failure behavior:

1. run `data:saves:refresh` with explicit cutoff/retrieval/compile instants, candidate-era source-lock/report/selection paths, and output paths; confirm its bootstrap→selected-horizon→optional lock-extension sequence ends at a provisional audit and cannot stage/publish;
2. inspect the typed active source lock, immutable candidate source lock, candidate report, selected-content report, and distance feasibility report; verify the candidate lock/report binding and final `analysisStartDate <= H − 59`, then stop on any failed gate;
3. run two independent passes over the audit's complete `qualityFlags` set, then `reconcile-content.ts quality` to atomically replace the complete evidence-bound review file;
4. run final `data:saves:compile` with the same active source lock, selected-content coverage and distance reports, reviewed content, fixed compile instant, and `desk-demo` mode; preserve the candidate-era source lock/report/selection/host-policy provenance in the 13-role manifest to create the deterministic inert stage;
5. reproduce twice and run `SAVES_STAGED_MANIFEST=data/pricecatcher/staging/pilot-build.json npm run verify:saves`, which scans and renders that exact stage without activating it;
6. run Electron regressions, then `data:saves:publish` by the atomic pointer update only and retain its printed prior-pointer backup path;
7. rebuild `dist/saves`, run the fresh unmocked current-pointer smoke, and reproduce through the committed final manifest;
8. any failure before activation leaves the prior pointer untouched; if a required post-activation confirmation fails, immediately run the conditional rollback command with the printed backup and expected new build ID, rerun `build:saves`, require source and `dist/saves/data/current.json` bytes to match, rerun the unmocked smoke, and record whether rollback/rebuild succeeded. Until that rebuild passes, treat `dist/saves` as invalid. Never claim the prior pointer stayed active after a completed publish.

Clarify that HTTPS hosting, scheduling, participant consent, field verification, and consumer claims are not authorized or completed by this branch.

- [ ] **Step 3: Create a completion-evidence matrix**

For each software and desk-demo acceptance criterion, record the exact evidence path/command and result. Use four statuses only: `proved`, `contradicted`, `missing`, `out-of-scope gate`. A criterion is `proved` only when its authoritative test/build/artifact/rendered evidence is inspected.

The report must include:

```text
branch and commit chain
fixture reproducibility manifest path, typed artifact roles, and verification result
desk build ID plus final-manifest paths/typed fields that contain snapshot/audit digests
domain/compiler/component/E2E test counts
Saves and Electron build results
boundary/secret/network scan results without values
responsive and axe results
unmet consumer-pilot and field-validation gates
```

Do not duplicate full 64-hex digests into Markdown. The completion report cites the immutable parsed manifest and exact typed field/artifact role as the authority; an optional display prefix is at most 12 lowercase hex characters and is not treated as hash verification. Full digests remain only in schema-validated manifest fields covered by the scanner's narrow exception.

- [ ] **Step 4: Run the full clean-state verification suite**

```bash
npm ci
npm run setup:saves:e2e
npm run verify:saves
npm run verify:saves:clean-reproduction
npm test
npm run build
git diff --check
git status --short --branch
```

Expected: all commands PASS. The clean-reproduction command exports tracked `HEAD`, has no raw/staging files, denies network during regeneration, resolves immutable inputs from the committed final manifest, and matches all artifact hashes. Status contains only intended documentation changes before the final commit.

- [ ] **Step 5: Perform a rendered browser audit**

At 390×844 and desktop widths, inspect fixture/current banner, permission denied/inaccurate/allowed states, preflight counts, every result kind, evidence details, source links, focus order, overflow, and absence of third-party requests. Save no screenshot containing precise user location.

- [ ] **Step 6: Dispatch final independent critics**

Use one critic for spec/acceptance coverage, one for data/math fail-closed behavior, and one for security/accessibility/build isolation. Critics inspect evidence and report only concrete failures. Return each failure to the responsible task, re-run its focused tests, then re-run the complete suite.

- [ ] **Step 7: Commit documentation and final audit**

```bash
git add README.md docs/auntie-saves-data-runbook.md docs/auntie-saves-desk-demo-report.md
git commit -m "docs: document AUNTIE Saves verification"
git push origin UPGRADES
```

- [ ] **Step 8: Record final branch evidence without deploying or opening a PR**

```bash
git status --short --branch
git log --oneline --decorate -15
```

Expected: clean `UPGRADES` branch synchronized with `origin/UPGRADES`, with the design, plan, task commits, passing verification evidence, and no deployment or pull request.
