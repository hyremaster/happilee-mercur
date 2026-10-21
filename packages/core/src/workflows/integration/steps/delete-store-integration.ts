import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"

export type DeleteStoreIntegrationStepInput = {
  seller_id: string
  provider_id: string
}

type Compensation = { id: string; credentials: string | null }

/**
 * Disconnect: wipe the stored credentials, then soft-delete the row.
 * Compensation restores both.
 */
export const deleteStoreIntegrationStep = createStep(
  "delete-store-integration",
  async (input: DeleteStoreIntegrationStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    const row = await service.retrieveSellerIntegration(
      input.seller_id,
      input.provider_id
    )
    if (!row) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `This store has no "${input.provider_id}" integration.`
      )
    }

    await service.updateStoreIntegrations({ id: row.id, credentials: null })
    await service.softDeleteStoreIntegrations(row.id)

    return new StepResponse<{ id: string }, Compensation>(
      { id: row.id },
      { id: row.id, credentials: row.credentials ?? null }
    )
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    await service.restoreStoreIntegrations(previous.id)
    await service.updateStoreIntegrations({
      id: previous.id,
      credentials: previous.credentials,
    })
  }
)
