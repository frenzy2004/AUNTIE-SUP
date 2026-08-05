import { z } from 'zod'

export const REVIEW_HOST_POLICY_VERSION = '2026-08-03-v1' as const

const DNS_HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_NUMBER_LABEL_PATTERN = /^(?:0x[0-9a-f]+|\d+)$/i

const isIpv4NumberForm = (host: string): boolean =>
  host.split('.').every(label => IPV4_NUMBER_LABEL_PATTERN.test(label))

const validPolicyHost = (host: string): boolean =>
  host === host.toLowerCase() && DNS_HOST_PATTERN.test(host) && !isIpv4NumberForm(host)

export const ReviewHostPolicyV1Schema = z.object({
  version: z.literal(REVIEW_HOST_POLICY_VERSION),
  retailerHosts: z.array(z.string()).max(256)
}).strict().superRefine((value, context) => {
  const sorted = [...value.retailerHosts].sort()
  if (value.retailerHosts.some(host => !validPolicyHost(host))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['retailerHosts'], message: 'retailer hosts must be lowercase ASCII DNS names' })
  }
  if (new Set(value.retailerHosts).size !== value.retailerHosts.length ||
      value.retailerHosts.some((host, index) => host !== sorted[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['retailerHosts'], message: 'retailer hosts must be sorted and unique' })
  }
})

export type ReviewHostPolicyV1 = z.infer<typeof ReviewHostPolicyV1Schema>

export function extractReviewSourceAuthority(value: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('https://')) return null
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/.exec(value)
  if (!match) return null
  const authority = match[1]!
  if (authority.includes('@') || authority.includes(':') || authority.endsWith('.') || /[^\x00-\x7f]/.test(authority)) return null
  const host = authority.toLowerCase()
  if (!validPolicyHost(host)) return null
  return host
}

interface ReviewPolicySource {
  url: string
  attributionCode: 'kpdn-official-record' | 'official-retailer-locator' | 'openstreetmap-contributors' | 'synthetic-fixture'
  redistribution: 'cc-by-4.0' | 'odbl-1.0' | 'official-use-permitted' | 'synthetic-cc0'
}

export function isReviewSourceAllowedByHostPolicy(input: {
  source: ReviewPolicySource
  publicationMode: 'fixture' | 'desk-demo'
  policy?: ReviewHostPolicyV1
}): boolean {
  const host = extractReviewSourceAuthority(input.source.url)
  if (!host) return false
  if (input.publicationMode === 'fixture') {
    return input.source.attributionCode === 'synthetic-fixture' &&
      input.source.redistribution === 'synthetic-cc0' && host.endsWith('.test')
  }
  if (input.source.attributionCode === 'synthetic-fixture') return false
  if (input.source.attributionCode === 'kpdn-official-record') {
    return input.source.redistribution === 'cc-by-4.0' &&
      (host === 'data.gov.my' || host === 'kpdn.gov.my' || host.endsWith('.kpdn.gov.my'))
  }
  if (input.source.attributionCode === 'openstreetmap-contributors') {
    return input.source.redistribution === 'odbl-1.0' && [
      'openstreetmap.org', 'www.openstreetmap.org', 'nominatim.openstreetmap.org'
    ].includes(host)
  }
  return input.source.redistribution === 'official-use-permitted' &&
    input.policy !== undefined && input.policy.retailerHosts.includes(host)
}
