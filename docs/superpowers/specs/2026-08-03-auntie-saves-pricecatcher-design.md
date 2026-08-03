# AUNTIE Saves: PriceCatcher Decision Concierge

**Date:** 3 August 2026
**Status:** Approved design for implementation planning
**Branch:** `UPGRADES`

## 1. Decision

Add a mobile-first web experience named **AUNTIE Saves** to the existing AUNTIE repository. It will answer one narrow question for a Malaysian shopper before they leave home:

> For this small staples top-up trip, does a different nearby shop appear reliably cheaper after conservative price and travel allowances, or is there no clear advantage over my usual shop?

The existing Electron live-commerce overlay remains intact. AUNTIE Saves is a parallel product surface with shared branding and pure TypeScript decision logic; it is not forced into the desktop overlay.

The first pilot is limited to one or two dense Petaling Jaya microzones and a manually verified set of 10–15 near-daily PriceCatcher premises, with at least three fresh-data-capable premises in each microzone. The range reflects the actual July 2026 supply: Petaling Jaya had only 20 observed premise codes, of which roughly 13 appeared daily or near-daily. The pilot serves only small staples top-up trips whose every intended item uses one of the pilot's 5–10 curated PriceCatcher definitions. It compares one usual shop with complete single-shop alternatives and fails closed when the public evidence cannot support a reliable recommendation.

## 2. Why this product, not another price map

The official KPDN PriceCatcher app already supports nearby premises, item comparison, a shopping basket, maps, directions, and distance sorting. ManaMurah also exposes basket-oriented PriceCatcher analysis. A clone would add little.

AUNTIE's differentiator is the decision layer:

- compare the user's actual quantities under the same published PriceCatcher item definitions and units against their usual shop;
- reject partial baskets, stale observations, unknown product codes, and implausible prices;
- account for the difference in trip cost;
- give one plain-language recommendation with a visible evidence breakdown;
- say “no reliable comparison” when the data is insufficient.

The service describes **recent monitored prices**, not live stock or guaranteed checkout prices.

## 3. Goals

The pilot must:

1. Work as a responsive mobile web app without an account or installation.
2. Let the user provide a one-shot location, choose their usual shop, and assemble a small staples top-up basket from a deliberately limited same-item-code catalogue.
3. Compare only the same PriceCatcher `item_code` and published unit, without claiming that every code denotes a unique brand or SKU.
4. Recommend at most one alternative premise only when the user confirms that every intended purchase is represented and both shops have 100% reliable basket coverage.
5. Show the usual-shop total, alternative total, gross difference, estimated trip-cost difference, and net difference.
6. Show the observation date for every line and credit KPDN/data.gov.my under CC BY 4.0.
7. Produce a clear refusal when any required evidence is missing, stale, unverified, or implausible.
8. Run without OpenAI, Exa, or any other paid API key.
9. Preserve the existing Electron application and its current commands.

## 4. Non-goals for this implementation

This first implementation will not include:

- nationwide coverage;
- Singapore or Price Kaki data;
- generic product substitutions or cross-code unit-price matching;
- split-basket or multi-stop routing;
- live inventory or stock claims;
- AI photo, receipt, voice, or natural-language basket extraction;
- WhatsApp integration, accounts, notifications, or price alerts;
- retailer sponsorship, affiliate ranking, or monetization;
- automated permanent geocoding of the national premise list;
- production hosting or a live daily scheduler;
- unrelated refactoring of the existing Electron trust overlay.

Those are separate Gauntlet rounds after the pilot proves that reliable, meaningful recommendations occur often enough.

## 5. User flow

### 5.1 Start

The landing screen explains the contract in one sentence: “AUNTIE compares recently checked government prices; stock and checkout prices may have changed.”

The user may grant one-shot browser location access. The app requests high accuracy and accepts an origin for a trip result only when the browser reports accuracy of 100 metres or better. It does not persist precise location. If permission is denied, inaccurate, or unavailable, the user may still explore the curated catalogue, but the app cannot issue a travel-adjusted `switch` or `no-clear-advantage` result. The refusal explains that a sufficiently precise origin is required; the pilot does not pretend a district or postcode centroid is the user's home. Geolocation acceptance is tested on localhost, and real mobile use requires the later HTTPS field deployment.

### 5.2 Choose the baseline

The app lists only manually verified pilot premises near the selected location. The user chooses their usual shop. A savings claim is never made without this explicit baseline.

An immediate eligibility preflight shows whether the usual shop has recent pilot data and how many coordinate-verified premises are initially viable. As the user adds each basket line, the UI updates the number of premises that still have complete eligible coverage. The user sees an inevitable refusal before filling the whole form, not only after pressing calculate.

### 5.3 Build the basket

The user searches a curated catalogue of 5–10 high-coverage PriceCatcher item codes. Every option displays the full official item definition and published unit. Quantity is expressed as a multiplier of that unit; the pilot does not silently convert or substitute items.

Before calculation, the app asks whether every intended purchase for this small top-up trip is represented. If the user has an unlisted or unmonitored item, the app may compare the selected lines but cannot issue a trip-level `switch` or `no-clear-advantage` result. This prevents a cheap monitored subset from hiding an expensive or unavailable remainder.

### 5.4 Decide

The user selects walking or driving and may change a minimum worthwhile net saving, defaulting to RM5. For driving, the app exposes editable fuel-price and fuel-efficiency assumptions. After data eligibility is known, it requests a premise-specific toll/parking status for the usual shop and every viable in-radius candidate. A confirmed RM0 means the user asserts no fixed cost; “unknown” is distinct and downgrades the result to comparison-only. Walking produces price-only comparison in this phase because the app has no evidence that a straight-line path is safely traversable.

The result is one of four states:

- **Switch:** “X appears worth checking — even the conservative estimate clears your RM5 threshold. Confirm stock and shelf price before going.”
- **No clear advantage:** “No alternative clearly clears your RM5 threshold after conservative price and travel allowances.”
- **Selected-items comparison:** “These 6 monitored items cost less at X. AUNTIE cannot judge the whole trip because other items are not covered.”
- **No reliable comparison:** an explicit reason such as incomplete basket coverage, stale observations, an unresolved price anomaly, or no verified nearby premise.

The recommendation headline rounds net saving to the nearest ringgit because travel is estimated. The expanded result preserves observed line and basket prices to the sen, shows estimated trip cost to the nearest ten sen, and exposes the unrounded integer-sen inputs used for the threshold decision. It also shows observation dates, source retrieval/compilation times, distance/travel assumptions, attribution, and the price/stock disclaimer.

## 6. Architecture

### 6.1 Repository layout

Implementation planning should preserve the existing `electron-vite` application and add these bounded areas:

```text
src/
  pricecatcher/        Pure TypeScript domain and recommendation logic
  saves/               Responsive React web application
scripts/
  pricecatcher/        Fetch, normalize, validate, and compile pilot snapshots
data/
  pricecatcher/
    pilot/             Verified coordinates and generated pilot snapshot
    fixtures/          Small deterministic test fixtures
```

A dedicated Vite configuration and `dev:saves`, `build:saves`, and `preview:saves` scripts build and serve the mobile web surface independently. A `data:saves:refresh` script performs the explicit network refresh; web builds never fetch mutable source data as a hidden side effect. The current `dev`, `build`, `start`, and `test` commands remain valid.

The integration is normative:

- `vite.saves.config.ts` uses `root: 'src/saves'`, `base: './'`, `envDir: false`, `outDir: '../../dist/saves'`, `emptyOutDir: true`, the React plugin, and an `@pricecatcher` alias to `src/pricecatcher`.
- `tsconfig.saves.json` covers `src/saves/**/*` and `src/pricecatcher/**/*`; node-side type-checking covers `src/pricecatcher/**/*` and `scripts/pricecatcher/**/*`.
- `typecheck:saves` runs both type-checks. `build:saves` runs `typecheck:saves` before the Vite build.
- `verify:saves` runs type-checking, domain/compiler/component tests, production build, module/bundle boundary checks, and production-preview end-to-end checks.
- Generated public data lives under `src/saves/public/data`, so Vite copies it deliberately. The design does not depend on the Electron renderer's `server.fs.allow` behavior.
- The Saves UI has no client-side router in this phase, so a relative static build works without rewrite rules.

### 6.2 Module boundaries

`src/pricecatcher` contains no React, Electron, browser, filesystem, or network calls. It exposes typed functions over plain data:

- **canonicalization:** normalize premise/item join keys without changing identity;
- **catalog validation:** join transaction rows to known premises and items while retaining unknown-code audit counts;
- **quality screening:** reject malformed, non-positive, stale, or statistically implausible observations;
- **distance/travel estimation:** deterministic Haversine and transparent trip-cost calculations;
- **recommendation:** compute complete monitored-basket totals and choose `switch`, `no-clear-advantage`, `comparison-only`, or `insufficient-evidence`;
- **explanation:** return machine-readable reason codes and display-ready arithmetic inputs.

`scripts/pricecatcher` owns network and filesystem work. It downloads official files, validates their schemas, records source URLs and timestamps, joins lookup tables, and produces a compact static pilot snapshot plus an audit report.

`src/saves` consumes only the compiled snapshot and domain API. It never receives API credentials and never fetches OpenAI or Exa directly.

The Saves build has a structural import boundary: it may import React and `src/pricecatcher`, but never Electron main/preload/renderer/judge code or the `electron`, `openai`, `exa-js`, `electron-store`, or `apify-client` packages. Static HTML enforces the supported CSP directives `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'` and `Referrer-Policy: no-referrer`. The later HTTPS host must send the same CSP as a response header plus `frame-ancestors 'none'`, which is not enforceable through a meta tag. No third-party script, font, image, or analytics request is permitted.

## 7. Data contracts and provenance

### 7.1 Official inputs

The compiler accepts:

- PriceCatcher transactional records: <https://data.gov.my/data-catalogue/pricecatcher>
- premise lookup: <https://data.gov.my/data-catalogue/lookup_premise>
- item lookup: <https://data.gov.my/data-catalogue/lookup_item>

Every compiled snapshot records source URLs, source observation-date range, latest included pilot observation date, compilation time, transformation version, and the required CC BY 4.0 attribution. `dataAsOfDate` is the maximum non-future observation date among lookup-joined selected pilot rows after basic identifier/price parsing but before quality screening; Selangor reference-only rows cannot advance it. The public target horizon is exactly `dataAsOfDate` and the immediately preceding Malaysia calendar date. The visible copy is: “PriceCatcher Transactional Records, Premise Lookup, and Item Lookup — KPDN and DOSM via data.gov.my, CC BY 4.0; retrieved [date]; observations [min date]–[max date]; filtered and transformed by AUNTIE Saves. Prices and stock may have changed.” Dataset and license names are links. Coordinate-source attribution and redistribution terms are recorded separately.

Fetching and compilation are separate adapters. `data:saves:fetch` downloads all monthly files intersecting any target observation's preceding 30-date reference window, streams them with the declared `csv-parse` package, computes their hashes, and stores immutable bytes by SHA-256. `data:saves:compile` accepts only pinned local file paths plus an injected clock. `data:saves:refresh` runs fetch then compile. This keeps network behavior out of deterministic tests.

The large downloaded source files, staging directories, and hash-addressed raw archive remain untracked and are explicitly covered by `.gitignore`. A committed source lock records every download URL, SHA-256 digest, byte length, retrieval time, and ETag or Last-Modified value when supplied. The repository also commits a normalized reference-and-pilot source slice, the curated coordinate file, the compact pilot output needed for the demo, and its private audit report. The slice contains every selected pilot row on the two public target dates plus every retained Selangor reference row on the 30 dates preceding each target date—an overall maximum span from `dataAsOfDate − 31 dates` through `dataAsOfDate`. Acceptance means reproducible given the recorded input bytes; mutable official URLs alone are not treated as an archive.

Compilation maintains two explicit row universes. `referenceRows` contains curated item codes across all lookup-joined, allowed one-operator Selangor premises and is used only for quality distributions. `pilotRows` is the subset whose premise codes appear in the approved pilot content and is the only universe evaluated or published. Feasibility reporting uses a separate declared 14/30-date analysis mode and never changes the two-date public snapshot horizon.

Compilation stages a complete versioned build under one `buildId`. The public snapshot is written to `src/saves/public/data/builds/<buildId>/snapshot.json`; the full audit remains outside the public web root under `data/pricecatcher/pilot/builds/<buildId>/audit.json`. After schema and hash validation, one atomic rename updates `src/saves/public/data/current.json` to point to the versioned snapshot. A failed compile leaves the prior pointer and build untouched.

At runtime, the app fetches `./data/current.json` and then its same-origin relative snapshot URL. Both responses are parsed from `unknown` with a versioned runtime schema before use. A missing asset, unknown version, build-ID mismatch, or integrity mismatch renders a specific load error. The public snapshot retains the pilot premise/item/date evidence matrix and per-cell rejection status needed to explain missing, stale, anomalous, and insufficient-reference results; the detailed audit and reviewer notes are never shipped to the browser.

### 7.2 Canonical identifiers

PriceCatcher codes are treated as identifiers, not measurements. Inputs such as numeric `2`, text `2`, and integral decimal text `2.0` canonicalize to the same string `2`. Non-integral, negative, empty, or non-numeric codes are invalid and remain in the audit rather than being guessed.

Unknown active `item_code` or `premise_code` values are counted and retained in the audit, but cannot appear in a recommendation until their labels are authoritative.

### 7.3 Verified pilot premises

Each pilot premise coordinate record includes:

- canonical premise code;
- latitude and longitude;
- verification method and source note;
- verification date and the identities of the reviewers;
- official lookup name, current verified display name, accuracy metres, expiry date, and coordinate-source redistribution terms;
- status of `desk-verified`, `field-verified`, `rejected`, or `needs-review`.

Only `desk-verified` or `field-verified` coordinates enter the app. `desk-verified` requires two independent reviewers and two independent sources: the KPDN premise record plus either an official retailer locator or a reputable map/business listing whose terms permit the intended coordinate use. The premise name and address must match, both reviewers' entrance points must agree within 30 metres, and source URLs and access dates are recorded. `field-verified` requires a GPS reading or geotagged photo taken at the storefront entrance and a second review against the premise record. Verification expires after 90 days. Any identity conflict, coordinate disagreement over 30 metres, closure signal, expired review, prohibited redistribution, or centroid-only match sets `needs-review` and quarantines the premise. Public Nominatim is not called at application runtime, and consumer field claims require `field-verified` coordinates.

The pilot also excludes premise types that may aggregate multiple independent vendors or do not represent a single grocery checkout, including wet markets, markets, food courts, and restaurants. Eligible types are taken from the official `premise_type` value, not guessed from the premise name. A premise enters the pilot only when verification establishes one operator and one checkout context for the compared basket.

### 7.4 Curated item catalogue

Only item codes that are present in the official lookup, active in the pilot snapshot, and manually checked for an intelligible item-definition/unit label are searchable. Some official definitions permit multiple brands, so the UI displays the official wording rather than calling every code an exact product. Different brands, grades, origins, package sizes, and item codes are never treated as substitutes in this phase.

Two independent reviewers classify each curated definition and record every available brand, grade, origin, and package qualifier from the official label. Disagreement or a definition too broad for a fair top-up comparison quarantines the code. The later paired-store field check confirms that the shelf products satisfy the same published definition at both stores; it does not claim identical barcode, producer, freshness, quality, or checkout conditions unless the official definition itself fixes those attributes.

For content selection, the calibration window is the 14 Malaysia calendar dates ending on `dataAsOfDate`. A premise is `near-daily` only when it publishes at least one transaction on 10 of those 14 dates. An item is `high-coverage` only when it appears on at least 10 dates and, on at least 70% of those dates, has observations at 70% or more of the proposed near-daily pilot premises. “Active” means transactional presence in this named window; the lookup tables do not supply an active flag.

Before literal pilot codes are frozen, a committed trailing-30-date feasibility report must demonstrate at least 10 near-daily eligible premises, 5–10 high-coverage item definitions, and at least one same-date complete alternative within 5 driving kilometres on at least 70% of calibration dates for each selected microzone. If it fails, content selection returns to design; the implementation must not quietly relax freshness or completeness.

Curated content is versioned separately from code in `microzones.json`, `premises.json`, and `items.json`, each with a runtime schema. `microzones.json` contains labels and geographic bounds for exploration only, never a substitute user origin. `premises.json` contains the private verification evidence and public-safe fields; only its projected public fields enter the snapshot. `items.json` contains literal item codes, official labels/units, quantity mode, qualifiers, and independent semantic-review status. Software can be complete against fixtures before this human-owned content gate is complete; a desk-demo build additionally requires all listed codes and premises to pass review, while a consumer pilot requires field-verified premises.

### 7.5 Normative runtime contracts

`LocalDate` is a runtime-validated `YYYY-MM-DD` value. `ISOInstant` is a runtime-validated UTC ISO-8601 instant. Every `Sen` value is a non-negative safe integer. The implementation may use branded TypeScript aliases, but the serialized Version 1 contract is:

```ts
interface SourceManifestV1 {
  url: string
  retrievedAt: ISOInstant
  sha256: string
  byteLength: number
  rowCount: number
  minObservedDate?: LocalDate
  maxObservedDate?: LocalDate
  etag?: string
  lastModified?: string
}

interface PilotSnapshotV1 {
  schemaVersion: 1
  buildId: string
  transformVersion: string
  compiledAt: ISOInstant
  dataAsOfDate: LocalDate
  timeZone: 'Asia/Kuala_Lumpur'
  sources: SourceManifestV1[]
  attribution: {
    text: string
    datasetUrl: string
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  }
  premises: PremiseV1[]
  items: ItemDefinitionV1[]
  evidence: EvidenceCellV1[]
}

interface PremiseV1 {
  code: string
  officialName: string
  displayName: string
  address: string
  premiseType: string
  latitude: number
  longitude: number
  coordinateAccuracyMetres: number
  verificationStatus: 'desk-verified' | 'field-verified'
  verifiedOn: LocalDate
  verificationExpiresOn: LocalDate
  coordinateAttribution: string
}

interface ItemDefinitionV1 {
  code: string
  officialName: string
  officialUnit: string
  qualifiers: string[]
  quantityMode: 'whole-units' | 'hundredths'
}

interface EvidenceCellV1 {
  premiseCode: string
  itemCode: string
  officialUnit: string
  observations: ObservationEvidenceV1[]
}

type ObservationEvidenceV1 =
  | { status: 'eligible'; observedDate: LocalDate; priceSen: Sen }
  | { status: 'missing'; observedDate: LocalDate }
  | { status: 'anomalous'; observedDate: LocalDate; reason: QualityReason }
  | { status: 'insufficient-reference'; observedDate: LocalDate }
```

The pointer file is `CurrentSnapshotPointerV1 { schemaVersion: 1; buildId: string; snapshotUrl: string; snapshotSha256: string }`. Zod schemas are the executable runtime contract for the pointer, snapshot, curated content, and recommendation input; TypeScript types are inferred from those schemas so compile-time and runtime contracts cannot drift independently.

The compiler materializes the premise × item × two-target-date matrix, so `missing` is explicit rather than inferred from a compact array. `stale` and cross-premise `date-mismatch` are evaluation outcomes because they depend on `evaluatedAt` and the comparison pair.

The public recommendation API is:

```ts
interface RecommendationInput {
  evaluatedAt: ISOInstant
  location: { latitude: number; longitude: number; accuracyMetres: number }
  usualPremiseCode: string
  basketScope: 'complete-trip' | 'selected-items-only'
  lines: Array<{ itemCode: string; quantityHundredths: number }>
  mode: 'walk' | 'drive'
  fuelEfficiencyDeciKmPerL?: number
  fuelPriceSenPerL?: Sen
  fixedTripCostByPremiseCode: Record<
    string,
    { status: 'confirmed'; amountSen: Sen } | { status: 'unknown' }
  >
  worthwhileThresholdSen: Sen
}

type RecommendationResult =
  | { kind: 'switch'; comparison: TripComparisonV1; exclusions: ExclusionCounts }
  | { kind: 'no-clear-advantage'; comparison: TripComparisonV1; exclusions: ExclusionCounts }
  | {
      kind: 'comparison-only'
      comparison: PriceComparisonV1
      reasons: ComparisonOnlyReason[]
      exclusions: ExclusionCounts
    }
  | { kind: 'insufficient-evidence'; primaryReason: ReasonCode; details: ReasonDetail[] }

type ComparisonOnlyReason =
  | 'selected-items-only'
  | 'walking-route-unverified'
  | 'fixed-trip-cost-unknown'

interface ComparedLineV1 {
  itemCode: string
  officialUnit: string
  quantityHundredths: number
  observedDate: LocalDate
  unitAllowanceSen: Sen
  lineAllowanceSen: Sen
  usual: { priceSen: Sen; lineTotalSen: Sen; conservativeLineSen: Sen }
  candidate: { priceSen: Sen; lineTotalSen: Sen; conservativeLineSen: Sen }
}

interface DrivingTripCostV1 {
  straightLineMetres: number
  routeFactorBasisPoints: number
  estimatedRoundTripRoadMetres: number
  fuelCostSen: Sen
  fixedCostSen: Sen
  totalTripCostSen: Sen
}

interface PriceComparisonV1 {
  usualPremiseCode: string
  candidatePremiseCode: string
  lines: ComparedLineV1[]
  usualBasketTotalSen: Sen
  candidateBasketTotalSen: Sen
  grossBasketSavingSen: number
  usualStraightLineMetres: number
  candidateStraightLineMetres: number
  oldestObservationDate: LocalDate
}

interface TripComparisonV1 {
  mode: 'drive'
  priceComparison: PriceComparisonV1
  usualEstimatedTrip: DrivingTripCostV1
  candidateEstimatedTrip: DrivingTripCostV1
  estimatedNetSavingSen: number
  usualConservativeBasketTotalSen: Sen
  candidateConservativeBasketTotalSen: Sen
  usualConservativeTrip: DrivingTripCostV1
  candidateConservativeTrip: DrivingTripCostV1
  usualConservativeNetCostSen: Sen
  candidateConservativeNetCostSen: Sen
  conservativeNetSavingSen: number
  worthwhileThresholdSen: Sen
}

type CandidateExclusionReason =
  | 'outside-radius'
  | 'missing'
  | 'stale'
  | 'anomalous'
  | 'insufficient-reference'
  | 'date-mismatch'

interface ExclusionCounts {
  pilotPremiseCount: number
  inRadiusCandidateCount: number
  excludedByReason: Partial<Record<CandidateExclusionReason, number>>
}

interface ReasonDetail {
  reason: ReasonCode
  premiseCode?: string
  itemCode?: string
  observedDate?: LocalDate
}
```

Signed saving fields are safe integers but may be negative; all other `Sen` fields are non-negative safe integers. `ComparisonOnlyReason[]` is deduplicated and sorted in the fixed order shown in its union: basket scope, walking route, then fixed-cost knowledge. `ExclusionCounts` groups excluded premises without exposing private audit notes.

Input validation is fixed: latitude is −90…90, longitude −180…180, reported accuracy must be 0…100 metres for a trip result, quantity hundredths 1…9,900, threshold 0…10,000 sen, fuel efficiency 10…500 deci-km/L, fuel price 1…1,000 sen/L, and each confirmed fixed trip cost 0…10,000 sen. The fixed-cost map must contain the usual premise and every complete in-radius candidate; a missing entry is `input-invalid`, while any `unknown` entry forces `comparison-only`. Items marked `whole-units` require quantity hundredths divisible by 100; manually curated weight/volume definitions may allow hundredths. Duplicate basket item codes merge by checked integer addition and fail when the result exceeds 9,900. Driving defaults fuel efficiency to 120 deci-km/L (12 km/L), but fuel price has no hidden live default and must be explicitly entered or confirmed from dated pilot metadata. Walking ignores fuel fields. The usual premise is always excluded from candidates.

## 8. Evidence-quality rules

All rules are deterministic and expose reason codes.

### 8.1 Freshness

PriceCatcher exposes an observation date, not a trustworthy observation time. Freshness therefore uses Malaysia calendar dates rather than pretending to know an hour. The engine receives an explicit `evaluatedAt` instant, converts it to `Asia/Kuala_Lumpur`, and accepts observations only from that local date or the immediately preceding local date. This is a two-calendar-date policy, not a claim that the observation occurred within a literal number of hours. A basket with any older line is incomplete for recommendation purposes, and a row dated after the evaluation date is invalid.

If the snapshot's latest included observation date is older than the immediately preceding Malaysia calendar date at evaluation time, the app may show its metadata but cannot issue `switch` or `no-clear-advantage`; it returns `snapshot-stale`. If `evaluatedAt` predates `compiledAt` by more than five minutes or its Malaysia date predates `dataAsOfDate`, the engine returns `clock-invalid`. Tests inject `evaluatedAt`; they never depend on the machine clock, and recompilation never makes old observations fresh.

### 8.2 Plausibility

A price must parse to a positive integer number of sen with at most two decimal places. For the Petaling Jaya pilot, the compiler builds a same-item Selangor reference from the 30 complete Malaysia calendar dates immediately preceding the target observation date; the target date never influences its own reference. Each premise contributes one value: the median of that premise's non-conflicting daily observations in the window, rounded half-up to sen. This gives daily and weekly premises equal reference weight. A line is eligible only when at least 20 distinct premises contribute and the price is strictly greater than one quarter and strictly less than four times the cross-premise median. The robust scale is `max(1.4826 × MAD, 20 sen, ceil(2% × median))`; `abs(price - median) / robustScale` above 6 makes the line ineligible. This definition remains finite and continuous when MAD is zero or near zero.

An ineligible low price can never make a premise win. The audit records the value, item, premise, observation date, rejection reason, eligible-line rate, and resulting basket-eligibility rate. Before publishing a pilot artifact, a reviewer inspects every rejected observation whose inclusion would change the winning premise or result state and every otherwise eligible winning line priced below half its reference median.

### 8.3 Same-definition completeness

For every requested basket line, both the usual premise and a candidate premise must have a raw observation for the same published PriceCatcher item code, unit, and observation date. For each premise/item independently, the engine selects that cell's maximum raw observation date within the freshness window and validates only that date. If either selected row is malformed, anomalous, or otherwise ineligible, the line fails; it never searches backward. If the two independently selected dates differ, the line fails with `date-mismatch`; it never falls back to an older common date. Exact duplicate prices collapse to one observation. Multiple distinct prices for the same date/premise/item become `conflicting-duplicate`; all values are audited and the line is ineligible. The compiler never invents their median as an official price.

Missing is always `unknown`. The engine never treats it as zero, out of stock, or permission to compare partial totals.

### 8.4 Ordered compiler pipeline

The compiler performs these stages in order:

1. Runtime-schema parse each raw row and canonicalize integral identifiers.
2. Join authoritative item and premise lookups; unknown codes remain in the private audit and cannot enter public content.
3. Filter to curated item codes and allowed one-operator Selangor premise types, then split `referenceRows` from the selected `pilotRows` subset.
4. In both universes, collapse exact duplicate `(observationDate, premiseCode, itemCode, priceSen)` rows and mark same-cell conflicting prices ineligible.
5. Build each target's equal-premise-weighted distribution from `referenceRows` on the preceding 30 complete local dates, excluding the target date.
6. Require 20 distinct contributing reference premises, then apply the hard ratio and robust-scale gates to target `pilotRows`.
7. Emit `insufficient-reference` or `anomalous` explicitly rather than dropping a rejected pilot cell.
8. Materialize every missing pilot premise × item × target-date cell for exactly the two public target dates, validate the complete public snapshot and private audit under one `buildId`, then atomically publish.

Any change to this order increments `transformVersion` and invalidates the golden artifact hash.

## 9. Recommendation algorithm

The engine receives:

- user latitude/longitude from an explicit one-shot permission;
- usual premise code;
- basket lines using the same published item code/unit and a positive quantity expressed in hundredths of that unit, from 1 to 9,900;
- basket scope of `complete-trip` or `selected-items-only`, explicitly confirmed by the user;
- travel mode;
- fuel efficiency and fuel price for driving;
- optional fixed toll/parking amounts for the usual and candidate round trips;
- a 5 km driving candidate radius; walking may browse premises within 2 km but cannot receive a trip recommendation in this phase;
- minimum worthwhile net saving, default RM5.

For each fully eligible premise:

1. Each line total is `priceSen × quantityHundredths / 100`, rounded half-up to the nearest sen; `basketTotal` is the integer-sen sum of those rounded lines.
2. Straight-line distance uses the Haversine formula with mean Earth radius 6,371,008.8 metres and is rounded half-up to the nearest metre. Radius boundaries are inclusive: at most 5,000 metres for driving candidates and at most 2,000 metres for walking comparison.
3. Estimated one-way road metres are explicitly labelled and equal straight-line metres multiplied by a configurable pilot route factor of 1.25, rounded to the nearest metre.
4. Walking has RM0 monetary trip cost. Driving fuel cost uses the round-trip estimated road distance, fuel efficiency, and fuel price, rounded half-up to the nearest sen, plus the premise-specific user-entered toll/parking amount.
5. `netCost = basketTotal + tripCost`.
6. `estimatedNetSaving = usualNetCost - candidateNetCost` using the 1.25 route factor.
7. Each observed unit price gets `unitAllowanceSen = max(20, ceil(2% × priceSen))`. The quantity-scaled allowance is `lineAllowanceSen = ceil(unitAllowanceSen × quantityHundredths / 100)`. Baseline lower line cost is `max(0, lineTotalSen − lineAllowanceSen)`; candidate upper line cost is `lineTotalSen + lineAllowanceSen`.
8. Conservative driving travel uses a 1.0 route factor for the usual shop and 1.5 for each candidate, preserving each confirmed premise-specific fixed cost from the input map. `conservativeNetSaving` subtracts the candidate's upper basket/travel cost from the usual shop's lower basket/travel cost. An unknown fixed cost is never converted to RM0 and prevents a trip recommendation.
9. Walking has RM0 estimated out-of-pocket cost, but straight-line distance cannot prove route connectivity, crossings, or effort. Walking therefore returns `comparison-only` with `walking-route-unverified`, never `switch` or `no-clear-advantage`, in this phase.

Candidates outside the radius or without full eligible coverage are excluded with visible reason counts. A price-only candidate is the complete candidate with the lowest observed basket total; ties resolve by the most recent oldest-line observation date, shortest distance, then canonical premise code. If basket scope, walking-route evidence, or fixed-cost knowledge requires `comparison-only`, the engine returns that price comparison and does not manufacture trip fields.

Only a complete driving request with confirmed fixed costs for every complete in-radius candidate proceeds to trip ranking. Among those candidates, the highest conservative net saving wins; ties resolve by the most recent oldest-line observation date, shortest distance, then canonical premise code.

The result is:

- `switch` when the best alternative's conservative net saving is at least the user's threshold;
- `no-clear-advantage` when at least one reliable alternative exists but none clears the threshold conservatively;
- `comparison-only` when reliable selected-line arithmetic exists but the user reports unmonitored intended purchases, selects walking without a verified route, or leaves any viable premise's fixed trip cost unknown; this state cannot contain trip-level imperative copy;
- `insufficient-evidence` when the baseline or every alternative fails the evidence rules.

`switch` and `no-clear-advantage` additionally require `basketScope = complete-trip` and `mode = drive`. The engine never infers completeness merely because every entered line has a price.

The arithmetic inputs accompany the verdict so the UI can explain every ringgit. The threshold decision uses `conservativeNetSavingSen`, and that same sen value is visible in the expanded result even though the headline is rounded. Estimated distance and fuel cost are labelled as dedicated-round-trip out-of-pocket estimates; the app does not include time/effort or claim route accuracy, live stock, or a guaranteed checkout total.

## 10. Failure handling

The app fails closed and remains useful:

- denied or inaccurate location allows catalogue exploration but no trip result;
- invalid or unavailable snapshots show the exact validation problem;
- an old last-known snapshot is identified by date and cannot power a recommendation;
- unknown lookup codes are reported in the compiler audit and hidden from search;
- an incomplete usual-shop basket prevents a savings claim;
- an incomplete alternative is excluded rather than partially totalled;
- unmonitored intended purchases downgrade the result to a selected-items comparison with no trip recommendation;
- an anomalous candidate price is excluded rather than celebrated as a bargain;
- no eligible candidate produces “No reliable complete comparison nearby,” not a fabricated winner;
- network failure during compilation leaves the previous compiled artifact untouched.

User-facing copy avoids inventory claims and uses “monitored,” “observed,” “estimated,” and “may have changed.”

`QualityReason` is one of `invalid-price`, `conflicting-duplicate`, `outside-ratio-bound`, or `robust-scale-outlier`. `ReasonCode` is one of:

- snapshot: `snapshot-load-failed`, `snapshot-schema-unsupported`, `snapshot-integrity-failed`, `snapshot-stale`, `clock-invalid`;
- input: `location-missing`, `location-imprecise`, `input-invalid`, `basket-empty`, `item-not-in-pilot`, `usual-premise-not-in-pilot`;
- baseline: `baseline-missing`, `baseline-stale`, `baseline-anomalous`, `baseline-insufficient-reference`;
- candidates: `no-candidate-in-radius`, `candidate-missing`, `candidate-stale`, `candidate-anomalous`, `candidate-insufficient-reference`, `candidate-date-mismatch`, `no-complete-candidate`.

Failure precedence is deterministic. The engine returns the first applicable class in this order: snapshot load/schema/integrity, clock validity, snapshot freshness, input validation/location, usual-premise and basket validity, baseline evidence, in-radius candidate existence, complete candidate evidence. Within an evidence class, precedence is `conflicting/anomalous`, `insufficient-reference`, `stale`, `missing`, then candidate-pair `date-mismatch`. `no-candidate-in-radius` means zero non-usual pilot premises are inside the applicable radius. `no-complete-candidate` means at least one is inside the radius but every one has at least one candidate evidence exclusion; candidate-specific details and all exclusion counts remain available even though `primaryReason` follows the fixed order. Only after reliable arithmetic exists may the sorted comparison-only reason array downgrade the result; otherwise the engine chooses `switch` or `no-clear-advantage`.

## 11. Privacy and security

- The browser requests location only after a user action.
- Precise location and basket state remain in memory by default and are not sent to analytics or stored on a server.
- The application has no account, advertising identifier, or third-party tracker.
- AUNTIE Saves contains no OpenAI, Exa, geocoder, or routing credential.
- Any future AI or paid-data integration must run behind a server boundary and receive a separate threat review.
- Secrets are excluded from fixtures, compiled snapshots, logs, screenshots, tests, commits, and generated bundles.

The later field study has a separate privacy contract because it collects more than the application. Participants receive a plain-language consent notice covering location, baskets, receipts/photos, observed behavior, and the study purpose. Study records use random participant IDs; the identity key is stored separately with access limited to the study lead. Receipt images are redacted for names, loyalty IDs, payment details, and unrelated purchases before analysis. Raw and derived records are encrypted at rest and access is logged. Raw location and receipt imagery are retained for no more than 30 days after the study, derived pseudonymous metrics for no more than 90 days, and then deleted. Participants may withdraw and request deletion before aggregation. None of the study data is used for advertising or model training.

## 12. Testing strategy

### 12.1 Domain unit tests

Vitest tests cover:

- identifier canonicalization, including `2`, `"2"`, and `"2.0"`;
- Malaysia-calendar-date freshness, future-date, and invalid-clock boundaries with an injected evaluation time;
- unknown lookup values and audit counts;
- malformed, zero, negative, infinite, and implausible prices;
- exact duplicate collapse and conflicting-duplicate rejection;
- same-code/unit/date and full-coverage enforcement;
- equal-premise reference weighting, hard ratio bounds, and zero/near-zero-MAD robust scale;
- integer-sen quantity rounding, Haversine, route-factor, fuel, toll, and parking arithmetic;
- quantity-scaled uncertainty and premise-specific fixed-cost-map completeness;
- whole-unit quantity validation, duplicate basket-line merge, and every numeric boundary;
- baseline-versus-candidate net saving;
- radius exclusion and deterministic tie-breaking;
- every `switch`, `no-clear-advantage`, `comparison-only`, and `insufficient-evidence` reason.

### 12.2 Compiler integration tests

Small fixtures model the real official schemas, integral-decimal join mismatch, lookup codes without recent transactions, unknown active item codes, exact and conflicting duplicates, extreme price errors, cross-month reference windows, and mutable-current-month source locks. A golden compiled snapshot and audit report include a fixed injected clock, exact source manifest, expected reason precedence, expected integer-sen outputs, and expected artifact hashes.

The compiler writes to a temporary path, validates the complete artifact, and only then replaces the prior generated snapshot. During the two-week concierge study, an operator runs `data:saves:refresh`, reviews the audit, and republishes the static pilot artifact each day before participants use it. A missed or failed refresh naturally produces the stale-data refusal; no old artifact is silently treated as current.

### 12.3 UI and end-to-end checks

The implementation adds React Testing Library, `user-event`, `jest-dom`, jsdom, Playwright, and `@axe-core/playwright`. Domain and compiler tests run in Vitest's Node environment; component tests opt into jsdom explicitly. Clock, geolocation provider, snapshot loader, fetch, and compiler filesystem/download adapters are injected rather than monkey-patched globally.

Component tests cover basket editing, basket-scope attestation, permission refusal/inaccuracy, assumption editing, all four result states, line-item evidence, attribution, and mobile accessibility. Playwright runs against the production `preview:saves` build with mocked accurate, inaccurate, denied, and missing geolocation. Browser verification covers at least 390×844 and desktop widths, keyboard use, visible focus, no horizontal overflow, readable error states, and axe checks.

The E2E harness rejects every request whose origin is not the local preview server. A module-graph test rejects prohibited imports, the CSP is asserted from the built HTML, and `dist/saves` is scanned for prohibited SDK/domain strings and high-entropy credential patterns without printing any matched secret value.

The existing Electron test and build commands must still pass. `verify:saves` runs all Saves-specific gates, then the completion audit separately runs existing `npm test` and `npm run build` as regression evidence. No paid key is required for `dev:saves`, `typecheck:saves`, `build:saves`, `preview:saves`, `verify:saves`, or the Saves experience; this claim does not apply to the preserved Electron app's live AI features.

## 13. Technical acceptance criteria

### 13.1 Software-complete gate

Software implementation is complete only when:

1. `UPGRADES` contains the parallel mobile web build without breaking the Electron build.
2. Existing tests pass and new domain/compiler/UI tests pass.
3. A production AUNTIE Saves build succeeds from a clean checkout.
4. A fixed golden basket produces the exact expected integer-sen arithmetic, reason precedence, and recommendation at a fixed `evaluatedAt`.
5. No ineligible observation contributes to a `switch` or `no-clear-advantage` result. Golden fixtures prove that an ineligible baseline, or the absence of any complete eligible alternative, returns `insufficient-evidence`; one bad candidate may be excluded only when another independently complete candidate remains.
6. The fixture artifact can be regenerated byte-for-byte from pinned fixture bytes and a fixed clock.
7. The rendered app visibly shows source date, line dates, assumptions, disclaimer, and CC BY 4.0 attribution.
8. The staged diff, Saves source/data directories, and `dist/saves` scan find no high-entropy credential values; the production module/domain scan finds no prohibited AI, Electron, analytics, or third-party network dependency. Scanners report paths and rule names but never print suspected secret values.
9. No paid API key is required for any Saves command or the Saves experience.
10. `verify:saves`, existing `npm test`, and existing `npm run build` all pass from a clean checkout.

### 13.2 Desk-demo content gate

A demo using current official data additionally requires the committed feasibility report, literal reviewed `microzones.json` / `premises.json` / `items.json`, 10–15 unexpired desk-verified eligible premises, 5–10 semantically reviewed high-coverage item definitions, a public snapshot/private audit pair under one build ID, and byte-for-byte regeneration from the committed normalized pilot slice. The source lock proves which retained official input bytes produced that slice. Until this gate passes, the UI identifies itself as fixture/demo data and does not imply current nearby recommendations.

### 13.3 Consumer-pilot content gate

Consumer use additionally requires all recommendation premises to be field-verified and unexpired, the HTTPS/operations/privacy prerequisites in Section 14, and route-factor calibration against at least 30 representative origin-to-premise driving routes. The conservative 1.0–1.5 factor interval must contain at least 95% of measured road/straight-line ratios; otherwise the interval is widened and recommendations are recalculated before recruitment.

## 14. Field-validation gate

Software completion does not prove the consumer promise. Field validation is a separate post-build round, not part of this implementation: it requires participant consent, a reachable HTTPS pilot deployment, a named daily refresh operator, refresh-failure monitoring, and a successful seven-day refresh/deployment soak before recruitment.

The first study is explicitly exploratory: two weeks with 30 Petaling Jaya households, at least 60 consecutive small staples top-up attempts, and 10–15 field-verified premises. It records every consecutive top-up attempt rather than recruiting only baskets known to work. For every `switch`, same-day field evidence is collected for the complete basket at both the usual and recommended stores, even when the participant visits only one. At least 10 paired switches are required to assess basic feasibility, but this small study cannot substantiate a low false-switch rate or a reliability claim.

A separate reliability gate continues collection until the one-sided 95% exact binomial upper confidence bound for the false-switch rate is below 5%. With zero false switches this requires at least 59 issued switches. Every issued switch remains in the denominator: missing paired follow-up counts as a failure rather than disappearing through attrition. If failures occur, the required sample is recomputed with the same predeclared exact method.

Proceed beyond the pilot only if the study achieves:

- 100% of premises used in a participant result independently confirmed at the correct storefront entrance; any failure quarantines the premise and invalidates affected cases;
- at least 70% acceptable same-definition mapping across all intended line items, using every intended line from every recorded attempt as the denominator;
- at least 50% of all recorded attempts receiving a reliable `switch` or `no-clear-advantage` result rather than `comparison-only` or `insufficient-evidence`;
- at least 70% of in-catalogue attempts having every intended line mapped and 100% eligible data coverage at the usual shop and at least one mode-eligible alternative;
- at least 90% of same-day checked line/premise observations matching shelf prices with absolute error no greater than the larger of RM0.20 or 2% of the shelf price;
- at least 90% of paired complete-basket totals matching their shelf-price totals with absolute error no greater than the larger of RM1 or 2% of the shelf-price basket total;
- at least 85% of recommended alternative trips having every intended item in stock;
- a one-sided 95% exact-binomial upper bound below 5% for false switches across every issued switch, where a false switch means same-day shelf price, stock, verified trip costs, or missing paired follow-up prevents realized net saving from clearing the user's threshold;
- among issued `switch` recommendations, median realized net saving of at least RM5 and at least 10% of the usual-shop basket total;
- at least 8 of the 30 enrolled participants completing a second, independently initiated top-up comparison on a later day within the 14-day study.

Until that gate passes, marketing must not claim guaranteed savings, live prices, complete inventory, or “RM100 per week.” If coverage or truth fails, the next product experiment should be fresh-price alerts for a few staples rather than broader basket optimization.

## 15. Delivery sequence and Gauntlet gates

The implementation plan will divide work into independently testable stages:

1. domain contracts and failing tests;
2. deterministic recommendation engine;
3. ingestion/compiler with fixtures and audit report;
4. manually verified pilot dataset;
5. mobile UI and evidence breakdown;
6. responsive/accessibility verification;
7. integrated build, secret scan, and regression audit.

Each stage uses a builder followed by a fresh critic. A failed criterion returns to the builder with the smallest evidence-backed correction; critics do not rewrite the implementation they judge. The branch is not declared complete until all acceptance criteria have authoritative test, build, source, and rendered evidence.
