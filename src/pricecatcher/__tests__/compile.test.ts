import { describe, expect, it } from 'vitest'
import {
  canonicalizeCompilerJson, collectQualityReviewBasis, compilePilot,
  compilePilotFromNormalizedSlice, normalizeQualifierDisplay, normalizeQualifierKey,
  normalizeReviewTextDisplay, normalizeReviewTextKey, validateCompilerAuditAgainstSnapshot,
  validateSourceRowProvenance
} from '../compile'
import {
  AuditCellSchema, CompilerAuditV1Schema, PrivateItemReviewSchema,
  NormalizedSourceSliceV1Schema, PrivatePremiseReviewSchema,
  QualityReviewDispositionSchema, ReviewHttpsUrlSchema,
  type CompilePilotInput
} from '../contracts/compiler'
import { PilotSnapshotV1Schema } from '../contracts/snapshot'
import { collapseObservationRows } from '../quality'
import {
  extractReviewSourceAuthority, isReviewSourceAllowedByHostPolicy,
  ReviewHostPolicyV1Schema
} from '../review-source-policy'
import {
  fixtureParsedContent, fixtureVerifiedDigests, makeCollectionInput,
  makeCompilerInput, makeDeskCompilerInput, pilotRow, referenceOnlyRow
} from './compilerFixture'

const syntheticSource = (url: string) => ({
  url, accessedOn: '2026-08-01', redistribution: 'synthetic-cc0' as const,
  attributionCode: 'synthetic-fixture' as const
})

const attachCollectedQualityReviews = (input: CompilePilotInput): CompilePilotInput => {
  const { basis } = collectQualityReviewBasis(makeCollectionInput(input))
  input.content.qualityReviewBasis = basis
  input.content.qualityReviews = {
    schemaVersion: 1,
    qualityReviewBasisSha256: input.contentDigests.qualityReviewBasis,
    qualityReviews: basis.qualityFlags.map(reviewBasis => {
      const disposition = reviewBasis.flag === 'rejected-cell' ? 'confirmed-exclusion' : 'confirmed-eligible'
      const reasonCode = reviewBasis.flag === 'rejected-cell'
        ? 'quality-exclusion-confirmed'
        : 'low-price-eligibility-confirmed'
      return {
        reviewBasis,
        disposition,
        reviewedOn: '2026-08-02',
        reviews: [
          { reviewerId: 'reviewer-a', reviewedOn: '2026-08-01', disposition, reasonCodes: [reasonCode] },
          { reviewerId: 'reviewer-b', reviewedOn: '2026-08-02', disposition, reasonCodes: [reasonCode] }
        ]
      }
    })
  }
  return input
}

describe('PriceCatcher compiler', () => {
  // Break caught: the compiler narrows reference construction to curated pilot premises.
  it('uses all Selangor reference premises but publishes only pilot premises', () => {
    const { snapshot, normalizedSlice } = compilePilot(makeCompilerInput())
    expect(snapshot.premises.map(premise => premise.code)).toEqual(['1', '2', '3'])
    expect(new Set(normalizedSlice.referenceRows.map(row => row.premiseCode)).size).toBe(20)
    expect(snapshot.evidence.every(cell => ['1', '2', '3'].includes(cell.premiseCode))).toBe(true)
  })

  // Break caught: the public evidence matrix publishes a wider or shifted date window.
  it('publishes exactly dataAsOfDate and the previous date', () => {
    const { snapshot } = compilePilot(makeCompilerInput())
    expect(snapshot.dataAsOfDate).toBe('2026-08-02')
    expect([...new Set(snapshot.evidence.flatMap(cell => cell.observations.map(row => row.observedDate)))]).toEqual([
      '2026-08-01',
      '2026-08-02'
    ])
  })

  // Break caught: rows after throughDate and rows after the Malaysia compile date share one counter or advance the horizon.
  it('enforces the through cutoff separately from the compiled-date future cutoff', () => {
    const { snapshot, audit } = compilePilot(makeCompilerInput({
      extraRows: [pilotRow('2026-08-03'), pilotRow('2026-08-04')]
    }))
    expect(snapshot.dataAsOfDate).toBe('2026-08-02')
    expect(audit.afterThroughRowCount).toBe(1)
    expect(audit.futureRowCount).toBe(1)
  })

  // Break caught: absent target cells disappear from the matrix or unknown item codes escape the audit.
  it('materializes missing cells and audits unknown codes', () => {
    const { snapshot, audit } = compilePilot(makeCompilerInput({ omitPilotCell: ['2', '10', '2026-08-01'] }))
    expect(snapshot.evidence.find(cell => cell.premiseCode === '2')?.observations).toContainEqual({
      status: 'missing', observedDate: '2026-08-01'
    })
    expect(audit.unknownItemCodes).toEqual(expect.objectContaining({ '999': 1 }))
  })
})

describe('compiler review input contracts', () => {
  // Break caught: URL validation admits a credential-bearing, local, non-HTTPS, fragment, or path-like review source.
  it.each([
    'http://fixture.test/evidence',
    'file:///tmp/evidence',
    'data:text/plain,evidence',
    'https://user:pass@fixture.test/evidence',
    'https://fixture.test/evidence#private',
    'https://fixture.test/evi dence',
    '/relative/evidence'
  ])('rejects unsafe review URL %s', url => {
    expect(ReviewHttpsUrlSchema.safeParse(url).success).toBe(false)
  })

  // Break caught: query credential keys survive one or more percent-decoding layers or malformed escape handling.
  it.each([
    'api_key', 'api%5Fkey', 'api%255Fkey', 'api%25255Fkey', 'api%252525255Fkey',
    'api%25252525255Fkey', 'token', 'signature', 'bad%2'
  ])('rejects sensitive or malformed query key %s', key => {
    expect(ReviewHttpsUrlSchema.safeParse(`https://fixture.test/evidence?${key}=fixture`).success).toBe(false)
  })

  // Break caught: the committed retailer host list is unsorted, duplicated, non-ASCII, or case-dependent.
  it('requires a sorted unique lowercase ASCII retailer policy', () => {
    expect(ReviewHostPolicyV1Schema.parse({
      version: '2026-08-03-v1', retailerHosts: ['locator.example', 'shop.example']
    }).retailerHosts).toEqual(['locator.example', 'shop.example'])
    expect(ReviewHostPolicyV1Schema.safeParse({
      version: '2026-08-03-v1', retailerHosts: ['shop.example', 'locator.example']
    }).success).toBe(false)
    expect(ReviewHostPolicyV1Schema.safeParse({
      version: '2026-08-03-v1', retailerHosts: ['shop.example', 'shop.example']
    }).success).toBe(false)
    expect(ReviewHostPolicyV1Schema.safeParse({
      version: '2026-08-03-v1', retailerHosts: ['SHOP.example']
    }).success).toBe(false)
  })

  // Break caught: authority parsing accepts lookalike boundaries, explicit ports, IPs, Unicode hosts, or trailing dots.
  it.each([
    'https://user@data.gov.my/evidence',
    'https://data.gov.my:443/evidence',
    'https://127.0.0.1/evidence',
    'https://127.1/evidence',
    'https://0177.0.0.1/evidence',
    'https://0x7f.1/evidence',
    'https://[::1]/evidence',
    'https://data.gov.my./evidence',
    'https://dāta.gov.my/evidence'
  ])('rejects non-default DNS authority %s', url => {
    expect(extractReviewSourceAuthority(url)).toBeNull()
  })

  // Break caught: numeric IPv4 aliases are accepted as retailer DNS names even though URL stacks resolve them as IP addresses.
  it.each(['127.1', '0177.0.0.1', '0x7f.1'])('rejects numeric IPv4 retailer host %s', host => {
    expect(ReviewHostPolicyV1Schema.safeParse({
      version: '2026-08-03-v1', retailerHosts: [host]
    }).success).toBe(false)
  })

  // Break caught: host matching uses substring/suffix matching without an exact dot boundary or fails uppercase normalization.
  it('enforces exact attribution hosts and suffix boundaries', () => {
    const policy = ReviewHostPolicyV1Schema.parse({
      version: '2026-08-03-v1', retailerHosts: ['locator.example']
    })
    expect(isReviewSourceAllowedByHostPolicy({
      source: { ...syntheticSource('https://DATA.GOV.MY/evidence'), attributionCode: 'kpdn-official-record', redistribution: 'cc-by-4.0' },
      publicationMode: 'desk-demo', policy
    })).toBe(true)
    for (const url of [
      'https://data.gov.my.evil.test/evidence',
      'https://kpdn.gov.my.evil.test/evidence',
      'https://openstreetmap.org.evil.test/evidence'
    ]) {
      expect(isReviewSourceAllowedByHostPolicy({
        source: { ...syntheticSource(url), attributionCode: url.includes('openstreetmap') ? 'openstreetmap-contributors' : 'kpdn-official-record', redistribution: url.includes('openstreetmap') ? 'odbl-1.0' : 'cc-by-4.0' },
        publicationMode: 'desk-demo', policy
      })).toBe(false)
    }
    expect(isReviewSourceAllowedByHostPolicy({
      source: { ...syntheticSource('https://unlisted.example/store'), attributionCode: 'official-retailer-locator', redistribution: 'official-use-permitted' },
      publicationMode: 'desk-demo', policy
    })).toBe(false)
  })

  // Break caught: review and qualifier reconciliation compares raw Unicode, case, or whitespace instead of canonical keys.
  it('normalizes review text and qualifiers without losing canonical display', () => {
    expect(normalizeReviewTextDisplay('  Cafe\u0301\u00a0  MART  ')).toBe('Café MART')
    expect(normalizeReviewTextKey('  Cafe\u0301\u00a0  MART  ')).toBe('café mart')
    expect(normalizeQualifierDisplay('  LARGE\u2003PACK ')).toBe('LARGE PACK')
    expect(normalizeQualifierKey('  LARGE\u2003PACK ')).toBe('large pack')
    expect(() => normalizeReviewTextKey(' \u0007 ')).toThrow()
    expect(() => normalizeQualifierKey('   ')).toThrow()
  })

  // Break caught: shared review schemas validate reviewer sets but preserve caller order in their parsed output.
  it('canonical-sorts every shared two-review array by reviewerId', () => {
    const input = makeCompilerInput()
    const premise = structuredClone(input.content.premises[0]) as any
    const item = structuredClone(input.content.items[0]) as any
    const disposition = structuredClone((input.content.qualityReviews as any).qualityReviews[0])
    premise.reviews.reverse()
    item.reviews.reverse()
    disposition.reviews.reverse()
    expect(PrivatePremiseReviewSchema.parse(premise).reviews.map(review => review.reviewerId)).toEqual(['reviewer-a', 'reviewer-b'])
    expect(PrivateItemReviewSchema.parse(item).reviews.map(review => review.reviewerId)).toEqual(['reviewer-a', 'reviewer-b'])
    expect(QualityReviewDispositionSchema.parse(disposition).reviews.map(review => review.reviewerId)).toEqual(['reviewer-a', 'reviewer-b'])
  })
})

describe('compiler audit and reproducibility', () => {
  // Break caught: normalized exports retain the wrong window or omit complete conflict evidence from the private audit.
  it('emits the complete retained windows and strict audit evidence', () => {
    const { snapshot, audit, normalizedSlice } = compilePilot(makeCompilerInput())
    expect(audit.inputRowCount).toBeGreaterThan(audit.publicEligibleRowCount)
    expect(audit.rejectedCells).toEqual(expect.arrayContaining([
      expect.objectContaining({ premiseCode: '2', itemCode: '10', reason: 'conflicting-duplicate' })
    ]))
    expect(audit.referenceRowCount).toBe(620)
    expect(audit.pilotRowCount).toBe(7)
    expect(audit.exactDuplicateCount).toBe(0)
    expect(audit.conflictingCellCount).toBe(1)
    expect(normalizedSlice.referenceRows.every(row => row.observedDate >= '2026-07-02')).toBe(true)
    expect(normalizedSlice.referenceRows.every(row => row.observedDate <= '2026-08-01')).toBe(true)
    expect([...new Set(normalizedSlice.pilotRows.map(row => row.observedDate))]).toEqual(['2026-08-01', '2026-08-02'])
    expect(() => PilotSnapshotV1Schema.parse(snapshot)).not.toThrow()
    expect(() => CompilerAuditV1Schema.parse(audit)).not.toThrow()
  })

  // Break caught: reason-specific audit evidence silently accepts missing prices, medians, or reference counts.
  it('rejects incomplete reason-specific audit cells', () => {
    const common = {
      premiseCode: '2', itemCode: '10', observedDate: '2026-08-02',
      sourceRows: [{ sourceManifestIndex: 1, rowNumber: 22 }]
    }
    expect(AuditCellSchema.safeParse({ ...common, reason: 'outside-ratio-bound', priceSen: 100 }).success).toBe(false)
    expect(AuditCellSchema.safeParse({ ...common, reason: 'conflicting-duplicate' }).success).toBe(false)
    expect(AuditCellSchema.safeParse({ ...common, reason: 'insufficient-reference' }).success).toBe(false)
  })

  // Break caught: complete-basket and matrix-count ratios are accepted without their snapshot denominator.
  it('contextually binds audit counts and complete-basket rate to the public matrix', () => {
    const { snapshot, audit } = compilePilot(makeCompilerInput())
    expect(audit.completeBasketRateBasisPoints).toBe(8333)
    expect(() => validateCompilerAuditAgainstSnapshot(snapshot, audit)).not.toThrow()
    const wrongBasket = structuredClone(audit)
    wrongBasket.completeBasketRateBasisPoints += 1
    expect(() => validateCompilerAuditAgainstSnapshot(snapshot, wrongBasket)).toThrow()
    const wrongMatrix = structuredClone(audit)
    wrongMatrix.evidenceStatusCounts.missing += 1
    wrongMatrix.eligibleLineRateBasisPoints = Math.floor(
      wrongMatrix.evidenceStatusCounts.eligible * 10_000 /
      Object.values(wrongMatrix.evidenceStatusCounts).reduce((sum, count) => sum + count, 0)
    )
    expect(() => validateCompilerAuditAgainstSnapshot(snapshot, wrongMatrix)).toThrow()
  })

  // Break caught: collection consults old dispositions or emits flags that differ from final compilation.
  it('collects the same complete flags while binding the review-input identity', () => {
    const input = makeCompilerInput()
    const { effectiveInputSha256: _effectiveInputSha256, reviewInputSha256, contentDigests, content, ...shared } = input
    const collection = collectQualityReviewBasis({
      ...shared,
      reviewInputSha256,
      inputDigests: {
        microzones: contentDigests.microzones,
        premises: contentDigests.premises,
        items: contentDigests.items
      },
      content: { microzones: content.microzones, premises: content.premises, items: content.items }
    })
    const final = compilePilot(input)
    expect(collection.basis.qualityFlags).toEqual(final.audit.qualityFlags)
    expect(collection.audit.qualityFlags).toEqual(final.audit.qualityFlags)
    expect(collection.audit.unreviewedQualityFlags).toEqual(final.audit.qualityFlags)
    expect(collection.audit.qualityReviewDispositionCount).toBe(0)
    expect(collection.audit.reviewInputSha256).toBe('7'.repeat(64))
    expect(collection.basis.reviewInputSha256).toBe('7'.repeat(64))
  })

  // Break caught: normalized reproduction copies prior outputs or loses a retained row instead of recomputing byte-equivalent artifacts.
  it('recomputes canonical-byte-equivalent snapshot and audit from the normalized slice', () => {
    const first = compilePilot(makeCompilerInput())
    const reproduced = compilePilotFromNormalizedSlice({
      slice: first.normalizedSlice,
      parsedContent: fixtureParsedContent(),
      verifiedDigests: fixtureVerifiedDigests()
    })
    expect(canonicalizeCompilerJson(reproduced.snapshot)).toBe(canonicalizeCompilerJson(first.snapshot))
    expect(canonicalizeCompilerJson(reproduced.audit)).toBe(canonicalizeCompilerJson(first.audit))
  })

  // Break caught: reproduction accepts an adapter digest record that no longer matches the committed slice.
  it('rejects a changed verified digest during normalized reproduction', () => {
    const first = compilePilot(makeCompilerInput())
    const verifiedDigests = fixtureVerifiedDigests()
    verifiedDigests.contentDigests.items = 'f'.repeat(64)
    expect(() => compilePilotFromNormalizedSlice({
      slice: first.normalizedSlice,
      parsedContent: fixtureParsedContent(),
      verifiedDigests
    })).toThrow()
  })
})

describe('compiler provenance, chronology, and contextual validation', () => {
  // Break caught: source-row indices remain meaningful after an unsorted source lock changes their authority.
  it('rejects a non-canonical source order even when every row index is consistently remapped', () => {
    const input = makeCompilerInput()
    ;[input.sourceLock.sources[0], input.sourceLock.sources[1]] = [input.sourceLock.sources[1]!, input.sourceLock.sources[0]!]
    input.transactions = input.transactions.map(value => {
      const row = value as ReturnType<typeof pilotRow>
      return { ...row, sourceManifestIndex: row.sourceManifestIndex === 0 ? 1 : 0 }
    })
    const basis = input.content.qualityReviewBasis as any
    const reviews = input.content.qualityReviews as any
    for (const flag of basis.qualityFlags) for (const ref of flag.cell.sourceRows) ref.sourceManifestIndex = 0
    for (const review of reviews.qualityReviews) for (const ref of review.reviewBasis.cell.sourceRows) ref.sourceManifestIndex = 0
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: a microzone can include an unapproved code while still containing the three required approved premises.
  it('rejects extraneous microzone premise codes', () => {
    const input = makeCompilerInput()
    ;(input.content.microzones[0] as any).premiseCodes.push('999')
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: malformed prices outside the joined reference universe disappear from the full-input invalid counter.
  it('counts malformed prices before unknown-code and reference-universe exclusion', () => {
    const baseline = compilePilot(makeCompilerInput())
    const invalidUnknown = { ...pilotRow('2026-08-02'), item_code: '999', price: 'broken' }
    const mutated = compilePilot(makeCompilerInput({ extraRows: [invalidUnknown] }))
    expect(mutated.audit.invalidRowCount).toBe(baseline.audit.invalidRowCount + 1)
    expect(mutated.audit.unknownItemCodes).toEqual({ '999': 2 })
    expect(mutated.normalizedSlice.referenceRows).toEqual(baseline.normalizedSlice.referenceRows)
    expect(mutated.normalizedSlice.pilotRows).toEqual(baseline.normalizedSlice.pilotRows)
  })

  // Break caught: audit rate fields can disagree with their literal status-count denominator.
  it('rejects an audit whose eligible-line rate is inconsistent with status counts', () => {
    const audit = structuredClone(compilePilot(makeCompilerInput()).audit)
    audit.eligibleLineRateBasisPoints += 1
    expect(CompilerAuditV1Schema.safeParse(audit).success).toBe(false)
  })

  // Break caught: source evidence binds only the cell key, allowing fabricated conflict prices for real rows.
  it('binds audit evidence values to the exact retained source rows', () => {
    const compiled = compilePilot(makeCompilerInput())
    const audit = structuredClone(compiled.audit)
    const conflict = audit.rejectedCells.find(cell => cell.reason === 'conflicting-duplicate')!
    if (conflict.reason === 'conflicting-duplicate') conflict.pricesSen = [1000, 9999]
    expect(() => validateSourceRowProvenance({
      sourceLock: compiled.normalizedSlice.sourceLock,
      normalizedSlice: compiled.normalizedSlice,
      audit
    })).toThrow()
  })

  // Break caught: malformed row provenance reaches compilation, collection, or reproduction as if adapter-attested.
  it.each([
    ['negative index', (input: any) => { input.transactions[0].sourceManifestIndex = -1 }],
    ['too-large index', (input: any) => { input.transactions[0].sourceManifestIndex = 99 }],
    ['lookup index', (input: any) => { input.transactions[0].sourceManifestIndex = 2 }],
    ['wrong month', (input: any) => { input.transactions[0].sourceManifestIndex = 1 }],
    ['row zero', (input: any) => { input.transactions[0].rowNumber = 0 }],
    ['row above manifest count', (input: any) => { input.transactions[0].rowNumber = 999999 }],
    ['duplicate source ref', (input: any) => { input.transactions[1].rowNumber = input.transactions[0].rowNumber }]
  ])('rejects %s provenance at the primary boundary', (_name, mutate) => {
    const input = makeCompilerInput() as any
    mutate(input)
    expect(() => compilePilot(input)).toThrow()
  })

  it('rechecks provenance at collection and normalized reproduction boundaries', () => {
    const collection = makeCollectionInput() as any
    collection.transactions[0].sourceManifestIndex = 2
    expect(() => collectQualityReviewBasis(collection)).toThrow()

    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice) as any
    slice.pilotRows[0].sourceManifestIndex = 2
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: a valid date with an invalid code bypasses manifest-month provenance checking.
  it.each([
    ['primary compilation', (input: CompilePilotInput) => compilePilot(input)],
    ['audit-only collection', (input: CompilePilotInput) => collectQualityReviewBasis(makeCollectionInput(input))]
  ])('checks manifest month before invalid-code exclusion in %s', (_name, run) => {
    const input = makeCompilerInput()
    const augustSource = input.sourceLock.sources[1]!
    augustSource.manifest.rowCount += 1
    input.transactions.push({
      date: '2026-07-15', premise_code: 'invalid-code', item_code: '10', price: '10.00',
      sourceManifestIndex: 1, rowNumber: augustSource.manifest.rowCount
    })
    expect(() => run(input)).toThrow()
  })

  // Break caught: one chronology relation is checked only in primary compilation, or equality-at-expiry is rejected.
  it('enforces source, review, verification, expiry, and disposition chronology', () => {
    const retrievedLate = makeCompilerInput()
    retrievedLate.sourceLock.sources[0]!.manifest.retrievedAt = '2026-08-03T05:00:00.000Z'
    expect(() => compilePilot(retrievedLate)).toThrow()

    const accessedLate = makeCompilerInput()
    ;(accessedLate.content.premises[0] as any).reviews[0].sources[0].accessedOn = '2026-08-02'
    expect(() => compilePilot(accessedLate)).toThrow()

    const verifiedWrong = structuredClone(makeCompilerInput().content.premises[0]) as any
    verifiedWrong.verifiedOn = '2026-08-01'
    expect(PrivatePremiseReviewSchema.safeParse(verifiedWrong).success).toBe(false)

    const expiryWrong = structuredClone(makeCompilerInput().content.premises[0]) as any
    expiryWrong.verificationExpiresOn = '2026-10-30'
    expect(PrivatePremiseReviewSchema.safeParse(expiryWrong).success).toBe(false)

    const disposition = structuredClone((makeCompilerInput().content.qualityReviews as any).qualityReviews[0])
    disposition.reviewedOn = '2026-08-01'
    expect(QualityReviewDispositionSchema.safeParse(disposition).success).toBe(false)

    const expiryAtCompileDate = makeCompilerInput()
    const premise = expiryAtCompileDate.content.premises[0] as any
    premise.reviews[0].reviewedOn = '2026-05-04'
    premise.reviews[1].reviewedOn = '2026-05-05'
    premise.reviews.flatMap((review: any) => review.sources).forEach((source: any) => { source.accessedOn = '2026-05-04' })
    premise.verifiedOn = '2026-05-05'
    premise.verificationExpiresOn = '2026-08-03'
    expect(() => compilePilot(expiryAtCompileDate)).not.toThrow()
  })

  // Break caught: ISO instants are ordered lexically, which misorders equal or adjacent mixed fractional precisions.
  it('orders source retrieval and compilation by epoch across fractional precision', () => {
    const retrievedLater = makeCompilerInput()
    retrievedLater.compiledAt = '2026-08-03T04:00:00Z'
    ;(retrievedLater.content.qualityReviewBasis as any).compiledAt = retrievedLater.compiledAt
    retrievedLater.sourceLock.sources[0]!.manifest.retrievedAt = '2026-08-03T04:00:00.001Z'
    expect(() => compilePilot(retrievedLater)).toThrow()

    const sameInstant = makeCompilerInput()
    sameInstant.compiledAt = '2026-08-03T04:00:00.100Z'
    ;(sameInstant.content.qualityReviewBasis as any).compiledAt = sameInstant.compiledAt
    sameInstant.sourceLock.sources[0]!.manifest.retrievedAt = '2026-08-03T04:00:00.1Z'
    expect(() => compilePilot(sameInstant)).not.toThrow()
  })

  // Break caught: final compilation or reproduction accepts a basis collected from a different non-review input identity.
  it('binds reviewInputSha256 in primary and normalized reproduction', () => {
    const input = makeCompilerInput()
    ;(input.content.qualityReviewBasis as any).reviewInputSha256 = 'f'.repeat(64)
    expect(() => compilePilot(input)).toThrow()

    const compiled = compilePilot(makeCompilerInput())
    const verified = fixtureVerifiedDigests()
    verified.reviewInputSha256 = 'f'.repeat(64)
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent: fixtureParsedContent(),
      verifiedDigests: verified
    })).toThrow()
  })

  // Break caught: final accepted reviews permit one or three reviewers or duplicate reviewer IDs per entity.
  it('requires exactly two distinct reviewers for premise, item, and disposition decisions', () => {
    const input = makeCompilerInput()
    for (const value of [input.content.premises[0], input.content.items[0]] as any[]) {
      const one = structuredClone(value); one.reviews.pop()
      const three = structuredClone(value); three.reviews.push({ ...three.reviews[1], reviewerId: 'reviewer-c' })
      const duplicate = structuredClone(value); duplicate.reviews[1].reviewerId = duplicate.reviews[0].reviewerId
      const schema = value.code === '10' ? PrivateItemReviewSchema : PrivatePremiseReviewSchema
      expect(schema.safeParse(one).success).toBe(false)
      expect(schema.safeParse(three).success).toBe(false)
      expect(schema.safeParse(duplicate).success).toBe(false)
    }
    const disposition = (input.content.qualityReviews as any).qualityReviews[0]
    const three = structuredClone(disposition); three.reviews.push({ ...three.reviews[1], reviewerId: 'reviewer-c' })
    expect(QualityReviewDispositionSchema.safeParse(three).success).toBe(false)
  })

  // Break caught: reviewer array order leaks into compiler artifacts even though reviewer identity is a set-level decision.
  it('is byte-stable when every two-review array is reversed', () => {
    const baseline = compilePilot(makeCompilerInput())
    const input = makeCompilerInput()
    for (const premise of input.content.premises as any[]) premise.reviews.reverse()
    for (const item of input.content.items as any[]) item.reviews.reverse()
    for (const disposition of (input.content.qualityReviews as any).qualityReviews) disposition.reviews.reverse()
    const reversed = compilePilot(input)
    expect(canonicalizeCompilerJson(reversed.snapshot)).toBe(canonicalizeCompilerJson(baseline.snapshot))
    expect(canonicalizeCompilerJson(reversed.audit)).toBe(canonicalizeCompilerJson(baseline.audit))
    expect(canonicalizeCompilerJson(reversed.normalizedSlice)).toBe(canonicalizeCompilerJson(baseline.normalizedSlice))
  })
})

describe('compiler lookup, cutoff, and retained-count invariants', () => {
  // Break caught: canonical 2 and 2.0 lookup rows either duplicate outputs or hide a conflicting authoritative field.
  it('collapses normalized lookup duplicates and rejects canonical-code conflicts', () => {
    const baseline = compilePilot(makeCompilerInput())
    const exact = makeCompilerInput()
    exact.premiseLookups.push({ ...(exact.premiseLookups[1] as any), premise_code: '2.0', state: '  SELANGOR ' })
    exact.itemLookups.push({ ...(exact.itemLookups[0] as any), item_code: '10.0', item: ' FIXTURE  ITEM ' })
    const collapsed = compilePilot(exact)
    expect(collapsed.normalizedSlice.premiseLookups).toHaveLength(20)
    expect(collapsed.normalizedSlice.itemLookups).toHaveLength(1)
    expect(canonicalizeCompilerJson(collapsed.snapshot)).toBe(canonicalizeCompilerJson(baseline.snapshot))

    for (const [kind, field] of [
      ['premise', 'state'], ['premise', 'address'], ['premise', 'premise_type'],
      ['item', 'unit'], ['item', 'item_group'], ['item', 'item_category']
    ] as const) {
      const input = makeCompilerInput()
      if (kind === 'premise') input.premiseLookups.push({ ...(input.premiseLookups[1] as any), premise_code: '2.0', [field]: 'conflict' })
      else input.itemLookups.push({ ...(input.itemLookups[0] as any), item_code: '10.0', [field]: 'conflict' })
      expect(() => compilePilot(input), `${kind} ${field}`).toThrow()
    }
  })

  // Break caught: absent optional item group/category values reach non-empty token normalization and cannot reproduce.
  it('maps absent optional item lookup fields to stable empty strings in primary and reproduction', () => {
    const input = makeCompilerInput()
    delete (input.itemLookups[0] as any).item_group
    delete (input.itemLookups[0] as any).item_category
    input.itemLookups.push({
      item_code: '10.0', item: 'Fixture Item', unit: 'each',
      item_group: ' \u00a0 ', item_category: '\u2003'
    })
    const compiled = compilePilot(input)
    expect(compiled.normalizedSlice.itemLookups).toEqual([{
      code: '10', name: 'Fixture Item', unit: 'each', itemGroup: '', itemCategory: ''
    }])
    const reproduced = compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent: fixtureParsedContent(),
      verifiedDigests: fixtureVerifiedDigests()
    })
    expect(canonicalizeCompilerJson(reproduced.audit)).toBe(canonicalizeCompilerJson(compiled.audit))

    const controlled = makeCompilerInput()
    ;(controlled.itemLookups[0] as any).item_group = '\u0007'
    expect(() => compilePilot(controlled)).toThrow()
  })

  // Break caught: future unknown rows alter retained artifacts or overlap the disjoint through/future counters.
  it('audits a future unknown code without changing retained rows or the public snapshot', () => {
    const baseline = compilePilot(makeCompilerInput())
    const futureUnknown = { ...pilotRow('2026-08-04'), item_code: '999' }
    const mutated = compilePilot(makeCompilerInput({ extraRows: [futureUnknown] }))
    expect(mutated.audit.futureRowCount).toBe(1)
    expect(mutated.audit.afterThroughRowCount).toBe(0)
    expect(mutated.audit.unknownItemCodes).toEqual({ '999': 2 })
    expect(mutated.normalizedSlice.referenceRows).toEqual(baseline.normalizedSlice.referenceRows)
    expect(mutated.normalizedSlice.pilotRows).toEqual(baseline.normalizedSlice.pilotRows)
    expect(mutated.snapshot.dataAsOfDate).toBe(baseline.snapshot.dataAsOfDate)
    expect(mutated.snapshot.premises).toEqual(baseline.snapshot.premises)
    expect(mutated.snapshot.items).toEqual(baseline.snapshot.items)
    expect(mutated.snapshot.evidence).toEqual(baseline.snapshot.evidence)
  })

  // Break caught: duplicate/conflict rows outside retained windows contaminate retained counts or fail pure reproduction.
  it('keeps retained counts invariant for out-of-window duplicate conflicts', () => {
    const baseline = compilePilot(makeCompilerInput())
    const first = referenceOnlyRow('2026-08-03')
    const second = { ...referenceOnlyRow('2026-08-03'), price: '11.00' }
    const mutated = compilePilot(makeCompilerInput({ extraRows: [first, first, second] }))
    expect({
      referenceRowCount: mutated.audit.referenceRowCount,
      pilotRowCount: mutated.audit.pilotRowCount,
      exactDuplicateCount: mutated.audit.exactDuplicateCount,
      conflictingCellCount: mutated.audit.conflictingCellCount
    }).toEqual({
      referenceRowCount: baseline.audit.referenceRowCount,
      pilotRowCount: baseline.audit.pilotRowCount,
      exactDuplicateCount: baseline.audit.exactDuplicateCount,
      conflictingCellCount: baseline.audit.conflictingCellCount
    })
    const reproduced = compilePilotFromNormalizedSlice({
      slice: mutated.normalizedSlice,
      parsedContent: fixtureParsedContent(),
      verifiedDigests: fixtureVerifiedDigests()
    })
    expect(canonicalizeCompilerJson(reproduced.audit)).toBe(canonicalizeCompilerJson(mutated.audit))
  })

  // Break caught: an invalid target-date price advances the compiler horizon despite having no safe positive price.
  it('does not let an invalid cutoff-date price advance dataAsOfDate', () => {
    const input = makeCompilerInput({ extraRows: [{ ...pilotRow('2026-08-03'), price: 'broken' }] })
    input.throughDate = '2026-08-03'
    input.sourceLock.throughDate = '2026-08-03'
    input.sourceLock.analysisStartDate = '2026-07-03'
    ;(input.content.qualityReviewBasis as any).throughDate = '2026-08-03'
    const compiled = compilePilot(input)
    expect(compiled.snapshot.dataAsOfDate).toBe('2026-08-02')
    expect(compiled.audit.invalidRowCount).toBe(1)
  })
})

describe('desk-demo compiler gates', () => {
  // Break caught: compiler uses only bootstrap-exact feasibility locks, or accepts a one-day-short lock.
  it('accepts exact and earlier feasibility locks but rejects one-day-short coverage', () => {
    expect(() => compilePilot(makeDeskCompilerInput('2026-06-04'))).not.toThrow()
    expect(() => compilePilot(makeDeskCompilerInput('2026-06-03'))).not.toThrow()
    expect(() => compilePilot(makeDeskCompilerInput('2026-06-05'))).toThrow()
  })

  // Break caught: fixture mode smuggles desk reports/policy or uses a non-exact public lock.
  it('keeps fixture and desk mode inputs mutually exclusive', () => {
    const fixtureWithPolicy = makeCompilerInput() as any
    fixtureWithPolicy.reviewHostPolicy = { version: '2026-08-03-v1', retailerHosts: ['locator.example'] }
    fixtureWithPolicy.reviewHostPolicySha256 = 'b'.repeat(64)
    expect(() => compilePilot(fixtureWithPolicy)).toThrow()
    const wrongPublicStart = makeCompilerInput()
    wrongPublicStart.sourceLock.analysisStartDate = '2026-07-01'
    expect(() => compilePilot(wrongPublicStart)).toThrow()
  })

  // Break caught: publication mode is bound to lock window but not to synthetic versus official source kind.
  it('binds fixture to synthetic locks and desk-demo to official locks at every boundary', () => {
    const officialFixture = makeCompilerInput() as any
    officialFixture.sourceLock.sourceKind = 'official'
    for (const source of officialFixture.sourceLock.sources) {
      source.manifest.url = source.role === 'transactions'
        ? `https://storage.data.gov.my/pricecatcher/pricecatcher_${source.yearMonth}.csv`
        : source.role === 'premise-lookup'
          ? 'https://storage.data.gov.my/pricecatcher/lookup_premise.csv'
          : 'https://storage.data.gov.my/pricecatcher/lookup_item.csv'
    }
    expect(() => compilePilot(officialFixture)).toThrow()

    const syntheticDesk = makeDeskCompilerInput() as any
    syntheticDesk.sourceLock.sourceKind = 'synthetic-fixture'
    syntheticDesk.sourceLock.sources.forEach((source: any, index: number) => {
      source.manifest.url = `https://source-${index}.fixture.test/source.csv`
    })
    expect(() => collectQualityReviewBasis(makeCollectionInput(syntheticDesk))).toThrow()

    const fixtureSlice = structuredClone(compilePilot(makeCompilerInput()).normalizedSlice) as any
    fixtureSlice.sourceLock = structuredClone(officialFixture.sourceLock)
    expect(NormalizedSourceSliceV1Schema.safeParse(fixtureSlice).success).toBe(false)

    const deskSlice = structuredClone(compilePilot(makeDeskCompilerInput()).normalizedSlice) as any
    deskSlice.sourceLock = structuredClone(syntheticDesk.sourceLock)
    expect(NormalizedSourceSliceV1Schema.safeParse(deskSlice).success).toBe(false)
  })

  // Break caught: desk output ignores report pass/date/hash/transform bindings.
  it.each([
    ['coverage pass', (input: any) => { input.content.coverageReport.passesCoverageCandidateGate = false }],
    ['coverage lock hash', (input: any) => { input.content.coverageReport.sourceLockSha256 = 'f'.repeat(64) }],
    ['feasibility coverage hash', (input: any) => { input.content.feasibilityReport.coverageReportSha256 = 'f'.repeat(64) }],
    ['transform', (input: any) => { input.content.coverageReport.transformVersion = '0.9.0' }],
    ['compiler as-of date', (input: any) => { input.content.coverageReport.dataAsOfDate = '2026-08-01' }]
  ])('rejects a mismatched desk %s binding', (_name, mutate) => {
    const input = makeDeskCompilerInput() as any
    mutate(input)
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: normalized desk reproduction skips the report gates or loses policy/digest context.
  it('reproduces desk artifacts only with both bound reports and policy digest', () => {
    const input = makeDeskCompilerInput()
    const compiled = compilePilot(input)
    const parsedContent = { ...structuredClone(input.content), reviewHostPolicy: structuredClone(input.reviewHostPolicy) }
    delete (parsedContent as any).coverageReport
    delete (parsedContent as any).feasibilityReport
    const verifiedDigests = {
      sourceLockSha256: input.sourceLockSha256,
      effectiveInputSha256: input.effectiveInputSha256,
      reviewInputSha256: input.reviewInputSha256,
      reviewHostPolicySha256: input.reviewHostPolicySha256,
      contentDigests: structuredClone(input.contentDigests)
    }
    const reproduced = compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent,
      parsedCoverageReport: input.content.coverageReport,
      parsedFeasibilityReport: input.content.feasibilityReport,
      verifiedDigests
    })
    expect(canonicalizeCompilerJson(reproduced.snapshot)).toBe(canonicalizeCompilerJson(compiled.snapshot))
    const changed = structuredClone(input.content.coverageReport) as any
    changed.passesCoverageCandidateGate = false
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent,
      parsedCoverageReport: changed,
      parsedFeasibilityReport: input.content.feasibilityReport,
      verifiedDigests
    })).toThrow()
  })

  // Break caught: normalized reproduction accepts a policy digest record that differs from the committed slice.
  it('rejects a mismatched review-host-policy digest record during reproduction', () => {
    const input = makeDeskCompilerInput()
    const compiled = compilePilot(input)
    const parsedContent = { ...structuredClone(input.content), reviewHostPolicy: structuredClone(input.reviewHostPolicy) }
    delete (parsedContent as any).coverageReport
    delete (parsedContent as any).feasibilityReport
    const verifiedDigests = {
      sourceLockSha256: input.sourceLockSha256,
      effectiveInputSha256: input.effectiveInputSha256,
      reviewInputSha256: input.reviewInputSha256,
      reviewHostPolicySha256: 'c'.repeat(64),
      contentDigests: structuredClone(input.contentDigests)
    }
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent,
      parsedCoverageReport: input.content.coverageReport,
      parsedFeasibilityReport: input.content.feasibilityReport,
      verifiedDigests
    })).toThrow()
  })
})

describe('compiler review-source mode negatives', () => {
  // Break caught: source diversity is counted by array length while duplicate URLs satisfy the two-source gate.
  it('rejects duplicate review URLs', () => {
    const input = makeCompilerInput()
    const review = (input.content.premises[0] as any).reviews[0]
    review.sources[1].url = review.sources[0].url
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: desk review accepts two official records without an independent coordinate-bearing source.
  it('rejects two KPDN-only sources and a missing official record', () => {
    const kpdnOnly = makeDeskCompilerInput()
    const review = (kpdnOnly.content.premises[0] as any).reviews[0]
    review.sources[1] = {
      ...review.sources[0], url: 'https://records.kpdn.gov.my/location'
    }
    expect(() => compilePilot(kpdnOnly)).toThrow()

    const coordinateOnly = makeDeskCompilerInput()
    ;(coordinateOnly as any).reviewHostPolicy.retailerHosts = ['locator.example', 'locator2.example']
    const coordinateReview = (coordinateOnly.content.premises[0] as any).reviews[0]
    coordinateReview.sources = [
      { ...coordinateReview.sources[1], url: 'https://locator.example/a' },
      { ...coordinateReview.sources[1], url: 'https://locator2.example/b' }
    ]
    expect(() => compilePilot(coordinateOnly)).toThrow()
  })

  // Break caught: attribution/redistribution mismatch or official evidence leaks into fixture mode.
  it('rejects wrong OSM redistribution and mixed fixture attribution', () => {
    const osm = makeDeskCompilerInput()
    const source = (osm.content.premises[0] as any).reviews[0].sources[1]
    source.url = 'https://openstreetmap.org/node/1'
    source.attributionCode = 'openstreetmap-contributors'
    source.redistribution = 'official-use-permitted'
    expect(() => compilePilot(osm)).toThrow()

    const mixed = makeCompilerInput()
    const fixtureSource = (mixed.content.premises[0] as any).reviews[0].sources[0]
    fixtureSource.url = 'https://data.gov.my/data-catalogue/pricecatcher'
    fixtureSource.attributionCode = 'kpdn-official-record'
    fixtureSource.redistribution = 'cc-by-4.0'
    expect(() => compilePilot(mixed)).toThrow()
  })

  // Break caught: closure and entrance reconciliation checks are omitted after host validation succeeds.
  it('rejects a closed review and reviewer entrances over 30 metres apart', () => {
    const closed = makeCompilerInput()
    ;(closed.content.premises[0] as any).reviews[0].closureSignal = 'closed'
    expect(() => compilePilot(closed)).toThrow()

    const distant = makeCompilerInput()
    ;(distant.content.premises[0] as any).reviews[1].entranceLatitude += 0.01
    expect(() => compilePilot(distant)).toThrow()
  })

  // Break caught: reviewer uniqueness is incorrectly global, rejecting the expected A/B pseudonym reuse across entities.
  it('allows the same two pseudonyms to review distinct entities', () => {
    expect(() => compilePilot(makeCompilerInput())).not.toThrow()
    expect((makeCompilerInput().content.premises as any[]).every(premise =>
      premise.reviews.map((review: any) => review.reviewerId).join('|') === 'reviewer-a|reviewer-b'
    )).toBe(true)
  })

  // Break caught: normalized qualifier reconciliation admits duplicate canonical keys or unequal key sets.
  it('rejects duplicate and unequal normalized qualifier keys', () => {
    const duplicate = makeCompilerInput()
    ;(duplicate.content.items[0] as any).qualifiers = ['standard', ' STANDARD ']
    expect(() => compilePilot(duplicate)).toThrow()
    const unequal = makeCompilerInput()
    ;(unequal.content.items[0] as any).reviews[1].qualifiers = ['different']
    expect(() => compilePilot(unequal)).toThrow()
  })
})

describe('quality basis and disposition bindings', () => {
  // Break caught: the complete wrapper's adapter-attested basis digest is ignored in primary or reproduction.
  it('rejects the wrong quality-basis wrapper hash in primary and reproduction', () => {
    const primary = makeCompilerInput()
    ;(primary.content.qualityReviews as any).qualityReviewBasisSha256 = 'f'.repeat(64)
    expect(() => compilePilot(primary)).toThrow()

    const compiled = compilePilot(makeCompilerInput())
    const parsedContent = fixtureParsedContent()
    ;(parsedContent.qualityReviews as any).qualityReviewBasisSha256 = 'f'.repeat(64)
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice, parsedContent, verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: dispositions may omit, add, or reuse a stale same-key basis whose evidence changed.
  it.each([
    ['missing', (input: any) => { input.content.qualityReviews.qualityReviews = [] }],
    ['extra', (input: any) => {
      const extra = structuredClone(input.content.qualityReviews.qualityReviews[0])
      extra.reviewBasis.cell.premiseCode = '3'
      input.content.qualityReviews.qualityReviews.push(extra)
    }],
    ['changed evidence', (input: any) => {
      input.content.qualityReviewBasis.qualityFlags[0].cell.pricesSen = [1000, 1200]
      input.content.qualityReviews.qualityReviews[0].reviewBasis.cell.pricesSen = [1000, 1200]
    }]
  ])('rejects a %s disposition set', (_name, mutate) => {
    const input = makeCompilerInput() as any
    mutate(input)
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: audit flags drift from rejected/eligible-low evidence or unreviewed flags cease to be a subset.
  it('rejects inconsistent audit quality flag sets', () => {
    const audit = structuredClone(compilePilot(makeCompilerInput()).audit)
    audit.qualityFlags = []
    expect(CompilerAuditV1Schema.safeParse(audit).success).toBe(false)
    const extra = structuredClone(compilePilot(makeCompilerInput()).audit)
    extra.unreviewedQualityFlags = [extra.qualityFlags[0]!]
    expect(CompilerAuditV1Schema.safeParse(extra).success).toBe(false)
  })

  // Break caught: collection review identity changes flags or non-review audit fields instead of only bound metadata.
  it('keeps collection flags stable when only reviewInputSha256 changes', () => {
    const first = collectQualityReviewBasis(makeCollectionInput())
    const changedInput = makeCollectionInput() as any
    changedInput.reviewInputSha256 = 'f'.repeat(64)
    const second = collectQualityReviewBasis(changedInput)
    expect(second.basis.qualityFlags).toEqual(first.basis.qualityFlags)
    expect(second.audit.qualityFlags).toEqual(first.audit.qualityFlags)
    const { reviewInputSha256: _firstReview, ...firstAudit } = first.audit
    const { reviewInputSha256: _secondReview, ...secondAudit } = second.audit
    expect(secondAudit).toEqual(firstAudit)
  })
})

describe('contextual chronology and reference eligibility', () => {
  // Break caught: future review dates or a future compiler cutoff pass one of the primary chronology branches.
  it('rejects future premise, item, nested-quality, and through dates', () => {
    for (const mutate of [
      (input: any) => { input.content.premises[0].reviews[1].reviewedOn = '2026-08-04' },
      (input: any) => { input.content.items[0].reviews[1].reviewedOn = '2026-08-04' },
      (input: any) => { input.content.qualityReviews.qualityReviews[0].reviews[1].reviewedOn = '2026-08-04'; input.content.qualityReviews.qualityReviews[0].reviewedOn = '2026-08-04' },
      (input: any) => { input.throughDate = '2026-08-04'; input.sourceLock.throughDate = '2026-08-04'; input.sourceLock.analysisStartDate = '2026-07-04'; input.content.qualityReviewBasis.throughDate = '2026-08-04' }
    ]) {
      const input = makeCompilerInput() as any
      mutate(input)
      expect(() => compilePilot(input)).toThrow()
    }
  })

  // Break caught: normalized reproduction skips source-retrieval and private-review chronology rechecks.
  it('rechecks source and private chronology during normalized reproduction', () => {
    const compiled = compilePilot(makeCompilerInput())
    const lateSourceSlice = structuredClone(compiled.normalizedSlice)
    lateSourceSlice.sourceLock.sources[0]!.manifest.retrievedAt = '2026-08-03T05:00:00.000Z'
    expect(() => compilePilotFromNormalizedSlice({
      slice: lateSourceSlice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()

    const content = fixtureParsedContent()
    ;(content.premises[0] as any).reviews[1].reviewedOn = '2026-08-04'
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice, parsedContent: content, verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: premise eligibility is inferred from names or broad market categories instead of exact normalized official types.
  it('accepts exact allowed type variants and excludes Pasar Basah', () => {
    const allowed = makeCompilerInput()
    const variants = [' Hypermarket ', 'KEDAI RUNCIT', 'Kedai\u00a0Serbaneka', 'Pasar Mini', 'Pasar Raya / Supermarket']
    for (const [index, row] of allowed.premiseLookups.entries()) (row as any).premise_type = variants[index % variants.length]
    for (const premise of allowed.content.premises as any[]) {
      premise.premiseType = (allowed.premiseLookups[Number(premise.code) - 1] as any).premise_type
    }
    const allowedAudit = collectQualityReviewBasis(makeCollectionInput(allowed)).audit
    expect(allowedAudit.referenceRowCount).toBe(620)

    const excluded = makeCompilerInput()
    ;(excluded.premiseLookups[19] as any).premise_type = 'Pasar Basah'
    const excludedAudit = collectQualityReviewBasis(makeCollectionInput(excluded)).audit
    expect(excludedAudit.referenceRowCount).toBe(589)
    expect(excludedAudit.degenerateReferenceItemCodes).toEqual(['10'])
  })

  // Break caught: normalized-equivalent curated unit display is used as a raw target-cell join key, materializing every cell as missing.
  it('joins target cells independently of curated unit display formatting', () => {
    const input = makeCompilerInput()
    ;(input.content.items[0] as any).officialUnit = ' EACH '
    const compiled = compilePilot(input)
    expect(compiled.snapshot.items[0]!.officialUnit).toBe(' EACH ')
    expect(compiled.snapshot.evidence[0]!.observations.map(row => row.status)).toEqual(['eligible', 'eligible'])
    expect(compiled.audit.conflictingCellCount).toBe(1)
  })
})

describe('duplicate-count overlap', () => {
  // Break caught: exact duplicates and conflicting cells are forced into disjoint counters.
  it.each([
    [[500, 500, 1500], { exactDuplicateCount: 1, conflictingCellCount: 1 }],
    [[500, 1500], { exactDuplicateCount: 0, conflictingCellCount: 1 }],
    [[500, 500], { exactDuplicateCount: 1, conflictingCellCount: 0 }]
  ])('counts retained price multiset %j independently', (prices, expected) => {
    const rows = prices.map(priceSen => ({
      observedDate: '2026-08-02', premiseCode: '1', itemCode: '10', officialUnit: 'each', priceSen
    }))
    expect(collapseObservationRows(rows)).toMatchObject(expected)
  })

  // Break caught: valid conflicts override invalid-price poisoning or exact duplicates vanish from the overlapping count.
  it('gives invalid prices status precedence while retaining exact-duplicate count', () => {
    const base = { observedDate: '2026-08-02', premiseCode: '1', itemCode: '10', officialUnit: 'each' }
    const result = collapseObservationRows([
      { ...base, priceSen: 500 }, { ...base, priceSen: 500 }, { ...base, priceSen: 1500 },
      { ...base, status: 'invalid-price' as const, rawPriceValue: 'broken' }
    ])
    expect(result).toMatchObject({ exactDuplicateCount: 1, conflictingCellCount: 0 })
    expect(result.cells[0]).toMatchObject({ status: 'invalid-price' })
  })
})

describe('long invalid-price equality classes', () => {
  const commonPrefix = 'x'.repeat(64)

  // Break caught: pretruncation merges distinct invalid raw prices before exact-duplicate classification.
  it('keeps distinct long raw prices with a common first 64 characters in separate bounded classes', () => {
    const input = attachCollectedQualityReviews(makeCompilerInput({
      extraRows: [
        { ...pilotRow('2026-08-02'), premise_code: '3', price: `${commonPrefix}a` },
        { ...pilotRow('2026-08-02'), premise_code: '3', price: `${commonPrefix}b` },
        { ...pilotRow('2026-08-02'), premise_code: '3', price: `${'x'.repeat(62)}~0` }
      ]
    }))
    const compiled = compilePilot(input)
    const invalid = compiled.audit.rejectedCells.find(cell =>
      cell.reason === 'invalid-price' && cell.premiseCode === '3' && cell.observedDate === '2026-08-02'
    )!
    expect(compiled.audit.exactDuplicateCount).toBe(0)
    expect(invalid.reason).toBe('invalid-price')
    if (invalid.reason !== 'invalid-price') throw new Error('expected invalid-price evidence')
    expect(invalid.rawPriceValues).toHaveLength(3)
    expect(new Set(invalid.rawPriceValues).size).toBe(3)
    expect(invalid.rawPriceValues.every(value => value.length <= 64)).toBe(true)
    const retained = compiled.normalizedSlice.rejectedPilotRows.filter(row =>
      row.premiseCode === '3' && row.observedDate === '2026-08-02'
    )
    expect(new Set(retained.map(row => row.rawPriceValue)).size).toBe(3)
    const reproduced = compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice,
      parsedContent: structuredClone(input.content),
      verifiedDigests: fixtureVerifiedDigests()
    })
    expect(canonicalizeCompilerJson(reproduced.audit)).toBe(canonicalizeCompilerJson(compiled.audit))
  })

  // Break caught: collision avoidance assigns different bounded classes to byte-identical long invalid values.
  it('counts identical long raw prices as one exact duplicate', () => {
    const longValue = `${commonPrefix}same`
    const input = attachCollectedQualityReviews(makeCompilerInput({
      extraRows: [
        { ...pilotRow('2026-08-02'), premise_code: '3', price: longValue },
        { ...pilotRow('2026-08-02'), premise_code: '3', price: longValue }
      ]
    }))
    const compiled = compilePilot(input)
    const invalid = compiled.audit.rejectedCells.find(cell =>
      cell.reason === 'invalid-price' && cell.premiseCode === '3' && cell.observedDate === '2026-08-02'
    )!
    expect(compiled.audit.exactDuplicateCount).toBe(1)
    if (invalid.reason !== 'invalid-price') throw new Error('expected invalid-price evidence')
    expect(invalid.rawPriceValues).toHaveLength(1)
  })
})

describe('cross-boundary provenance mutation matrix', () => {
  // Break caught: collection provenance validation is weaker than final compilation for a specific invalid coordinate.
  it.each([
    ['negative index', (input: any) => { input.transactions[0].sourceManifestIndex = -1 }],
    ['too-large index', (input: any) => { input.transactions[0].sourceManifestIndex = 99 }],
    ['lookup index', (input: any) => { input.transactions[0].sourceManifestIndex = 2 }],
    ['wrong month', (input: any) => { input.transactions[0].sourceManifestIndex = 1 }],
    ['row zero', (input: any) => { input.transactions[0].rowNumber = 0 }],
    ['row above manifest', (input: any) => { input.transactions[0].rowNumber = 999999 }],
    ['duplicate row reference', (input: any) => { input.transactions[1].rowNumber = input.transactions[0].rowNumber }]
  ])('rejects %s during audit-only collection', (_name, mutate) => {
    const input = makeCollectionInput() as any
    mutate(input)
    expect(() => collectQualityReviewBasis(input)).toThrow()
  })

  // Break caught: committed normalized rows bypass source role/month/range validation during pure reproduction.
  it.each([
    ['negative index', (slice: any) => { slice.referenceRows[0].sourceManifestIndex = -1 }],
    ['too-large index', (slice: any) => { slice.referenceRows[0].sourceManifestIndex = 99 }],
    ['lookup index', (slice: any) => { slice.referenceRows[0].sourceManifestIndex = 2 }],
    ['wrong month', (slice: any) => { slice.referenceRows[0].sourceManifestIndex = 1 }],
    ['row zero', (slice: any) => { slice.referenceRows[0].rowNumber = 0 }],
    ['row above manifest', (slice: any) => { slice.referenceRows[0].rowNumber = 999999 }]
  ])('rejects normalized %s during reproduction', (_name, mutate) => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice) as any
    mutate(slice)
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: duplicate, nonexistent, or mismatched-cell evidence refs pass when the enclosing basis key exists.
  it.each([
    ['duplicate ref', (content: any) => {
      content.qualityReviewBasis.qualityFlags[0].cell.sourceRows[1] = structuredClone(content.qualityReviewBasis.qualityFlags[0].cell.sourceRows[0])
      content.qualityReviews.qualityReviews[0].reviewBasis.cell.sourceRows[1] = structuredClone(content.qualityReviews.qualityReviews[0].reviewBasis.cell.sourceRows[0])
    }],
    ['nonexistent ref', (content: any) => {
      content.qualityReviewBasis.qualityFlags[0].cell.sourceRows[1].rowNumber = 999999
      content.qualityReviews.qualityReviews[0].reviewBasis.cell.sourceRows[1].rowNumber = 999999
    }],
    ['mismatched cell', (content: any) => {
      content.qualityReviewBasis.qualityFlags[0].cell.premiseCode = '3'
      content.qualityReviews.qualityReviews[0].reviewBasis.cell.premiseCode = '3'
    }]
  ])('rejects %s in reproduced quality evidence', (_name, mutate) => {
    const compiled = compilePilot(makeCompilerInput())
    const content = fixtureParsedContent() as any
    mutate(content)
    expect(() => compilePilotFromNormalizedSlice({
      slice: compiled.normalizedSlice, parsedContent: content, verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: a committed lookup field can drift while source rows, codes, and adapter digest record remain unchanged.
  it('rejects normalized lookup-field drift during reproduction', () => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    slice.premiseLookups[0]!.address = 'Drifted Address'
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: one manifest row is accepted as both a valid and rejected observation when its cell key is unchanged.
  it('rejects duplicate provenance with a conflicting full normalized row identity', () => {
    const compiled = compilePilot(makeCompilerInput())
    expect(() => validateSourceRowProvenance({
      sourceLock: compiled.normalizedSlice.sourceLock,
      normalizedSlice: compiled.normalizedSlice,
      audit: compiled.audit
    })).not.toThrow()
    const slice = structuredClone(compiled.normalizedSlice)
    const valid = slice.referenceRows[0]!
    slice.rejectedReferenceRows.push({
      observedDate: valid.observedDate, premiseCode: valid.premiseCode, itemCode: valid.itemCode,
      officialUnit: valid.officialUnit, rawPriceValue: 'broken', reason: 'invalid-price',
      sourceManifestIndex: valid.sourceManifestIndex, rowNumber: valid.rowNumber
    })
    expect(() => validateSourceRowProvenance({
      sourceLock: slice.sourceLock, normalizedSlice: slice, audit: compiled.audit
    })).toThrow()
  })
})

describe('normalized-slice semantic reproduction', () => {
  // Break caught: reproduction trusts retained rows that have no authoritative premise lookup.
  it('rejects a reference row whose premise lookup was removed', () => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    slice.premiseLookups = slice.premiseLookups.filter(row => row.code !== '20')
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: retained rows may claim an item that exists in lookup data but is absent from curated pilot content.
  it('rejects a retained reference row outside curated item membership', () => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    slice.itemLookups.push({
      code: '11', name: 'Uncurated Item', unit: 'each', itemGroup: '', itemCategory: ''
    })
    slice.referenceRows[0]!.itemCode = '11'
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: a retained reference row survives lookup state or premise-type drift that makes it ineligible.
  it.each([
    ['state', (lookup: any) => { lookup.state = 'Perak' }],
    ['premise type', (lookup: any) => { lookup.premiseType = 'Pasar Basah' }]
  ])('rejects reference %s drift during reproduction', (_name, mutate) => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    mutate(slice.premiseLookups.find(row => row.code === '20'))
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: target rows can name a reference-only premise and still influence the reproduced slice.
  it('rejects a pilot row outside curated premise membership', () => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    const row = slice.pilotRows.find(candidate =>
      candidate.observedDate === '2026-08-02' && candidate.premiseCode === '3'
    )!
    row.premiseCode = '4'
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: reproduction permits the curated H-1 row to remain in the reference universe after removal from the pilot universe.
  it('requires exact curated reference and pilot overlap on H-1', () => {
    const compiled = compilePilot(makeCompilerInput())
    const slice = structuredClone(compiled.normalizedSlice)
    slice.pilotRows = slice.pilotRows.filter(row => !(
      row.observedDate === '2026-08-01' && row.premiseCode === '3'
    ))
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent: fixtureParsedContent(), verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: rejected H-1 overlap is not checked when the supplied review set is adjusted to the missing pilot row.
  it('requires exact rejected reference and pilot overlap on H-1', () => {
    const input = attachCollectedQualityReviews(makeCompilerInput({
      extraRows: [{ ...pilotRow('2026-08-01'), premise_code: '3', price: 'broken-overlap' }]
    }))
    const compiled = compilePilot(input)
    const slice = structuredClone(compiled.normalizedSlice)
    slice.rejectedPilotRows = slice.rejectedPilotRows.filter(row => !(
      row.observedDate === '2026-08-01' && row.premiseCode === '3'
    ))
    const parsedContent = structuredClone(input.content) as any
    const isRemovedFlag = (flag: any) => flag.flag === 'rejected-cell' &&
      flag.cell.reason === 'invalid-price' && flag.cell.observedDate === '2026-08-01' && flag.cell.premiseCode === '3'
    parsedContent.qualityReviewBasis.qualityFlags = parsedContent.qualityReviewBasis.qualityFlags.filter(
      (flag: any) => !isRemovedFlag(flag)
    )
    parsedContent.qualityReviews.qualityReviews = parsedContent.qualityReviews.qualityReviews.filter(
      (review: any) => !isRemovedFlag(review.reviewBasis)
    )
    expect(() => compilePilotFromNormalizedSlice({
      slice, parsedContent, verifiedDigests: fixtureVerifiedDigests()
    })).toThrow()
  })

  // Break caught: exact official-unit equality is not rechecked for any of the four retained row arrays.
  it.each(['referenceRows', 'pilotRows', 'rejectedReferenceRows', 'rejectedPilotRows'] as const)(
    'rejects official-unit drift in normalized %s', arrayName => {
      const input = attachCollectedQualityReviews(makeCompilerInput({
        extraRows: [
          { ...referenceOnlyRow('2026-07-15'), price: 'broken-reference' },
          { ...pilotRow('2026-08-02'), premise_code: '3', price: 'broken-pilot' }
        ]
      }))
      const compiled = compilePilot(input)
      const slice = structuredClone(compiled.normalizedSlice)
      slice[arrayName][0]!.officialUnit = 'EACH'
      expect(() => compilePilotFromNormalizedSlice({
        slice, parsedContent: structuredClone(input.content), verifiedDigests: fixtureVerifiedDigests()
      })).toThrow()
    }
  )

  // Break caught: duplicate provenance is checked globally for conflicts but not for repetition inside one slice array.
  it.each(['referenceRows', 'pilotRows', 'rejectedReferenceRows', 'rejectedPilotRows'] as const)(
    'rejects duplicate source-row provenance inside %s', arrayName => {
      const input = attachCollectedQualityReviews(makeCompilerInput({
        extraRows: [
          { ...referenceOnlyRow('2026-07-15'), price: 'broken-reference' },
          { ...pilotRow('2026-08-02'), premise_code: '3', price: 'broken-pilot' }
        ]
      }))
      const slice = structuredClone(compilePilot(input).normalizedSlice)
      ;(slice[arrayName] as any[]).push(structuredClone(slice[arrayName][0]!))
      expect(NormalizedSourceSliceV1Schema.safeParse(slice).success).toBe(false)
    }
  )

  // Break caught: the intentional H-1 source-row overlap between reference and pilot arrays is treated as a global duplicate.
  it('allows identical H-1 provenance across the reference and pilot arrays', () => {
    const slice = compilePilot(makeCompilerInput()).normalizedSlice
    const reference = slice.referenceRows.find(row => row.observedDate === '2026-08-01' && row.premiseCode === '1')!
    const pilot = slice.pilotRows.find(row => row.observedDate === '2026-08-01' && row.premiseCode === '1')!
    expect({ sourceManifestIndex: pilot.sourceManifestIndex, rowNumber: pilot.rowNumber }).toEqual({
      sourceManifestIndex: reference.sourceManifestIndex, rowNumber: reference.rowNumber
    })
    expect(NormalizedSourceSliceV1Schema.safeParse(slice).success).toBe(true)
  })
})

describe('desk report pair mutations', () => {
  const shiftDate = (value: string, days: number): string => {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
  }

  // Break caught: a valid rehashed report pair selects the compiler horizon instead of matching its independently derived date.
  it('rejects a schema-valid report pair shifted one date earlier', () => {
    const input = makeDeskCompilerInput() as any
    input.content.coverageReport.dataAsOfDate = '2026-08-01'
    input.content.coverageReport.calibrationDates = input.content.coverageReport.calibrationDates.map((date: string) => shiftDate(date, -1))
    input.content.feasibilityReport.dataAsOfDate = '2026-08-01'
    input.content.feasibilityReport.referenceAndTargetDates = input.content.feasibilityReport.referenceAndTargetDates.map((date: string) => shiftDate(date, -1))
    input.content.feasibilityReport.targetDates = input.content.feasibilityReport.targetDates.map((date: string) => shiftDate(date, -1))
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: Phase-A failure is ignored when the standalone distance report still declares a Phase-B pass.
  it('rejects a valid coverage failure paired with a standalone desk pass', () => {
    const input = makeDeskCompilerInput() as any
    const premise = input.content.coverageReport.premises[0]
    premise.distinctPresenceDates = 9
    premise.dateCoverageBasisPoints = 6428
    premise.nearDaily = false
    input.content.coverageReport.passesCoverageCandidateGate = false
    input.content.coverageReport.failureReasons = ['insufficient-near-daily-premises']
    expect(input.content.feasibilityReport.passesDeskDemoGate).toBe(true)
    expect(() => compilePilot(input)).toThrow()
  })

  // Break caught: a schema-valid Phase-B failure or final-code drift is treated as publishable.
  it('rejects a bound feasibility failure and a final-code mismatch', () => {
    const failed = makeDeskCompilerInput() as any
    const baseline = failed.content.feasibilityReport.microzones[0].baselines[0]
    baseline.completeAlternativeDates = 20
    baseline.completeAlternativeDateBasisPoints = 6666
    failed.content.feasibilityReport.microzones[0].minimumBaselineAlternativeDateBasisPoints = 6666
    failed.content.feasibilityReport.microzones[0].passes = false
    failed.content.feasibilityReport.passesDeskDemoGate = false
    failed.content.feasibilityReport.failureReasons = ['baseline-alternative-rate-below-7000']
    expect(() => compilePilot(failed)).toThrow()

    const drift = makeDeskCompilerInput() as any
    drift.content.feasibilityReport.finalPremiseCodes[9] = '11'
    expect(() => compilePilot(drift)).toThrow()
  })
})
