import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  setVariantAvailabilityStep,
  SetVariantAvailabilityStepInput,
} from "../steps/set-variant-availability"

export const setVariantAvailabilityWorkflowId = "set-variant-availability"

export const setVariantAvailabilityWorkflow = createWorkflow(
  setVariantAvailabilityWorkflowId,
  function (input: SetVariantAvailabilityStepInput) {
    const availability = setVariantAvailabilityStep(input)

    return new WorkflowResponse(availability)
  }
)
