import { z } from 'zod'
import { CanonicalCodeSchema, ISOInstantSchema, SenSchema } from '../contracts/common'

export const RecommendationInputBaseSchema = z.object({
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
  fuelEfficiencyDeciKmPerL: z.number().int().safe().min(10).max(500).optional(),
  fuelPriceSenPerL: SenSchema.min(1).max(1000).optional(),
  fixedTripCostByPremiseCode: z.record(CanonicalCodeSchema, z.discriminatedUnion('status', [
    z.object({ status: z.literal('confirmed'), amountSen: SenSchema.max(10000) }).strict(),
    z.object({ status: z.literal('unknown') }).strict()
  ])).optional(),
  worthwhileThresholdSen: SenSchema.max(10000).optional()
}).strict()

export const safeParseStagedRecommendationInput = (value: unknown) => RecommendationInputBaseSchema.safeParse(value)
