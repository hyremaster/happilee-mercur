import { ConfirmVariantInventoryWorkflowInputDTO } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { prepareConfirmInventoryInput } from "../utils/prepare-confirm-inventory-input"

export type ValidateOrderFulfilmentStockStepInput = ConfirmVariantInventoryWorkflowInputDTO & {
  /** Item id → the location its order is fulfilled from. */
  routed_locations: Record<string, string>
}

/**
 * Refuse the cart (NOT_ALLOWED, listing the variants) when the chosen shipping
 * option's location can't supply an item, even if another location could.
 * Runs before any order exists, so a refusal has nothing to roll back.
 */
export const validateOrderFulfilmentStockStep = createStep(
  "validate-order-fulfilment-stock",
  (input: ValidateOrderFulfilmentStockStepInput) => {
    prepareConfirmInventoryInput({ input })
    return new StepResponse(void 0)
  }
)
