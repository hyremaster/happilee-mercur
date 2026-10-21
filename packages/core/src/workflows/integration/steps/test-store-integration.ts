import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  IntegrationTestResult,
  IntegrationValues,
  MercurModules,
  StoreIntegrationStatus,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import { UNREADABLE_CREDENTIALS_MESSAGE } from "../../../modules/integration/service"

export type TestStoreIntegrationStepInput = {
  /** store_integration id; credentials are decrypted inside the step. */
  id: string
}

type Compensation = {
  id: string
  status: StoreIntegrationStatus
  last_checked_at: Date | null
  last_error: string | null
}

/**
 * Test a saved connection against the provider (read-only call) and record the
 * outcome as the connection status. A failed test is a result, not a step
 * failure: saving a connection must not be rolled back because the external
 * system is unreachable.
 */
export const testStoreIntegrationStep = createStep(
  "test-store-integration",
  async (input: TestStoreIntegrationStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    const row = await service.retrieveStoreIntegration(input.id)

    const stored = service.readStoredCredentials(row)
    const result: IntegrationTestResult = stored.readable
      ? await service.testIntegrationConnection(row.provider_id, {
          credentials: stored.values,
          settings: (row.settings as IntegrationValues | null) ?? {},
        })
      : {
          ok: false,
          message: `Stored credentials can't be read. ${UNREADABLE_CREDENTIALS_MESSAGE}`,
        }

    await service.updateStoreIntegrations({
      id: row.id,
      status: result.ok
        ? StoreIntegrationStatus.CONNECTED
        : StoreIntegrationStatus.ERROR,
      last_checked_at: new Date(),
      last_error: result.ok ? null : result.message,
    })

    return new StepResponse<IntegrationTestResult, Compensation>(result, {
      id: row.id,
      status: row.status as StoreIntegrationStatus,
      last_checked_at: row.last_checked_at ?? null,
      last_error: row.last_error ?? null,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    await service.updateStoreIntegrations(previous)
  }
)
