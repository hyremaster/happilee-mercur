import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type { IntegrationLocationRow } from "../../../modules/integration/service"

export type UpdateIntegrationLocationMappingStepInput = {
  seller_id: string
  provider_id: string
  /** integration_location id */
  location_id: string
  /** Branch (stock location) to map to; null unmaps. */
  stock_location_id: string | null
}

type Compensation = { id: string; stock_location_id: string | null }

/**
 * Map an external location to one of the store's branches, or unmap it.
 * A branch belongs to at most one external location per provider.
 */
export const updateIntegrationLocationMappingStep = createStep(
  "update-integration-location-mapping",
  async (input: UpdateIntegrationLocationMappingStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )

    const [row] = (await service.listIntegrationLocations({
      id: input.location_id,
      seller_id: input.seller_id,
      provider_id: input.provider_id,
    })) as IntegrationLocationRow[]
    if (!row) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Location not found.")
    }

    if (input.stock_location_id) {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: links } = await query.graph({
        entity: "stock_location_seller",
        fields: ["stock_location_id"],
        filters: {
          seller_id: input.seller_id,
          stock_location_id: input.stock_location_id,
        },
      })
      if (!links.length) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Branch not found.")
      }

      const [taken] = (await service.listIntegrationLocations({
        seller_id: input.seller_id,
        provider_id: input.provider_id,
        stock_location_id: input.stock_location_id,
      })) as IntegrationLocationRow[]
      if (taken && taken.id !== row.id) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `This branch is already mapped to "${taken.name}". Unmap it first.`
        )
      }
    }

    const updated = await service.updateIntegrationLocations({
      id: row.id,
      stock_location_id: input.stock_location_id,
    })

    return new StepResponse<IntegrationLocationRow, Compensation>(
      updated as IntegrationLocationRow,
      { id: row.id, stock_location_id: row.stock_location_id ?? null }
    )
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    await service.updateIntegrationLocations(previous)
  }
)
