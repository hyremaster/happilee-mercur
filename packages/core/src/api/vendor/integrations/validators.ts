import { IntegrationSyncStream } from "@mercurjs/types"
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

export type VendorUpdateIntegrationLocationType = z.infer<
  typeof VendorUpdateIntegrationLocation
>
export const VendorUpdateIntegrationLocation = z
  .object({
    stock_location_id: z.string().min(1).nullable(),
  })
  .strict()

export type VendorListIntegrationSyncRunsType = z.infer<
  typeof VendorListIntegrationSyncRuns
>
export const VendorListIntegrationSyncRuns = z.object({
  stream: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type VendorRunIntegrationSyncType = z.infer<typeof VendorRunIntegrationSync>
export const VendorRunIntegrationSync = z
  .object({
    stream: z.nativeEnum(IntegrationSyncStream),
  })
  .strict()
