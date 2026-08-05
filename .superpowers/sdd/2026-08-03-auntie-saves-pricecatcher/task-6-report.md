# Task 6 implementation report

Status: implementation complete; remains in progress pending independent spec/quality review.

Base: `7c64f325a99a06e71435fb77a0ae7bf41d351fdf`

## TDD record

- Step-1 RED was captured before any production compiler/contract file existed. Only `compilerFixture.ts` and the four named compiler tests were present. `npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts` failed at collection with `Failed to load url ../compile`; 0 tests were collected.
- Contracts/URL/host-policy RED then failed on the missing `contracts/compiler` module. After GREEN, 25 contract/policy/normalization tests passed and only the four intentional `compiler not implemented` behavior tests failed.
- Parsing/join/cutoff/two-universe GREEN: 29/29.
- Matrix/audit/collection/reproduction RED: missing `collectQualityReviewBasis` and `compilePilotFromNormalizedSlice`; GREEN: 34/34.
- Provenance/chronology/digest RED: five isolated gaps (canonical source order, extraneous microzone codes, full-input invalid-price count, audit rate refinement, price-level provenance binding); GREEN: 63/63.
- Expanded source-mode, quality-set, chronology, premise-type, desk-report, and reproduction mutation matrix: 82/82, then 102/102.
- Contextual matrix-rate, normalized unit-join, and full duplicate-provenance identity REDs were captured and made GREEN.
- Final compile-focused gate: 105/105.

Every added test names the production mutation it kills. Literal counts/dates/rates were derived from the fixture rather than by calling production helpers.

## Implemented contracts and policy

- Added strict raw transaction/premise/item boundaries. Transaction provenance is required explicitly as `sourceManifestIndex` and `rowNumber`; unrelated passthrough CSV columns cannot supply audit identity.
- Added strict private microzone, premise, item, quality-basis, quality-disposition, collection-audit, compiler-audit, normalized-slice, final compile-input, and collection-input schemas.
- Added the clause extensions: contextual active public/extended feasibility locks; desk-only parsed review-host policy and attested SHA; final/reproduction `reviewInputSha256`; exact two distinct reviewers; later nested quality-review date equality; desk/fixture report-policy exclusivity.
- Added executable HTTPS review URL constraints including fixed-point query-key decoding and sensitive-key rejection.
- Added `2026-08-03-v1` exact-host policy parsing and a pure raw authority parser with no Node, DOM, filesystem, crypto, or network API.
- Added audit refinements that bind eligible counts/rates and exact quality flag/unreviewed sets.

## Implemented compiler behavior

- Executes the locked parse → authoritative lookup join → disjoint compiled/through cutoffs → Selangor single-operator reference universe → curated pilot universe order.
- Uses existing `canonicalizeCode`, `compareCanonicalCodes`, local-date, price, duplicate, reference, and classification helpers.
- Counts unknown codes and invalid prices across full pinned transaction input while keeping cutoff rows out of joins and horizon selection.
- Derives only the two target dates, publishes a complete premise/item matrix, retains missing/anomalous/insufficient distinctions, and projects no private reviewer/source notes.
- Preserves exact and conflicting source rows, invalid-price precedence, independent overlapping duplicate/conflict counts, and full reason-specific private evidence.
- Emits complete evidence-bound quality flags and requires exact canonical basis/disposition equality, wrapper digest binding, review-input identity binding, and chronology.
- Trims the normalized reference and pilot universes to the specified windows while persisting full-input ingestion counters.
- Adds pure audit-only basis collection and pure normalized-slice regeneration; regeneration reconstructs outputs rather than copying prior artifacts and rechecks digests, reports, policy context, chronology, lookups, and provenance.
- Validates source-row role/month/range, duplicate refs, exact cell identity, complete source membership, price/raw evidence, and full duplicate provenance identity.
- Validates desk report gates, transforms, dates, locks, code sets, content/report digests, and the derived-horizon 59-date coverage rule.
- Exports canonical review text display/key and qualifier display/key helpers for Task 8 reuse.
- Exports a contextual snapshot/audit validator for matrix counts and complete-basket denominator equality.

## Clause-memo coverage

- Fixture inputs accept only exact 31-date public locks and forbid desk reports/policy. Desk inputs accept exact or earlier extended feasibility locks and require both reports plus policy/SHA.
- Review host policy and SHA are threaded through final, collection, normalized slice, and reproduction boundaries without inventing a content-digest role.
- Transaction provenance is explicit and provenance values survive valid/invalid rows and both normalized universes.
- Final and reproduction require basis `reviewInputSha256` equality; collection copies it to basis and audit.
- Premise, item, and quality decisions require exactly two per-entity distinct reviewers; A/B pseudonym reuse across entities remains valid; output is review-order invariant.
- `[500,500,1500]`, `[500,1500]`, `[500,500]`, and invalid-poisoned combinations prove independent duplicate/conflict counts and invalid precedence.
- Top-level quality `reviewedOn` must equal the later nested date.

## Verification evidence

- `npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts src/pricecatcher`: 7 files, 517/517 tests passed.
- `npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts`: 105/105 tests passed after the final changes.
- `npm run typecheck:saves`: all four TypeScript projects passed.
- `git diff --check`: passed before report creation.

Two repository/environment gates cannot complete in this sandbox:

- `npm run test:saves` and `npm test` each reached all tests but the existing `saves-node20-workflow.test.ts` child exited 1 because `tsx` could not create its local IPC socket: `listen EPERM .../tsx-501/*.pipe`. The same `npm run data:saves:smoke` command reproduces the sandbox error. Escalation was requested and aborted/declined. The Saves run was 518/519; the default run was 532/533, with that single shared infrastructure failure.
- `npm run build:saves` passed all four typechecks and then Vite failed before bundling because `vite.saves.config.ts` is absent from this worktree and from the Task-6 base tree. `package.json` references the missing file. No out-of-scope config was added.

## Self-review

- Re-read every Task-6 brief checklist item and all seven clause resolutions.
- Confirmed pure production files contain no Node/DOM crypto, filesystem, network, or environment API.
- Confirmed private reviewer IDs, source notes, policies, basis/dispositions, and audit details are not projected into the public snapshot.
- Confirmed all output arrays/maps use canonical code/date/object ordering where order is observable.
- Confirmed primary, collection, and reproduction paths share strict parsing, content, source-context, report, and provenance validation.
- Confirmed the implementation changes only the six named source/test files plus this report and the Task-6 in-progress ledger entry.

## Concerns for independent review

- The pure compiler treats digest strings (including review-host-policy and report byte digests) as adapter-attested values; it binds and compares them but intentionally does not hash bytes. Task 7 must compute/verify those digests before invocation.
- Full-suite and bundle completion are blocked by inherited sandbox/config conditions described above; focused/domain/type gates are clean.
- The compiler files are large because the brief centralizes strict schemas, pure compilation, collection, reproduction, chronology, desk gates, and provenance in Task 6. No unrelated refactor was included.

## Fix round 1 — compiler reproduction hardening

Status remains in progress pending fresh independent review.

The first focused RED added semantic normalized-slice mutations for lookup membership, curated membership, exact unit binding, Selangor/type eligibility, pilot membership, H−1 overlap, and provenance uniqueness within each of the four row arrays. The targeted run collected 120 tests and produced the intended 12 failures; the unchanged cross-array H−1 provenance case remained accepted. After the semantic row validator and per-array uniqueness refinements were added, the focused group passed 15/15.

The second RED expanded the compiler file to 135 tests and produced 13 intended failures: six numeric-IPv4 authority/policy cases, canonical review ordering, two invalid-code/wrong-month boundary cases, mixed-fraction instant ordering, absent optional item fields, source-kind/mode binding, and distinct long invalid-price equality. A final optional-field RED then isolated missing-versus-whitespace duplicate comparison while retaining control-character rejection. Each focused RED was followed by its GREEN before wider verification.

The correction now:

- Revalidates every valid/rejected reference/pilot row against authoritative lookup existence, exact lookup unit, curated item membership, normalized Selangor and allowed premise type, and curated pilot premise membership. Curated valid and rejected H−1 reference/pilot rows must overlap exactly.
- Rejects duplicate provenance independently inside each normalized row array while continuing to permit the intentional identical reference/pilot overlap.
- Orders source retrieval and compilation as parsed epochs, including mixed fractional precisions, and checks a valid row date against its transaction manifest month before invalid-code exclusion in both final compilation and audit-only collection.
- Rejects dotted, shortened, octal-looking, and hexadecimal-looking numeric IPv4 authority forms in both source authority extraction and the retailer host policy.
- Maps absent or whitespace-only optional item group/category fields to canonical empty strings, compares missing/whitespace duplicates equally, reproduces empty values, and still rejects control characters.
- Binds fixture mode to synthetic-fixture source locks and desk-demo mode to official source locks in compile, collection, and normalized-slice schemas.
- Canonical-sorts premise, item, and nested quality review arrays by reviewer ID in their shared schema parse outputs.
- Keeps full invalid raw-price equality classes until a deterministic per-cell bounded representation is assigned. Distinct long values sharing the first 64 characters—and values colliding with a candidate suffix token—remain distinct; identical long values remain duplicates; normalized reproduction emits byte-equivalent audit output.
- Adds the explicit desk reproduction mutation for a review-host-policy digest record mismatch, plus exact source-row membership/unit mutations across the normalized universes.

Fresh verification after the last source edit:

```text
$ npm run test:saves -- src/pricecatcher/__tests__/compile.test.ts
# 1 file, 136 tests passed

$ npm run test:saves -- src/pricecatcher
# 7 files, 548 tests passed

$ npm run typecheck:saves
# all four configured TypeScript projects passed

$ npm run build
# Electron/Vite main, preload, and renderer builds passed

$ git diff --check
# passed

$ rg -n <high-confidence credential/private-key patterns> <five changed files>
# no findings (rg exit 1)

$ rg -n -P <nonprinting-byte pattern> <five changed files>
# no findings (rg exit 1)
```
