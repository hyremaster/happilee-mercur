import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  createStoreFulfillmentOptionsStep,
  CreateStoreFulfillmentOptionsInput,
} from "../steps/create-store-fulfillment-options"

export const syncStoreFulfillmentOptionsWorkflowId =
  "sync-store-fulfillment-options"

/**
 * Bring an existing store's shipping options in line with its fulfillment
 * methods after they are edited: kinds that were enabled later get their
 * fulfillment set, service zone and shipping option. Safe to re-run — the step
 * only creates what is missing.
 */
export const syncStoreFulfillmentOptionsWorkflow = createWorkflow(
  syncStoreFulfillmentOptionsWorkflowId,
  function (input: CreateStoreFulfillmentOptionsInput) {
    const result = createStoreFulfillmentOptionsStep(input)

    return new WorkflowResponse(result)
  }
)
