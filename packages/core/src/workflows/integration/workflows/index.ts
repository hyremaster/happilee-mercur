import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  syncIntegrationLocationsStep,
  SyncIntegrationLocationsStepInput,
} from "../steps/sync-integration-locations"
import {
  updateIntegrationLocationMappingStep,
  UpdateIntegrationLocationMappingStepInput,
} from "../steps/update-integration-location-mapping"
import {
  deleteStoreIntegrationStep,
  DeleteStoreIntegrationStepInput,
} from "../steps/delete-store-integration"
import {
  testStoreIntegrationStep,
  TestStoreIntegrationStepInput,
} from "../steps/test-store-integration"
import {
  upsertStoreIntegrationStep,
  UpsertStoreIntegrationStepInput,
} from "../steps/upsert-store-integration"

export const upsertStoreIntegrationWorkflowId = "upsert-store-integration"

/** Save a store's connection. Input credentials must already be encrypted. */
export const upsertStoreIntegrationWorkflow = createWorkflow(
  upsertStoreIntegrationWorkflowId,
  function (input: UpsertStoreIntegrationStepInput) {
    const saved = upsertStoreIntegrationStep(input)
    return new WorkflowResponse(saved)
  }
)

export const testStoreIntegrationWorkflowId = "test-store-integration"

/** Test a saved connection and record its status. */
export const testStoreIntegrationWorkflow = createWorkflow(
  testStoreIntegrationWorkflowId,
  function (input: TestStoreIntegrationStepInput) {
    const result = testStoreIntegrationStep(input)
    return new WorkflowResponse(result)
  }
)

export const deleteStoreIntegrationWorkflowId = "delete-store-integration"

export const deleteStoreIntegrationWorkflow = createWorkflow(
  deleteStoreIntegrationWorkflowId,
  function (input: DeleteStoreIntegrationStepInput) {
    const deleted = deleteStoreIntegrationStep(input)
    return new WorkflowResponse(deleted)
  }
)

export const syncIntegrationLocationsWorkflowId = "sync-integration-locations"

/**
 * Converge a store's external locations to what the provider reports.
 * Never throws for provider/API failures: the returned run carries the error.
 * `already_running` is true when another sync for the same store/provider
 * holds the lock.
 */
export const syncIntegrationLocationsWorkflow = createWorkflow(
  syncIntegrationLocationsWorkflowId,
  function (input: SyncIntegrationLocationsStepInput) {
    const result = syncIntegrationLocationsStep(input)
    return new WorkflowResponse(result)
  }
)

export const updateIntegrationLocationMappingWorkflowId =
  "update-integration-location-mapping"

export const updateIntegrationLocationMappingWorkflow = createWorkflow(
  updateIntegrationLocationMappingWorkflowId,
  function (input: UpdateIntegrationLocationMappingStepInput) {
    const location = updateIntegrationLocationMappingStep(input)
    return new WorkflowResponse(location)
  }
)
