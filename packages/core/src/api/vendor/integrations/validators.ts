import { z } from "zod"

const integrationValues = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)

export type VendorSaveIntegrationType = z.infer<typeof VendorSaveIntegration>
export const VendorSaveIntegration = z
  .object({
    label: z.string().max(100).nullish(),
    is_enabled: z.boolean().optional(),
    credentials: integrationValues.optional(),
    settings: integrationValues.optional(),
    test: z.boolean().optional(),
  })
  .strict()

export type VendorTestIntegrationType = z.infer<typeof VendorTestIntegration>
export const VendorTestIntegration = z
  .object({
    credentials: integrationValues.optional(),
    settings: integrationValues.optional(),
  })
  .strict()
